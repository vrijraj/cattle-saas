import { eq } from "drizzle-orm";
import type { db as DbType } from "../index";
import {
  feedItems,
  medicineItems,
  medicineMovements,
  milkPriceHistory,
  rationGroupItems,
  rationGroups,
  users,
  vaccineProtocols,
} from "../schema";

export const DEFAULT_INDIAN_PROTOCOLS = [
  { name: "FMD (Foot & Mouth Disease)", kind: "vaccine", species: "all", startAgeDays: 120, repeatEveryDays: 180, note: "Booster after 30 days on primary dose, then every 6 months." },
  { name: "HS (Haemorrhagic Septicaemia)", kind: "vaccine", species: "all", startAgeDays: 180, repeatEveryDays: 365, note: "Pre-monsoon annual vaccination." },
  { name: "BQ (Black Quarter)", kind: "vaccine", species: "all", startAgeDays: 180, repeatEveryDays: 365, note: "Pre-monsoon annual vaccination in endemic areas." },
  { name: "Brucellosis (S19 female calves)", kind: "vaccine", species: "all", startAgeDays: 150, repeatEveryDays: null, note: "Once in lifetime for female calves aged 4–8 months." },
  { name: "Theileriosis", kind: "vaccine", species: "cattle", startAgeDays: 90, repeatEveryDays: null, note: "Recommended for crossbred and exotic cattle." },
  { name: "Deworming (Broad spectrum)", kind: "deworming", species: "all", startAgeDays: 30, repeatEveryDays: 90, note: "Quarterly deworming schedule." },
] as const;

export async function seedProModules(db: typeof DbType, farmId: string) {
  await db.update(users).set({ isSuperAdmin: true }).where(eq(users.email, "asha@shreegir.test"));

  const existingProtocols = await db.select({ id: vaccineProtocols.id }).from(vaccineProtocols).where(eq(vaccineProtocols.farmId, farmId)).limit(1);
  if (existingProtocols.length === 0) {
    await db.insert(vaccineProtocols).values(
      DEFAULT_INDIAN_PROTOCOLS.map((item) => ({
        farmId,
        name: item.name,
        kind: item.kind,
        species: item.species,
        startAgeDays: item.startAgeDays,
        repeatEveryDays: item.repeatEveryDays,
        note: item.note,
      })),
    );
  }

  const existingPrices = await db.select({ id: milkPriceHistory.id }).from(milkPriceHistory).where(eq(milkPriceHistory.farmId, farmId)).limit(1);
  if (existingPrices.length === 0) {
    await db
      .insert(milkPriceHistory)
      .values([
        { farmId, effectiveFrom: "2026-01-01", pricePerLitre: "52.00", fatBonusPerPoint: "1.50", snfBonusPerPoint: "1.00", note: "Winter procurement rate" },
        { farmId, effectiveFrom: "2026-06-01", pricePerLitre: "55.00", fatBonusPerPoint: "1.75", snfBonusPerPoint: "1.00", note: "Updated Gir A2 rate" },
      ])
      .onConflictDoNothing();
  }

  const existingMeds = await db.select({ id: medicineItems.id }).from(medicineItems).where(eq(medicineItems.farmId, farmId)).limit(1);
  if (existingMeds.length === 0) {
    const inserted = await db
      .insert(medicineItems)
      .values([
        { farmId, name: "Oxytetracycline LA", category: "antibiotic", unit: "ml", batchNumber: "OXY-2604", expiresOn: "2027-04-30", minimumQuantity: "100.0", unitCost: "2.40" },
        { farmId, name: "Meloxicam + Paracetamol", category: "anti_inflammatory", unit: "ml", batchNumber: "MEL-2608", expiresOn: "2027-08-31", minimumQuantity: "100.0", unitCost: "1.80" },
        { farmId, name: "Calcium Borogluconate", category: "supplement", unit: "ml", batchNumber: "CAL-2603", expiresOn: "2026-12-15", minimumQuantity: "450.0", unitCost: "0.45" },
      ])
      .returning();
    await db.insert(medicineMovements).values(
      inserted.map((item) => ({
        farmId,
        itemId: item.id,
        kind: "opening",
        quantity: item.unit === "ml" && item.name.includes("Calcium") ? "900.0" : "250.0",
        unitCost: item.unitCost,
        movedOn: "2026-10-01",
        note: "Opening pharmacy stock",
      })),
    );
  }

  const existingRations = await db.select({ id: rationGroups.id }).from(rationGroups).where(eq(rationGroups.farmId, farmId)).limit(1);
  if (existingRations.length === 0) {
    const feeds = await db.select().from(feedItems).where(eq(feedItems.farmId, farmId));
    if (feeds.length > 0) {
      const [highGroup, dryGroup] = await db
        .insert(rationGroups)
        .values([
          { farmId, name: "Milking herd ration", targetStage: "lactating", note: "Standard milking group daily TMR" },
          { farmId, name: "Dry cow maintenance", targetStage: "dry", note: "Low-energy maintenance ration" },
        ])
        .returning();
      const rationRows: { farmId: string; groupId: string; feedItemId: string; kgPerHeadPerDay: string }[] = [];
      for (const feed of feeds.slice(0, 3)) {
        rationRows.push({
          farmId,
          groupId: highGroup.id,
          feedItemId: feed.id,
          kgPerHeadPerDay: feed.category === "concentrate" ? "4.50" : feed.category === "green" ? "18.00" : "6.00",
        });
        rationRows.push({
          farmId,
          groupId: dryGroup.id,
          feedItemId: feed.id,
          kgPerHeadPerDay: feed.category === "concentrate" ? "1.50" : feed.category === "green" ? "12.00" : "5.00",
        });
      }
      if (rationRows.length > 0) await db.insert(rationGroupItems).values(rationRows);
    }
  }
}
