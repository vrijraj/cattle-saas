"use server";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { breeds, farms } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { farmToday } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { escapeHtml, sendMail } from "@/lib/mail";
import { canManageSettings } from "@/lib/permissions";
import { planSpec, type PlanId } from "@/lib/plans";
import { createRazorpaySubscriptionCheckout, razorpayPlanIdFor } from "@/lib/subscriptions";
import { syncMilkDrops } from "@/lib/sync-milk-drops";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function intInRange(value: string, min: number, max: number) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < min || num > max) return null;
  return num;
}

export async function saveFarmGeneral(formData: FormData) {
  const farm = await requireFarm();
  if (!canManageSettings(farm.roles)) redirect("/settings?error=role");

  const name = text(formData, "name");
  const timezone = text(formData, "timezone") || "Asia/Kolkata";
  const animalPrefix = text(formData, "animalPrefix").toUpperCase();
  const enquiryEmail = text(formData, "enquiryEmail").toLowerCase();
  const whatsappNumber = text(formData, "whatsappNumber").replace(/[^0-9+]/g, "").slice(0, 20);
  const localeRaw = text(formData, "locale");
  const locale = localeRaw === "hi" || localeRaw === "gu" || localeRaw === "mr" ? localeRaw : "en";

  if (name.length < 2 || name.length > 100) redirect("/settings?error=farm");
  if (!/^[A-Z0-9]{2,6}$/.test(animalPrefix)) redirect("/settings?error=prefix");
  if (enquiryEmail && (!enquiryEmail.includes("@") || enquiryEmail.startsWith("@"))) redirect("/settings?error=email");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    redirect("/settings?error=timezone");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(farms)
      .set({
        name,
        timezone,
        animalPrefix,
        enquiryEmail: enquiryEmail || null,
        whatsappNumber: whatsappNumber || null,
        locale,
      })
      .where(eq(farms.id, farm.farmId));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "farm_settings",
      entityId: farm.farmId,
      summary: `Farm profile updated (${name}, prefix ${animalPrefix}, lang ${locale})`,
      before: {
        name: farm.farmName,
        timezone: farm.timezone,
        animalPrefix: farm.animalPrefix,
        enquiryEmail: farm.enquiryEmail,
        whatsappNumber: farm.whatsappNumber,
        locale: farm.farmLocale,
      },
      after: {
        name,
        timezone,
        animalPrefix,
        enquiryEmail: enquiryEmail || null,
        whatsappNumber: whatsappNumber || null,
        locale,
      },
    });
  });
  redirect("/settings?saved=farm");
}

export async function saveFarmRules(formData: FormData) {
  const farm = await requireFarm();
  if (!canManageSettings(farm.roles)) redirect("/settings?error=role");

  const priceRaw = text(formData, "milkPricePerLitre");
  const price = priceRaw ? Number(priceRaw) : null;
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 1000)) redirect("/settings?error=rules");

  const milkDropPercent = intInRange(text(formData, "milkDropPercent"), 5, 90);
  const pdDueDaysCattle = intInRange(text(formData, "pdDueDaysCattle"), 20, 90);
  const pdDueDaysBuffalo = intInRange(text(formData, "pdDueDaysBuffalo"), 20, 90);
  const dryOffLeadCattle = intInRange(text(formData, "dryOffLeadCattle"), 30, 120);
  const dryOffLeadBuffalo = intInRange(text(formData, "dryOffLeadBuffalo"), 30, 150);
  const matingGenerationWindow = intInRange(text(formData, "matingGenerationWindow"), 3, 6);
  const voluntaryWaitingDays = intInRange(text(formData, "voluntaryWaitingDays") || "45", 20, 120);
  const requireBothMilkSessions = formData.get("requireBothMilkSessions") === "on";

  if (
    milkDropPercent === null ||
    pdDueDaysCattle === null ||
    pdDueDaysBuffalo === null ||
    dryOffLeadCattle === null ||
    dryOffLeadBuffalo === null ||
    matingGenerationWindow === null ||
    voluntaryWaitingDays === null
  ) {
    redirect("/settings?error=rules");
  }

  const next = {
    milkPricePerLitre: price !== null ? price.toFixed(2) : null,
    milkDropPercent,
    requireBothMilkSessions,
    pdDueDaysCattle,
    pdDueDaysBuffalo,
    dryOffLeadCattle,
    dryOffLeadBuffalo,
    matingGenerationWindow,
    voluntaryWaitingDays,
  };

  await db.transaction(async (tx) => {
    await tx.update(farms).set(next).where(eq(farms.id, farm.farmId));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "farm_settings",
      entityId: farm.farmId,
      summary: `Updated milk, breeding & alert defaults`,
      before: {
        milkPricePerLitre: farm.milkPricePerLitre,
        milkDropPercent: farm.milkDropPercent,
        requireBothMilkSessions: farm.requireBothMilkSessions,
        pdDueDaysCattle: farm.pdDueDaysCattle,
        pdDueDaysBuffalo: farm.pdDueDaysBuffalo,
        dryOffLeadCattle: farm.dryOffLeadCattle,
        dryOffLeadBuffalo: farm.dryOffLeadBuffalo,
        matingGenerationWindow: farm.matingGenerationWindow,
        voluntaryWaitingDays: farm.voluntaryWaitingDays,
      },
      after: next,
    });
  });
  await syncMilkDrops(farm.farmId, farmToday(farm.timezone));
  redirect("/settings?saved=rules");
}

export type IotKeyState = { apiKey?: string; error?: string };

export async function generateIotApiKey(): Promise<IotKeyState> {
  const farm = await requireFarm();
  if (!canManageSettings(farm.roles)) return { error: "Only owners and admins can manage IoT API keys." };

  const rawKey = `dairy_iot_${randomBytes(24).toString("base64url")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  await db.transaction(async (tx) => {
    await tx.update(farms).set({ iotApiKeyHash: keyHash }).where(eq(farms.id, farm.farmId));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "farm_settings",
      entityId: farm.farmId,
      summary: "Generated / rotated IoT ingest API key",
      after: { iotApiKeyRotated: true },
    });
  });

  return { apiKey: rawKey };
}

export async function updateFarmPlan(formData: FormData) {
  const farm = await requireFarm();
  if (!canManageSettings(farm.roles)) redirect("/settings?error=role");
  const requested = text(formData, "plan");
  if (requested !== "starter" && requested !== "pro" && requested !== "enterprise") {
    redirect("/settings?error=farm");
  }
  const targetPlan = requested as PlanId;
  if (targetPlan === farm.plan) redirect("/settings");

  const spec = planSpec(targetPlan);

  // Super-admins can switch plans directly for internal operations / demos.
  if (farm.isSuperAdmin) {
    await db.transaction(async (tx) => {
      await tx
        .update(farms)
        .set({
          plan: spec.id,
          maxAnimals: spec.maxAnimals,
          maxMembers: spec.maxMembers,
          aiMonthlyLimit: spec.aiMonthlyLimit,
          subscriptionStatus: "active",
        })
        .where(eq(farms.id, farm.farmId));
      await writeAudit(tx, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "update",
        entity: "subscription",
        entityId: farm.farmId,
        summary: `Super-admin changed farm plan to ${spec.name}`,
        before: { plan: farm.plan, maxAnimals: farm.maxAnimals, maxMembers: farm.maxMembers },
        after: { plan: spec.id, maxAnimals: spec.maxAnimals, maxMembers: spec.maxMembers },
      });
    });
    redirect("/settings?saved=plan");
  }

  // Standard farm owners go through Razorpay Subscription checkout when configured.
  if (razorpayPlanIdFor(targetPlan) && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    const checkout = await createRazorpaySubscriptionCheckout({
      farmId: farm.farmId,
      farmName: farm.farmName,
      email: farm.email,
      plan: targetPlan,
    });
    if (checkout.ok) {
      await writeAudit(db, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "create",
        entity: "subscription",
        entityId: farm.farmId,
        summary: `Started Razorpay checkout for ${spec.name} (${checkout.subscriptionId})`,
        after: { targetPlan, subscriptionId: checkout.subscriptionId },
      });
      redirect(checkout.shortUrl);
    }
    redirect("/settings?error=billing");
  }

  // Fallback when online recurring billing is not configured: record a verified upgrade request
  // rather than granting unpaid quota increases.
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "create",
    entity: "subscription_request",
    entityId: farm.farmId,
    summary: `Requested plan change from ${farm.plan} to ${spec.name}`,
    after: { currentPlan: farm.plan, requestedPlan: spec.id, requesterEmail: farm.email },
  });

  const opsEmail = process.env.PLATFORM_BILLING_EMAIL || process.env.ZEPTOMAIL_FROM;
  if (opsEmail) {
    await sendMail({
      to: opsEmail,
      subject: `Plan upgrade request: ${farm.farmName} → ${spec.name}`,
      html: `<p><strong>${escapeHtml(farm.farmName)}</strong> (${escapeHtml(farm.farmSlug)}) requested switching from <strong>${escapeHtml(farm.plan)}</strong> to <strong>${escapeHtml(spec.name)}</strong>.</p><p>Requested by: ${escapeHtml(farm.userName ?? farm.email)} (${escapeHtml(farm.email)})</p>`,
    });
  }

  redirect("/settings?saved=plan_request");
}

export async function saveBreed(formData: FormData) {
  const farm = await requireFarm();
  if (!canManageSettings(farm.roles)) redirect("/settings?error=role");

  const id = text(formData, "id");
  const name = text(formData, "name");
  const code = text(formData, "code").toUpperCase();
  const species = text(formData, "species") === "buffalo" ? "buffalo" : "cattle";
  const gestationDays = intInRange(text(formData, "gestationDays"), 250, 350);
  const active = formData.get("active") === "on";

  if (!name || name.length > 80 || gestationDays === null) redirect("/settings?error=breed");

  if (id) {
    const [current] = await db
      .select()
      .from(breeds)
      .where(and(eq(breeds.id, id), eq(breeds.farmId, farm.farmId)))
      .limit(1);
    if (!current) redirect("/settings?error=breed");
    await db.transaction(async (tx) => {
      await tx
        .update(breeds)
        .set({ name, gestationDays, active })
        .where(and(eq(breeds.id, current.id), eq(breeds.farmId, farm.farmId)));
      await writeAudit(tx, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "update",
        entity: "breed",
        entityId: current.id,
        summary: `Updated breed ${name} (${gestationDays}d gestation, ${active ? "active" : "inactive"})`,
        before: { name: current.name, gestationDays: current.gestationDays, active: current.active },
        after: { name, gestationDays, active },
      });
    });
    redirect("/settings?saved=breed");
  }

  if (!/^[A-Z0-9]{2,5}$/.test(code)) redirect("/settings?error=breed");
  const [duplicate] = await db
    .select({ id: breeds.id })
    .from(breeds)
    .where(and(eq(breeds.farmId, farm.farmId), eq(breeds.code, code), ...(id ? [ne(breeds.id, id)] : [])))
    .limit(1);
  if (duplicate) redirect("/settings?error=breed_dup");

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(breeds)
      .values({ farmId: farm.farmId, name, code, species, gestationDays, active: true })
      .returning({ id: breeds.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "breed",
      entityId: created.id,
      summary: `Added breed ${name} (${code}, ${species}, ${gestationDays}d)`,
      after: { name, code, species, gestationDays },
    });
  });
  redirect("/settings?saved=breed");
}
