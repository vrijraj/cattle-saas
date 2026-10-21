import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { animals, breeds, locations } from "@/db/schema";
import { requireFarm } from "@/lib/farm-context";
import { farmToday } from "@/lib/dates";
import { isUnderOneYear } from "@/lib/herd-stats";
import { HerdTree } from "@/components/herd-tree";
import { HerdSearch } from "@/components/herd-search";
import { lifeStageLabel, presenceLabel } from "@/lib/labels";
import { canManageTeam, canViewAudit, canViewFinance, canViewGenetics, canViewHealth, canViewReports, canViewSemen, canWriteAnimals } from "@/lib/permissions";
import { matchesHerdQuery } from "@/lib/herd-query";
import { herdForest } from "@/lib/pedigree-tree";
import { pickTab, Pill, Summary, TabBar } from "@/components/workspace";

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
  searchParams: Promise<{ q?: string; view?: string; tab?: string }>;
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
      dob: animals.dob,
      presence: animals.presence,
      lifeStage: animals.lifeStage,
      reproduction: animals.reproduction,
      lactation: animals.lactation,
      earTag: animals.earTag,
      geneticDamId: animals.geneticDamId,
      geneticSireCode: animals.geneticSireCode,
      geneticSireName: animals.geneticSireName,
      breedName: breeds.name,
      locationName: locations.name,
    })
    .from(animals)
    .innerJoin(breeds, eq(breeds.id, animals.breedId))
    .leftJoin(locations, eq(locations.id, animals.locationId))
    .where(eq(animals.farmId, farm.farmId))
    .orderBy(animals.code);

  const damIds = new Set(rows.map((row) => row.geneticDamId).filter((id): id is string => Boolean(id)));
  const searched = term ? rows.filter((row) => matchesHerdQuery(row, term)) : rows;

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
  const counts = {
    all: searched.length,
    active: searched.filter((row) => row.presence === "on_farm").length,
    pregnant: searched.filter((row) => row.reproduction === "pregnant").length,
    calves: searched.filter((row) => row.presence === "on_farm" && row.dob !== null && isUnderOneYear(row.dob, today) && !damIds.has(row.id)).length,
    sold: searched.filter((row) => row.presence === "sold").length,
  };
  const herdCounts = {
    active: rows.filter((row) => row.presence === "on_farm").length,
    pregnant: rows.filter((row) => row.reproduction === "pregnant").length,
    calves: rows.filter((row) => row.presence === "on_farm" && row.dob !== null && isUnderOneYear(row.dob, today) && !damIds.has(row.id)).length,
    sold: rows.filter((row) => row.presence === "sold").length,
  };

  function href(nextView: ViewId = view) {
    const params = new URLSearchParams();
    if (term) params.set("q", term);
    if (nextView !== "all") params.set("view", nextView);
    const value = params.toString();
    return value ? `/animals?${value}` : "/animals";
  }

  return (
    <div className="space-y-5">
      <Summary
        title="Cattle"
        description={term ? `${visible.length} ${visible.length === 1 ? "animal matches" : "animals match"} “${query.q?.trim()}”.` : "Open a row to see that animal's profile."}
        facts={[
          { label: "On farm", value: String(herdCounts.active) },
          { label: "Pregnant", value: String(herdCounts.pregnant) },
          { label: "Calves", value: String(herdCounts.calves) },
          { label: "Sold", value: String(herdCounts.sold) },
        ]}
        action={
          canWriteAnimals(farm.roles) ? (
            <Link href="/animals/new" className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
              Add cattle
            </Link>
          ) : null
        }
      />
      <TabBar tabs={pageTabs} current={tab} base="/animals" />

      {tab === "tree" ? <HerdTree forest={herdForest(rows)} /> : null}
      {tab === "herd" ? (
        <section className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
            <HerdSearch
              variant="field"
              farmId={farm.farmId}
              showTeam={canManageTeam(farm.roles)}
              showAudit={canViewAudit(farm.roles)}
              showFinance={canViewFinance(farm.roles)}
              showReports={canViewReports(farm.roles)}
              showGenetics={canViewGenetics(farm.roles)}
              showHealth={canViewHealth(farm.roles)}
              showSemen={canViewSemen(farm.roles)}
            />
            <div className="flex flex-wrap gap-1.5">
              {views.map((item) => {
                const active = view === item.id;
                return (
                  <Link
                    key={item.id}
                    href={href(item.id)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${
                      active ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.label}
                    <span>{counts[item.id]}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <ul className="divide-y divide-border md:hidden">
            {visible.length === 0 ? <li className="px-4 py-8 text-sm text-muted-foreground">No cattle match this filter.</li> : null}
            {visible.map((animal) => {
              const status = rowStatus(animal);
              return (
                <li key={animal.id}>
                  <Link href={`/animals/${animal.code}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-sm font-semibold text-primary">
                      {(animal.name ?? animal.code).slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{animal.name ?? "Unnamed"}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {animal.code} · {animal.breedName} · {ageLabel(animal.dob, today)}
                      </span>
                      <span className="mt-1.5 flex min-w-0 items-center gap-2">
                        <Pill tone={status.tone}>{status.label}</Pill>
                        <span className="truncate text-xs text-muted-foreground">{animal.locationName ?? "Unassigned"}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-muted/80 text-xs text-muted-foreground">
                <tr>
                  {["Animal", "Breed", "Age", "Status", "Location"].map((header) => (
                    <th key={header} className="px-4 py-3 font-medium">
                      {header}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Profile</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-sm text-muted-foreground">
                      No cattle match this filter.
                    </td>
                  </tr>
                ) : (
                  visible.map((animal) => {
                    const status = rowStatus(animal);
                    const rowHref = `/animals/${animal.code}`;
                    const cell = "block px-4 py-3";
                    return (
                      <tr key={animal.id} className="hover:bg-muted/60">
                        <td className="p-0">
                          <Link href={rowHref} className={cell}>
                            <span className="font-medium">{animal.name ?? "Unnamed"}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">{animal.code}</span>
                          </Link>
                        </td>
                        <td className="p-0">
                          <Link href={rowHref} className={cell}>
                            {animal.breedName}
                          </Link>
                        </td>
                        <td className="p-0">
                          <Link href={rowHref} className={cell}>
                            {ageLabel(animal.dob, today)}
                          </Link>
                        </td>
                        <td className="p-0">
                          <Link href={rowHref} className={cell}>
                            <Pill tone={status.tone}>{status.label}</Pill>
                          </Link>
                        </td>
                        <td className="p-0">
                          <Link href={rowHref} className={cell}>
                            {animal.locationName ?? "Unassigned"}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Link
                            href={`/animals/${animal.code}`}
                            className="inline-flex h-8 items-center rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground"
                          >
                            Open profile
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
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
