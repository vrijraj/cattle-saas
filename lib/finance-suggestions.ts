import { feedAverageUnitCost } from "@/lib/feed-stock";

export const INCOME_CATEGORIES = ["milk", "cattle sales", "calves", "semen", "embryos", "ghee and dairy products", "farmhouse", "other"] as const;
export const EXPENSE_CATEGORIES = ["feed", "medicine", "veterinary", "labour", "breeding", "semen", "embryo work", "electricity", "transport", "other"] as const;

export function canonicalCategory(kind: "income" | "expense", category: string) {
  const allowed = kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return allowed.find((item) => item.toLowerCase() === category.trim().toLowerCase()) ?? null;
}

export function countsInAnimalBooks(note: string | null, sourceKey?: string | null) {
  const key = sourceKey ?? note ?? "";
  if (!key) return true;
  return (
    !key.includes("suggested:milk:") &&
    !key.includes("suggested:medicine:") &&
    !key.includes("suggested:semen:") &&
    !key.includes("suggested:feed:") &&
    !key.includes("suggested:sale:")
  );
}

export function animalResult(input: { litres: number; price: number; sale: number; feed: number; medicine: number; breeding: number }) {
  const milkValue = Math.round(input.litres * input.price * 100) / 100;
  const total = Math.round((milkValue + input.sale - input.feed - input.medicine - input.breeding) * 100) / 100;
  return { milkValue, sale: input.sale, feed: input.feed, medicine: input.medicine, breeding: input.breeding, total };
}

export function allocatedFeedCost(
  rows: { itemId?: string; kind: string; quantity: string | number; unitCost: string | number | null; note: string | null; voidedAt?: Date | null }[],
  code: string,
) {
  const mark = ` · ${code}`;
  const avgByItem = new Map<string, number | null>();
  for (const row of rows) {
    if (!row.itemId || avgByItem.has(row.itemId)) continue;
    avgByItem.set(
      row.itemId,
      feedAverageUnitCost(rows.filter((item) => item.itemId === row.itemId)),
    );
  }
  return Math.round(
    rows.reduce((sum, row) => {
      if (row.voidedAt || row.kind !== "consumption" || !row.note?.endsWith(mark)) return sum;
      const directCost = row.unitCost !== null && row.unitCost !== "" ? Number(row.unitCost) : null;
      const avgCost = row.itemId ? (avgByItem.get(row.itemId) ?? null) : null;
      const rate = directCost !== null && Number.isFinite(directCost) ? directCost : avgCost;
      if (rate === null || rate <= 0) return sum;
      return sum + Math.abs(Number(row.quantity)) * rate;
    }, 0) * 100,
  ) / 100;
}

export type FinanceSuggestion = {
  key: string;
  kind: "income" | "expense";
  category: string;
  amount: number;
  entryOn: string;
  label: string;
  animalId?: string;
};

export function milkValueSuggestion(input: {
  month: string;
  litres: number;
  price: number | null;
  existingNotes: (string | null)[];
}): FinanceSuggestion | null {
  const key = `suggested:milk:${input.month}`;
  if (!input.price || input.litres <= 0) return null;
  if (input.existingNotes.some((note) => note === key || note?.includes(key))) return null;
  return {
    key,
    kind: "income",
    category: "milk",
    amount: Math.round(input.litres * input.price * 100) / 100,
    entryOn: `${input.month}-01`,
    label: `Milk · ${input.month} · ${input.litres.toFixed(1)} L × ₹${input.price}`,
  };
}

export function keyedSuggestion(input: {
  key: string;
  kind: "income" | "expense";
  category: string;
  amount: number;
  entryOn: string;
  label: string;
  existingNotes: (string | null)[];
  animalId?: string;
}): FinanceSuggestion | null {
  if (input.amount <= 0) return null;
  if (input.existingNotes.some((note) => note === input.key || note?.includes(input.key))) return null;
  return { key: input.key, kind: input.kind, category: input.category, amount: input.amount, entryOn: input.entryOn, label: input.label, animalId: input.animalId };
}

export function monthTotals(rows: { entryOn: string; kind: string; category: string; amount: number; voided: boolean }[]) {
  const months = new Map<string, { income: number; expense: number; categories: Map<string, number> }>();
  for (const row of rows) {
    if (row.voided) continue;
    const month = row.entryOn.slice(0, 7);
    const current = months.get(month) ?? { income: 0, expense: 0, categories: new Map() };
    if (row.kind === "income") current.income += row.amount;
    else current.expense += row.amount;
    const signed = row.kind === "income" ? row.amount : -row.amount;
    current.categories.set(row.category, (current.categories.get(row.category) ?? 0) + signed);
    months.set(month, current);
  }
  return [...months.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, totals]) => ({
      month,
      income: totals.income,
      expense: totals.expense,
      surplus: totals.income - totals.expense,
      categories: [...totals.categories.entries()],
    }));
}
