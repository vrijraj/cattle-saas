import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { alerts, animals, calvings, milkYields } from "@/db/schema";
import { animalMilkDrop, herdMilkDrop, milkDropBody, type YieldDay } from "@/lib/milk-drop";

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
  const yields = await db
    .select()
    .from(milkYields)
    .where(and(eq(milkYields.farmId, farmId), isNull(milkYields.voidedAt)));
  const births = await db
    .select({ damId: calvings.damId, calvedOn: calvings.calvedOn, voidedAt: calvings.voidedAt })
    .from(calvings)
    .where(eq(calvings.farmId, farmId));
  const herd = await db
    .select({ id: animals.id, code: animals.code, name: animals.name, lactation: animals.lactation })
    .from(animals)
    .where(eq(animals.farmId, farmId));
  const flags = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.farmId, farmId)));

  const explainedAnimal = new Set(
    flags
      .filter((alert) => alert.type === "milk_drop" && alert.status === "explained" && alert.animalId && alert.dueOn)
      .map((alert) => `${alert.animalId}:${alert.dueOn}`),
  );

  for (const animal of herd) {
    if (animal.lactation !== "lactating") continue;
    const todayRow = yields.find((row) => row.animalId === animal.id && row.recordedOn === today);
    if (!todayRow) continue;
    const latestBirth = births
      .filter((birth) => birth.damId === animal.id && !birth.voidedAt)
      .map((birth) => birth.calvedOn)
      .sort()
      .at(-1);
    const drop = animalMilkDrop({
      daysInMilk: latestBirth ? daysBetween(latestBirth, today) : null,
      prior: yields
        .filter((row) => row.animalId === animal.id && row.recordedOn !== today)
        .map((row) => yieldDay(row.recordedOn, row.morningLitres, row.eveningLitres, explainedAnimal.has(`${animal.id}:${row.recordedOn}`))),
      today: yieldDay(today, todayRow.morningLitres, todayRow.eveningLitres, false),
    });
    await upsertMilkAlert({
      farmId,
      animalId: animal.id,
      type: "milk_drop",
      dueOn: today,
      title: `Milk drop · ${animal.name ?? animal.code}`,
      body: drop ? milkDropBody(drop) : null,
      existing: flags.filter((alert) => alert.type === "milk_drop" && alert.animalId === animal.id && alert.dueOn === today),
    });
  }

  const byDate = new Map<string, number>();
  for (const row of yields) {
    const total = Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0);
    byDate.set(row.recordedOn, (byDate.get(row.recordedOn) ?? 0) + total);
  }
  const explainedHerd = new Set(
    flags.filter((alert) => alert.type === "herd_milk_drop" && alert.status === "explained" && alert.dueOn).map((alert) => alert.dueOn as string),
  );
  const herdDrop = herdMilkDrop(
    [...byDate.entries()].map(([date, litres]) => ({
      date,
      litres: Math.round(litres * 10) / 10,
      explained: explainedHerd.has(date),
    })),
    today,
  );
  await upsertMilkAlert({
    farmId,
    animalId: null,
    type: "herd_milk_drop",
    dueOn: today,
    title: "Herd milk drop",
    body: herdDrop ? milkDropBody(herdDrop) : null,
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
    if (open) await db.update(alerts).set({ status: "done" }).where(eq(alerts.id, open.id));
    return;
  }
  if (open) {
    await db.update(alerts).set({ title: input.title, body: input.body }).where(eq(alerts.id, open.id));
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
