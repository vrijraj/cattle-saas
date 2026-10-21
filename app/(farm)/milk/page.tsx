import { and, eq, gte, or } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { alerts, animals, milkYields } from "@/db/schema";
import { addDays, farmToday, formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { milkDaySummary } from "@/lib/milk-sheet";
import { canWriteMilk } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Notice, Summary } from "@/components/workspace";
import { saveMilk } from "./actions";

const messages: Record<string, string> = {
  range: "Each session must be between 0 and 80 litres.",
  role: "Your role cannot record milk.",
};

export const metadata = { title: "Milk records" };

export default async function MilkPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const farm = await requireFarm();
  const query = await searchParams;
  const today = farmToday(farm.timezone);
  const herd = await db
    .select({
      id: animals.id,
      code: animals.code,
      name: animals.name,
    })
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.presence, "on_farm"), eq(animals.lactation, "lactating")))
    .orderBy(animals.code);

  const existing = await db
    .select()
    .from(milkYields)
    .where(and(eq(milkYields.farmId, farm.farmId), gte(milkYields.recordedOn, addDays(today, -7))));
  const summary = milkDaySummary(
    herd.map((animal) => animal.id),
    existing.filter((row) => row.recordedOn === today),
  );
  const canSave = canWriteMilk(farm.roles);
  const drops = await db
    .select()
    .from(alerts)
    .where(
      and(
        eq(alerts.farmId, farm.farmId),
        eq(alerts.status, "open"),
        or(eq(alerts.type, "milk_drop"), eq(alerts.type, "herd_milk_drop")),
      ),
    );
  const byCode = new Map(herd.map((animal) => [animal.id, animal]));
  const herdDays = new Map<string, number>();
  for (const row of existing) {
    if (row.voidedAt) continue;
    const litres = Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0);
    herdDays.set(row.recordedOn, (herdDays.get(row.recordedOn) ?? 0) + litres);
  }
  const recent = [...herdDays.entries()].sort(([left], [right]) => left.localeCompare(right));

  const stats = [
    [summary.total.toFixed(1) + " L", "Total milk today"],
    [String(summary.entered), "Cows milked"],
    [String(summary.notEntered), "Not entered"],
    [summary.average.toFixed(1) + " L", "Average entered"],
  ];

  return (
    <div className="space-y-5">
      <Summary
        title="Milk log"
        description={`Daily yield for each cow in milk · ${formatDisplayDate(today)}. A blank cow is not entered. A 30% drop against the previous 7 days opens an alert after day 14 in milk.`}
        facts={stats.map(([value, label]) => ({ label, value }))}
      />
      {query.error && messages[query.error] ? <Notice tone="danger">{messages[query.error]}</Notice> : null}
      {query.saved ? <Notice>Milk for today is saved.</Notice> : null}
      {drops.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold">Milk drop</h2>
          <ul className="space-y-2">
            {drops.map((alert) => {
              const animal = alert.animalId ? byCode.get(alert.animalId) : undefined;
              return (
                <li key={alert.id}>
                  {animal ? (
                    <Link href={`/animals/${animal.code}?tab=milk`} className="text-sm font-medium hover:underline">
                      {alert.title}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium">{alert.title}</p>
                  )}
                  <p className="text-sm text-muted-foreground">{alert.body}</p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {recent.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold">Herd total</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map(([date, litres]) => (
              <li key={date} className="rounded-xl bg-muted px-3 py-2">
                <p className="text-xs text-muted-foreground">{formatDisplayDate(date)}</p>
                <p className="font-medium">{litres.toFixed(1)} L</p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Each day adds only the cows that were entered. A missing cow is not counted as zero.</p>
        </section>
      ) : null}
      <form action={saveMilk} className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-card">
        {herd.length === 0 ? <p className="px-4 py-8 text-sm text-muted-foreground">No lactating animals on the farm.</p> : null}
        {herd.length > 0 ? (
          <div className="hidden grid-cols-[7.5rem_minmax(0,1fr)_8rem_8rem_4.5rem] gap-3 bg-muted px-4 py-3 text-xs font-medium text-muted-foreground lg:grid">
            <span>Cattle ID</span>
            <span>Name</span>
            <span>Morning (L)</span>
            <span>Evening (L)</span>
            <span>Total</span>
          </div>
        ) : null}
        <ul className="divide-y divide-border">
          {herd.map((animal) => {
            const row = summary.active.get(animal.id);
            const sum = Number(row?.morningLitres ?? 0) + Number(row?.eveningLitres ?? 0);
            return (
              <li
                key={animal.id}
                className="grid grid-cols-2 items-end gap-3 p-4 lg:grid-cols-[7.5rem_minmax(0,1fr)_8rem_8rem_4.5rem] lg:items-center lg:py-3"
              >
                <div className="col-span-2 flex items-center justify-between gap-3 lg:contents">
                  <Link href={`/animals/${animal.code}?tab=milk`} className="min-w-0 hover:underline lg:contents">
                    <span className="hidden font-medium lg:block">{animal.code}</span>
                    <span className="block truncate font-medium">{animal.name ?? "Unnamed"}</span>
                    <span className="text-xs text-muted-foreground lg:hidden">{animal.code}</span>
                  </Link>
                  <p className="shrink-0 text-sm font-medium lg:order-1">{row ? `${sum.toFixed(1)} L` : "Not entered"}</p>
                </div>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  <span className="lg:sr-only">Morning (L)</span>
                  <input
                    name={`morning-${animal.id}`}
                    inputMode="decimal"
                    defaultValue={row?.morningLitres ?? ""}
                    disabled={!canSave}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground lg:h-10"
                  />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  <span className="lg:sr-only">Evening (L)</span>
                  <input
                    name={`evening-${animal.id}`}
                    inputMode="decimal"
                    defaultValue={row?.eveningLitres ?? ""}
                    disabled={!canSave}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground lg:h-10"
                  />
                </label>
              </li>
            );
          })}
        </ul>
        {canSave && herd.length > 0 ? (
          <div className="border-t border-border px-4 py-3">
            <Button type="submit" className="h-10 rounded-full px-5">
              Save milk log
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
