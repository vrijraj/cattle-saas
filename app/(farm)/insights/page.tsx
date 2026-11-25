import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { animals, bulls, calvings, dryOffs, farms, feedMovements, healthEvents, heats, inseminations, milkPriceHistory, milkYields, weights } from "@/db/schema";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { allocatedFeedCost } from "@/lib/finance-suggestions";
import { diseaseSignals, heatWindows, valueInsight, weightChanges } from "@/lib/insights";
import { lactationHistory, projected305DayLitres } from "@/lib/lactation";
import { matingFlags, type PedigreeLink } from "@/lib/mating";
import { milkRevenueForRows } from "@/lib/milk-pricing";
import { canSeeClinical, canViewFinance, canViewGenetics, canViewHeatWindow } from "@/lib/permissions";
import { FormSelect } from "@/components/form-select";
import { EmptyRow, Notice, Pill, Submit, Summary, Table, Td } from "@/components/workspace";

const closeFlags = new Set(["Parent", "Grandparent", "Son", "Daughter", "Full sibling", "Half sibling"]);

export const metadata = { title: "Insights" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ female?: string }> }) {
  const farm = await requireFarm();
  const query = await searchParams;
  const today = farmToday(farm.timezone);
  const showHeat = canViewHeatWindow(farm.roles);
  const showClinical = canSeeClinical(farm.roles);
  const showValue = canViewFinance(farm.roles);
  const openGenetics = canViewGenetics(farm.roles);
  const loadHealth = showClinical || showValue;
  const [herd, heatRows, services, health, weightRows, milk, bullRows, farmRow, calvingRows, dryRows, priceHistory, feedRows] = await Promise.all([
    db.select().from(animals).where(eq(animals.farmId, farm.farmId)),
    showHeat ? db.select().from(heats).where(eq(heats.farmId, farm.farmId)) : Promise.resolve([]),
    showHeat ? db.select().from(inseminations).where(eq(inseminations.farmId, farm.farmId)) : Promise.resolve([]),
    loadHealth ? db.select().from(healthEvents).where(eq(healthEvents.farmId, farm.farmId)) : Promise.resolve([]),
    db.select().from(weights).where(eq(weights.farmId, farm.farmId)),
    db.select().from(milkYields).where(eq(milkYields.farmId, farm.farmId)),
    openGenetics ? db.select().from(bulls).where(eq(bulls.farmId, farm.farmId)) : Promise.resolve([]),
    showValue ? db.select().from(farms).where(eq(farms.id, farm.farmId)).limit(1).then((rows) => rows[0]) : Promise.resolve(undefined),
    db.select().from(calvings).where(eq(calvings.farmId, farm.farmId)),
    db.select().from(dryOffs).where(eq(dryOffs.farmId, farm.farmId)),
    showValue ? db.select().from(milkPriceHistory).where(eq(milkPriceHistory.farmId, farm.farmId)).orderBy(desc(milkPriceHistory.effectiveFrom)) : Promise.resolve([]),
    showValue ? db.select().from(feedMovements).where(eq(feedMovements.farmId, farm.farmId)) : Promise.resolve([]),
  ]);

  const byId = new Map(herd.map((animal) => [animal.id, animal]));
  const onFarm = herd.filter((animal) => animal.presence === "on_farm");
  const cycling = onFarm.filter((animal) => animal.sex === "female" && animal.reproduction !== "pregnant" && animal.reproduction !== "not_applicable");
  const cyclingIds = new Set(cycling.map((animal) => animal.id));
  const windows = heatWindows(
    [
      ...heatRows.filter((row) => !row.voidedAt && cyclingIds.has(row.animalId)).map((row) => ({ animalId: row.animalId, observedOn: row.observedOn, anchor: "heat" as const })),
      ...services
        .filter((row) => !row.voidedAt && cyclingIds.has(row.animalId))
        .map((row) => ({ animalId: row.animalId, observedOn: row.performedOn, anchor: "insemination" as const })),
    ],
    today,
  ).filter((window) => window.state !== "past");
  const onFarmIds = new Set(onFarm.map((animal) => animal.id));
  const signals = diseaseSignals(
    health.filter((row) => !row.voidedAt && onFarmIds.has(row.animalId)).map((row) => ({ animalId: row.animalId, problem: row.problem, eventOn: row.eventOn })),
    today,
  );
  const changes = weightChanges(
    weightRows
      .filter((row) => !row.voidedAt && onFarmIds.has(row.animalId))
      .map((row) => ({ animalId: row.animalId, weighedOn: row.weighedOn, kilograms: Number(row.kilograms) })),
  );
  const litres = milk.filter((row) => !row.voidedAt).reduce((sum, row) => sum + Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0), 0);
  const medicine = health.filter((row) => !row.voidedAt).reduce((sum, row) => sum + Number(row.cost ?? 0), 0);
  const value = showValue ? valueInsight({ litres, price: farmRow?.milkPricePerLitre ? Number(farmRow.milkPricePerLitre) : null, medicine }) : null;

  // Per-cow 305-day lactation projection & profitability ranking
  const cowMetrics = onFarm
    .filter((a) => a.sex === "female" && (a.lactation === "lactating" || a.lactation === "dry"))
    .map((animal) => {
      const cowMilk = milk.filter((m) => m.animalId === animal.id && !m.voidedAt);
      const cowCalvings = calvingRows.filter((c) => c.damId === animal.id && !c.voidedAt).map((c) => c.calvedOn);
      const cowDrys = dryRows.filter((d) => d.animalId === animal.id && !d.voidedAt).map((d) => d.driedOn);
      const cycles = lactationHistory({
        calvedOn: cowCalvings,
        driedOn: cowDrys,
        yields: cowMilk,
        state: animal.lactation,
        today,
        presence: animal.presence,
        exitOn: animal.exitOn,
      });
      const currentCycle = cycles[0] ?? null;
      const proj305 = currentCycle?.daysInMilk ? projected305DayLitres(currentCycle.totalLitres, currentCycle.daysInMilk) : null;
      const milkRev = showValue ? milkRevenueForRows(cowMilk, priceHistory, farmRow?.milkPricePerLitre) : 0;
      const vetCost = showValue ? health.filter((h) => h.animalId === animal.id && !h.voidedAt).reduce((s, h) => s + Number(h.cost ?? 0), 0) : 0;
      const feedCost = showValue ? allocatedFeedCost(feedRows, animal.code) : 0;
      return {
        animal,
        lactationNum: currentCycle?.number ?? 0,
        dim: currentCycle?.daysInMilk ?? null,
        cycleLitres: currentCycle?.totalLitres ?? 0,
        avgDaily: currentCycle?.averageLitres ?? 0,
        proj305,
        milkRev,
        directCost: vetCost + feedCost,
        margin: Math.round((milkRev - vetCost - feedCost) * 100) / 100,
      };
    })
    .sort((a, b) => (b.proj305 ?? b.cycleLitres) - (a.proj305 ?? a.cycleLitres));

  const females = onFarm.filter((animal) => animal.sex === "female").sort((left, right) => left.code.localeCompare(right.code));
  const female = females.find((animal) => animal.code === query.female) ?? females[0];
  const links: PedigreeLink[] = [
    ...herd.map((animal) => ({
      code: animal.code,
      sireCode: animal.geneticSireCode,
      damCode: animal.geneticDamId ? (byId.get(animal.geneticDamId)?.code ?? null) : null,
      sex: animal.sex,
    })),
    ...bullRows.map((bull) => ({ code: bull.code, sireCode: bull.sireCode, damCode: bull.damCode, sex: "male" as const })),
  ];
  const suggestions = female
    ? bullRows
        .map((bull) => ({ bull, flags: matingFlags(female.code, bull.code, links, farm.matingGenerationWindow) }))
        .filter((row) => row.flags.every((flag) => !closeFlags.has(flag.flag)))
        .sort((left, right) => left.bull.code.localeCompare(right.bull.code))
    : [];

  return (
    <div className="space-y-5">
      <Summary
        title="Insights"
        description="Decision support, 305-day lactation projections, and per-cow economics. Each card states the rule and the records it used."
      />

      <article className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">305-day lactation projection &amp; cow profitability</h2>
            <p className="text-xs text-muted-foreground">
              Projects standard 305-day yield for cows at 30+ days in milk (DIM){showValue ? " and compares lifetime milk revenue against direct vet + allocated feed costs" : ""}.
            </p>
          </div>
          <Pill>{cowMetrics.length} milking / dry</Pill>
        </div>
        <Table headers={["Cow", "Lact #", "DIM", "Cycle L", "Avg / day", "305d proj.", ...(showValue ? ["Milk rev", "Direct cost", "Net margin"] : [])]}>
          {cowMetrics.length === 0 ? <EmptyRow cols={showValue ? 9 : 6}>No lactating or dry cows on farm.</EmptyRow> : null}
          {cowMetrics.map((row) => (
            <tr key={row.animal.id}>
              <Td className="font-medium">
                <Link href={`/animals/${row.animal.code}?tab=milk`} className="hover:underline">
                  {row.animal.name ?? row.animal.code} · {row.animal.code}
                </Link>
              </Td>
              <Td className="tabular-nums">{row.lactationNum || "—"}</Td>
              <Td className="tabular-nums">{row.dim !== null ? `${row.dim}d` : "—"}</Td>
              <Td className="tabular-nums">{row.cycleLitres.toFixed(1)} L</Td>
              <Td className="tabular-nums">{row.avgDaily.toFixed(1)} L</Td>
              <Td className="font-semibold tabular-nums">{row.proj305 !== null ? `${row.proj305.toLocaleString("en-IN")} L` : "—"}</Td>
              {showValue ? (
                <>
                  <Td className="tabular-nums">₹{Math.round(row.milkRev).toLocaleString("en-IN")}</Td>
                  <Td className="tabular-nums text-muted-foreground">₹{Math.round(row.directCost).toLocaleString("en-IN")}</Td>
                  <Td className={`font-semibold tabular-nums ${row.margin >= 0 ? "text-emerald-700" : "text-danger"}`}>
                    ₹{Math.round(row.margin).toLocaleString("en-IN")}
                  </Td>
                </>
              ) : null}
            </tr>
          ))}
        </Table>
      </article>

      <div className="grid gap-4 lg:grid-cols-2">
        {showHeat ? (
          <article className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">Heat window</h2>
                <Pill tone={windows.some((w) => w.state === "inside") ? "warn" : "neutral"}>{windows.length} active</Pill>
              </div>
              {windows.length === 0 ? <p className="text-sm text-muted-foreground">No open female is inside days 18–24 after her latest heat or insemination.</p> : null}
              <ul className="space-y-2">
                {windows.map((window) => {
                  const animal = byId.get(window.animalId);
                  const range = `${formatDisplayDate(window.start)} to ${formatDisplayDate(window.end)}`;
                  return (
                    <li key={window.animalId} className="rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        {animal ? (
                          <Link href={`/animals/${animal.code}?tab=breeding`} className="font-medium hover:underline">
                            {animal.name ?? animal.code} · {animal.code}
                          </Link>
                        ) : (
                          <span className="font-medium">{window.animalId}</span>
                        )}
                        <Pill tone={window.state === "inside" ? "warn" : "neutral"}>
                          {window.state === "inside" ? "In window" : "Upcoming"}
                        </Pill>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {window.state === "inside" ? `Inside the window ${range}.` : `Next window ${range}.`} After the {window.anchor} on {formatDisplayDate(window.anchorOn)}.
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="space-y-1 border-t border-border/60 pt-3">
              <p className="text-xs text-muted-foreground">The window is day 18 to day 24 after that female&apos;s latest heat or insemination. A recorded pregnancy closes it.</p>
              <p className="text-[11px] font-medium text-muted-foreground">
                Sample: {heatRows.filter((row) => !row.voidedAt).length} heat records, {services.filter((row) => !row.voidedAt).length} inseminations.
              </p>
            </div>
          </article>
        ) : null}
        {showClinical ? (
          <article className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">Herd health signal</h2>
                <Pill tone={signals.hits.length > 0 ? "warn" : "good"}>{signals.hits.length} signals</Pill>
              </div>
              {signals.hits.length === 0 ? <p className="text-sm text-muted-foreground">No problem is recorded on two or more animals in the last 30 days.</p> : null}
              <ul className="space-y-2">
                {signals.hits.map((hit) => (
                  <li key={hit.problem} className="rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5 text-sm">
                    <p className="font-medium">{hit.problem}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {hit.animalIds.map((id, index) => {
                        const animal = byId.get(id);
                        return (
                          <span key={id}>
                            {index > 0 ? ", " : ""}
                            {animal ? (
                              <Link href={`/animals/${animal.code}?tab=health`} className="font-medium text-foreground hover:underline">
                                {animal.name ?? animal.code} · {animal.code}
                              </Link>
                            ) : (
                              id
                            )}
                          </span>
                        );
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-1 border-t border-border/60 pt-3">
              <p className="text-xs text-muted-foreground">Animals with the same problem text in the last 30 days are counted. Two or more animals is a herd signal.</p>
              <p className="text-[11px] font-medium text-muted-foreground">Sample: {signals.considered} health records in the last 30 days.</p>
            </div>
          </article>
        ) : null}
        <article className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Weight change</h2>
              <Pill>{changes.length} tracked</Pill>
            </div>
            {changes.length === 0 ? <p className="text-sm text-muted-foreground">Two weights on the same animal are needed before a change is shown.</p> : null}
            <ul className="space-y-2">
              {changes.map((change) => {
                const animal = byId.get(change.animalId);
                return (
                  <li key={change.animalId} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5 text-sm">
                    <div>
                      {animal ? (
                        <Link href={`/animals/${animal.code}`} className="font-medium hover:underline">
                          {animal.name ?? animal.code} · {animal.code}
                        </Link>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {formatDisplayDate(change.from)} to {formatDisplayDate(change.to)}
                      </p>
                    </div>
                    <Pill tone={change.change >= 0 ? "good" : "warn"}>
                      {change.change >= 0 ? "+" : ""}
                      {change.change} kg
                    </Pill>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="space-y-1 border-t border-border/60 pt-3">
            <p className="text-xs text-muted-foreground">The change is the latest weight minus the previous weight on the same animal.</p>
            <p className="text-[11px] font-medium text-muted-foreground">Sample: {weightRows.length} weight records.</p>
          </div>
        </article>
        {value ? (
          <article className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="space-y-2">
              <h2 className="font-semibold">{value.title}</h2>
              <p className="rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5 text-sm font-medium">{value.result}</p>
            </div>
            <div className="space-y-1 border-t border-border/60 pt-3">
              <p className="text-xs text-muted-foreground">{value.method}</p>
              <p className="text-[11px] font-medium text-muted-foreground">
                Sample: {value.sample}. <Link href="/finance" className="text-foreground hover:underline">Finance →</Link>
              </p>
            </div>
          </article>
        ) : null}
      </div>
      {openGenetics ? (
        <article className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">Mating suggestions</h2>
          <p className="text-sm text-muted-foreground">
            Bulls without a close relationship flag against {female ? `${female.name ?? female.code} · ${female.code}` : "a female"}. Depth is {farm.matingGenerationWindow} generations.
          </p>
          {females.length > 0 ? (
            <form method="get" className="grid gap-3 sm:grid-cols-[minmax(0,18rem)_auto] sm:items-center">
              <FormSelect
                name="female"
                defaultValue={female?.code ?? ""}
                options={females.map((animal) => ({ value: animal.code, label: `${animal.name ?? animal.code} · ${animal.code}` }))}
              />
              <Submit>Check</Submit>
            </form>
          ) : null}
          {suggestions.length === 0 ? <Notice>No bull is free of a close relationship flag, or no female and bull are both on file.</Notice> : null}
          <ul className="space-y-1 text-sm">
            {suggestions.map((row) => (
              <li key={row.bull.id}>
                <Link href={`/genetics?female=${encodeURIComponent(female?.code ?? "")}&bull=${encodeURIComponent(row.bull.code)}`} className="hover:underline">
                  {row.bull.name} · {row.bull.code}
                </Link>
                {row.flags.length > 0 ? ` · ${row.flags.length} more distant overlap${row.flags.length === 1 ? "" : "s"}` : " · no stored overlap"}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Sample: {bullRows.length} bulls, {herd.length} animals.</p>
        </article>
      ) : null}
    </div>
  );
}
