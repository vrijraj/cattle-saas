import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, bulls, calvings, healthEvents, inseminations, milkYields, pregnancyChecks, semenBatches } from "@/db/schema";
import { saveMatingCheck } from "@/app/(farm)/genetics/actions";
import { requireFarm } from "@/lib/farm-context";
import { geneticsPerformance } from "@/lib/genetics-snapshot";
import { matingFlags, pedigreeLines, type MatingFlag, type PedigreeLink } from "@/lib/mating";
import { canUseGenetics, canViewGenetics } from "@/lib/permissions";
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

function flagSentence(flag: MatingFlag, label: string) {
  if (flag.flag === "Parent") return `${label} is the sire of this female.`;
  if (flag.flag === "Grandparent") return `${label} is a grandparent of this female.`;
  if (flag.flag === "Son") return `${label} is a son of this female.`;
  if (flag.flag === "Daughter") return `${label} is a daughter of this female.`;
  const generations = `${flag.generation} generation${flag.generation === 1 ? "" : "s"}`;
  return `${label} appears on both pedigrees, ${generations} back on the female's side.`;
}

export default async function GeneticsPage({
  searchParams,
}: {
  searchParams: Promise<{ female?: string; bull?: string; tab?: string; year?: string; lactation?: string; sire?: string; saved?: string; error?: string }>;
}) {
  const farm = await requireFarm();
  if (!canViewGenetics(farm.roles)) redirect("/dashboard");
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
  const byCode = new Map(herd.map((animal) => [animal.code, animal]));
  const bullById = new Map(bullRows.map((bull) => [bull.id, bull]));
  const bullByCode = new Map(bullRows.map((bull) => [bull.code, bull]));
  const links: PedigreeLink[] = [
    ...herd.map((animal) => ({
      code: animal.code,
      sireCode: animal.geneticSireCode,
      damCode: animal.geneticDamId ? (byId.get(animal.geneticDamId)?.code ?? null) : null,
      sex: animal.sex,
    })),
    ...bullRows.map((bull) => ({ code: bull.code, sireCode: bull.sireCode, damCode: bull.damCode, sex: "male" as const })),
  ];
  const history = { herd, births, health, milk, ais, checks };
  const performance = geneticsPerformance(history, { year: query.year, lactation: query.lactation, sire: query.sire });
  const allSires = geneticsPerformance(history);
  const sireCode = proposedSire(query.bull);
  const femaleRow = query.female ? herd.find((animal) => animal.code === query.female && animal.sex === "female") : undefined;
  const batchNumber = query.bull?.includes("::") ? query.bull.split("::")[1]?.trim() : "";
  const knownProposal = batchNumber
    ? batches.some((batch) => batch.batchNumber === batchNumber && bullById.get(batch.bullId)?.code === sireCode)
    : Boolean(sireCode && (bullByCode.has(sireCode) || byCode.has(sireCode)));
  const ready = Boolean(femaleRow && knownProposal);
  const flags = ready && query.female ? matingFlags(query.female, sireCode, links) : [];
  const canSave = canUseGenetics(farm.roles);
  const bullCodes = new Set(bullRows.map((bull) => bull.code));
  const bullOptions = [
    { value: "", label: "Bull or semen batch" },
    ...bullRows.map((bull) => ({ value: bull.code, label: `${bull.name} · ${bull.code}` })),
    ...herd
      .filter((animal) => !bullCodes.has(animal.code))
      .map((animal) => ({ value: animal.code, label: `${animal.name ?? animal.code} · ${animal.code}` })),
    ...batches.flatMap((batch) => {
      const bull = bullById.get(batch.bullId);
      if (!bull) return [];
      return [{ value: `${bull.code}::${batch.batchNumber}`, label: `Batch ${batch.batchNumber} · ${bull.name} · ${bull.code}` }];
    }),
  ];
  const sireOptions = [
    { value: "", label: "All sires" },
    ...allSires.map((row) => ({ value: row.sireCode, label: labelFor(row.sireCode, byCode, bullByCode) })),
  ];
  const filtered = Boolean(query.year?.trim() || query.lactation?.trim() || query.sire?.trim());
  const saveError = query.error ? saveErrors[query.error] : undefined;
  const pairError = query.female && !femaleRow
    ? "Choose a female on this farm."
    : query.bull && !knownProposal
      ? "Choose a bull, a herd animal, or a semen batch from this farm."
      : undefined;
  const femaleLabel = query.female ? labelFor(query.female, byCode, bullByCode) : "";
  const sireLabel = sireCode ? labelFor(sireCode, byCode, bullByCode) : "";

  return (
    <div className="space-y-5">
      <Summary
        title="Genetics"
        description="Decision support. This check lists pedigree overlaps from data entered on this farm. It is not a veterinary opinion, an inbreeding coefficient, or a breed-society approval."
        facts={[{ label: "Sires with offspring", value: String(allSires.length) }]}
      />
      <TabBar tabs={tabs} current={tab} base="/genetics" />
      {tab === "bulls" ? (
        <div className="space-y-4">
          <form className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="tab" value="bulls" />
            <FormSelect name="sire" defaultValue={query.sire ?? ""} options={sireOptions} className="w-full sm:max-w-64" />
            <input name="year" defaultValue={query.year ?? ""} placeholder="Birth year" className={`${inputClass} max-w-40`} />
            <input name="lactation" defaultValue={query.lactation ?? ""} placeholder="Lactation number" className={`${inputClass} max-w-48`} />
            <Submit>Filter</Submit>
            {filtered ? (
              <Link href="/genetics?tab=bulls" className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-medium">
                Clear
              </Link>
            ) : null}
          </form>
          {performance.length === 0 ? (
            <Notice>
              {filtered
                ? "Nothing is filled in for this filter."
                : "Figures appear after offspring are linked to a sire. Nothing is filled in when that history is missing."}
            </Notice>
          ) : (
            <Table headers={["Sire", "Offspring", "Daughters", "Daughters in milk", "Avg daily L", "Health events", "Live births", "Conception", "Calving interval", "Animals"]}>
              {performance.map((row) => (
                <tr key={row.sireCode}>
                  <Td className="font-medium">
                    <RecordLink code={row.sireCode} herd={byCode} bulls={bullByCode} />
                  </Td>
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
            {pairError ? <div className="mb-3"><Notice tone="danger">{pairError}</Notice></div> : null}
            <form className="grid gap-3">
              <FormSelect
                name="female"
                defaultValue={query.female ?? ""}
                placeholder="Female"
                options={[
                  { value: "", label: "Female" },
                  ...herd
                    .filter((animal) => animal.sex === "female")
                    .map((animal) => ({ value: animal.code, label: `${animal.name ?? animal.code} · ${animal.code}` })),
                ]}
              />
              <FormSelect name="bull" defaultValue={query.bull ?? ""} placeholder="Bull or semen batch" options={bullOptions} />
              <Submit>Check mating</Submit>
            </form>
            {ready && canSave ? (
              <form action={saveMatingCheck} className="mt-3">
                <input type="hidden" name="female" value={query.female} />
                <input type="hidden" name="bull" value={query.bull} />
                <Submit>Save on the female</Submit>
              </form>
            ) : null}
            {query.saved ? <p className="mt-3 text-sm text-muted-foreground">The check is saved on the female. It does not block an insemination.</p> : null}
          </Panel>
          <Panel title={ready && query.female ? `${femaleLabel} × ${sireLabel}` : "Result"}>
            {ready && query.female ? (
              <div className="space-y-4">
                {flags.length === 0 ? (
                  <Notice>No shared ancestor was found in the stored pedigree.</Notice>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {flags.map((flag) => (
                      <li key={`${flag.flag}-${flag.code}-${flag.generation}`} className="rounded-xl bg-muted px-3 py-3">
                        <span className="font-medium">{flag.flag}</span>
                        <span className="mt-1 block text-muted-foreground">{flagSentence(flag, labelFor(flag.code, byCode, bullByCode))}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <PedigreeList title={femaleLabel} code={query.female} links={links} herd={byCode} bulls={bullByCode} />
                  <PedigreeList title={sireLabel} code={sireCode} links={links} herd={byCode} bulls={bullByCode} />
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

function labelFor(code: string, herd: Map<string, { name: string | null; code: string }>, bulls: Map<string, { name: string; code: string }>) {
  const bull = bulls.get(code);
  if (bull) return `${bull.name} · ${bull.code}`;
  const animal = herd.get(code);
  if (animal?.name) return `${animal.name} · ${animal.code}`;
  return code;
}

function RecordLink({ code, herd, bulls }: { code: string; herd: Map<string, { name: string | null; code: string }>; bulls: Map<string, { name: string; code: string }> }) {
  const label = labelFor(code, herd, bulls);
  const href = herd.has(code) ? `/animals/${code}` : `/semen?q=${encodeURIComponent(code)}`;
  return (
    <Link href={href} className="text-primary">
      {label}
    </Link>
  );
}

function PedigreeList({
  title,
  code,
  links,
  herd,
  bulls,
}: {
  title: string;
  code: string;
  links: PedigreeLink[];
  herd: Map<string, { name: string | null; code: string }>;
  bulls: Map<string, { name: string; code: string }>;
}) {
  const lines = pedigreeLines(code, links);
  const pad = ["pl-0", "pl-3", "pl-6", "pl-9", "pl-12"] as const;
  return (
    <div className="rounded-xl bg-muted/70 p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {lines.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No parents linked.</p> : null}
      <ul className="mt-2 space-y-1 text-sm">
        {lines.map((line) => (
          <li key={`${line.generation}-${line.role}-${line.code}`} className={pad[line.generation] ?? "pl-12"}>
            <span className="text-muted-foreground">{line.role}</span>{" "}
            <RecordLink code={line.code} herd={herd} bulls={bulls} />
          </li>
        ))}
      </ul>
    </div>
  );
}
