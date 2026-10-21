import { hash } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
import { addDays, farmToday } from "../../lib/dates";
import { animalMilkDrop, milkDropBody } from "../../lib/milk-drop";
import type { db as database } from "../index";

type Database = typeof database;

export async function seedLaunchGaps(db: Database, farmId: string) {
  const { alerts, animals, calvings, healthEvents, locations, locationMoves, milkYields } = await import("../schema");
  const today = farmToday("Asia/Kolkata");
  const herd = await db.select().from(animals).where(eq(animals.farmId, farmId));
  const byCode = new Map(herd.map((animal) => [animal.code, animal]));
  const jamuna = byCode.get("MIL-GIR-001");
  const radha = byCode.get("MIL-GIR-003");
  const krishna = byCode.get("MIL-GIR-008");

  if (jamuna) {
    const births = await db.select({ id: calvings.id }).from(calvings).where(eq(calvings.damId, jamuna.id));
    if (births.length === 0) {
      await db.insert(calvings).values({
        farmId,
        damId: jamuna.id,
        calvedOn: addDays(today, -50),
        outcome: "live",
      });
    }
    const existingMilk = await db
      .select({ id: milkYields.id })
      .from(milkYields)
      .where(and(eq(milkYields.animalId, jamuna.id), eq(milkYields.recordedOn, today)))
      .limit(1);
    if (existingMilk.length === 0) {
      const prior = Array.from({ length: 7 }, (_, index) => addDays(today, index - 7));
      await db.insert(milkYields).values([
        ...prior.map((recordedOn) => ({
          farmId,
          animalId: jamuna.id,
          recordedOn,
          morningLitres: "6.0",
          eveningLitres: "6.0",
        })),
        {
          farmId,
          animalId: jamuna.id,
          recordedOn: today,
          morningLitres: "3.0",
          eveningLitres: "4.0",
        },
      ]);
      const drop = animalMilkDrop({
        daysInMilk: 50,
        prior: prior.map((date) => ({ date, morning: 6, evening: 6, explained: false })),
        today: { date: today, morning: 3, evening: 4, explained: false },
      });
      if (drop) {
        await db.insert(alerts).values({
          farmId,
          animalId: jamuna.id,
          type: "milk_drop",
          title: `Milk drop · ${jamuna.name ?? jamuna.code}`,
          body: milkDropBody(drop),
          dueOn: today,
          status: "open",
        });
      }
    }
    const moves = await db.select({ id: locationMoves.id }).from(locationMoves).where(eq(locationMoves.animalId, jamuna.id)).limit(1);
    if (moves.length === 0 && jamuna.locationId) {
      await db.insert(locationMoves).values({
        farmId,
        animalId: jamuna.id,
        locationId: jamuna.locationId,
        movedOn: "2026-04-01",
        note: "Opening location",
      });
    }
  }

  if (radha && radha.lactation === "lactating" && radha.reproduction === "pregnant") {
    const expected = radha.expectedCalving ?? addDays(today, 50);
    if (!radha.expectedCalving) {
      await db.update(animals).set({ expectedCalving: expected }).where(eq(animals.id, radha.id));
    }
    const openDry = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(and(eq(alerts.animalId, radha.id), eq(alerts.type, "dry_off"), eq(alerts.status, "open")))
      .limit(1);
    if (openDry.length === 0) {
      const due = addDays(expected, -60);
      await db.insert(alerts).values({
        farmId,
        animalId: radha.id,
        type: "dry_off",
        title: "Dry-off due",
        body: `${radha.code} dry-off due ${due}, 60 days before expected calving ${expected}.`,
        dueOn: due,
        status: "open",
      });
    }
  }

  const narmada = byCode.get("MIL-GIR-007");
  if (narmada) {
    const doses = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(and(eq(alerts.animalId, narmada.id), eq(alerts.type, "medication_due")))
      .limit(1);
    if (doses.length === 0) {
      const due = addDays(today, 1);
      await db.insert(healthEvents).values({
        farmId,
        animalId: narmada.id,
        eventOn: today,
        problem: "Fever",
        medicine: "Oxytetracycline",
        dose: "1 ml / 10 kg",
        followUpOn: due,
        outcome: "ongoing",
      });
      await db.insert(alerts).values({
        farmId,
        animalId: narmada.id,
        type: "medication_due",
        title: "Medication due",
        body: `${narmada.code} Oxytetracycline dose due ${due}.`,
        dueOn: due,
        status: "open",
      });
    }
  }

  if (krishna && !krishna.isolationReason) {
    await db
      .update(animals)
      .set({ isolationReason: "Foot injury", isolatedOn: addDays(today, -3) })
      .where(eq(animals.id, krishna.id));
  }

  await seedSecondFarm(db);
}

async function seedSecondFarm(db: Database) {
  const { animals, breeds, farmMembers, farms, locations, users } = await import("../schema");
  const [existing] = await db.select({ id: farms.id }).from(farms).where(eq(farms.slug, "narmada-hills")).limit(1);
  if (existing) return;
  const passwordHash = await hash("demo-farm-2026");
  const [farm] = await db
    .insert(farms)
    .values({
      name: "Narmada Hills",
      slug: "narmada-hills",
      timezone: "Asia/Kolkata",
      currency: "INR",
      animalPrefix: "NAV",
      milkPricePerLitre: "52.00",
    })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      name: "Meera Nair",
      email: "meera@narmada.test",
      passwordHash,
      emailVerified: new Date(),
    })
    .returning();
  await db.insert(farmMembers).values({ farmId: farm.id, userId: user.id, roles: ["owner"] });
  const [breed] = await db
    .insert(breeds)
    .values({ farmId: farm.id, name: "Gir", code: "GIR", species: "cattle", gestationDays: 287 })
    .returning();
  const [shed] = await db.insert(locations).values({ farmId: farm.id, name: "Home shed" }).returning();
  await db.insert(animals).values({
    farmId: farm.id,
    code: "NAV-GIR-001",
    name: "Gauri",
    species: "cattle",
    breedId: breed.id,
    sex: "female",
    dob: "2022-02-02",
    presence: "on_farm",
    lifeStage: "cow",
    reproduction: "open",
    lactation: "lactating",
    locationId: shed.id,
    qrToken: `narmada-${farm.id}`,
    createdBy: user.id,
  });
}
