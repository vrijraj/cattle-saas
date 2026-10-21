import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { alerts, animals, feedItems, feedMovements } from "@/db/schema";
import { dismissAlert, setMilkAlert } from "./actions";
import { sendReminders } from "./reminders";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { feedBalance, feedIsLow } from "@/lib/feed-stock";
import { requireFarm } from "@/lib/farm-context";
import { canReadAlert } from "@/lib/permissions";
import { EmptyRow, Notice, Pill, Summary, Table, Td } from "@/components/workspace";

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
};

function destination(type: string, code: string | null) {
  if (type === "low_feed" || type === "herd_milk_drop") return type === "low_feed" ? "/feed" : "/milk";
  if (!code) return null;
  if (type === "pd_due" || type === "ai_followup" || type === "calving_due" || type === "dry_off" || type === "heat_expected") return `/animals/${code}?tab=breeding`;
  if (type === "milk_drop") return `/animals/${code}?tab=milk`;
  return `/animals/${code}?tab=health`;
}

export const metadata = { title: "Alerts" };

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; q?: string }> }) {
  const farm = await requireFarm();
  const query = await searchParams;
  const today = farmToday(farm.timezone);
  const term = query.q?.trim().toLowerCase() ?? "";
  const [open, herd, items, movements] = await Promise.all([
    db.select().from(alerts).where(and(eq(alerts.farmId, farm.farmId), eq(alerts.status, "open"))),
    db.select({ id: animals.id, code: animals.code, name: animals.name }).from(animals).where(eq(animals.farmId, farm.farmId)),
    canReadAlert(farm.roles, "low_feed") ? db.select().from(feedItems).where(eq(feedItems.farmId, farm.farmId)) : Promise.resolve([]),
    canReadAlert(farm.roles, "low_feed") ? db.select().from(feedMovements).where(eq(feedMovements.farmId, farm.farmId)) : Promise.resolve([]),
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
  const rows = [...stored, ...feedRows]
    .filter((alert) => !term || alert.title.toLowerCase().includes(term) || alert.body.toLowerCase().includes(term))
    .sort((left, right) => (left.dueOn ?? "9999").localeCompare(right.dueOn ?? "9999"));
  const overdue = rows.filter((alert) => alert.dueOn && alert.dueOn < today).length;

  return (
    <div className="space-y-5">
      <Summary
        title="Alerts"
        description={term ? `Open alerts matching “${query.q?.trim()}”.` : "Open reminders, soonest first. WhatsApp and SMS are attempted when you send reminders. A failed send stays in the audit log and the alert stays open."}
        facts={[
          { label: "Open", value: String(rows.length) },
          { label: "Overdue", value: String(overdue) },
        ]}
        action={
          term ? (
            <Link href="/alerts" className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-medium">
              Clear
            </Link>
          ) : null
        }
      />
      {query.error && messages[query.error] ? <Notice tone="danger">{messages[query.error]}</Notice> : null}
      {query.sent ? <p className="rounded-xl bg-muted px-4 py-3 text-sm">Reminder attempts are in the audit log. Alerts stay open until the work is done.</p> : null}
      {farm.roles.some((role) => role === "owner" || role === "manager" || role === "admin") ? (
        <form action={sendReminders}>
          <button className="h-10 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground" type="submit">
            Send WhatsApp and SMS
          </button>
        </form>
      ) : null}
      <Table headers={["Due", "Type", "Alert", "Detail", ""]}>
        {rows.length === 0 ? <EmptyRow cols={5}>{term ? "No alerts match this search." : "No open alerts."}</EmptyRow> : null}
        {rows.map((alert) => {
          const href = destination(alert.type, alert.code);
          const late = Boolean(alert.dueOn && alert.dueOn < today);
          return (
            <tr key={alert.id}>
              <Td>
                {alert.dueOn ? <Pill tone={late ? "warn" : "neutral"}>{formatDisplayDate(alert.dueOn)}{late ? " · Overdue" : ""}</Pill> : "—"}
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
                {alert.milk ? (
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
                ) : alert.stored ? (
                  <form action={dismissAlert}>
                    <input type="hidden" name="id" value={alert.id} />
                    <button className="h-9 rounded-full border border-border px-3 text-xs font-medium" type="submit">
                      Dismiss
                    </button>
                  </form>
                ) : null}
              </Td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
