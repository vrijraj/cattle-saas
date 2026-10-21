import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  animals,
  breeds,
  feedItems,
  feedMovements,
  financeEntries,
  healthEvents,
  inseminations,
  milkYields,
  semenBatches,
  straws,
  vaccinations,
  weights,
} from "@/db/schema";

export async function reportRows(kind: string, farmId: string): Promise<string[][] | null> {
  if (kind === "cattle") {
    const herd = await db.select().from(animals).where(eq(animals.farmId, farmId));
    const breedRows = await db.select().from(breeds).where(eq(breeds.farmId, farmId));
    const breedName = new Map(breedRows.map((breed) => [breed.id, breed.name]));
    return [
      ["code", "name", "breed", "sex", "dob", "presence", "reproduction", "lactation", "sire", "dam id"],
      ...herd.map((animal) => [
        animal.code,
        animal.name ?? "",
        breedName.get(animal.breedId) ?? "",
        animal.sex,
        animal.dob ?? "",
        animal.presence,
        animal.reproduction,
        animal.lactation,
        animal.geneticSireCode ?? "",
        animal.geneticDamId ?? "",
      ]),
    ];
  }
  if (kind === "breeding") {
    const list = await db.select().from(inseminations).where(eq(inseminations.farmId, farmId));
    return [
      ["date", "bull", "straw", "technician", "attempt"],
      ...list.map((row) => [row.performedOn, row.bullCode, row.strawCode ?? "", row.technicianName, String(row.attemptNumber)]),
    ];
  }
  if (kind === "milk") {
    const list = await db.select().from(milkYields).where(eq(milkYields.farmId, farmId));
    return [["date", "animal id", "morning", "evening"], ...list.map((row) => [row.recordedOn, row.animalId, row.morningLitres ?? "", row.eveningLitres ?? ""])];
  }
  if (kind === "health") {
    const events = await db.select().from(healthEvents).where(eq(healthEvents.farmId, farmId));
    const doses = await db.select().from(vaccinations).where(eq(vaccinations.farmId, farmId));
    return [
      ["type", "date", "animal id", "detail"],
      ...events.map((row) => ["treatment", row.eventOn, row.animalId, row.problem]),
      ...doses.map((row) => ["vaccine", row.givenOn, row.animalId, row.vaccine]),
    ];
  }
  if (kind === "feed") {
    const items = await db.select().from(feedItems).where(eq(feedItems.farmId, farmId));
    const movements = await db.select().from(feedMovements).where(eq(feedMovements.farmId, farmId));
    const names = new Map(items.map((item) => [item.id, item.name]));
    return [["date", "item", "kind", "quantity"], ...movements.map((row) => [row.movedOn, names.get(row.itemId) ?? "", row.kind, row.quantity])];
  }
  if (kind === "semen") {
    const list = await db.select().from(straws).where(eq(straws.farmId, farmId));
    const batches = await db.select().from(semenBatches).where(eq(semenBatches.farmId, farmId));
    const batchType = new Map(batches.map((batch) => [batch.id, batch.semenType]));
    return [
      ["straw", "status", "tank", "canister", "goblet", "position", "type"],
      ...list.map((row) => [row.code, row.status, row.tank ?? "", row.canister ?? "", row.goblet ?? "", row.position ?? "", batchType.get(row.batchId) ?? ""]),
    ];
  }
  if (kind === "finance") {
    const list = await db.select().from(financeEntries).where(eq(financeEntries.farmId, farmId));
    return [["date", "kind", "category", "amount", "note"], ...list.map((row) => [row.entryOn, row.kind, row.category, row.amount, row.note ?? ""])];
  }
  if (kind === "weight") {
    const list = await db
      .select({
        weighedOn: weights.weighedOn,
        kilograms: weights.kilograms,
        note: weights.note,
        code: animals.code,
        name: animals.name,
      })
      .from(weights)
      .innerJoin(animals, eq(animals.id, weights.animalId))
      .where(eq(weights.farmId, farmId));
    return [
      ["date", "code", "name", "kilograms", "note"],
      ...list.map((row) => [row.weighedOn, row.code, row.name ?? "", row.kilograms, row.note ?? ""]),
    ];
  }
  return null;
}
