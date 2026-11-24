export const FEED_KINDS = ["opening", "purchase", "consumption", "wastage", "adjustment"] as const;
export const FEED_CATEGORIES = ["green", "dry", "silage", "concentrate", "mineral", "other"] as const;

const SIGN: Record<string, number> = {
  opening: 1,
  purchase: 1,
  consumption: -1,
  wastage: -1,
  adjustment: 1,
};

export const feedCategoryLabel: Record<string, string> = {
  green: "Green fodder",
  dry: "Dry fodder",
  silage: "Silage",
  concentrate: "Concentrate",
  mineral: "Mineral",
  other: "Other",
};

export const feedKindLabel: Record<string, string> = {
  opening: "Opening",
  purchase: "Purchase",
  consumption: "Consumption",
  wastage: "Wastage",
  adjustment: "Adjustment",
};

export function isFeedKind(value: string): value is (typeof FEED_KINDS)[number] {
  return (FEED_KINDS as readonly string[]).includes(value);
}

export function isFeedCategory(value: string): value is (typeof FEED_CATEGORIES)[number] {
  return (FEED_CATEGORIES as readonly string[]).includes(value);
}

export function feedSign(kind: string) {
  return SIGN[kind] ?? 0;
}

export function feedSignedDelta(kind: string, quantity: string | number) {
  const num = Number(quantity);
  if (!Number.isFinite(num)) return 0;
  if (kind === "adjustment") return num;
  const sign = feedSign(kind);
  if (sign === 0) return 0;
  return Math.abs(num) * sign;
}

export function feedBalance(rows: { kind: string; quantity: string | number; voidedAt?: Date | null }[]) {
  return rows.reduce((sum, row) => {
    if (row.voidedAt) return sum;
    return sum + feedSignedDelta(row.kind, row.quantity);
  }, 0);
}

export function feedAverageUnitCost(rows: { kind: string; quantity: string | number; unitCost: string | number | null; voidedAt?: Date | null }[]) {
  let totalCost = 0;
  let totalQty = 0;
  for (const row of rows) {
    if (row.voidedAt) continue;
    if (row.kind !== "purchase" && row.kind !== "opening") continue;
    const cost = row.unitCost === null || row.unitCost === "" ? NaN : Number(row.unitCost);
    const qty = Math.abs(Number(row.quantity));
    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(qty) || qty <= 0) continue;
    totalCost += qty * cost;
    totalQty += qty;
  }
  return totalQty > 0 ? Math.round((totalCost / totalQty) * 100) / 100 : null;
}

export function feedIsLow(balance: number, minimum: string | null) {
  return Boolean(minimum) && balance <= Number(minimum);
}

export function feedQuantityLabel(kind: string, quantity: string | number) {
  const delta = feedSignedDelta(kind, quantity);
  const amount = Math.abs(delta).toFixed(1);
  if (delta < 0) return `−${amount}`;
  if (delta > 0) return `+${amount}`;
  return amount;
}
