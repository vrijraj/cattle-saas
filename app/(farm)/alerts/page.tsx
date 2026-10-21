import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { EmptyRow, Pill, Summary, Table, Td } from "@/components/workspace";

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
        description="Open reminders for vaccines, pregnancy checks, and calving."
        facts={[{ label: "Open", value: String(rows.length) }]}
      />
      <Table headers={["Due", "Alert", "Detail"]}>
        {rows.length === 0 ? <EmptyRow cols={3}>No open alerts.</EmptyRow> : null}
        {rows.map((alert) => (
          <tr key={alert.id}>
            <Td>{alert.dueOn ? <Pill tone="warn">{formatDisplayDate(alert.dueOn)}</Pill> : "—"}</Td>
            <Td className="font-medium">{alert.title}</Td>
            <Td className="text-muted-foreground">{alert.body}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
