"use server";

import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { breeds, farms } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { farmToday } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canManageSettings } from "@/lib/permissions";
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
      })
      .where(eq(farms.id, farm.farmId));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "farm_settings",
      entityId: farm.farmId,
      summary: `Farm profile updated (${name}, prefix ${animalPrefix})`,
      before: { name: farm.farmName, timezone: farm.timezone, animalPrefix: farm.animalPrefix, enquiryEmail: farm.enquiryEmail },
      after: { name, timezone, animalPrefix, enquiryEmail: enquiryEmail || null },
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
  const requireBothMilkSessions = formData.get("requireBothMilkSessions") === "on";

  if (
    milkDropPercent === null ||
    pdDueDaysCattle === null ||
    pdDueDaysBuffalo === null ||
    dryOffLeadCattle === null ||
    dryOffLeadBuffalo === null ||
    matingGenerationWindow === null
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
      },
      after: next,
    });
  });
  await syncMilkDrops(farm.farmId, farmToday(farm.timezone));
  redirect("/settings?saved=rules");
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
