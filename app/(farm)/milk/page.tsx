import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { animals, milkYields } from "@/db/schema";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canWriteMilk } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Notice, Summary } from "@/components/workspace";
import { saveMilk } from "./actions";

const messages: Record<string, string> = {
  range: "Each session must be between 0 and 80 litres.",
  role: "Your role cannot record milk.",
};

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
    .where(and(eq(milkYields.farmId, farm.farmId), eq(milkYields.recordedOn, today)));
  const byAnimal = new Map(existing.map((row) => [row.animalId, row]));
  const canSave = canWriteMilk(farm.roles);
  const entered = herd.filter((animal) => byAnimal.has(animal.id));
  const total = entered.reduce((sum, animal) => {
    const row = byAnimal.get(animal.id);
    return sum + Number(row?.morningLitres ?? 0) + Number(row?.eveningLitres ?? 0);
  }, 0);
  const average = entered.length ? total / entered.length : 0;
  const completion = herd.length ? Math.round((entered.length / herd.length) * 100) : 0;

  const stats = [
    [total.toFixed(1) + " L", "Total milk today"],
    [String(entered.length), "Cows milked"],
    [average.toFixed(1) + " L", "Average per cow"],
    [completion + "%", "Completion"],
  ];

  return (
    <div className="space-y-5">
      <Summary
        title="Milk log"
        description={`Daily yield for each cow in milk · ${formatDisplayDate(today)}`}
        facts={stats.map(([value, label]) => ({ label, value }))}
      />
      {query.error ? <Notice tone="danger">{messages[query.error]}</Notice> : null}
      {query.saved ? <Notice>Milk for today is saved.</Notice> : null}
      <form action={saveMilk} className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
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
            const row = byAnimal.get(animal.id);
            const sum = Number(row?.morningLitres ?? 0) + Number(row?.eveningLitres ?? 0);
            return (
              <li
                key={animal.id}
                className="grid grid-cols-2 items-end gap-3 p-4 lg:grid-cols-[7.5rem_minmax(0,1fr)_8rem_8rem_4.5rem] lg:items-center lg:py-3"
              >
                <div className="min-w-0 self-center lg:col-start-2 lg:row-start-1">
                  <p className="truncate font-medium">{animal.name ?? "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground lg:hidden">{animal.code}</p>
                </div>
                <p className="self-center text-right text-sm font-medium lg:col-start-5 lg:row-start-1 lg:text-left">{row ? `${sum.toFixed(1)} L` : "—"}</p>
                <p className="hidden font-medium lg:col-start-1 lg:row-start-1 lg:block">{animal.code}</p>
                <label className="grid gap-1 text-xs text-muted-foreground lg:col-start-3 lg:row-start-1">
                  <span className="lg:sr-only">Morning (L)</span>
                  <input
                    name={`morning-${animal.id}`}
                    inputMode="decimal"
                    defaultValue={row?.morningLitres ?? ""}
                    disabled={!canSave}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground lg:h-10"
                  />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground lg:col-start-4 lg:row-start-1">
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
