import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { alerts, animals, feedItems, feedMovements } from "@/db/schema";
import { createCustomAlert, dismissAlert, setMilkAlert } from "./actions";
import { sendReminders } from "./reminders";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { feedBalance, feedIsLow } from "@/lib/feed-stock";
import { requireFarm } from "@/lib/farm-context";
import { canReadAlert, canResolveAlert, canViewFinance, hasRole } from "@/lib/permissions";
import { FormSelect } from "@/components/form-select";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Notice, Pill, Submit, Summary, Table, Td } from "@/components/workspace";

const labels: Record<string, string> = {
  pd_due: "Pregnancy check",
  ai_followup: "AI follow-up",
  calving_due: "Expected calving",
  dry_off: "Dry-off",
  heat_expected: "Heat window",
  vaccine_due: "Vaccination",
  deworming_due: "Deworming",
  deworm_due: "Deworming",
  health_followup: "Health follow-up",
  medication_due: "Medication",
  withdrawal: "Withdrawal",
  milk_drop: "Milk drop",
  herd_milk_drop: "Herd milk drop",
  low_feed: "Feed stock",
  custom: "Task",
  finance: "Finance",
};

const messages: Record<string, string> = {
  role: "Your role cannot change this alert.",
  task: "Enter a task title.",
};

function destination(type: string, code: string | null) {
  if (type === "low_feed") return "/feed";
  if (type === "herd_milk_drop") return "/milk";
  if (type === "finance") return "/finance";
  if (!code) return null;
  if (type === "pd_due" || type === "ai_followup" || type === "calving_due" || type === "dry_off" || type === "heat_expected") {
    return `/animals/${code}?tab=breeding`;
  }
  if (type === "milk_drop" || type === "withdrawal") return `/animals/${code}?tab=milk`;
  if (type === "custom") return `/animals/${code}`;
  return `/animals/${code}?tab=health`;
}

export const metadata = { title: "Alerts" };

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; q?: string; type?: string }>;
}) {
  const farm = await requireFarm();
  const query = await searchParams;
  const today = farmToday(farm.timezone);
  const term = query.q?.trim().toLowerCase() ?? "";
  const typeFilter = query.type?.trim() ?? "";

  const [open, herd, items, movements] = await Promise.all([
    db.select().from(alerts).where(and(eq(alerts.farmId, farm.farmId), eq(alerts.status, "open"))),
    db.select({ id: animals.id, code: animals.code, name: animals.name }).from(animals).where(eq(animals.farmId, farm.farmId)),
    canReadAlert(farm.roles, "low_feed") ? db.select().from(feedItems).where(eq(feedItems.farmId, farm.farmId)) : Promise.resolve([]),
    canReadAlert(farm.roles, "low_feed") ? db.select().from(feedMovements).where(and(eq(feedMovements.farmId, farm.farmId), isNull(feedMovements.voidedAt))) : Promise.resolve([]),
  ]);
  const byId = new Map(herd.map((animal) => [animal.id, animal]));
  const stored = open
    .filter((alert) => canReadAlert(farm.roles, alert.type))
    .map((alert) => {
      const animal = alert.animalId ? byId.get(alert.animalId) : undefined;
      return {
        id: alert.id,
        type: alert.type,
        title: alert.title,
        body: alert.body,
        dueOn: alert.dueOn,
        code: animal?.code ?? null,
        name: animal?.name ?? null,
        stored: true,
        milk: alert.type === "milk_drop" || alert.type === "herd_milk_drop",
      };
    });
  const feedRows = items.flatMap((item) => {
    const balance = feedBalance(movements.filter((movement) => movement.itemId === item.id));
    if (!feedIsLow(balance, item.minimumQuantity)) return [];
    return [
      {
        id: `feed:${item.id}`,
        type: "low_feed",
        title: `${item.name} is below minimum`,
        body: `${balance.toFixed(1)} ${item.unit} on hand. Minimum is ${item.minimumQuantity} ${item.unit}.`,
        dueOn: today,
        code: null,
        name: null,
        stored: false,
        milk: false,
      },
    ];
  });
  const allRows = [...stored, ...feedRows].sort((left, right) => (left.dueOn ?? "9999").localeCompare(right.dueOn ?? "9999"));
  const availableTypes = [...new Set(allRows.map((row) => row.type))];
  const rows = allRows.filter(
    (alert) =>
      (!typeFilter || alert.type === typeFilter) &&
      (!term || alert.title.toLowerCase().includes(term) || alert.body.toLowerCase().includes(term)),
  );
  const overdue = rows.filter((alert) => alert.dueOn && alert.dueOn < today).length;
  const canSchedule = hasRole(farm.roles, ["owner", "manager", "admin", "vet", "ai_technician", "accountant"]);

  return (
    <div className="space-y-5">
      <Summary
        title="Alerts"
        description={
          term
            ? `Open alerts matching “${query.q?.trim()}”.`
            : "Open reminders, soonest first. WhatsApp and SMS attempts are recorded in the audit log; in-app alerts stay open until done or dismissed."
        }
        facts={[
          { label: "Open", value: String(rows.length) },
          { label: "Overdue", value: String(overdue) },
        ]}
        action={
          term || typeFilter ? (
            <Link href="/alerts" className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-medium">
              Clear
            </Link>
          ) : null
        }
      />
      {query.error && messages[query.error] ? <Notice tone="danger">{messages[query.error]}</Notice> : null}
      {query.sent === "1" ? <Notice>Reminder notifications were sent and logged in the audit trail.</Notice> : null}
      {query.sent === "unconfigured" ? <Notice>WhatsApp/SMS tokens are not configured, so sends were logged as not configured. In-app alerts remain open.</Notice> : null}
      {query.sent === "none" ? <Notice>No open alerts needed outbound reminders.</Notice> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {canSchedule ? (
            <RecordDialog title="Schedule farm task or reminder" button="Schedule task">
              <form action={createCustomAlert} className="space-y-3">
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Task title
                  <input name="title" required placeholder="Hoof trimming, shed disinfection, Tank LN2 refill" className={inputClass} />
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Details / instructions
                  <input name="body" placeholder="Notes or instructions for the team" className={inputClass} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                    Due date
                    <input name="dueOn" type="date" defaultValue={today} className={inputClass} />
                  </label>
                  {canViewFinance(farm.roles) ? (
                    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                      Category
                      <FormSelect
                        name="type"
                        defaultValue="custom"
                        options={[
                          { value: "custom", label: "Farm task" },
                          { value: "finance", label: "Finance task" },
                        ]}
                      />
                    </label>
                  ) : null}
                </div>
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Animal (optional)
                  <FormSelect
                    name="animalId"
                    defaultValue=""
                    options={[
                      { value: "", label: "Whole farm / General task" },
                      ...[...herd]
                        .sort((a, b) => a.code.localeCompare(b.code))
                        .map((animal) => ({
                          value: animal.id,
                          label: animal.name && animal.name !== animal.code ? `${animal.name} · ${animal.code}` : animal.code,
                        })),
                    ]}
                  />
                </label>
                <div className="flex justify-end pt-1">
                  <Submit>Save task</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null}
          {farm.roles.some((role) => role === "owner" || role === "manager" || role === "admin") ? (
            <form action={sendReminders}>
              <button className="h-10 rounded-full border border-border bg-background px-4 text-sm font-medium hover:bg-muted" type="submit">
                Send WhatsApp and SMS
              </button>
            </form>
          ) : null}
        </div>

        <form key={`${query.q ?? ""}:${typeFilter}`} method="get" className="flex flex-wrap items-center gap-2">
          <input name="q" defaultValue={query.q ?? ""} placeholder="Filter alerts..." className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
          <select name="type" defaultValue={typeFilter} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
            <option value="">All types</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {labels[t] ?? t}
              </option>
            ))}
          </select>
          <button type="submit" className="h-10 rounded-full border border-border bg-card px-4 text-sm font-medium hover:bg-muted">
            Filter
          </button>
        </form>
      </div>

      <Table headers={["Due", "Type", "Alert", "Detail", ""]}>
        {rows.length === 0 ? <EmptyRow cols={5}>{term || typeFilter ? "No alerts match this filter." : "No open alerts."}</EmptyRow> : null}
        {rows.map((alert) => {
          const href = destination(alert.type, alert.code);
          const late = Boolean(alert.dueOn && alert.dueOn < today);
          const canResolve = canResolveAlert(farm.roles, alert.type);
          return (
            <tr key={alert.id}>
              <Td>
                {alert.dueOn ? (
                  <Pill tone={late ? "warn" : "neutral"}>
                    {formatDisplayDate(alert.dueOn)}
                    {late ? " · Overdue" : ""}
                  </Pill>
                ) : (
                  "—"
                )}
              </Td>
              <Td>{labels[alert.type] ?? alert.type}</Td>
              <Td className="font-medium">
                {href ? (
                  <Link href={href} className="hover:underline">
                    {alert.title}
                  </Link>
                ) : (
                  alert.title
                )}
              </Td>
              <Td className="text-muted-foreground">{alert.body}</Td>
              <Td>
                {alert.milk && canResolve ? (
                  <div className="flex flex-wrap gap-2">
                    <form action={setMilkAlert}>
                      <input type="hidden" name="id" value={alert.id} />
                      <input type="hidden" name="status" value="explained" />
                      <button className="h-10 rounded-full border border-border px-3 text-xs font-medium" type="submit">
                        Explained
                      </button>
                    </form>
                    <form action={setMilkAlert}>
                      <input type="hidden" name="id" value={alert.id} />
                      <input type="hidden" name="status" value="dismissed" />
                      <button className="h-10 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground" type="submit">
                        Dismiss
                      </button>
                    </form>
                  </div>
                ) : alert.stored && canResolve ? (
                  <div className="flex flex-wrap gap-2">
                    <form action={dismissAlert}>
                      <input type="hidden" name="id" value={alert.id} />
                      <input type="hidden" name="status" value="done" />
                      <button className="h-10 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground" type="submit">
                        Done
                      </button>
                    </form>
                    <form action={dismissAlert}>
                      <input type="hidden" name="id" value={alert.id} />
                      <input type="hidden" name="status" value="dismissed" />
                      <button className="h-10 rounded-full border border-border px-3 text-xs font-medium" type="submit">
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
