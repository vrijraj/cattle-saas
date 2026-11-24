import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { alerts, animals, calvings, farms, milkYields } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { animalMilkDrop, milkDropBody, type YieldDay } from "@/lib/milk-drop";

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function yieldDay(date: string, morning: string | null, evening: string | null, explained: boolean): YieldDay {
  return {
    date,
    morning: morning === null ? null : Number(morning),
    evening: evening === null ? null : Number(evening),
    explained,
  };
}

export async function syncMilkDrops(farmId: string, today: string) {
  const [farmRow] = await db
    .select({
      milkDropPercent: farms.milkDropPercent,
      requireBothMilkSessions: farms.requireBothMilkSessions,
    })
    .from(farms)
    .where(eq(farms.id, farmId))
    .limit(1);
  const dropPercent = farmRow?.milkDropPercent ?? 30;
  const requireBothSessions = farmRow?.requireBothMilkSessions ?? true;
  const windowStart = addDays(today, -60);

  const [yields, births, herd, flags] = await Promise.all([
    db
      .select()
      .from(milkYields)
      .where(and(eq(milkYields.farmId, farmId), isNull(milkYields.voidedAt), gte(milkYields.recordedOn, windowStart), lte(milkYields.recordedOn, today))),
    db
      .select({ damId: calvings.damId, calvedOn: calvings.calvedOn, outcome: calvings.outcome, voidedAt: calvings.voidedAt })
      .from(calvings)
      .where(and(eq(calvings.farmId, farmId), isNull(calvings.voidedAt))),
    db
      .select({ id: animals.id, code: animals.code, name: animals.name, presence: animals.presence, lactation: animals.lactation })
      .from(animals)
      .where(and(eq(animals.farmId, farmId), eq(animals.presence, "on_farm"))),
    db
      .select()
      .from(alerts)
      .where(and(eq(alerts.farmId, farmId), gte(alerts.dueOn, windowStart))),
  ]);

  const explainedAnimal = new Set(
    flags
      .filter((alert) => alert.type === "milk_drop" && alert.status === "explained" && alert.animalId && alert.dueOn)
      .map((alert) => `${alert.animalId}:${alert.dueOn}`),
  );

  // Track comparable animals (entered today with complete sessions & >=7 prior days) for PRD §24.1 herd drop
  let herdTodaySum = 0;
  let herdBaselineSum = 0;
  let herdComparedAnimals = 0;

  for (const animal of herd) {
    if (animal.lactation !== "lactating") continue;
    const todayRow = yields.find((row) => row.animalId === animal.id && row.recordedOn === today);
    const existingForToday = flags.filter((alert) => alert.type === "milk_drop" && alert.animalId === animal.id && alert.dueOn === today);
    if (!todayRow) {
      await upsertMilkAlert({
        farmId,
        animalId: animal.id,
        type: "milk_drop",
        dueOn: today,
        title: `Milk drop · ${animal.name ?? animal.code}`,
        body: null,
        existing: existingForToday,
      });
      continue;
    }

    const latestBirth = births
      .filter((birth) => birth.damId === animal.id && birth.outcome !== "dead" && birth.calvedOn <= today)
      .map((birth) => birth.calvedOn)
      .sort()
      .at(-1);

    const prior = yields
      .filter((row) => row.animalId === animal.id && row.recordedOn < today && (!latestBirth || row.recordedOn >= latestBirth))
      .map((row) => yieldDay(row.recordedOn, row.morningLitres, row.eveningLitres, explainedAnimal.has(`${animal.id}:${row.recordedOn}`)));

    // If a lactating cow was onboarded without a calving record and already has >= 7 milking days, treat DIM as past fresh window
    const daysInMilk = latestBirth ? daysBetween(latestBirth, today) : prior.length >= 7 ? 30 : null;
    const todayParsed = yieldDay(today, todayRow.morningLitres, todayRow.eveningLitres, false);

    const drop = animalMilkDrop({
      daysInMilk,
      prior,
      today: todayParsed,
      requireBothSessions,
      dropPercent,
    });

    await upsertMilkAlert({
      farmId,
      animalId: animal.id,
      type: "milk_drop",
      dueOn: today,
      title: `Milk drop · ${animal.name ?? animal.code}`,
      body: drop ? milkDropBody(drop, dropPercent) : null,
      existing: existingForToday,
    });

    // Include animal in same-cohort herd drop calculation when today's entry is complete and 7-day baseline exists
    const completeToday = !requireBothSessions || (todayParsed.morning !== null && todayParsed.evening !== null);
    if (completeToday && (daysInMilk === null || daysInMilk > 14)) {
      const validPrior = prior
        .filter((day) => !day.explained && (day.morning !== null || day.evening !== null))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 7);
      if (validPrior.length === 7) {
        const baseline = validPrior.reduce((sum, day) => sum + (day.morning ?? 0) + (day.evening ?? 0), 0) / 7;
        const todayTotal = (todayParsed.morning ?? 0) + (todayParsed.evening ?? 0);
        herdTodaySum += todayTotal;
        herdBaselineSum += baseline;
        herdComparedAnimals += 1;
      }
    }
  }

  let herdBody: string | null = null;
  if (herdComparedAnimals > 0 && herdBaselineSum > 0) {
    const todayLitres = Math.round(herdTodaySum * 10) / 10;
    const baselineLitres = Math.round(herdBaselineSum * 10) / 10;
    const percentBelow = Math.round(((baselineLitres - todayLitres) / baselineLitres) * 1000) / 10;
    if (percentBelow >= dropPercent) {
      herdBody = `${milkDropBody({ todayLitres, baselineLitres, percentBelow }, dropPercent)} Across ${herdComparedAnimals} ${herdComparedAnimals === 1 ? "animal" : "animals"} entered today.`;
    }
  }

  await upsertMilkAlert({
    farmId,
    animalId: null,
    type: "herd_milk_drop",
    dueOn: today,
    title: "Herd milk drop",
    body: herdBody,
    existing: flags.filter((alert) => alert.type === "herd_milk_drop" && alert.dueOn === today),
  });
}

async function upsertMilkAlert(input: {
  farmId: string;
  animalId: string | null;
  type: string;
  dueOn: string;
  title: string;
  body: string | null;
  existing: { id: string; status: string }[];
}) {
  if (input.existing.some((alert) => alert.status === "explained" || alert.status === "dismissed")) return;
  const open = input.existing.find((alert) => alert.status === "open");
  if (!input.body) {
    if (open) await db.update(alerts).set({ status: "done" }).where(and(eq(alerts.id, open.id), eq(alerts.farmId, input.farmId)));
    return;
  }
  if (open) {
    await db
      .update(alerts)
      .set({ title: input.title, body: input.body })
      .where(and(eq(alerts.id, open.id), eq(alerts.farmId, input.farmId)));
    return;
  }
  await db.insert(alerts).values({
    farmId: input.farmId,
    animalId: input.animalId,
    type: input.type,
    title: input.title,
    body: input.body,
    dueOn: input.dueOn,
    status: "open",
  });
}
