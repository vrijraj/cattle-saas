import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { financeEntries } from "@/db/schema";
import { saveFinance } from "@/app/(farm)/herd/actions";
import { formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canRecordFinance, canViewFinance } from "@/lib/permissions";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Pill, Submit, Summary, Table, Td } from "@/components/workspace";

function rupees(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default async function FinancePage() {
  const farm = await requireFarm();
  if (!canViewFinance(farm.roles)) redirect("/dashboard");
  const rows = await db.select().from(financeEntries).where(eq(financeEntries.farmId, farm.farmId));
  const income = rows.filter((row) => row.kind === "income").reduce((sum, row) => sum + Number(row.amount), 0);
  const expense = rows.filter((row) => row.kind === "expense").reduce((sum, row) => sum + Number(row.amount), 0);

  return (
    <div className="space-y-5">
      <Summary
        title="Finance"
        description="Farm income and expense. Costs that are not tied to one animal stay on this register."
        facts={[
          { label: "Income", value: rupees(income) },
          { label: "Expense", value: rupees(expense) },
          { label: "Surplus", value: rupees(income - expense) },
        ]}
      />
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Register</h2>
          {canRecordFinance(farm.roles) ? (
            <RecordDialog title="Add entry" button="Add entry">
              <form action={saveFinance} className="grid gap-3">
                <select name="kind" className={inputClass}>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
                <input name="category" required placeholder="Category, for example feed or milk" className={inputClass} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="amount" required placeholder="Amount" className={inputClass} />
                  <input name="entryOn" type="date" className={inputClass} />
                </div>
                <input name="note" placeholder="Note" className={inputClass} />
                <div className="flex justify-end">
                  <Submit>Save entry</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null}
        </div>
      <Table headers={["Date", "Type", "Category", "Amount", "Note"]}>
        {rows.length === 0 ? <EmptyRow cols={5}>No entries yet.</EmptyRow> : null}
        {rows.map((row) => (
          <tr key={row.id}>
            <Td>{formatDisplayDate(row.entryOn)}</Td>
            <Td>
              <Pill tone={row.kind === "income" ? "good" : "neutral"}>{row.kind}</Pill>
            </Td>
            <Td>{row.category}</Td>
            <Td className="font-medium">{rupees(Number(row.amount))}</Td>
            <Td className="text-muted-foreground">{row.note ?? "—"}</Td>
          </tr>
        ))}
      </Table>
      </section>
    </div>
  );
}
