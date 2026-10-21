import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { EmptyRow, Summary, Table, Td } from "@/components/workspace";
import { requireFarm } from "@/lib/farm-context";
import { canViewAudit } from "@/lib/permissions";

export default async function AuditPage() {
  const farm = await requireFarm();
  if (!canViewAudit(farm.roles)) redirect("/dashboard");
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entity: auditLogs.entity,
      summary: auditLogs.summary,
      createdAt: auditLogs.createdAt,
      actor: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(eq(auditLogs.farmId, farm.farmId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(100);

  return (
    <div className="space-y-5">
      <Summary
        title="Audit"
        description="Creates, updates, and voids for cattle, breeding, health, milk, and finance. A void keeps the row and records the reason."
        facts={[{ label: "Shown", value: String(rows.length) }]}
      />
      <Table headers={["When", "Who", "Action", "Record", "Detail"]}>
        {rows.length === 0 ? <EmptyRow cols={5}>No changes recorded yet. New records will appear here.</EmptyRow> : null}
        {rows.map((row) => (
          <tr key={row.id}>
            <Td>
              {new Intl.DateTimeFormat("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: farm.timezone,
              }).format(row.createdAt)}
            </Td>
            <Td>{row.actor ?? "—"}</Td>
            <Td className="capitalize">{row.action}</Td>
            <Td className="capitalize">{row.entity.replaceAll("_", " ")}</Td>
            <Td>{row.summary}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
