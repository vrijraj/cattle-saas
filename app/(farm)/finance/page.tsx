import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, farms, feedItems, feedMovements, financeEntries, healthEvents, inseminations, milkYields, semenBatches, straws } from "@/db/schema";
import { saveFinance } from "@/app/(farm)/herd/actions";
import { confirmSuggestion } from "@/app/(farm)/finance/actions";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { allocatedFeedCost, animalResult, countsInAnimalBooks, EXPENSE_CATEGORIES, INCOME_CATEGORIES, keyedSuggestion, milkValueSuggestion, monthTotals } from "@/lib/finance-suggestions";
import { requireFarm } from "@/lib/farm-context";
import { canRecordFinance, canViewFinance } from "@/lib/permissions";
import { FormSelect } from "@/components/form-select";
import { RecordDialog } from "@/components/record-dialog";
import { VoidRecord } from "@/components/void-record";
import { EmptyRow, inputClass, Notice, Pill, Submit, Summary, Table, Td } from "@/components/workspace";

const messages: Record<string, string> = {
  role: "Your role cannot record finance.",
  amount: "Amount must be greater than zero.",
  category: "Choose an income or expense category.",
  date: "Use a date in YYYY-MM-DD.",
  animal: "Choose an animal on this farm.",
};

function rupees(value: number) {
  const body = Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `−₹${body}` : `₹${body}`;
}

function monthLabel(month: string) {
  return formatDisplayDate(`${month}-01`).slice(3);
}

export const metadata = { title: "Finance" };

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const farm = await requireFarm();
  if (!canViewFinance(farm.roles)) redirect("/dashboard");
  const query = await searchParams;
  const today = farmToday(farm.timezone);
  const canRecord = canRecordFinance(farm.roles);
  const [rows, farmRow, herd, milk, health, batches, movements, services, strawRows, feedItemRows] = await Promise.all([
    db.select().from(financeEntries).where(eq(financeEntries.farmId, farm.farmId)),
    db.select().from(farms).where(eq(farms.id, farm.farmId)).limit(1).then((list) => list[0]),
    db.select().from(animals).where(eq(animals.farmId, farm.farmId)).orderBy(animals.code),
    db.select().from(milkYields).where(eq(milkYields.farmId, farm.farmId)),
    db.select().from(healthEvents).where(eq(healthEvents.farmId, farm.farmId)),
    db.select().from(semenBatches).where(eq(semenBatches.farmId, farm.farmId)),
    db.select().from(feedMovements).where(eq(feedMovements.farmId, farm.farmId)),
    db.select().from(inseminations).where(eq(inseminations.farmId, farm.farmId)),
    db.select().from(straws).where(eq(straws.farmId, farm.farmId)),
    db.select().from(feedItems).where(eq(feedItems.farmId, farm.farmId)),
  ]);
  const feedById = new Map(feedItemRows.map((item) => [item.id, item]));
  const active = rows.filter((row) => !row.voidedAt);
  const notes = active.map((row) => row.note);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const price = farmRow?.milkPricePerLitre ? Number(farmRow.milkPricePerLitre) : 0;
  const monthLitres = milk
    .filter((row) => !row.voidedAt && row.recordedOn.startsWith(month))
    .reduce((sum, row) => sum + Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0), 0);
  const byId = new Map(herd.map((animal) => [animal.id, animal]));
  const suggestions = [
    milkValueSuggestion({ month, litres: monthLitres, price: price || null, existingNotes: notes }),
    ...health
      .filter((row) => !row.voidedAt && Number(row.cost) > 0)
      .map((row) => {
        const animal = byId.get(row.animalId);
        return keyedSuggestion({
          key: `suggested:medicine:${row.id}`,
          kind: "expense",
          category: "medicine",
          amount: Number(row.cost),
          entryOn: row.eventOn,
          label: `Medicine · ${animal?.name ?? animal?.code ?? "Animal"} · ${animal?.code ?? ""}`.replace(/ · $/, ""),
          existingNotes: notes,
          animalId: row.animalId,
        });
      }),
    ...batches
      .filter((row) => Number(row.pricePerStraw) > 0)
      .map((row) =>
        keyedSuggestion({
          key: `suggested:semen:${row.id}`,
          kind: "expense",
          category: "semen",
          amount: Number(row.pricePerStraw) * row.quantityReceived,
          entryOn: row.receivedOn ?? today,
          label: `Semen batch ${row.batchNumber} · ${row.quantityReceived} straws`,
          existingNotes: notes,
        }),
      ),
    ...movements
      .filter((row) => row.kind === "purchase" && Number(row.unitCost) > 0)
      .map((row) => {
        const item = feedById.get(row.itemId);
        return keyedSuggestion({
          key: `suggested:feed:${row.id}`,
          kind: "expense",
          category: "feed",
          amount: Math.round(Number(row.quantity) * Number(row.unitCost) * 100) / 100,
          entryOn: row.movedOn,
          label: `Feed purchase · ${item?.name ?? "Feed"} · ${row.quantity} ${item?.unit ?? "kg"}`,
          existingNotes: notes,
        });
      }),
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const months = monthTotals(active.map((row) => ({ entryOn: row.entryOn, kind: row.kind, category: row.category, amount: Number(row.amount), voided: false })));
  const yearRows = active.filter((row) => row.entryOn.startsWith(year));
  const yearCategories = [...yearRows.reduce((groups, row) => {
    const key = `${row.kind}:${row.category}`;
    const current = groups.get(key) ?? { kind: row.kind, category: row.category, amount: 0 };
    current.amount += Number(row.amount);
    groups.set(key, current);
    return groups;
  }, new Map<string, { kind: string; category: string; amount: number }>()).values()].sort((left, right) => left.kind.localeCompare(right.kind) || left.category.localeCompare(right.category));
  const strawPrice = new Map(strawRows.map((straw) => [straw.code, Number(batches.find((batch) => batch.id === straw.batchId)?.pricePerStraw ?? 0)]));
  const books = herd
    .map((animal) => {
      const litres = milk.filter((row) => row.animalId === animal.id && !row.voidedAt).reduce((sum, row) => sum + Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0), 0);
      const medicine = health.filter((row) => row.animalId === animal.id && !row.voidedAt).reduce((sum, row) => sum + Number(row.cost ?? 0), 0);
      const linked = active.filter((row) => row.animalId === animal.id && countsInAnimalBooks(row.note));
      const sale = linked.filter((row) => row.kind === "income" && (row.category === "cattle sales" || row.category === "calves")).reduce((sum, row) => sum + Number(row.amount), 0);
      const breedingEntries = linked
        .filter((row) => row.kind === "expense" && (row.category === "breeding" || row.category === "semen" || row.category === "embryo work"))
        .reduce((sum, row) => sum + Number(row.amount), 0);
      const strawCost = services
        .filter((row) => row.animalId === animal.id && !row.voidedAt && row.strawCode)
        .reduce((sum, row) => sum + (strawPrice.get(row.strawCode ?? "") ?? 0), 0);
      return { animal, ...animalResult({ litres, price, sale, feed: allocatedFeedCost(movements, animal.code), medicine, breeding: breedingEntries + strawCost }) };
    })
    .filter((row) => row.milkValue > 0 || row.sale > 0 || row.feed > 0 || row.medicine > 0 || row.breeding > 0);
  const income = active.filter((row) => row.kind === "income").reduce((sum, row) => sum + Number(row.amount), 0);
  const expense = active.filter((row) => row.kind === "expense").reduce((sum, row) => sum + Number(row.amount), 0);
  const register = [...rows].sort((left, right) => right.entryOn.localeCompare(left.entryOn) || right.createdAt.getTime() - left.createdAt.getTime());

  return (
    <div className="space-y-5">
      <Summary
        title="Finance"
        description="Farm income and expense for the register. An animal result uses that animal's milk, allocated feed, medicine, and breeding cost. Herd feed stays in the farm surplus."
        facts={[
          { label: "Income", value: rupees(income) },
          { label: "Expense", value: rupees(expense) },
          { label: "Surplus", value: rupees(income - expense) },
        ]}
      />
      {query.error && messages[query.error] ? <Notice tone="danger">{messages[query.error]}</Notice> : null}
      {query.saved ? <Notice>The finance entry is saved.</Notice> : null}
      {suggestions.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold">Suggested entries</h2>
          <p className="text-sm text-muted-foreground">Confirming creates one finance row. Refreshing this page does not create it again.</p>
          <ul className="space-y-2">
            {suggestions.map((item) => (
              <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted px-3 py-3">
                <span className="text-sm">
                  {item.label} · {formatDisplayDate(item.entryOn)} · {rupees(item.amount)}
                </span>
                {canRecord ? (
                  <form action={confirmSuggestion}>
                    <input type="hidden" name="key" value={item.key} />
                    <input type="hidden" name="kind" value={item.kind} />
                    <input type="hidden" name="category" value={item.category} />
                    <input type="hidden" name="amount" value={String(item.amount)} />
                    <input type="hidden" name="entryOn" value={item.entryOn} />
                    {item.animalId ? <input type="hidden" name="animalId" value={item.animalId} /> : null}
                    <Submit>Confirm</Submit>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">{year}</h2>
        <Table headers={["Category", "Type", "Amount"]}>
          {yearCategories.length === 0 ? <EmptyRow cols={3}>No entries in this year yet.</EmptyRow> : null}
          {yearCategories.map((row) => (
            <tr key={`${row.kind}:${row.category}`}>
              <Td className="font-medium capitalize">{row.category}</Td>
              <Td className="capitalize">{row.kind}</Td>
              <Td>{rupees(row.amount)}</Td>
            </tr>
          ))}
        </Table>
      </section>
      {months.length > 0 ? (
        <Table headers={["Month", "Income", "Expense", "Surplus"]}>
          {months.map((row) => (
            <tr key={row.month}>
              <Td className="font-medium">{monthLabel(row.month)}</Td>
              <Td>{rupees(row.income)}</Td>
              <Td>{rupees(row.expense)}</Td>
              <Td>{rupees(row.surplus)}</Td>
            </tr>
          ))}
        </Table>
      ) : null}
      {books.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">By animal</h2>
          <p className="text-sm text-muted-foreground">Milk value is recorded yield × ₹{price.toFixed(2)} per litre. A confirmed milk or medicine row stays in the farm register and is not added here again.</p>
          <Table headers={["Animal", "Milk", "Sale", "Feed", "Medicine", "Breeding", "Result"]}>
            {books.map((row) => (
              <tr key={row.animal.id}>
                <Td className="font-medium">
                  <Link href={`/animals/${row.animal.code}`} className="hover:underline">
                    {row.animal.name ?? row.animal.code} · {row.animal.code}
                  </Link>
                </Td>
                <Td>{rupees(row.milkValue)}</Td>
                <Td>{rupees(row.sale)}</Td>
                <Td>{rupees(row.feed)}</Td>
                <Td>{rupees(row.medicine)}</Td>
                <Td>{rupees(row.breeding)}</Td>
                <Td className="font-medium">{rupees(row.total)}</Td>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Register</h2>
          {canRecord ? (
            <RecordDialog title="Add entry" button="Add entry">
              <form action={saveFinance} className="grid gap-3">
                <label className="grid gap-1 text-sm">
                  Category
                  <FormSelect
                    name="category"
                    required
                    defaultValue="income:milk"
                    options={[
                      ...INCOME_CATEGORIES.map((category) => ({ value: `income:${category}`, label: `Income · ${category}` })),
                      ...EXPENSE_CATEGORIES.map((category) => ({ value: `expense:${category}`, label: `Expense · ${category}` })),
                    ]}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Amount (₹)
                    <input name="amount" type="number" min={0.01} max={100000000} step="0.01" required inputMode="decimal" placeholder="Amount" className={inputClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Date
                    <input name="entryOn" type="date" defaultValue={today} className={inputClass} />
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  Note
                  <input name="note" maxLength={240} placeholder="Note" className={inputClass} />
                </label>
                <label className="grid gap-1 text-sm">
                  Animal (optional)
                  <FormSelect
                    name="animalId"
                    defaultValue=""
                    options={[{ value: "", label: "Whole farm" }, ...herd.map((animal) => ({ value: animal.id, label: `${animal.name ?? animal.code} · ${animal.code}` }))]}
                  />
                </label>
                <div className="flex justify-end">
                  <Submit>Save entry</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null}
        </div>
        <Table headers={["Date", "Type", "Category", "Animal", "Amount", "Note", ""]}>
          {register.length === 0 ? <EmptyRow cols={7}>No entries yet.</EmptyRow> : null}
          {register.map((row) => {
            const animal = row.animalId ? byId.get(row.animalId) : undefined;
            return (
              <tr key={row.id} className={row.voidedAt ? "text-muted-foreground" : ""}>
                <Td>{formatDisplayDate(row.entryOn)}</Td>
                <Td>
                  <Pill tone={row.voidedAt ? "neutral" : row.kind === "income" ? "good" : "neutral"}>{row.voidedAt ? "Voided" : row.kind === "income" ? "Income" : "Expense"}</Pill>
                </Td>
                <Td className="capitalize">{row.category}</Td>
                <Td>
                  {animal ? (
                    <Link href={`/animals/${animal.code}`} className="hover:underline">
                      {animal.name ?? animal.code} · {animal.code}
                    </Link>
                  ) : (
                    "Whole farm"
                  )}
                </Td>
                <Td className="font-medium">{rupees(Number(row.amount))}</Td>
                <Td className="text-muted-foreground">{row.note?.startsWith("suggested:") ? "Confirmed from records" : (row.note ?? "—")}</Td>
                <Td>{row.voidedAt ? row.voidReason : canRecord ? <VoidRecord entity="finance" id={row.id} returnTo="/finance" /> : "—"}</Td>
              </tr>
            );
          })}
        </Table>
      </section>
    </div>
  );
}
