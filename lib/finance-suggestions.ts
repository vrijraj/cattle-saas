export type FinanceSuggestion = {
  key: string;
  kind: "income" | "expense";
  category: string;
  amount: number;
  entryOn: string;
  label: string;
};

export function milkValueSuggestion(input: {
  month: string;
  litres: number;
  price: number | null;
  existingNotes: (string | null)[];
}): FinanceSuggestion | null {
  const key = `suggested:milk:${input.month}`;
  if (!input.price || input.litres <= 0) return null;
  if (input.existingNotes.some((note) => note?.includes(key))) return null;
  return {
    key,
    kind: "income",
    category: "milk",
    amount: Math.round(input.litres * input.price * 100) / 100,
    entryOn: `${input.month}-01`,
    label: `Milk ${input.month}: ${input.litres.toFixed(1)} L × ₹${input.price}`,
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
}): FinanceSuggestion | null {
  if (input.amount <= 0) return null;
  if (input.existingNotes.some((note) => note?.includes(input.key))) return null;
  return { key: input.key, kind: input.kind, category: input.category, amount: input.amount, entryOn: input.entryOn, label: input.label };
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
