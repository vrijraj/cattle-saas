import { mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("pglite:")) {
    mkdirSync(path.dirname(url.slice("pglite:".length)), { recursive: true });
  }
  const { getDb } = await import("./index");
  const database = getDb();
  const folder = "./db/migrations";
  if (url.startsWith("postgres")) {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(database, { migrationsFolder: folder });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(database as never, { migrationsFolder: folder });
  }
  console.log("Migrations applied");
  const { closeDb } = await import("./close");
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
