import Link from "next/link";
import { eq } from "drizzle-orm";
import { Search } from "lucide-react";
import { db } from "@/db";
import { animals, breeds, locations } from "@/db/schema";
import { requireFarm } from "@/lib/farm-context";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { isUnderOneYear } from "@/lib/herd-stats";
import { HerdTree } from "@/components/herd-tree";
import { lactationLabel, lifeStageLabel, presenceLabel, reproductionLabel, sexLabel } from "@/lib/labels";
import { canWriteAnimals } from "@/lib/permissions";
import { herdForest } from "@/lib/pedigree-tree";
import { pickTab, Pill, TabBar } from "@/components/workspace";

const views = [
  { id: "all", label: "All" },
  { id: "active", label: "On farm" },
  { id: "pregnant", label: "Pregnant" },
  { id: "calves", label: "Calves" },
  { id: "sold", label: "Sold" },
] as const;

type ViewId = (typeof views)[number]["id"];

const pageTabs = [
  { id: "herd", label: "Herd" },
  { id: "tree", label: "Family tree" },
];

export default async function AnimalsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; code?: string; tab?: string }>;
}) {
  const farm = await requireFarm();
  const query = await searchParams;
  const today = farmToday(farm.timezone);
  const term = (query.q ?? "").trim().toLowerCase();
  const view = views.some((item) => item.id === query.view) ? (query.view as ViewId) : "all";
  const tab = pickTab(query.tab, pageTabs, "herd");

  const rows = await db
    .select({
      id: animals.id,
      code: animals.code,
      name: animals.name,
      sex: animals.sex,
      dob: animals.dob,
      presence: animals.presence,
      lifeStage: animals.lifeStage,
      reproduction: animals.reproduction,
      lactation: animals.lactation,
      earTag: animals.earTag,
      colour: animals.colour,
      geneticDamId: animals.geneticDamId,
      geneticSireCode: animals.geneticSireCode,
      geneticSireName: animals.geneticSireName,
      expectedCalving: animals.expectedCalving,
      breedName: breeds.name,
      locationName: locations.name,
    })
    .from(animals)
    .innerJoin(breeds, eq(breeds.id, animals.breedId))
    .leftJoin(locations, eq(locations.id, animals.locationId))
    .where(eq(animals.farmId, farm.farmId))
    .orderBy(animals.code);

  const byId = new Map(rows.map((row) => [row.id, row]));
  const damIds = new Set(rows.map((row) => row.geneticDamId).filter((id): id is string => Boolean(id)));
  const searched = term
    ? rows.filter((row) =>
        [row.code, row.name, row.earTag, row.breedName].some((value) => value?.toLowerCase().includes(term)),
      )
    : rows;

  function matches(row: (typeof rows)[number]) {
    if (view === "active") return row.presence === "on_farm";
    if (view === "pregnant") return row.reproduction === "pregnant";
    if (view === "sold") return row.presence === "sold";
    if (view === "calves") {
      return row.presence === "on_farm" && row.dob !== null && isUnderOneYear(row.dob, today) && !damIds.has(row.id);
    }
    return true;
  }

  const visible = searched.filter(matches);
  const selected = visible.find((row) => row.code === query.code) ?? visible[0];
  const counts = {
    all: searched.length,
    active: searched.filter((row) => row.presence === "on_farm").length,
    pregnant: searched.filter((row) => row.reproduction === "pregnant").length,
    calves: searched.filter((row) => row.presence === "on_farm" && row.dob !== null && isUnderOneYear(row.dob, today) && !damIds.has(row.id)).length,
    sold: searched.filter((row) => row.presence === "sold").length,
  };

  function href(next: { view?: ViewId; code?: string }) {
    const params = new URLSearchParams();
    if (term) params.set("q", term);
    const nextView = next.view ?? view;
    if (nextView !== "all") params.set("view", nextView);
    if (next.code) params.set("code", next.code);
    const value = params.toString();
    return value ? `/animals?${value}` : "/animals";
  }

  const dam = selected?.geneticDamId ? byId.get(selected.geneticDamId) : undefined;
  const damLabel = dam ? `${dam.name ?? dam.code} · ${dam.code}` : "Not linked";
  const sireLabel = selected?.geneticSireCode
    ? selected.geneticSireName && selected.geneticSireName !== selected.geneticSireCode
      ? `${selected.geneticSireName} · ${selected.geneticSireCode}`
      : selected.geneticSireCode
    : "Not linked";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Cattle</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {counts.active} on the farm · {counts.pregnant} pregnant · {counts.calves} calves
          </p>
        </div>
        {canWriteAnimals(farm.roles) ? (
          <Link href="/animals/new" className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
            Add cattle
          </Link>
        ) : null}
      </div>
      <TabBar tabs={pageTabs} current={tab} base="/animals" />

      {tab === "tree" ? <HerdTree forest={herdForest(rows)} /> : null}
      {tab === "herd" ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:grid lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="border-b border-border lg:border-r lg:border-b-0">
            <form action="/animals" className="p-3">
              {view !== "all" ? <input type="hidden" name="view" value={view} /> : null}
              <label className="flex h-10 items-center gap-2 rounded-full bg-muted px-3">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  name="q"
                  defaultValue={query.q ?? ""}
                  placeholder="Name, code, or ear tag"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </label>
            </form>
            <div className="flex gap-1.5 overflow-x-auto px-3 pb-3">
              {views.map((item) => {
                const active = view === item.id;
                return (
                  <Link
                    key={item.id}
                    href={href({ view: item.id })}
                    className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${
                      active ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.label}
                    <span>{counts[item.id]}</span>
                  </Link>
                );
              })}
            </div>
            {visible.length === 0 ? (
              <p className="border-t border-border px-4 py-10 text-sm text-muted-foreground">No cattle match this filter.</p>
            ) : (
              <ul className="max-h-[min(40rem,70vh)] divide-y divide-border overflow-auto border-t border-border">
                {visible.map((animal) => {
                  const active = selected?.code === animal.code;
                  const status = rowStatus(animal);
                  return (
                    <li key={animal.id}>
                      <Link href={href({ code: animal.code })} className={`flex items-center gap-3 px-3 py-3 ${active ? "bg-secondary" : "hover:bg-muted"}`}>
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e7f6ee] text-sm font-semibold text-primary">
                          {(animal.name ?? animal.code).slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">{animal.name ?? "Unnamed"}</span>
                            <Pill tone={status.tone}>{status.label}</Pill>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {animal.code} · {animal.breedName}
                            {animal.dob ? ` · ${ageLabel(animal.dob, today)}` : ""}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {selected ? (
            <article className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-secondary text-2xl font-semibold text-primary">
                    {(selected.name ?? selected.code).slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-2xl font-semibold tracking-tight">{selected.name ?? "Unnamed"}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selected.code} · {selected.breedName} · {sexLabel[selected.sex]} · {ageLabel(selected.dob, today)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Pill tone={selected.presence === "on_farm" ? "good" : "neutral"}>{presenceLabel[selected.presence]}</Pill>
                      {selected.reproduction !== "not_applicable" ? (
                        <Pill tone={selected.reproduction === "pregnant" ? "warn" : "neutral"}>{reproductionLabel[selected.reproduction]}</Pill>
                      ) : null}
                      {selected.lactation !== "not_applicable" ? <Pill>{lactationLabel[selected.lactation]}</Pill> : null}
                    </div>
                  </div>
                </div>
                <Link href={`/animals/${selected.code}`} className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
                  Open profile
                </Link>
              </div>
              <dl className="mt-6 grid border-t border-border sm:grid-cols-2">
                <Fact label="Ear tag" value={selected.earTag ?? "—"} />
                <Fact label="Date of birth" value={selected.dob ? formatDisplayDate(selected.dob) : "Unknown"} />
                <Fact label="Location" value={selected.locationName ?? "Unassigned"} />
                <Fact label="Colour" value={selected.colour ?? "—"} />
                <Fact label="Life stage" value={lifeStageLabel[selected.lifeStage]} />
                <Fact label="Dam" value={damLabel} />
                <Fact label="Sire" value={sireLabel} />
                <Fact label="Expected calving" value={selected.expectedCalving ? formatDisplayDate(selected.expectedCalving) : "—"} />
              </dl>
            </article>
          ) : (
            <p className="px-5 py-16 text-sm text-muted-foreground">Select an animal from the list.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border py-3 sm:odd:pr-6 sm:even:pl-6">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

function rowStatus(animal: {
  presence: "on_farm" | "sold" | "dead" | "transferred";
  reproduction: "not_applicable" | "open" | "bred" | "pregnant" | "fresh";
  lactation: "not_applicable" | "pre_lactation" | "lactating" | "dry";
  lifeStage: "calf" | "heifer" | "cow" | "bull" | "steer";
}) {
  if (animal.reproduction === "pregnant") return { label: "Pregnant", tone: "warn" as const };
  if (animal.presence !== "on_farm") return { label: presenceLabel[animal.presence], tone: "neutral" as const };
  if (animal.lactation === "lactating") return { label: "In milk", tone: "good" as const };
  if (animal.lactation === "dry") return { label: "Dry", tone: "neutral" as const };
  return { label: lifeStageLabel[animal.lifeStage], tone: "neutral" as const };
}

function ageLabel(dob: string | null, today: string) {
  if (!dob) return "Age unknown";
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dob}T00:00:00Z`)) / 86400000);
  if (days < 31) return days <= 1 ? "1 day" : `${Math.max(days, 0)} days`;
  const months = Math.floor(days / 30.4375);
  if (months < 24) return months === 1 ? "1 month" : `${months} months`;
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (remainder === 0) return years === 1 ? "1 year" : `${years} years`;
  return `${years} yr ${remainder} mo`;
}
