import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { animals, bulls, calvings, healthEvents, inseminations, milkYields, pregnancyChecks, semenBatches } from "@/db/schema";
import { saveMatingCheck } from "@/app/(farm)/genetics/actions";
import { requireFarm } from "@/lib/farm-context";
import { bullPerformance } from "@/lib/bull-performance";
import { matingFlags, pedigreeLines, type PedigreeLink } from "@/lib/mating";
import { canUseGenetics } from "@/lib/permissions";
import { FormSelect } from "@/components/form-select";
import { inputClass, Notice, Panel, pickTab, Submit, Summary, TabBar, Table, Td } from "@/components/workspace";

const tabs = [
  { id: "check", label: "Mating check" },
  { id: "bulls", label: "Bull performance" },
];

const saveErrors: Record<string, string> = {
  role: "Your role cannot save a mating check.",
  animal: "Choose a female on this farm and a bull code.",
};

function proposedSire(value: string | undefined) {
  return (value ?? "").split("::")[0]?.trim() ?? "";
}

export default async function GeneticsPage({
  searchParams,
}: {
  searchParams: Promise<{ female?: string; bull?: string; tab?: string; year?: string; lactation?: string; saved?: string; error?: string }>;
}) {
  const farm = await requireFarm();
  const query = await searchParams;
  const tab = pickTab(query.tab, tabs, "check");
  const herd = await db.select().from(animals).where(eq(animals.farmId, farm.farmId));
  const bullRows = await db.select().from(bulls).where(eq(bulls.farmId, farm.farmId));
  const batches = await db.select().from(semenBatches).where(eq(semenBatches.farmId, farm.farmId));
  const births = await db.select().from(calvings).where(eq(calvings.farmId, farm.farmId));
  const health = await db.select().from(healthEvents).where(eq(healthEvents.farmId, farm.farmId));
  const milk = await db.select().from(milkYields).where(eq(milkYields.farmId, farm.farmId));
  const ais = await db.select().from(inseminations).where(eq(inseminations.farmId, farm.farmId));
  const checks = await db.select().from(pregnancyChecks).where(eq(pregnancyChecks.farmId, farm.farmId));
  const byId = new Map(herd.map((animal) => [animal.id, animal]));
  const bullById = new Map(bullRows.map((bull) => [bull.id, bull]));
  const links: PedigreeLink[] = [
    ...herd.map((animal) => ({
      code: animal.code,
      sireCode: animal.geneticSireCode,
      damCode: animal.geneticDamId ? (byId.get(animal.geneticDamId)?.code ?? null) : null,
    })),
    ...bullRows.map((bull) => ({ code: bull.code, sireCode: bull.sireCode, damCode: bull.damCode })),
  ];
  const sireCode = proposedSire(query.bull);
  const flags = query.female && sireCode ? matingFlags(query.female, sireCode, links) : [];
  const mates = ais
    .filter((row) => !row.voidedAt)
    .map((row) => {
      const results = checks.filter((check) => check.inseminationId === row.id && !check.voidedAt);
      const pregnant = results.some((check) => check.result === "pregnant");
      return { bullCode: row.bullCode, result: pregnant ? "pregnant" : (results[0]?.result ?? "") };
    });
  const daughterBirths = births
    .filter((birth) => !birth.voidedAt)
    .map((birth) => ({ damId: birth.damId, calvedOn: birth.calvedOn }));
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
    { mates, daughterBirths },
  );
  const canSave = canUseGenetics(farm.roles);
  const bullCodes = new Set(bullRows.map((bull) => bull.code));
  const bullOptions = [
    ...bullRows.map((bull) => ({ value: bull.code, label: `${bull.code} · ${bull.name}` })),
    ...herd
      .filter((animal) => animal.sex === "male" && !bullCodes.has(animal.code))
      .map((animal) => ({ value: animal.code, label: `${animal.code} · ${animal.name ?? animal.code}` })),
    ...batches.flatMap((batch) => {
      const bull = bullById.get(batch.bullId);
      if (!bull) return [];
      return [{ value: `${bull.code}::${batch.batchNumber}`, label: `Batch ${batch.batchNumber} · ${bull.code} · ${bull.name}` }];
    }),
  ];
  const saveError = query.error ? saveErrors[query.error] : undefined;

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
            <Table headers={["Sire", "Offspring", "Daughters", "Daughters in milk", "Avg daily L", "Health events", "Live births", "Conception", "Calving interval", "Animals"]}>
              {performance.map((row) => (
                <tr key={row.sireCode}>
                  <Td className="font-medium">{row.sireCode}</Td>
                  <Td>{row.offspring}</Td>
                  <Td>{row.females}</Td>
                  <Td>{row.daughtersWithMilk}</Td>
                  <Td>{row.averageDailyYield ?? "—"}</Td>
                  <Td>{row.healthEvents}</Td>
                  <Td>{row.liveCalvings}</Td>
                  <Td>{row.mateChecks ? `${row.conceptions} pregnant of ${row.mateChecks}` : "—"}</Td>
                  <Td>{row.averageCalvingInterval ? `${row.averageCalvingInterval} days` : "—"}</Td>
                  <Td>
                    {row.animals.map((animal) => (
                      <Link key={animal.code} href={`/animals/${animal.code}`} className="mr-2 text-primary">
                        {animal.name ?? animal.code}
                      </Link>
                    ))}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <Panel title="Mating check">
            {saveError ? <div className="mb-3"><Notice tone="danger">{saveError}</Notice></div> : null}
            <form className="grid gap-3">
              <FormSelect
                name="female"
                defaultValue={query.female}
                placeholder="Female"
                options={herd
                  .filter((animal) => animal.sex === "female")
                  .map((animal) => ({ value: animal.code, label: `${animal.code} · ${animal.name ?? animal.code}` }))}
              />
              <FormSelect name="bull" defaultValue={query.bull} placeholder="Bull or semen batch" options={bullOptions} />
              <Submit>Check mating</Submit>
            </form>
            {query.female && sireCode && canSave ? (
              <form action={saveMatingCheck} className="mt-3">
                <input type="hidden" name="female" value={query.female} />
                <input type="hidden" name="bull" value={query.bull} />
                <Submit>Save on the female</Submit>
              </form>
            ) : null}
            {query.saved ? <p className="mt-3 text-sm text-muted-foreground">The check is saved on the female. It does not block an insemination.</p> : null}
          </Panel>
          <Panel title={query.female && sireCode ? `${query.female} × ${sireCode}` : "Result"}>
            {query.female && sireCode ? (
              <div className="space-y-4">
                {flags.length === 0 ? (
                  <Notice>No shared ancestor was found in the stored pedigree.</Notice>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {flags.map((flag) => (
                      <li key={`${flag.flag}-${flag.code}-${flag.generation}`} className="rounded-xl bg-muted px-3 py-3">
                        <span className="font-medium">{flag.flag}</span>
                        <span className="mt-1 block text-muted-foreground">
                          {flag.code} appears {flag.generation} generation{flag.generation === 1 ? "" : "s"} back.
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <PedigreeList title={query.female} code={query.female} links={links} />
                  <PedigreeList title={sireCode} code={sireCode} links={links} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Choose a female and a bull, then run the check.</p>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function PedigreeList({ title, code, links }: { title: string; code: string; links: PedigreeLink[] }) {
  const lines = pedigreeLines(code, links);
  const pad = ["pl-0", "pl-3", "pl-6", "pl-9", "pl-12"] as const;
  return (
    <div className="rounded-xl bg-muted/70 p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {lines.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No parents linked.</p> : null}
      <ul className="mt-2 space-y-1 text-sm">
        {lines.map((line) => (
          <li key={`${line.generation}-${line.role}-${line.code}`} className={pad[line.generation] ?? "pl-12"}>
            <span className="text-muted-foreground">{line.role}</span> {line.code}
          </li>
        ))}
      </ul>
    </div>
  );
}
