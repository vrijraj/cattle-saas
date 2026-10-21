import { and, eq } from "drizzle-orm";
import type { db as database } from "../index";

type Database = typeof database;

export async function seedOperations(db: Database, farmId: string) {
  const { animals, bulls, calvings, feedItems, feedMovements, inseminations, listings, pregnancyChecks, products, semenBatches, straws, weights } =
    await import("../schema");
  const [existingBull] = await db.select({ id: bulls.id }).from(bulls).where(eq(bulls.farmId, farmId)).limit(1);
  if (existingBull) return;

  const herd = await db.select().from(animals).where(eq(animals.farmId, farmId));
  const byCode = new Map(herd.map((animal) => [animal.code, animal]));
  const ganga = byCode.get("MIL-GIR-004");
  const kaveri = byCode.get("MIL-GIR-006");
  const holi = byCode.get("MIL-HF-001");
  const calf = byCode.get("MIL-GIR-018");
  const jamuna = byCode.get("MIL-GIR-001");
  if (!ganga || !kaveri || !holi || !jamuna) return;

  const [sagar] = await db
    .insert(bulls)
    .values({
      farmId,
      code: "BULL-GIR-014",
      name: "Sagar",
      breed: "Gir",
      registrationNumber: "GIR-REG-2291",
      semenCompany: "Farm's own bull",
      sireCode: "BULL-GIR-002",
    })
    .returning();
  const [batch] = await db
    .insert(semenBatches)
    .values({
      farmId,
      bullId: sagar.id,
      batchNumber: "G14-2026",
      semenType: "conventional",
      collectedOn: "2025-12-12",
      quantityReceived: 2,
      pricePerStraw: "350.00",
      receivedOn: "2025-12-20",
    })
    .returning();
  await db.insert(straws).values([
    { farmId, batchId: batch.id, code: "STR-G14-2026-013", tank: "Tank A", canister: "1", goblet: "A", position: "1", status: "available" },
    {
      farmId,
      batchId: batch.id,
      code: "STR-G14-2026-014",
      tank: "Tank A",
      canister: "1",
      goblet: "A",
      position: "2",
      status: "used",
      usedOnAnimalId: ganga.id,
      usedAt: new Date("2026-01-02T03:40:00Z"),
    },
  ]);

  const [gangaAi] = await db
    .insert(inseminations)
    .values({
      farmId,
      animalId: ganga.id,
      performedOn: "2026-01-02",
      technicianName: "S. Jadhav",
      bullCode: "BULL-GIR-014",
      bullName: "Sagar",
      batchNumber: "G14-2026",
      strawCode: "STR-G14-2026-014",
      attemptNumber: 1,
    })
    .returning();
  await db.insert(pregnancyChecks).values({
    farmId,
    animalId: ganga.id,
    inseminationId: gangaAi.id,
    checkedOn: "2026-02-08",
    result: "pregnant",
    method: "ultrasound",
  });
  if (calf) {
    await db.insert(calvings).values({
      farmId,
      damId: ganga.id,
      inseminationId: gangaAi.id,
      calvedOn: "2026-10-14",
      calfId: calf.id,
      outcome: "live",
      ease: "1",
    });
  }
  await db.insert(inseminations).values({
    farmId,
    animalId: holi.id,
    performedOn: "2026-10-01",
    technicianName: "S. Jadhav",
    bullCode: "BULL-HF-010",
    batchNumber: "HF-SX-88",
    attemptNumber: 1,
  });
  const [kaveriAi] = await db
    .insert(inseminations)
    .values({
      farmId,
      animalId: kaveri.id,
      performedOn: "2026-09-20",
      technicianName: "S. Jadhav",
      bullCode: "BULL-GIR-014",
      bullName: "Sagar",
      attemptNumber: 1,
    })
    .returning();
  await db.insert(pregnancyChecks).values({
    farmId,
    animalId: kaveri.id,
    inseminationId: kaveriAi.id,
    checkedOn: "2026-10-18",
    result: "pregnant",
    method: "ultrasound",
  });
  await db
    .update(animals)
    .set({ conceptionOn: "2026-09-20", expectedCalving: "2027-07-04" })
    .where(and(eq(animals.id, kaveri.id)));

  await db.insert(weights).values([
    { farmId, animalId: jamuna.id, weighedOn: "2026-10-01", kilograms: "385.0" },
    { farmId, animalId: calf?.id ?? ganga.id, weighedOn: "2026-10-14", kilograms: "22.4" },
  ]);

  const [feed] = await db
    .insert(feedItems)
    .values({ farmId, name: "Compound cattle feed", category: "concentrate", unit: "kg", minimumQuantity: "300.0" })
    .returning();
  await db.insert(feedMovements).values([
    { farmId, itemId: feed.id, kind: "opening", quantity: "1000.0", movedOn: "2026-04-01" },
    { farmId, itemId: feed.id, kind: "purchase", quantity: "500.0", unitCost: "28.00", movedOn: "2026-04-10" },
    { farmId, itemId: feed.id, kind: "consumption", quantity: "1200.0", movedOn: "2026-04-30" },
    { farmId, itemId: feed.id, kind: "wastage", quantity: "15.0", movedOn: "2026-04-30" },
  ]);

  await db.insert(listings).values({
    farmId,
    animalId: kaveri.id,
    category: "heifers",
    price: "150000.00",
    published: "yes",
    showPedigree: "yes",
    showPregnancy: "no",
    publicNote: "Gir heifer from the home herd.",
  });
  await db.insert(products).values({
    farmId,
    name: "Gir ghee",
    category: "dairy",
    price: "850.00",
    stock: 20,
    published: "yes",
  });
}
