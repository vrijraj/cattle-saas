import { config } from "dotenv";

config({ path: ".env" });

async function main() {
  const { eq } = await import("drizzle-orm");
  const { db } = await import("./index");
  const { animals, farms } = await import("./schema");
  const { herdCounts } = await import("../lib/herd-stats");
  const { farmToday } = await import("../lib/dates");
  const [farm] = await db.select().from(farms).where(eq(farms.slug, "shree-gir")).limit(1);
  if (!farm) {
    console.error("Sample farm shree-gir not found.");
    process.exitCode = 1;
    return;
  }
  const rows = await db.select().from(animals).where(eq(animals.farmId, farm.id));
  const dams = new Set(rows.map((row) => row.geneticDamId).filter((id): id is string => Boolean(id)));
  const today = farmToday(farm.timezone);
  console.log(
    JSON.stringify({
      farm: farm.name,
      today,
      animals: rows.length,
      counts: herdCounts(
        rows.map((row) => ({
          id: row.id,
          presence: row.presence,
          lactation: row.lactation,
          reproduction: row.reproduction,
          dob: row.dob,
          isDam: dams.has(row.id),
        })),
        today,
      ),
    }),
  );
  const { closeDb } = await import("./close");
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
