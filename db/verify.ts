import { config } from "dotenv";

config({ path: ".env" });

async function main() {
  const { db } = await import("./index");
  const { animals } = await import("./schema");
  const { herdCounts } = await import("../lib/herd-stats");
  const { farmToday } = await import("../lib/dates");
  const rows = await db.select().from(animals);
  const dams = new Set(rows.map((row) => row.geneticDamId).filter((id): id is string => Boolean(id)));
  const today = farmToday("Asia/Kolkata");
  console.log(
    JSON.stringify({
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

main();
