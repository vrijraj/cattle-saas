import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, farms, financeEntries, healthEvents, milkYields, semenBatches } from "@/db/schema";
import { saveFinance } from "@/app/(farm)/herd/actions";
import { confirmSuggestion } from "@/app/(farm)/finance/actions";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { keyedSuggestion, milkValueSuggestion, monthTotals } from "@/lib/finance-suggestions";
import { requireFarm } from "@/lib/farm-context";
import { canRecordFinance, canViewFinance } from "@/lib/permissions";
import { FormSelect } from "@/components/form-select";
import { RecordDialog } from "@/components/record-dialog";
import { VoidRecord } from "@/components/void-record";
import { EmptyRow, inputClass, Notice, Pill, Submit, Summary, Table, Td } from "@/components/workspace";

function rupees(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default async function FinancePage() {
  const farm = await requireFarm();
  if (!canViewFinance(farm.roles)) redirect("/dashboard");
  const rows = await db.select().from(financeEntries).where(eq(financeEntries.farmId, farm.farmId));
  const [farmRow] = await db.select().from(farms).where(eq(farms.id, farm.farmId)).limit(1);
  const herd = await db.select().from(animals).where(eq(animals.farmId, farm.farmId));
  const milk = await db.select().from(milkYields).where(eq(milkYields.farmId, farm.farmId));
  const health = await db.select().from(healthEvents).where(eq(healthEvents.farmId, farm.farmId));
  const batches = await db.select().from(semenBatches).where(eq(semenBatches.farmId, farm.farmId));
  const active = rows.filter((row) => !row.voidedAt);
  const notes = active.map((row) => row.note);
  const month = farmToday(farm.timezone).slice(0, 7);
  const monthLitres = milk
    .filter((row) => !row.voidedAt && row.recordedOn.startsWith(month))
    .reduce((sum, row) => sum + Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0), 0);
  const suggestions = [
    milkValueSuggestion({ month, litres: monthLitres, price: farmRow?.milkPricePerLitre ? Number(farmRow.milkPricePerLitre) : null, existingNotes: notes }),
    ...health
      .filter((row) => !row.voidedAt && row.cost)
      .map((row) =>
        keyedSuggestion({
          key: `suggested:medicine:${row.id}`,
          kind: "expense",
          category: "medicine",
          amount: Number(row.cost),
          entryOn: row.eventOn,
          label: `Medicine on ${row.eventOn}`,
          existingNotes: notes,
        }),
      ),
    ...batches
      .filter((row) => row.pricePerStraw)
      .map((row) =>
        keyedSuggestion({
          key: `suggested:semen:${row.id}`,
          kind: "expense",
          category: "semen",
          amount: Number(row.pricePerStraw) * row.quantityReceived,
          entryOn: row.receivedOn ?? farmToday(farm.timezone),
          label: `Semen batch ${row.batchNumber}`,
          existingNotes: notes,
        }),
      ),
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const months = monthTotals(active.map((row) => ({ entryOn: row.entryOn, kind: row.kind, category: row.category, amount: Number(row.amount), voided: false })));
  const profit = herd
    .map((animal) => {
      const litres = milk.filter((row) => row.animalId === animal.id && !row.voidedAt).reduce((sum, row) => sum + Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0), 0);
      const medicine = health.filter((row) => row.animalId === animal.id && !row.voidedAt).reduce((sum, row) => sum + Number(row.cost ?? 0), 0);
      const linked = active.filter((row) => row.animalId === animal.id).reduce((sum, row) => sum + (row.kind === "income" ? Number(row.amount) : -Number(row.amount)), 0);
      const price = farmRow?.milkPricePerLitre ? Number(farmRow.milkPricePerLitre) : 0;
      const milkValue = litres * price;
      return { animal, milkValue, medicine, linked, total: milkValue - medicine + linked };
    })
    .filter((row) => row.milkValue > 0 || row.medicine > 0 || row.linked !== 0);
  const income = active.filter((row) => row.kind === "income").reduce((sum, row) => sum + Number(row.amount), 0);
  const expense = active.filter((row) => row.kind === "expense").reduce((sum, row) => sum + Number(row.amount), 0);

  return (
    <div className="space-y-5">
      <Summary
        title="Finance"
        description="Farm income and expense. Costs that are not tied to one animal stay in the farm bucket. Feed that is not allocated to an animal is not forced onto that animal."
        facts={[
          { label: "Income", value: rupees(income) },
          { label: "Expense", value: rupees(expense) },
          { label: "Surplus", value: rupees(income - expense) },
        ]}
      />
      {suggestions.length > 0 && canRecordFinance(farm.roles) ? (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="font-semibold">Suggested entries</h2>
          <p className="text-sm text-muted-foreground">Confirming creates one finance row. Refreshing this page does not create it again.</p>
          <ul className="space-y-2">
            {suggestions.map((item) => (
              <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted px-3 py-3">
                <span className="text-sm">{item.label} · {rupees(item.amount)}</span>
                <form action={confirmSuggestion}>
                  <input type="hidden" name="key" value={item.key} />
                  <input type="hidden" name="kind" value={item.kind} />
                  <input type="hidden" name="category" value={item.category} />
                  <input type="hidden" name="amount" value={String(item.amount)} />
                  <input type="hidden" name="entryOn" value={item.entryOn} />
                  <Submit>Confirm</Submit>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {months.length > 0 ? (
        <Table headers={["Month", "Income", "Expense", "Surplus"]}>
          {months.map((row) => (
            <tr key={row.month}>
              <Td className="font-medium">{row.month}</Td>
              <Td>{rupees(row.income)}</Td>
              <Td>{rupees(row.expense)}</Td>
              <Td>{rupees(row.surplus)}</Td>
            </tr>
          ))}
        </Table>
      ) : null}
      {profit.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">By animal</h2>
          <Notice>Milk value and medicine are taken from records on that animal. Unallocated feed stays in the farm bucket.</Notice>
          <Table headers={["Animal", "Milk value", "Medicine", "Linked entries", "Result"]}>
            {profit.map((row) => (
              <tr key={row.animal.id}>
                <Td className="font-medium">{row.animal.name ?? row.animal.code}</Td>
                <Td>{rupees(row.milkValue)}</Td>
                <Td>{rupees(row.medicine)}</Td>
                <Td>{rupees(row.linked)}</Td>
                <Td>{rupees(row.total)}</Td>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Register</h2>
          {canRecordFinance(farm.roles) ? (
            <RecordDialog title="Add entry" button="Add entry">
              <form action={saveFinance} className="grid gap-3">
                <FormSelect
                  name="kind"
                  defaultValue="income"
                  options={[
                    { value: "income", label: "Income" },
                    { value: "expense", label: "Expense" },
                  ]}
                />
                <input name="category" required placeholder="Category, for example feed or milk" className={inputClass} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="amount" required placeholder="Amount" className={inputClass} />
                  <input name="entryOn" type="date" className={inputClass} />
                </div>
                <input name="note" placeholder="Note" className={inputClass} />
                <FormSelect
                  name="animalId"
                  placeholder="Animal, if this belongs to one"
                  options={[{ value: "", label: "Whole farm" }, ...herd.map((animal) => ({ value: animal.id, label: `${animal.code} · ${animal.name ?? animal.code}` }))]}
                />
                <div className="flex justify-end">
                  <Submit>Save entry</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null}
        </div>
      <Table headers={["Date", "Type", "Category", "Amount", "Note", ""]}>
        {rows.length === 0 ? <EmptyRow cols={6}>No entries yet.</EmptyRow> : null}
        {rows.map((row) => (
          <tr key={row.id} className={row.voidedAt ? "text-muted-foreground" : ""}>
            <Td>{formatDisplayDate(row.entryOn)}</Td>
            <Td>
              <Pill tone={row.voidedAt ? "neutral" : row.kind === "income" ? "good" : "neutral"}>{row.voidedAt ? "voided" : row.kind}</Pill>
            </Td>
            <Td>{row.category}</Td>
            <Td className="font-medium">{rupees(Number(row.amount))}</Td>
            <Td className="text-muted-foreground">{row.note ?? "—"}</Td>
            <Td>
              {row.voidedAt ? row.voidReason : canRecordFinance(farm.roles) ? <VoidRecord entity="finance" id={row.id} returnTo="/finance" /> : "—"}
            </Td>
          </tr>
        ))}
      </Table>
      </section>
    </div>
  );
}
