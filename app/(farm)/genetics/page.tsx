import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { animals, bulls, calvings, healthEvents, milkYields } from "@/db/schema";
import { saveMatingCheck } from "@/app/(farm)/genetics/actions";
import { requireFarm } from "@/lib/farm-context";
import { bullPerformance } from "@/lib/bull-performance";
import { matingFlags, type PedigreeLink } from "@/lib/mating";
import { canUseGenetics } from "@/lib/permissions";
import { FormSelect } from "@/components/form-select";
import { inputClass, Notice, Panel, pickTab, Submit, Summary, TabBar, Table, Td } from "@/components/workspace";

const tabs = [
  { id: "check", label: "Mating check" },
  { id: "bulls", label: "Bull performance" },
];

export default async function GeneticsPage({
  searchParams,
}: {
  searchParams: Promise<{ female?: string; bull?: string; tab?: string; year?: string; lactation?: string; saved?: string }>;
}) {
  const farm = await requireFarm();
  const query = await searchParams;
  const tab = pickTab(query.tab, tabs, "check");
  const herd = await db.select().from(animals).where(eq(animals.farmId, farm.farmId));
  const bullRows = await db.select().from(bulls).where(eq(bulls.farmId, farm.farmId));
  const births = await db.select().from(calvings).where(eq(calvings.farmId, farm.farmId));
  const health = await db.select().from(healthEvents).where(eq(healthEvents.farmId, farm.farmId));
  const milk = await db.select().from(milkYields).where(eq(milkYields.farmId, farm.farmId));
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
  const performance = bullPerformance(
    herd.map((animal) => ({
      id: animal.id,
      code: animal.code,
      name: animal.name,
      sex: animal.sex,
      dob: animal.dob,
      sireCode: animal.geneticSireCode,
      lactationNumber: births.filter((birth) => birth.damId === animal.id && !birth.voidedAt).length,
      dailyMilk: milk
        .filter((row) => row.animalId === animal.id && !row.voidedAt)
        .map((row) => Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0)),
      healthEvents: health.filter((row) => row.animalId === animal.id && !row.voidedAt).length,
      calvingOutcome: births.find((birth) => birth.calfId === animal.id && !birth.voidedAt)?.outcome ?? null,
    })),
    { year: query.year, lactation: query.lactation },
  );
  const canSave = canUseGenetics(farm.roles);

  return (
    <div className="space-y-5">
      <Summary
        title="Genetics"
        description="Decision support. This check lists pedigree overlaps from data entered on this farm. It is not a veterinary opinion, an inbreeding coefficient, or a breed-society approval."
        facts={[{ label: "Sires with offspring", value: String(performance.length) }]}
      />
      <TabBar tabs={tabs} current={tab} base="/genetics" />
      {tab === "bulls" ? (
        <div className="space-y-4">
          <form className="flex flex-wrap gap-3">
            <input type="hidden" name="tab" value="bulls" />
            <input name="year" defaultValue={query.year ?? ""} placeholder="Birth year" className={`${inputClass} max-w-40`} />
            <input name="lactation" defaultValue={query.lactation ?? ""} placeholder="Lactation number" className={`${inputClass} max-w-48`} />
            <Submit>Filter</Submit>
          </form>
          {performance.length === 0 ? (
            <Notice>Figures appear after offspring are linked to a sire. Nothing is filled in when that history is missing.</Notice>
          ) : (
            <Table headers={["Sire", "Offspring", "Daughters", "Daughters in milk", "Avg daily L", "Health events", "Live births"]}>
              {performance.map((row) => (
                <tr key={row.sireCode}>
                  <Td className="font-medium">{row.sireCode}</Td>
                  <Td>{row.offspring}</Td>
                  <Td>{row.females}</Td>
                  <Td>{row.daughtersWithMilk}</Td>
                  <Td>{row.averageDailyYield ?? "—"}</Td>
                  <Td>{row.healthEvents}</Td>
                  <Td>{row.liveCalvings}</Td>
                </tr>
              ))}
            </Table>
          )}
          {performance.flatMap((row) => row.animals).length > 0 ? (
            <p className="text-sm text-muted-foreground">
              {performance
                .flatMap((row) => row.animals.map((animal) => animal.code))
                .slice(0, 12)
                .map((code) => (
                  <Link key={code} href={`/animals/${code}`} className="mr-3 text-primary">
                    {code}
                  </Link>
                ))}
            </p>
          ) : null}
        </div>
      ) : (
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <Panel title="Mating check">
          <form className="grid gap-3">
            <FormSelect
              name="female"
              defaultValue={query.female}
              options={herd
                .filter((animal) => animal.sex === "female")
                .map((animal) => ({ value: animal.code, label: `${animal.code} · ${animal.name ?? animal.code}` }))}
            />
            <input name="bull" defaultValue={query.bull ?? ""} placeholder="Proposed bull or semen code" className={inputClass} />
            <Submit>Check mating</Submit>
          </form>
          {query.female && query.bull && canSave ? (
            <form action={saveMatingCheck} className="mt-3">
              <input type="hidden" name="female" value={query.female} />
              <input type="hidden" name="bull" value={query.bull} />
              <Submit>Save on the female</Submit>
            </form>
          ) : null}
          {query.saved ? <p className="mt-3 text-sm text-muted-foreground">The check is saved on the female. It does not block an insemination.</p> : null}
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
