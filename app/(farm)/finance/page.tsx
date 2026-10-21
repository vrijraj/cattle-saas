import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { financeEntries } from "@/db/schema";
import { saveFinance } from "@/app/(farm)/herd/actions";
import { formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canRecordFinance, canViewFinance } from "@/lib/permissions";
import { FormSelect } from "@/components/form-select";
import { RecordDialog } from "@/components/record-dialog";
import { VoidRecord } from "@/components/void-record";
import { EmptyRow, inputClass, Pill, Submit, Summary, Table, Td } from "@/components/workspace";

function rupees(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default async function FinancePage() {
  const farm = await requireFarm();
  if (!canViewFinance(farm.roles)) redirect("/dashboard");
  const rows = await db.select().from(financeEntries).where(eq(financeEntries.farmId, farm.farmId));
  const active = rows.filter((row) => !row.voidedAt);
  const income = active.filter((row) => row.kind === "income").reduce((sum, row) => sum + Number(row.amount), 0);
  const expense = active.filter((row) => row.kind === "expense").reduce((sum, row) => sum + Number(row.amount), 0);

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
