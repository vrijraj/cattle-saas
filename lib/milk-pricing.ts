export type MilkPriceRule = {
  effectiveFrom: string;
  pricePerLitre: string | number;
  fatBonusPerPoint?: string | number | null;
  snfBonusPerPoint?: string | number | null;
};

const BASE_FAT_PERCENT = 4.0;
const BASE_SNF_PERCENT = 8.5;

export function milkPriceOnDate(
  date: string,
  history: MilkPriceRule[],
  fallbackPrice: string | number | null | undefined,
  quality?: { fatPercent?: string | number | null; snfPercent?: string | number | null },
): number | null {
  const sorted = [...history]
    .filter((row) => row.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  const rule = sorted[0];
  let base: number | null = null;
  if (rule) {
    const parsed = Number(rule.pricePerLitre);
    if (Number.isFinite(parsed) && parsed >= 0) base = parsed;
  } else if (fallbackPrice !== null && fallbackPrice !== undefined && fallbackPrice !== "") {
    const parsed = Number(fallbackPrice);
    if (Number.isFinite(parsed) && parsed >= 0) base = parsed;
  }

  if (base === null) return null;

  let adjusted = base;
  if (rule && quality) {
    const fat = quality.fatPercent !== null && quality.fatPercent !== undefined && quality.fatPercent !== "" ? Number(quality.fatPercent) : null;
    const fatBonus = rule.fatBonusPerPoint ? Number(rule.fatBonusPerPoint) : 0;
    if (fat !== null && Number.isFinite(fat) && Number.isFinite(fatBonus) && fatBonus !== 0) {
      adjusted += (fat - BASE_FAT_PERCENT) * fatBonus;
    }
    const snf = quality.snfPercent !== null && quality.snfPercent !== undefined && quality.snfPercent !== "" ? Number(quality.snfPercent) : null;
    const snfBonus = rule.snfBonusPerPoint ? Number(rule.snfBonusPerPoint) : 0;
    if (snf !== null && Number.isFinite(snf) && Number.isFinite(snfBonus) && snfBonus !== 0) {
      adjusted += (snf - BASE_SNF_PERCENT) * snfBonus;
    }
  }

  return Math.max(0, Math.round(adjusted * 100) / 100);
}

export function milkRevenueForRows(
  rows: {
    recordedOn: string;
    morningLitres: string | number | null;
    eveningLitres: string | number | null;
    fatPercent?: string | number | null;
    snfPercent?: string | number | null;
    voidedAt?: Date | null;
  }[],
  history: MilkPriceRule[],
  fallbackPrice: string | number | null | undefined,
): number {
  let total = 0;
  for (const row of rows) {
    if (row.voidedAt) continue;
    const litres = Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0);
    if (litres <= 0) continue;
    const price = milkPriceOnDate(row.recordedOn, history, fallbackPrice, {
      fatPercent: row.fatPercent,
      snfPercent: row.snfPercent,
    });
    if (price !== null) total += litres * price;
  }
  return Math.round(total * 100) / 100;
}
