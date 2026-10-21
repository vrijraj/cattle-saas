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

export function feedBalance(rows: { kind: string; quantity: string | number }[]) {
  return rows.reduce((sum, row) => sum + Number(row.quantity) * feedSign(row.kind), 0);
}

export function feedIsLow(balance: number, minimum: string | null) {
  return Boolean(minimum) && balance <= Number(minimum);
}

export function feedQuantityLabel(kind: string, quantity: string | number) {
  const amount = Math.abs(Number(quantity)).toFixed(1);
  const sign = feedSign(kind);
  if (sign < 0) return `−${amount}`;
  if (sign > 0) return `+${amount}`;
  return amount;
}
