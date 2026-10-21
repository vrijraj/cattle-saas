import { eq } from "drizzle-orm";
import { db } from "@/db";
import { animals, bulls, farms, healthEvents, heats, milkYields, weights } from "@/db/schema";
import { farmToday } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { diseaseInsight, heatInsight, valueInsight, weightInsight } from "@/lib/insights";
import { matingFlags, type PedigreeLink } from "@/lib/mating";
import { Notice, Summary } from "@/components/workspace";

export default async function InsightsPage() {
  const farm = await requireFarm();
  const today = farmToday(farm.timezone);
  const herd = await db.select().from(animals).where(eq(animals.farmId, farm.farmId));
  const heatRows = await db.select().from(heats).where(eq(heats.farmId, farm.farmId));
  const health = await db.select().from(healthEvents).where(eq(healthEvents.farmId, farm.farmId));
  const weightRows = await db.select().from(weights).where(eq(weights.farmId, farm.farmId));
  const milk = await db.select().from(milkYields).where(eq(milkYields.farmId, farm.farmId));
  const bullRows = await db.select().from(bulls).where(eq(bulls.farmId, farm.farmId));
  const [farmRow] = await db.select().from(farms).where(eq(farms.id, farm.farmId)).limit(1);
  const byId = new Map(herd.map((animal) => [animal.id, animal]));
  const links: PedigreeLink[] = [
    ...herd.map((animal) => ({
      code: animal.code,
      sireCode: animal.geneticSireCode,
      damCode: animal.geneticDamId ? (byId.get(animal.geneticDamId)?.code ?? null) : null,
    })),
    ...bullRows.map((bull) => ({ code: bull.code, sireCode: bull.sireCode, damCode: bull.damCode })),
  ];
  const lastHeat = heatRows.map((row) => row.observedOn).sort().at(-1) ?? null;
  const litres = milk.filter((row) => !row.voidedAt).reduce((sum, row) => sum + Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0), 0);
  const medicine = health.filter((row) => !row.voidedAt).reduce((sum, row) => sum + Number(row.cost ?? 0), 0);
  const female = herd.find((animal) => animal.sex === "female" && animal.presence === "on_farm");
  const suggestions = female
    ? bullRows
        .map((bull) => ({ bull, flags: matingFlags(female.code, bull.code, links) }))
        .filter((row) => row.flags.every((flag) => flag.flag === "Common ancestor"))
        .slice(0, 5)
    : [];
  const cards = [
    heatInsight(lastHeat, today),
    diseaseInsight(
      health.filter((row) => !row.voidedAt).map((row) => ({ animalId: row.animalId, problem: row.problem, eventOn: row.eventOn })),
      today,
    ),
    weightInsight(weightRows.map((row) => ({ weighedOn: row.weighedOn, kilograms: Number(row.kilograms) }))),
    valueInsight({ litres, price: farmRow?.milkPricePerLitre ? Number(farmRow.milkPricePerLitre) : null, medicine }),
  ];

  return (
    <div className="space-y-5">
      <Summary
        title="Insights"
        description="Decision support. Each card states the rule and the records it used. These are not diagnoses, heat detectors, or sale prices."
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {cards.map((card) => (
          <article key={card.title} className="space-y-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-semibold">{card.title}</h2>
            <p className="text-sm">{card.result}</p>
            <p className="text-sm text-muted-foreground">{card.method}</p>
            <p className="text-xs text-muted-foreground">Sample: {card.sample}</p>
          </article>
        ))}
      </div>
      <article className="space-y-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-semibold">Mating suggestions</h2>
        <p className="text-sm text-muted-foreground">
          Bulls with no parent or grandparent overlap against {female ? female.code : "a female"}. Depth is 4 generations. This is relationship information, not a mating recommendation from a genetic evaluation.
        </p>
        {suggestions.length === 0 ? <Notice>No bull is free of a parent or grandparent overlap, or no female and bull are both on file.</Notice> : null}
        <ul className="space-y-1 text-sm">
          {suggestions.map((row) => (
            <li key={row.bull.id}>
              {row.bull.name} · {row.bull.code}
              {row.flags.length > 0 ? ` · ${row.flags.length} more distant overlap${row.flags.length === 1 ? "" : "s"}` : " · no stored overlap"}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Sample: {bullRows.length} bulls, {herd.length} animals.</p>
      </article>
    </div>
  );
}
