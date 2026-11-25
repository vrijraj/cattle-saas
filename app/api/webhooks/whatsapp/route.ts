import { timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { alerts, animals, farmMembers, farms, milkYields, users } from "@/db/schema";
import { geminiConfigured } from "@/lib/ai/config";
import { writeAudit } from "@/lib/audit";
import { farmToday } from "@/lib/dates";
import { canWriteMilk } from "@/lib/permissions";
import { checkDistributedRateLimit } from "@/lib/rate-limit-db";
import { syncMilkDrops } from "@/lib/sync-milk-drops";

export const runtime = "nodejs";

function digitsOnly(value: string) {
  return value.replace(/[^0-9]/g, "");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Meta WhatsApp Cloud API verification challenge (GET).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!expected || mode !== "subscribe" || !safeEqual(token, expected)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return new NextResponse(challenge, { status: 200 });
}

type IncomingMessage = {
  from: string;
  text: string;
};

function extractIncoming(payload: unknown): IncomingMessage | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;

  // Simplified JSON / Twilio-style payload: { from, body } or { phone, text }
  if (typeof obj.from === "string" && typeof obj.body === "string") {
    return { from: obj.from, text: obj.body.trim() };
  }
  if (typeof obj.phone === "string" && typeof obj.text === "string") {
    return { from: obj.phone, text: obj.text.trim() };
  }

  // Meta WhatsApp Cloud API webhook structure
  const entries = Array.isArray(obj.entry) ? obj.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray((entry as Record<string, unknown>)?.changes)
      ? ((entry as Record<string, unknown>).changes as Record<string, unknown>[])
      : [];
    for (const change of changes) {
      const val = change.value as Record<string, unknown> | undefined;
      const msgs = Array.isArray(val?.messages) ? (val.messages as Record<string, unknown>[]) : [];
      const first = msgs[0];
      if (first && typeof first.from === "string") {
        const textObj = first.text as { body?: string } | undefined;
        if (textObj?.body) return { from: first.from, text: textObj.body.trim() };
      }
    }
  }
  return null;
}

export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (secret) {
    const provided = request.headers.get("x-webhook-secret") ?? "";
    if (!provided || !safeEqual(provided, secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const payload = await request.json().catch(() => null);
  const incoming = extractIncoming(payload);
  if (!incoming || !incoming.from || !incoming.text) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const senderDigits = digitsOnly(incoming.from);
  if (senderDigits.length < 7) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  const rl = await checkDistributedRateLimit(`wa:${senderDigits}`, { limit: 20, windowMs: 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const allUsers = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      disabledAt: users.disabledAt,
    })
    .from(users);

  const matchedUser = allUsers.find((u) => {
    if (!u.phone || u.disabledAt) return false;
    const stored = digitsOnly(u.phone);
    return stored.length >= 7 && (stored === senderDigits || stored.endsWith(senderDigits.slice(-10)) || senderDigits.endsWith(stored.slice(-10)));
  });

  if (!matchedUser) {
    return NextResponse.json({
      ok: true,
      reply: "Your phone number is not linked to an active farm account. Add your phone number in Profile settings.",
    });
  }

  const [membership] = await db
    .select({
      farmId: farms.id,
      farmName: farms.name,
      farmSlug: farms.slug,
      timezone: farms.timezone,
      matingGenerationWindow: farms.matingGenerationWindow,
      roles: farmMembers.roles,
      canRecordVaccines: farmMembers.canRecordVaccines,
    })
    .from(farmMembers)
    .innerJoin(farms, eq(farms.id, farmMembers.farmId))
    .where(eq(farmMembers.userId, matchedUser.userId))
    .limit(1);

  if (!membership) {
    return NextResponse.json({ ok: true, reply: "No active farm workspace found for your account." });
  }

  const lower = incoming.text.toLowerCase();
  const today = farmToday(membership.timezone);

  // Deterministic quick command 1: Milk log "<name/code> <litres>L morning|evening"
  const milkMatch = incoming.text.match(/^([a-z0-9-]+)\s+(\d+(?:\.\d+)?)\s*l?\s*(morning|evening|am|pm)$/i);
  if (milkMatch) {
    if (!canWriteMilk(membership.roles)) {
      return NextResponse.json({ ok: true, reply: "Your farm role does not have permission to record milk yields." });
    }
    const [, queryTerm, qtyRaw, sessionWord] = milkMatch;
    const qty = Number(qtyRaw);
    if (!Number.isFinite(qty) || qty < 0 || qty > 80) {
      return NextResponse.json({ ok: true, reply: "Milk litres must be between 0 and 80 L." });
    }
    const herd = await db
      .select()
      .from(animals)
      .where(and(eq(animals.farmId, membership.farmId), eq(animals.presence, "on_farm")));
    const animal = herd.find(
      (a) => a.code.toLowerCase() === queryTerm.toLowerCase() || a.name?.toLowerCase() === queryTerm.toLowerCase(),
    );
    if (!animal) {
      return NextResponse.json({ ok: true, reply: `Could not find an on-farm animal matching "${queryTerm}".` });
    }
    const isMorning = sessionWord.toLowerCase() === "morning" || sessionWord.toLowerCase() === "am";
    const formatted = qty.toFixed(1);

    await db.transaction(async (tx) => {
      const [prev] = await tx
        .select()
        .from(milkYields)
        .where(and(eq(milkYields.farmId, membership.farmId), eq(milkYields.animalId, animal.id), eq(milkYields.recordedOn, today)))
        .limit(1);
      const nextMorning = isMorning ? formatted : (prev?.morningLitres ?? null);
      const nextEvening = !isMorning ? formatted : (prev?.eveningLitres ?? null);
      const [saved] = await tx
        .insert(milkYields)
        .values({
          farmId: membership.farmId,
          animalId: animal.id,
          recordedOn: today,
          morningLitres: nextMorning,
          eveningLitres: nextEvening,
          createdBy: matchedUser.userId,
        })
        .onConflictDoUpdate({
          target: [milkYields.animalId, milkYields.recordedOn],
          set: { morningLitres: nextMorning, eveningLitres: nextEvening, voidedAt: null, updatedAt: new Date() },
        })
        .returning({ id: milkYields.id });
      await writeAudit(tx, {
        farmId: membership.farmId,
        actorId: matchedUser.userId,
        action: prev ? "update" : "create",
        entity: "milk",
        entityId: saved.id,
        summary: `WhatsApp milk log for ${animal.code}: ${formatted} L ${isMorning ? "morning" : "evening"}`,
        after: { recordedOn: today, morning: nextMorning, evening: nextEvening, channel: "whatsapp" },
      });
    });
    await syncMilkDrops(membership.farmId, today);
    return NextResponse.json({
      ok: true,
      reply: `Saved ${formatted} L (${isMorning ? "morning" : "evening"}) for ${animal.name ?? animal.code} (${animal.code}) on ${today}.`,
    });
  }

  // Deterministic quick command 2: "summary" / "herd" / "alerts"
  if (lower === "summary" || lower === "herd" || lower === "status") {
    const [herd, openAlerts, todayMilk] = await Promise.all([
      db.select().from(animals).where(and(eq(animals.farmId, membership.farmId), eq(animals.presence, "on_farm"))),
      db.select().from(alerts).where(and(eq(alerts.farmId, membership.farmId), eq(alerts.status, "open"))),
      db.select().from(milkYields).where(and(eq(milkYields.farmId, membership.farmId), eq(milkYields.recordedOn, today), isNull(milkYields.voidedAt))),
    ]);
    const lactating = herd.filter((a) => a.lactation === "lactating").length;
    const pregnant = herd.filter((a) => a.reproduction === "pregnant").length;
    const totalMilk = todayMilk.reduce((s, r) => s + Number(r.morningLitres ?? 0) + Number(r.eveningLitres ?? 0), 0);
    return NextResponse.json({
      ok: true,
      reply: `${membership.farmName} (${today}): ${herd.length} on farm (${lactating} lactating, ${pregnant} pregnant). Today's milk: ${totalMilk.toFixed(1)} L. Open alerts: ${openAlerts.length}.`,
    });
  }

  if (lower === "alerts") {
    const openAlerts = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.farmId, membership.farmId), eq(alerts.status, "open")));
    if (openAlerts.length === 0) {
      return NextResponse.json({ ok: true, reply: `${membership.farmName}: All clear — no open alerts.` });
    }
    const top = openAlerts.slice(0, 6).map((a) => `• ${a.title} (${a.dueOn ?? "today"})`).join("\n");
    return NextResponse.json({ ok: true, reply: `${membership.farmName} open alerts (${openAlerts.length}):\n${top}` });
  }

  // Route general queries through Gemini assistant if configured
  if (geminiConfigured()) {
    const { runFarmAssistant } = await import("@/lib/ai/run");
    let replyText = "";
    for await (const event of runFarmAssistant(
      {
        userId: matchedUser.userId,
        farmId: membership.farmId,
        farmName: membership.farmName,
        farmSlug: membership.farmSlug,
        timezone: membership.timezone,
        roles: membership.roles,
        canRecordVaccines: membership.canRecordVaccines,
        matingGenerationWindow: membership.matingGenerationWindow,
        userName: matchedUser.name ?? matchedUser.email,
      },
      { kind: "text", text: incoming.text },
      undefined,
    )) {
      if (event.type === "delta") replyText += event.text;
      else if (event.type === "replace") replyText = event.text;
    }
    return NextResponse.json({ ok: true, reply: replyText || "Done." });
  }

  return NextResponse.json({
    ok: true,
    reply: `Commands: "summary", "alerts", or "<AnimalName/Code> <litres>L morning|evening" (e.g. "Jamuna 7.5L morning").`,
  });
}
