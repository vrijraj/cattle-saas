import { eq } from "drizzle-orm";
import { db } from "@/db";
import { animals, bulls } from "@/db/schema";
import { requireFarm } from "@/lib/farm-context";
import { matingFlags, type PedigreeLink } from "@/lib/mating";
import { inputClass, Notice, Panel, pickTab, Submit, Summary, TabBar, Table, Td } from "@/components/workspace";

const tabs = [
  { id: "check", label: "Mating check" },
  { id: "offspring", label: "Offspring" },
];

export default async function GeneticsPage({
  searchParams,
}: {
  searchParams: Promise<{ female?: string; bull?: string; tab?: string }>;
}) {
  const farm = await requireFarm();
  const query = await searchParams;
  const tab = pickTab(query.tab, tabs, "check");
  const herd = await db.select().from(animals).where(eq(animals.farmId, farm.farmId));
  const bullRows = await db.select().from(bulls).where(eq(bulls.farmId, farm.farmId));
  const byId = new Map(herd.map((animal) => [animal.id, animal]));
  const links: PedigreeLink[] = [
    ...herd.map((animal) => ({
      code: animal.code,
      sireCode: animal.geneticSireCode,
      damCode: animal.geneticDamId ? (byId.get(animal.geneticDamId)?.code ?? null) : null,
    })),
    ...bullRows.map((bull) => ({ code: bull.code, sireCode: bull.sireCode, damCode: bull.damCode })),
  ];
  const flags = query.female && query.bull ? matingFlags(query.female, query.bull, links) : [];
  const bySire = new Map<string, { total: number; females: number }>();
  for (const animal of herd) {
    if (!animal.geneticSireCode) continue;
    const current = bySire.get(animal.geneticSireCode) ?? { total: 0, females: 0 };
    current.total += 1;
    if (animal.sex === "female") current.females += 1;
    bySire.set(animal.geneticSireCode, current);
  }

  return (
    <div className="space-y-5">
      <Summary
        title="Genetics"
        description="Decision support. This check lists pedigree overlaps from data entered on this farm. It is not a veterinary opinion, an inbreeding coefficient, or a breed-society approval."
        facts={[{ label: "Sires with offspring", value: String(bySire.size) }]}
      />
      <TabBar tabs={tabs} current={tab} base="/genetics" />
      {tab === "offspring" ? (
      <Table headers={["Sire", "Offspring", "Females"]}>
        {[...bySire.entries()].map(([code, stats]) => (
          <tr key={code}>
            <Td className="font-medium">{code}</Td>
            <Td>{stats.total}</Td>
            <Td>{stats.females}</Td>
          </tr>
        ))}
      </Table>
      ) : (
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Panel title="Mating check">
          <form className="grid gap-3">
            <select name="female" defaultValue={query.female} className={inputClass}>
              {herd
                .filter((animal) => animal.sex === "female")
                .map((animal) => (
                  <option key={animal.id} value={animal.code}>
                    {animal.code} · {animal.name}
                  </option>
                ))}
            </select>
            <input name="bull" defaultValue={query.bull ?? ""} placeholder="Proposed bull or semen code" className={inputClass} />
            <Submit>Check mating</Submit>
          </form>
        </Panel>
        <Panel title={query.female && query.bull ? `${query.female} × ${query.bull}` : "Result"}>
          {query.female && query.bull ? (
            flags.length === 0 ? (
              <Notice>No shared ancestor was found in the stored pedigree.</Notice>
            ) : (
              <ul className="space-y-2 text-sm">
                {flags.map((flag) => (
                  <li key={`${flag.flag}-${flag.generation}`} className="rounded-xl bg-muted px-3 py-3">
                    <span className="font-medium">{flag.flag}</span>
                    <span className="mt-1 block text-muted-foreground">
                      {flag.code} appears {flag.generation} generation{flag.generation === 1 ? "" : "s"} back.
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Choose a female and a bull, then run the check.</p>
          )}
        </Panel>
      </div>
      )}
    </div>
  );
}
