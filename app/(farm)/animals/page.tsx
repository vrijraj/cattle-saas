import Link from "next/link";
import { and, count, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { animals, breeds, locations } from "@/db/schema";
import { requireFarm } from "@/lib/farm-context";
import { farmToday } from "@/lib/dates";
import { isUnderOneYear } from "@/lib/herd-stats";
import { t, type DictionaryKey } from "@/lib/i18n";
import { HerdTree } from "@/components/herd-tree";
import { lactationLabel, lifeStageLabel, presenceLabel, sexLabel } from "@/lib/labels";
import { canWriteAnimals } from "@/lib/permissions";
import { herdForest } from "@/lib/pedigree-tree";
import { HerdTabs } from "@/components/herd-tabs";
import { inputClass, pickTab, Pill, Summary } from "@/components/workspace";

const views: { id: "all" | "active" | "pregnant" | "calves" | "sold"; labelKey: DictionaryKey }[] = [
  { id: "all", labelKey: "animals.view.all" },
  { id: "active", labelKey: "animals.view.active" },
  { id: "pregnant", labelKey: "animals.view.pregnant" },
  { id: "calves", labelKey: "animals.view.calves" },
  { id: "sold", labelKey: "animals.view.sold" },
];

type ViewId = (typeof views)[number]["id"];
const PAGE_SIZE = 50;

export const metadata = { title: "Cattle" };

export default async function AnimalsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; tab?: string; breed?: string; sex?: string; shed?: string; lactation?: string; page?: string }>;
}) {
  const farm = await requireFarm();
  const query = await searchParams;
  const today = farmToday(farm.timezone);
  const rawTerm = (query.q ?? "").trim();
  const term = rawTerm.toLowerCase();
  const view = views.some((item) => item.id === query.view) ? (query.view as ViewId) : "all";
  const tab = pickTab(query.tab, [{ id: "herd" }, { id: "tree" }], "herd");
  const breedFilter = query.breed?.trim() ?? "";
  const sexFilter = query.sex && ["female", "male", "unknown"].includes(query.sex) ? query.sex : "";
  const shedFilter = query.shed?.trim() ?? "";
  const lactationFilter = query.lactation && ["lactating", "dry", "pre_lactation", "not_applicable"].includes(query.lactation) ? query.lactation : "";
  const requestedPage = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);

  const filterConds: SQL[] = [eq(animals.farmId, farm.farmId)];
  if (breedFilter) filterConds.push(eq(animals.breedId, breedFilter));
  if (sexFilter) filterConds.push(eq(animals.sex, sexFilter as "female" | "male" | "unknown"));
  if (shedFilter === "unassigned") filterConds.push(isNull(animals.locationId));
  else if (shedFilter) filterConds.push(eq(animals.locationId, shedFilter));
  if (lactationFilter) {
    filterConds.push(eq(animals.lactation, lactationFilter as "lactating" | "dry" | "pre_lactation" | "not_applicable"));
  }
  if (rawTerm) {
    const like = `%${rawTerm.replace(/[%_\\]/g, "\\$&")}%`;
    filterConds.push(
      or(
        ilike(animals.code, like),
        ilike(animals.name, like),
        ilike(animals.earTag, like),
        ilike(animals.rfid, like),
        ilike(animals.geneticSireCode, like),
        ilike(animals.geneticSireName, like),
        ilike(breeds.name, like),
        ilike(locations.name, like),
      )!,
    );
  }

  // View SQL conditions (except "calves" which uses damIds check cleanly)
  const viewConds = [...filterConds];
  if (view === "active") viewConds.push(eq(animals.presence, "on_farm"));
  else if (view === "pregnant") {
    viewConds.push(eq(animals.presence, "on_farm"), eq(animals.reproduction, "pregnant"));
  } else if (view === "sold") viewConds.push(eq(animals.presence, "sold"));
  else if (view === "calves") viewConds.push(eq(animals.presence, "on_farm"));

  const [allMeta, breedList, shedList, filteredCountRow] = await Promise.all([
    db
      .select({
        id: animals.id,
        dob: animals.dob,
        presence: animals.presence,
        reproduction: animals.reproduction,
        geneticDamId: animals.geneticDamId,
      })
      .from(animals)
      .where(eq(animals.farmId, farm.farmId)),
    db.select({ id: breeds.id, name: breeds.name }).from(breeds).where(eq(breeds.farmId, farm.farmId)).orderBy(breeds.name),
    db.select({ id: locations.id, name: locations.name }).from(locations).where(eq(locations.farmId, farm.farmId)).orderBy(locations.name),
    db
      .select({ total: count() })
      .from(animals)
      .innerJoin(breeds, eq(breeds.id, animals.breedId))
      .leftJoin(locations, eq(locations.id, animals.locationId))
      .where(and(...viewConds)),
  ]);

  const damIds = new Set(allMeta.map((row) => row.geneticDamId).filter((id): id is string => Boolean(id)));
  const isCalfMeta = (row: { id: string; presence: string; dob: string | null }) =>
    row.presence === "on_farm" && row.dob !== null && isUnderOneYear(row.dob, today) && !damIds.has(row.id);

  const herdCounts = {
    all: allMeta.length,
    active: allMeta.filter((row) => row.presence === "on_farm").length,
    pregnant: allMeta.filter((row) => row.presence === "on_farm" && row.reproduction === "pregnant").length,
    calves: allMeta.filter(isCalfMeta).length,
    sold: allMeta.filter((row) => row.presence === "sold").length,
  };

  const baseSelect = {
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
    rfid: animals.rfid,
    breedId: animals.breedId,
    locationId: animals.locationId,
    geneticDamId: animals.geneticDamId,
    geneticSireCode: animals.geneticSireCode,
    geneticSireName: animals.geneticSireName,
    breedName: breeds.name,
    locationName: locations.name,
  };

  let visible: {
    id: string;
    code: string;
    name: string | null;
    sex: "female" | "male" | "unknown";
    dob: string | null;
    presence: "on_farm" | "sold" | "dead" | "transferred";
    lifeStage: "calf" | "heifer" | "cow" | "bull" | "steer";
    reproduction: "not_applicable" | "open" | "bred" | "pregnant" | "fresh";
    lactation: "not_applicable" | "pre_lactation" | "lactating" | "dry";
    earTag: string | null;
    rfid: string | null;
    breedId: string;
    locationId: string | null;
    geneticDamId: string | null;
    geneticSireCode: string | null;
    geneticSireName: string | null;
    breedName: string;
    locationName: string | null;
  }[] = [];

  let totalMatching = Number(filteredCountRow[0]?.total ?? 0);
  let totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_SIZE));
  let currentPage = Math.min(requestedPage, totalPages);

  if (tab === "tree" || view === "calves") {
    const allFiltered = await db
      .select(baseSelect)
      .from(animals)
      .innerJoin(breeds, eq(breeds.id, animals.breedId))
      .leftJoin(locations, eq(locations.id, animals.locationId))
      .where(and(...viewConds))
      .orderBy(animals.code);
    const narrowed = view === "calves" ? allFiltered.filter(isCalfMeta) : allFiltered;
    totalMatching = narrowed.length;
    totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_SIZE));
    currentPage = Math.min(requestedPage, totalPages);
    visible = tab === "tree" ? narrowed : narrowed.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  } else {
    visible = await db
      .select(baseSelect)
      .from(animals)
      .innerJoin(breeds, eq(breeds.id, animals.breedId))
      .leftJoin(locations, eq(locations.id, animals.locationId))
      .where(and(...viewConds))
      .orderBy(animals.code)
      .limit(PAGE_SIZE)
      .offset((currentPage - 1) * PAGE_SIZE);
  }

  const hasFilters = Boolean(term || breedFilter || sexFilter || shedFilter || lactationFilter || view !== "all");

  function href(nextView: ViewId = view, nextPage = 1) {
    const params = new URLSearchParams();
    if (rawTerm) params.set("q", rawTerm);
    if (breedFilter) params.set("breed", breedFilter);
    if (sexFilter) params.set("sex", sexFilter);
    if (shedFilter) params.set("shed", shedFilter);
    if (lactationFilter) params.set("lactation", lactationFilter);
    if (nextView !== "all") params.set("view", nextView);
    if (nextPage > 1) params.set("page", String(nextPage));
    const value = params.toString();
    return value ? `/animals?${value}` : "/animals";
  }

  return (
    <div className="space-y-5">
      <Summary
        title={t(farm.locale, "animals.title")}
        description={
          rawTerm
            ? `${totalMatching} ${totalMatching === 1 ? "animal matches" : "animals match"} “${rawTerm}”.`
            : "Open a row to see that animal's profile. Filter, print QR label sheets, or run bulk shed actions."
        }
        facts={[
          { label: t(farm.locale, "animals.view.active"), value: String(herdCounts.active) },
          { label: t(farm.locale, "animals.view.pregnant"), value: String(herdCounts.pregnant) },
          { label: t(farm.locale, "animals.view.calves"), value: String(herdCounts.calves) },
          { label: t(farm.locale, "animals.view.sold"), value: String(herdCounts.sold) },
        ]}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/animals/labels"
              className="inline-flex h-10 items-center rounded-full border border-border bg-white px-3.5 text-xs font-semibold text-foreground shadow-2xs transition hover:border-primary/35 hover:text-primary"
            >
              {t(farm.locale, "animals.qrSheets")}
            </Link>
            <Link
              href="/animals/bulk"
              className="inline-flex h-10 items-center rounded-full border border-border bg-white px-3.5 text-xs font-semibold text-foreground shadow-2xs transition hover:border-primary/35 hover:text-primary"
            >
              {t(farm.locale, "animals.bulkCsv")}
            </Link>
            {canWriteAnimals(farm.roles) ? (
              <Link
                href="/animals/new"
                className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
              >
                {t(farm.locale, "animals.add")}
              </Link>
            ) : null}
          </div>
        }
      />
      <HerdTabs
        initialTab={tab}
        tree={<HerdTree forest={herdForest(visible)} />}
        herd={
          <section className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border/85 bg-card shadow-[0_1px_3px_rgba(15,35,24,0.04)]">
            <div className="space-y-3 border-b border-border/75 p-4">
              <form method="get" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,0.85fr))_auto]">
                {view !== "all" ? <input type="hidden" name="view" value={view} /> : null}
                <input
                  key={rawTerm}
                  name="q"
                  defaultValue={rawTerm}
                  placeholder={t(farm.locale, "animals.searchPlaceholder")}
                  className={inputClass}
                />
                <select name="breed" defaultValue={breedFilter} className={inputClass} aria-label="Filter by breed">
                  <option value="">All breeds</option>
                  {breedList.map((breed) => (
                    <option key={breed.id} value={breed.id}>
                      {breed.name}
                    </option>
                  ))}
                </select>
                <select name="sex" defaultValue={sexFilter} className={inputClass} aria-label="Filter by sex">
                  <option value="">All sexes</option>
                  {Object.entries(sexLabel).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
                <select name="shed" defaultValue={shedFilter} className={inputClass} aria-label="Filter by shed">
                  <option value="">All sheds</option>
                  <option value="unassigned">Unassigned</option>
                  {shedList.map((shed) => (
                    <option key={shed.id} value={shed.id}>
                      {shed.name}
                    </option>
                  ))}
                </select>
                <select name="lactation" defaultValue={lactationFilter} className={inputClass} aria-label="Filter by lactation">
                  <option value="">All lactation</option>
                  {Object.entries(lactationLabel).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <button type="submit" className="inline-flex h-11 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">
                    {t(farm.locale, "animals.filter")}
                  </button>
                  {hasFilters ? (
                    <Link href="/animals" className="inline-flex h-11 items-center rounded-xl border border-border px-3 text-sm font-medium text-muted-foreground hover:bg-muted">
                      {t(farm.locale, "animals.clear")}
                    </Link>
                  ) : null}
                </div>
              </form>
              <div className="flex flex-wrap gap-1.5">
                {views.map((item) => {
                  const active = view === item.id;
                  return (
                    <Link
                      key={item.id}
                      href={href(item.id, 1)}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
                        active ? "bg-secondary text-primary ring-1 ring-primary/20" : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {t(farm.locale, item.labelKey)}
                      <span className="tabular-nums opacity-80">{herdCounts[item.id]}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            <ul className="divide-y divide-border/70 md:hidden">
              {visible.length === 0 ? <li className="px-4 py-8 text-center text-sm text-muted-foreground">No cattle match this filter.</li> : null}
              {visible.map((animal) => {
                const pills = rowStatuses(animal);
                return (
                  <li key={animal.id}>
                    <Link href={`/animals/${animal.code}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-sm font-semibold text-primary ring-1 ring-primary/15">
                        {(animal.name ?? animal.code).slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-foreground">{animal.name ?? "Unnamed"}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {animal.code} · {animal.breedName} · {ageLabel(animal.dob, today)}
                        </span>
                        <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
                          {pills.map((pill) => (
                            <Pill key={pill.label} tone={pill.tone}>
                              {pill.label}
                            </Pill>
                          ))}
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
                <thead className="border-b border-border/80 bg-muted/60 text-xs font-semibold text-muted-foreground">
                  <tr>
                    {["Animal", "Breed", "Age", "Status", "Location"].map((header) => (
                      <th key={header} className="px-4 py-3 font-semibold tracking-tight">
                        {header}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right font-semibold tracking-tight">
                      <span className="sr-only">Profile</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No cattle match this filter.
                      </td>
                    </tr>
                  ) : (
                    visible.map((animal) => {
                      const pills = rowStatuses(animal);
                      const rowHref = `/animals/${animal.code}`;
                      const cell = "block px-4 py-3";
                      return (
                        <tr key={animal.id} className="transition-colors hover:bg-muted/40">
                          <td className="p-0">
                            <Link href={rowHref} className={cell}>
                              <span className="font-semibold text-foreground">{animal.name ?? "Unnamed"}</span>
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {animal.code}
                                {animal.earTag ? ` · Tag ${animal.earTag}` : ""}
                              </span>
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
                            <Link href={rowHref} className="flex flex-wrap items-center gap-1.5 px-4 py-3">
                              {pills.map((pill) => (
                                <Pill key={pill.label} tone={pill.tone}>
                                  {pill.label}
                                </Pill>
                              ))}
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
                              className="inline-flex h-8 items-center rounded-full border border-primary/20 bg-secondary/80 px-3 text-xs font-semibold text-primary transition-colors hover:bg-secondary"
                            >
                              Open profile →
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/75 bg-muted/20 px-4 py-3 text-xs">
                <span className="text-muted-foreground tabular-nums">
                  Page {currentPage} of {totalPages} · {totalMatching} matching animals
                </span>
                <div className="flex items-center gap-2">
                  {currentPage > 1 ? (
                    <Link
                      href={href(view, currentPage - 1)}
                      className="inline-flex h-8 items-center rounded-full border border-border bg-white px-3 font-medium hover:bg-muted"
                    >
                      ← Previous
                    </Link>
                  ) : null}
                  {currentPage < totalPages ? (
                    <Link
                      href={href(view, currentPage + 1)}
                      className="inline-flex h-8 items-center rounded-full border border-border bg-white px-3 font-medium hover:bg-muted"
                    >
                      Next →
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        }
      />
    </div>
  );
}

function rowStatuses(animal: {
  presence: "on_farm" | "sold" | "dead" | "transferred";
  reproduction: "not_applicable" | "open" | "bred" | "pregnant" | "fresh";
  lactation: "not_applicable" | "pre_lactation" | "lactating" | "dry";
  lifeStage: "calf" | "heifer" | "cow" | "bull" | "steer";
}) {
  if (animal.presence !== "on_farm") return [{ label: presenceLabel[animal.presence], tone: "neutral" as const }];
  const pills: { label: string; tone: "neutral" | "good" | "warn" }[] = [];
  if (animal.lactation === "lactating") pills.push({ label: "In milk", tone: "good" });
  else if (animal.lactation === "dry") pills.push({ label: "Dry", tone: "neutral" });
  if (animal.reproduction === "pregnant") pills.push({ label: "Pregnant", tone: "warn" });
  else if (animal.reproduction === "bred") pills.push({ label: "Bred", tone: "neutral" });
  if (pills.length === 0) pills.push({ label: lifeStageLabel[animal.lifeStage], tone: "neutral" });
  return pills;
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
