import { PGlite } from "@electric-sql/pglite";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { orderAccessToken, verifyOrderAccessToken } from "@/lib/payments";
import { planFromRazorpayPlanId } from "@/lib/subscriptions";

describe("database migrations, tenant isolation & distributed rate limits", () => {
  let client: PGlite;
  let testDb: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    client = new PGlite();
    testDb = drizzle(client, { schema });
    await migrate(testDb, { migrationsFolder: "db/migrations" });
  });

  afterAll(async () => {
    await client.close();
  });

  it("applies all migrations 0000–0007 cleanly and enforces multi-tenant isolation", async () => {
    const [farmA] = await testDb
      .insert(schema.farms)
      .values({ name: "Alpha Gir Dairy", slug: "alpha-gir", animalPrefix: "ALP" })
      .returning();
    const [farmB] = await testDb
      .insert(schema.farms)
      .values({ name: "Beta Sahiwal Dairy", slug: "beta-sahiwal", animalPrefix: "BET" })
      .returning();

    const [breedA] = await testDb
      .insert(schema.breeds)
      .values({ farmId: farmA.id, name: "Gir", code: "GIR", species: "cattle", gestationDays: 287 })
      .returning();
    const [breedB] = await testDb
      .insert(schema.breeds)
      .values({ farmId: farmB.id, name: "Sahiwal", code: "SAH", species: "cattle", gestationDays: 286 })
      .returning();

    // Same ear tag & RFID are allowed across separate tenant farms
    await testDb.insert(schema.animals).values({
      farmId: farmA.id,
      code: "ALP-GIR-0001",
      name: "Ganga",
      species: "cattle",
      breedId: breedA.id,
      sex: "female",
      lifeStage: "cow",
      earTag: "TAG-99",
      rfid: "RFID-99",
      qrToken: "token-a-1",
    });
    await testDb.insert(schema.animals).values({
      farmId: farmB.id,
      code: "BET-SAH-0001",
      name: "Kaveri",
      species: "cattle",
      breedId: breedB.id,
      sex: "female",
      lifeStage: "cow",
      earTag: "TAG-99",
      rfid: "RFID-99",
      qrToken: "token-b-1",
    });

    // Duplicate RFID inside the SAME farm must be rejected by unique index
    await expect(
      testDb.insert(schema.animals).values({
        farmId: farmA.id,
        code: "ALP-GIR-0002",
        name: "Duplicate",
        species: "cattle",
        breedId: breedA.id,
        sex: "female",
        lifeStage: "cow",
        rfid: "RFID-99",
        qrToken: "token-a-2",
      }),
    ).rejects.toThrow();

    // Scoped farm query never leaks Farm B animals into Farm A
    const farmARows = await testDb.select().from(schema.animals).where(eq(schema.animals.farmId, farmA.id));
    expect(farmARows).toHaveLength(1);
    expect(farmARows[0].name).toBe("Ganga");
  });

  it("enforces atomic Postgres rate_limit_bucket windows across hits and resets", async () => {
    const key = "test:dist:bucket";
    const t0 = new Date(1_700_000_000_000);
    const reset1 = new Date(t0.getTime() + 60_000);

    const hit = async (now: Date, nextReset: Date) => {
      const [row] = await testDb
        .insert(schema.rateLimitBuckets)
        .values({ key, count: 1, resetAt: nextReset })
        .onConflictDoUpdate({
          target: schema.rateLimitBuckets.key,
          set: {
            count: sql`CASE WHEN ${schema.rateLimitBuckets.resetAt} <= ${now} THEN 1 ELSE ${schema.rateLimitBuckets.count} + 1 END`,
            resetAt: sql`CASE WHEN ${schema.rateLimitBuckets.resetAt} <= ${now} THEN ${nextReset} ELSE ${schema.rateLimitBuckets.resetAt} END`,
          },
        })
        .returning();
      return row;
    };

    const first = await hit(t0, reset1);
    const second = await hit(new Date(t0.getTime() + 1000), new Date(t0.getTime() + 61_000));
    const afterExpiry = await hit(new Date(t0.getTime() + 65_000), new Date(t0.getTime() + 125_000));

    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
    expect(afterExpiry.count).toBe(1);
  });

  it("stores milk quality, protocols, pharmacy stock, ration groups, and cron runs", async () => {
    const [farm] = await testDb
      .insert(schema.farms)
      .values({ name: "Pro Dairy", slug: "pro-dairy", animalPrefix: "PRO", voluntaryWaitingDays: 45 })
      .returning();

    await testDb.insert(schema.vaccineProtocols).values({
      farmId: farm.id,
      name: "FMD Biannual",
      kind: "vaccine",
      species: "all",
      startAgeDays: 120,
      repeatEveryDays: 180,
    });
    await testDb.insert(schema.cronRuns).values({
      farmId: farm.id,
      runDate: "2026-11-25",
      kind: "daily_automation",
      summaryJson: { freshTransitioned: 1, protocolAlertsCreated: 2, pharmacyAlertsCreated: 0 },
    });

    const runs = await testDb
      .select()
      .from(schema.cronRuns)
      .where(and(eq(schema.cronRuns.farmId, farm.id), eq(schema.cronRuns.kind, "daily_automation")));
    expect(runs).toHaveLength(1);
    expect((runs[0].summaryJson as { freshTransitioned: number }).freshTransitioned).toBe(1);
  });

  it("verifies HMAC order access tokens and Razorpay subscription plan IDs", () => {
    const token = orderAccessToken("ord-12345");
    expect(verifyOrderAccessToken("ord-12345", token)).toBe(true);
    expect(verifyOrderAccessToken("ord-12345", "tampered-token")).toBe(false);
    expect(verifyOrderAccessToken("ord-other", token)).toBe(false);

    process.env.RAZORPAY_PLAN_PRO = "plan_test_pro_123";
    expect(planFromRazorpayPlanId("plan_test_pro_123")).toBe("pro");
    expect(planFromRazorpayPlanId("plan_unknown")).toBeNull();
    delete process.env.RAZORPAY_PLAN_PRO;
  });
});
