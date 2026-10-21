import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { EmptyRow, Pill, Summary, Table, Td } from "@/components/workspace";
import { setMilkAlert } from "./actions";

export default async function AlertsPage() {
  const farm = await requireFarm();
  const rows = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.farmId, farm.farmId), eq(alerts.status, "open")))
    .orderBy(asc(alerts.dueOn));

  return (
    <div className="space-y-5">
      <Summary
        title="Alerts"
        description="Open reminders for vaccines, pregnancy checks, calving, and milk drops."
        facts={[{ label: "Open", value: String(rows.length) }]}
      />
      <Table headers={["Due", "Alert", "Detail", ""]}>
        {rows.length === 0 ? <EmptyRow cols={4}>No open alerts.</EmptyRow> : null}
        {rows.map((alert) => {
          const milk = alert.type === "milk_drop" || alert.type === "herd_milk_drop";
          return (
            <tr key={alert.id}>
              <Td>{alert.dueOn ? <Pill tone="warn">{formatDisplayDate(alert.dueOn)}</Pill> : "—"}</Td>
              <Td className="font-medium">{alert.title}</Td>
              <Td className="text-muted-foreground">{alert.body}</Td>
              <Td>
                {milk ? (
                  <div className="flex flex-wrap gap-2">
                    <form action={setMilkAlert}>
                      <input type="hidden" name="id" value={alert.id} />
                      <input type="hidden" name="status" value="explained" />
                      <button className="h-9 rounded-full border border-border px-3 text-xs font-medium" type="submit">
                        Explained
                      </button>
                    </form>
                    <form action={setMilkAlert}>
                      <input type="hidden" name="id" value={alert.id} />
                      <input type="hidden" name="status" value="dismissed" />
                      <button className="h-9 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground" type="submit">
                        Dismiss
                      </button>
                    </form>
                  </div>
                ) : null}
              </Td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
