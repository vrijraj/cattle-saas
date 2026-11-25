import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { animals, farms, milkYields, weights } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { farmToday, parseFarmDate } from "@/lib/dates";
import { checkRateLimit } from "@/lib/rate-limit";
import { syncMilkDrops } from "@/lib/sync-milk-drops";

export const runtime = "nodejs";

const ingestSchema = z.object({
  milk: z
    .array(
      z.object({
        rfid: z.string().trim().optional(),
        code: z.string().trim().optional(),
        recordedOn: z.string().trim().optional(),
        morningLitres: z.number().min(0).max(80).optional(),
        eveningLitres: z.number().min(0).max(80).optional(),
        fatPercent: z.number().min(0).max(15).optional(),
        snfPercent: z.number().min(0).max(15).optional(),
        scc: z.number().int().min(0).max(10_000_000).optional(),
      }),
    )
    .max(500)
    .optional(),
  weights: z
    .array(
      z.object({
        rfid: z.string().trim().optional(),
        code: z.string().trim().optional(),
        weighedOn: z.string().trim().optional(),
        kilograms: z.number().positive().max(1200),
        note: z.string().trim().max(160).optional(),
      }),
    )
    .max(500)
    .optional(),
  rfidScans: z
    .array(
      z.object({
        rfid: z.string().trim().min(1),
        reader: z.string().trim().max(80).optional(),
      }),
    )
    .max(200)
    .optional(),
});

export async function POST(request: Request) {
  const slug = request.headers.get("x-farm-slug")?.trim() ?? "";
  const apiKey = request.headers.get("x-api-key")?.trim() ?? "";
  if (!slug || !apiKey) {
    return NextResponse.json({ error: "Missing X-Farm-Slug or X-API-Key headers." }, { status: 401 });
  }

  const rl = checkRateLimit(`iot:${slug}`, { limit: 120, windowMs: 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm?.iotApiKeyHash || farm.subscriptionStatus === "suspended") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidateHash = createHash("sha256").update(apiKey).digest("hex");
  const a = Buffer.from(candidateHash);
  const b = Buffer.from(farm.iotApiKeyHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = ingestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid ingest payload", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }

  const data = parsed.data;
  const today = farmToday(farm.timezone);
  const herd = await db
    .select({ id: animals.id, code: animals.code, rfid: animals.rfid, name: animals.name })
    .from(animals)
    .where(eq(animals.farmId, farm.id));

  const byRfid = new Map(herd.filter((a) => a.rfid).map((a) => [a.rfid!.toLowerCase(), a]));
  const byCode = new Map(herd.map((a) => [a.code.toLowerCase(), a]));
  const resolveAnimal = (rfid?: string, code?: string) => {
    if (rfid) {
      const hit = byRfid.get(rfid.toLowerCase());
      if (hit) return hit;
    }
    if (code) return byCode.get(code.toLowerCase()) ?? null;
    return null;
  };

  let milkSaved = 0;
  let weightsSaved = 0;
  const rfidMatched: { rfid: string; code: string; name: string | null }[] = [];
  const unknownIdentifiers: string[] = [];
  let latestMilkDate = "";

  await db.transaction(async (tx) => {
    for (const item of data.milk ?? []) {
      const animal = resolveAnimal(item.rfid, item.code);
      if (!animal) {
        unknownIdentifiers.push(item.rfid || item.code || "missing");
        continue;
      }
      const recordedOn = parseFarmDate(item.recordedOn || today);
      if (!recordedOn || recordedOn > today) continue;
      if (item.morningLitres === undefined && item.eveningLitres === undefined) continue;

      const [prev] = await tx
        .select()
        .from(milkYields)
        .where(and(eq(milkYields.farmId, farm.id), eq(milkYields.animalId, animal.id), eq(milkYields.recordedOn, recordedOn)))
        .limit(1);

      const nextMorning = item.morningLitres !== undefined ? item.morningLitres.toFixed(1) : (prev?.morningLitres ?? null);
      const nextEvening = item.eveningLitres !== undefined ? item.eveningLitres.toFixed(1) : (prev?.eveningLitres ?? null);
      const nextFat = item.fatPercent !== undefined ? item.fatPercent.toFixed(2) : (prev?.fatPercent ?? null);
      const nextSnf = item.snfPercent !== undefined ? item.snfPercent.toFixed(2) : (prev?.snfPercent ?? null);
      const nextScc = item.scc !== undefined ? item.scc : (prev?.scc ?? null);

      await tx
        .insert(milkYields)
        .values({
          farmId: farm.id,
          animalId: animal.id,
          recordedOn,
          morningLitres: nextMorning,
          eveningLitres: nextEvening,
          fatPercent: nextFat,
          snfPercent: nextSnf,
          scc: nextScc,
        })
        .onConflictDoUpdate({
          target: [milkYields.animalId, milkYields.recordedOn],
          set: {
            morningLitres: nextMorning,
            eveningLitres: nextEvening,
            fatPercent: nextFat,
            snfPercent: nextSnf,
            scc: nextScc,
            voidedAt: null,
            updatedAt: new Date(),
          },
        });
      milkSaved += 1;
      if (recordedOn > latestMilkDate) latestMilkDate = recordedOn;
    }

    for (const item of data.weights ?? []) {
      const animal = resolveAnimal(item.rfid, item.code);
      if (!animal) {
        unknownIdentifiers.push(item.rfid || item.code || "missing");
        continue;
      }
      const weighedOn = parseFarmDate(item.weighedOn || today);
      if (!weighedOn || weighedOn > today) continue;
      await tx.insert(weights).values({
        farmId: farm.id,
        animalId: animal.id,
        weighedOn,
        kilograms: item.kilograms.toFixed(1),
        note: item.note || "IoT digital scale",
      });
      weightsSaved += 1;
    }

    for (const scan of data.rfidScans ?? []) {
      const animal = resolveAnimal(scan.rfid, undefined);
      if (animal) rfidMatched.push({ rfid: scan.rfid, code: animal.code, name: animal.name });
      else unknownIdentifiers.push(scan.rfid);
    }

    if (milkSaved > 0 || weightsSaved > 0) {
      await writeAudit(tx, {
        farmId: farm.id,
        actorId: null,
        action: "create",
        entity: "iot_ingest",
        entityId: farm.id,
        summary: `IoT ingest saved ${milkSaved} milk & ${weightsSaved} weight readings`,
        after: { milkSaved, weightsSaved, unknownCount: unknownIdentifiers.length },
      });
    }
  });

  if (latestMilkDate) {
    await syncMilkDrops(farm.id, latestMilkDate);
  }

  return NextResponse.json({
    ok: true,
    milkSaved,
    weightsSaved,
    rfidMatched,
    unknownIdentifiers: unknownIdentifiers.slice(0, 50),
  });
}
