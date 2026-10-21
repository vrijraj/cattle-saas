import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { siteConfig } from "../../lib/site-config";
import { breedCatalogue } from "./breeds";

config({ path: ".env" });

const password = "demo-farm-2026";

const people = [
  ["Asha Rao", "asha@shreegir.test", ["owner", "admin"]],
  ["Imran Qureshi", "imran@shreegir.test", ["manager"]],
  ["Dr. N. Patil", "patil@shreegir.test", ["vet"]],
  ["S. Jadhav", "jadhav@shreegir.test", ["ai_technician"]],
  ["Lata More", "lata@shreegir.test", ["worker"]],
  ["K. Shah", "shah@shreegir.test", ["accountant"]],
  ["R. Deshmukh", "deshmukh@shreegir.test", ["genetics"]],
] as const;

const sheds = ["Milking shed", "Dry shed", "Calving pen", "Calf pen", "Bull pen", "Isolation", "Hospital"];

const herd = [
  animal("MIL-GIR-001", "Jamuna", "GIR", "female", "2019-03-12", "on_farm", "cow", "open", "lactating", "Milking shed", undefined, "BULL-GIR-002"),
  animal("MIL-GIR-002", "Savitri", "GIR", "female", "2020-07-04", "on_farm", "cow", "pregnant", "dry", "Dry shed", "MIL-GIR-001", "BULL-GIR-002"),
  animal("MIL-GIR-003", "Radha", "GIR", "female", "2021-01-19", "on_farm", "cow", "pregnant", "lactating", "Milking shed", "MIL-GIR-001", "BULL-HF-010"),
  animal("MIL-GIR-004", "Ganga", "GIR", "female", "2021-11-02", "on_farm", "cow", "fresh", "lactating", "Milking shed", "MIL-GIR-001", "BULL-GIR-014", "Sagar"),
  animal("MIL-GIR-005", "Godavari", "GIR", "female", "2022-05-15", "on_farm", "cow", "open", "lactating", "Milking shed", undefined, "BULL-GIR-014", "Sagar"),
  animal("MIL-GIR-006", "Kaveri", "GIR", "female", "2023-09-09", "on_farm", "heifer", "pregnant", "pre_lactation", "Dry shed", "MIL-GIR-002", "BULL-GIR-014", "Sagar"),
  animal("MIL-GIR-007", "Narmada", "GIR", "female", "2025-02-01", "on_farm", "heifer", "open", "pre_lactation", "Calf pen", "MIL-GIR-003", "BULL-GIR-014", "Sagar"),
  animal("MIL-GIR-008", "Krishna", "GIR", "male", "2024-08-20", "on_farm", "bull", "not_applicable", "not_applicable", "Bull pen", "MIL-GIR-005", "BULL-GIR-002"),
  animal("MIL-HF-001", "Holi", "HFX", "female", "2022-12-11", "on_farm", "cow", "bred", "lactating", "Milking shed", undefined, "BULL-HF-010"),
  animal("MIL-MUR-001", "Meera", "MUR", "female", "2021-04-08", "on_farm", "cow", "open", "dry", "Dry shed", undefined, "BULL-MUR-001"),
  animal("MIL-GIR-018", "Ganga's calf", "GIR", "female", "2026-10-14", "on_farm", "calf", "open", "pre_lactation", "Calf pen", "MIL-GIR-004", "BULL-GIR-014", "Sagar"),
  animal("MIL-GIR-009", "Tulsi", "GIR", "female", "2018-06-03", "sold", "cow", "open", "dry", null, undefined, undefined),
];

async function main() {
  const { db } = await import("../index");
  const { alerts, animals, breeds, codeCounters, farmMembers, farms, locations, users } = await import("../schema");

  const [existing] = await db.select({ id: farms.id }).from(farms).where(eq(farms.slug, "shree-gir")).limit(1);
  if (existing) {
    const { seedOperations } = await import("./operations");
    await seedOperations(db, existing.id);
    const { seedLaunchGaps } = await import("./launch");
    await seedLaunchGaps(db, existing.id);
    console.log("Sample farm ready. Sign in as asha@shreegir.test / demo-farm-2026");
    const { closeDb } = await import("../close");
    await closeDb();
    return;
  }

  const passwordHash = await hash(password);
  const [farm] = await db
    .insert(farms)
    .values({
      name: siteConfig.name,
      slug: "shree-gir",
      timezone: "Asia/Kolkata",
      currency: "INR",
      animalPrefix: "MIL",
      milkPricePerLitre: "55.00",
    })
    .returning();

  const userIds = new Map<string, string>();
  for (const [name, email, roles] of people) {
    const [user] = await db
      .insert(users)
      .values({ name, email, passwordHash, emailVerified: new Date() })
      .returning();
    userIds.set(email, user.id);
    await db.insert(farmMembers).values({ farmId: farm.id, userId: user.id, roles: [...roles] });
  }

  const breedIds = new Map<string, string>();
  for (const [name, code, species, gestationDays] of breedCatalogue) {
    const [breed] = await db
      .insert(breeds)
      .values({ farmId: farm.id, name, code, species, gestationDays })
      .returning();
    breedIds.set(code, breed.id);
  }

  const locationIds = new Map<string, string>();
  for (const name of sheds) {
    const [location] = await db.insert(locations).values({ farmId: farm.id, name }).returning();
    locationIds.set(name, location.id);
  }

  const animalIds = new Map<string, string>();
  for (const row of herd) {
    const [created] = await db
      .insert(animals)
      .values({
        farmId: farm.id,
        code: row.code,
        name: row.name,
        species: row.breed === "MUR" ? "buffalo" : "cattle",
        breedId: breedIds.get(row.breed)!,
        sex: row.sex,
        dob: row.dob,
        presence: row.presence,
        lifeStage: row.lifeStage,
        reproduction: row.reproduction,
        lactation: row.lactation,
        locationId: row.location ? locationIds.get(row.location) : null,
        qrToken: randomBytes(32).toString("base64url"),
        geneticSireCode: row.sireCode,
        geneticSireName: row.sireName ?? row.sireCode,
        createdBy: userIds.get("asha@shreegir.test"),
      })
      .returning();
    animalIds.set(row.code, created.id);
  }

  for (const row of herd) {
    if (!row.damCode) continue;
    await db
      .update(animals)
      .set({ geneticDamId: animalIds.get(row.damCode) })
      .where(eq(animals.id, animalIds.get(row.code)!));
  }

  await db.insert(codeCounters).values([
    { farmId: farm.id, breedCode: "GIR", nextValue: 19 },
    { farmId: farm.id, breedCode: "HF", nextValue: 2 },
    { farmId: farm.id, breedCode: "HFX", nextValue: 1 },
    { farmId: farm.id, breedCode: "MUR", nextValue: 2 },
  ]);

  await db.insert(alerts).values([
    {
      farmId: farm.id,
      animalId: animalIds.get("MIL-GIR-007"),
      type: "vaccine_due",
      title: "Vaccination due",
      body: "MIL-GIR-007 Narmada FMD due 15 Oct 2026.",
      dueOn: "2026-10-15",
    },
    {
      farmId: farm.id,
      animalId: animalIds.get("MIL-GIR-008"),
      type: "vaccine_due",
      title: "Vaccination due",
      body: "MIL-GIR-008 Krishna FMD due 15 Oct 2026.",
      dueOn: "2026-10-15",
    },
  ]);

  const { seedOperations } = await import("./operations");
  await seedOperations(db, farm.id);
  const { seedLaunchGaps } = await import("./launch");
  await seedLaunchGaps(db, farm.id);
  console.log(`Seeded ${siteConfig.name}. Sign in as asha@shreegir.test / demo-farm-2026`);
  const { closeDb } = await import("../close");
  await closeDb();
}

function animal(
  code: string,
  name: string,
  breed: string,
  sex: "female" | "male",
  dob: string,
  presence: "on_farm" | "sold",
  lifeStage: "calf" | "heifer" | "cow" | "bull",
  reproduction: "not_applicable" | "open" | "bred" | "pregnant" | "fresh",
  lactation: "not_applicable" | "pre_lactation" | "lactating" | "dry",
  location: string | null,
  damCode?: string,
  sireCode?: string,
  sireName?: string,
) {
  return { code, name, breed, sex, dob, presence, lifeStage, reproduction, lactation, location, damCode, sireCode, sireName };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
