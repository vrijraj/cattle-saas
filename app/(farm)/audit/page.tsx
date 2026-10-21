import { and, count, desc, eq, gte, ilike, lt, or } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { EmptyRow, Summary, Table, Td } from "@/components/workspace";
import { requireFarm } from "@/lib/farm-context";
import { canViewAudit } from "@/lib/permissions";
import { auditActionLabel, auditChange, auditEntityLabel, auditRecordHref, auditWindow, zonedDayBounds } from "@/lib/audit-log";

const pageSize = 100;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string; entity?: string; from?: string; to?: string }>;
}) {
  const farm = await requireFarm();
  if (!canViewAudit(farm.roles)) redirect("/dashboard");
  const query = await searchParams;
  const term = query.q?.trim() ?? "";
  const window = auditWindow(query.from, query.to);
  const action = query.action && ["create", "update", "void", "export"].includes(query.action) ? query.action : "";
  const entity = query.entity?.trim() ?? "";
  const filters = [eq(auditLogs.farmId, farm.farmId)];
  if (action) filters.push(eq(auditLogs.action, action));
  if (entity) filters.push(eq(auditLogs.entity, entity));
  if (window.from) filters.push(gte(auditLogs.createdAt, zonedDayBounds(window.from, farm.timezone).start));
  if (window.to) filters.push(lt(auditLogs.createdAt, zonedDayBounds(window.to, farm.timezone).end));
  if (term) {
    const pattern = `%${term.replaceAll("%", "").replaceAll("_", "")}%`;
    const matches = or(ilike(auditLogs.summary, pattern), ilike(users.name, pattern));
    if (matches) filters.push(matches);
  }
  const where = and(...filters);
  const [kinds, counted, rows] = await Promise.all([
    db.selectDistinct({ entity: auditLogs.entity }).from(auditLogs).where(eq(auditLogs.farmId, farm.farmId)).orderBy(auditLogs.entity),
    db.select({ total: count() }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorId)).where(where),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entity: auditLogs.entity,
        summary: auditLogs.summary,
        afterState: auditLogs.afterState,
        createdAt: auditLogs.createdAt,
        actor: users.name,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize),
  ]);
  const total = counted[0]?.total ?? 0;
  const filtered = Boolean(term || action || entity || window.from || window.to);
  const when = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: farm.timezone,
  });

  return (
    <div className="space-y-5">
      <Summary
        title="Audit"
        description="Creates, updates, voids, and exports. A void keeps the original row and records the reason."
        facts={[
          { label: "Shown", value: String(rows.length) },
          { label: "Matching", value: String(total) },
        ]}
        action={
          filtered ? (
            <Link href="/audit" className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-medium">
              Clear
            </Link>
          ) : null
        }
      />
      <form className="flex flex-wrap items-end gap-2" method="get">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Search</span>
          <input className="h-10 rounded-lg border border-border bg-background px-3" name="q" defaultValue={term} placeholder="Animal, person, or detail" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Action</span>
          <select className="h-10 rounded-lg border border-border bg-background px-3" name="action" defaultValue={action}>
            <option value="">All</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="void">Void</option>
            <option value="export">Export</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Record</span>
          <select className="h-10 rounded-lg border border-border bg-background px-3" name="entity" defaultValue={entity}>
            <option value="">All</option>
            {kinds.map((kind) => (
              <option key={kind.entity} value={kind.entity}>
                {auditEntityLabel(kind.entity)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">From</span>
          <input className="h-10 rounded-lg border border-border bg-background px-3" name="from" type="date" defaultValue={window.from ?? ""} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">To</span>
          <input className="h-10 rounded-lg border border-border bg-background px-3" name="to" type="date" defaultValue={window.to ?? ""} />
        </label>
        <button className="h-10 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground" type="submit">
          Apply
        </button>
      </form>
      <Table headers={["When", "Who", "Action", "Record", "Detail", "Change"]}>
        {rows.length === 0 ? (
          <EmptyRow cols={6}>{filtered ? "Nothing is filled in for this filter." : "No changes recorded yet. New records will appear here."}</EmptyRow>
        ) : null}
        {rows.map((row) => {
          const href = auditRecordHref(row.entity, row.afterState);
          const change = auditChange(row.afterState);
          return (
            <tr key={row.id}>
              <Td className="whitespace-nowrap">{when.format(row.createdAt)}</Td>
              <Td>{row.actor ?? "—"}</Td>
              <Td>{auditActionLabel(row.action)}</Td>
              <Td>
                {href ? (
                  <Link href={href} className="hover:underline">
                    {auditEntityLabel(row.entity)}
                  </Link>
                ) : (
                  auditEntityLabel(row.entity)
                )}
              </Td>
              <Td>
                <Detail text={row.summary} />
              </Td>
              <Td className="text-muted-foreground">{change || "—"}</Td>
            </tr>
          );
        })}
      </Table>
      {total > rows.length ? (
        <p className="text-sm text-muted-foreground">
          Showing the latest {rows.length} of {total}. Narrow the dates to see older rows.
        </p>
      ) : null}
    </div>
  );
}

function Detail({ text }: { text: string }) {
  const parts = text.split(/(\s·\s|\s+)/);
  return (
    <>
      {parts.map((part, index) =>
        /^[A-Z]{2,6}(?:-[A-Z0-9]+)+$/.test(part) ? (
          <Link key={`${part}-${index}`} href={part.startsWith("BULL-") ? `/genetics?tab=bulls&sire=${encodeURIComponent(part)}` : part.startsWith("STR-") ? `/scan?code=${encodeURIComponent(part)}` : `/animals/${part}`} className="hover:underline">
            {part}
          </Link>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}
