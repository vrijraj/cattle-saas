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
      <form action={saveMilk} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Cattle ID</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Morning (L)</th>
                <th className="px-4 py-3 font-medium">Evening (L)</th>
                <th className="px-4 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {herd.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-muted-foreground">
                    No lactating animals on the farm.
                  </td>
                </tr>
              ) : null}
              {herd.map((animal) => {
                const row = byAnimal.get(animal.id);
                const sum = Number(row?.morningLitres ?? 0) + Number(row?.eveningLitres ?? 0);
                return (
                  <tr key={animal.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{animal.code}</td>
                    <td className="px-4 py-3 text-muted-foreground">{animal.name ?? "Unnamed"}</td>
                    <td className="px-4 py-3">
                      <input
                        name={`morning-${animal.id}`}
                        inputMode="decimal"
                        defaultValue={row?.morningLitres ?? ""}
                        disabled={!canSave}
                        className="h-10 w-24 rounded-lg border border-border bg-background px-3"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        name={`evening-${animal.id}`}
                        inputMode="decimal"
                        defaultValue={row?.eveningLitres ?? ""}
                        disabled={!canSave}
                        className="h-10 w-24 rounded-lg border border-border bg-background px-3"
                      />
                    </td>
                    <td className="px-4 py-3">{row ? sum.toFixed(1) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
