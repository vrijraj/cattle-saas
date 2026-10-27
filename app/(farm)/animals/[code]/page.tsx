import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { animals, breeds, locations } from "@/db/schema";
import { formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { AnimalHub, profileTabs, type ProfileTab } from "@/components/animal-hub";
import { FormSelect } from "@/components/form-select";
import { RecordDialog } from "@/components/record-dialog";
import { inputClass, Notice, Pill, Submit, TabBar } from "@/components/workspace";
import { lactationLabel, lifeStageLabel, presenceLabel, reproductionLabel } from "@/lib/labels";
import { canPublish, canRecordBreeding, canRecordFeed, canRecordHealth, canSeeClinical, canViewGenetics, canViewHealth, canWriteAnimals, canWriteMilk } from "@/lib/permissions";
import { updateAnimalStatus } from "../actions";
import { savePhoto } from "../photo-actions";

const profileErrorMessages: Record<string, string> = {
  role: "Your role cannot record or modify this entry.",
  weight: "Weight must be between 1 and 1,200 kg.",
  milk: "Enter morning or evening milk between 0 and 80 litres.",
  date: "Enter a valid date (not in the future where restricted).",
  cost: "Treatment cost must be zero or more.",
  price: "Listing price must be zero or more.",
  isolation: "Enter a reason to isolate or clear isolation.",
  location: "Choose an active shed on this farm.",
  dry: "Only a lactating female can be dried off.",
  result: "Choose Pregnant, Not pregnant, or Doubtful.",
  outcome: "Choose Live calf or Dead calf.",
  bull: "Enter the bull code used for insemination.",
  straw: "That straw code is not available in inventory.",
  conception: "Choose the conception insemination for this calving.",
  storage: "Cloudflare R2 is not configured, so the photo was not stored.",
  photo: "Use a JPEG, PNG, or WebP under 5 MB.",
};

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const farm = await requireFarm();
  const { code } = await params;
  const [animal] = await db
    .select({ name: animals.name, code: animals.code })
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)))
    .limit(1);
  if (!animal) return { title: "Cattle" };
  const label = animal.name && animal.name !== animal.code ? `${animal.name} (${animal.code})` : animal.code;
  return { title: label, description: `${label} at ${farm.farmName}.` };
}

export default async function AnimalProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ tab?: string; event?: string; error?: string; edit?: string }>;
}) {
  const farm = await requireFarm();
  const { code } = await params;
  const query = await searchParams;
  const [animal] = await db
    .select({
      animal: animals,
      breedName: breeds.name,
      locationName: locations.name,
    })
    .from(animals)
    .innerJoin(breeds, eq(breeds.id, animals.breedId))
    .leftJoin(locations, eq(locations.id, animals.locationId))
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)))
    .limit(1);

  if (!animal) notFound();
  const record = animal.animal;
  let damLabel = "Not linked";
  let damCode: string | null = null;
  if (record.geneticDamId) {
    const [dam] = await db
      .select({ code: animals.code, name: animals.name })
      .from(animals)
      .where(eq(animals.id, record.geneticDamId))
      .limit(1);
    if (dam) {
      damLabel = `${dam.name ?? dam.code} · ${dam.code}`;
      damCode = dam.code;
    }
  }
  const sireLabel = record.geneticSireCode
    ? record.geneticSireName && record.geneticSireName !== record.geneticSireCode
      ? `${record.geneticSireName} · ${record.geneticSireCode}`
      : record.geneticSireCode
    : "Not linked";

  const tabs = profileTabs.filter(
    (tab) => (tab.id !== "listing" || canPublish(farm.roles)) && (tab.id !== "health" || canViewHealth(farm.roles)),
  );
  const tab = tabs.some((item) => item.id === query.tab) ? (query.tab as ProfileTab) : "overview";
  const canEdit = canWriteAnimals(farm.roles);
  const sexSymbol = record.sex === "female" ? "♀" : record.sex === "male" ? "♂" : "•";
  const sexBadgeTone =
    record.sex === "female"
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : record.sex === "male"
        ? "bg-sky-50 text-sky-700 ring-sky-200"
        : "bg-muted text-muted-foreground ring-border";

  return (
    <div className="space-y-5">
      <section className="min-w-0 max-w-full rounded-2xl border border-border/85 bg-card p-4 shadow-[0_1px_3px_rgba(15,35,24,0.04)] sm:p-6">
        {/* Top bar: Breadcrumb + Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3.5">
          <div className="flex items-center gap-2.5">
            <Link
              href="/animals"
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-3 text-xs font-medium text-foreground transition hover:bg-muted"
            >
              ← Cattle register
            </Link>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs font-medium text-muted-foreground capitalize">
              {animal.breedName} · {record.species}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <RecordDialog
                title="Change status"
                button="Change status"
                quiet
                open={query.error === "status"}
                notice={query.error === "status" ? "Choose a status and try again." : undefined}
              >
                <form action={updateAnimalStatus} className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="code" value={record.code} />
                  <label className="text-sm">
                    Presence
                    <FormSelect name="presence" className={`mt-1 ${inputClass}`} defaultValue={record.presence} options={Object.entries(presenceLabel).map(([value, label]) => ({ value, label }))} />
                  </label>
                  <label className="text-sm">
                    Life stage
                    <FormSelect name="lifeStage" className={`mt-1 ${inputClass}`} defaultValue={record.lifeStage} options={Object.entries(lifeStageLabel).map(([value, label]) => ({ value, label }))} />
                  </label>
                  {record.sex === "male" ? (
                    <>
                      <input type="hidden" name="reproduction" value="not_applicable" />
                      <input type="hidden" name="lactation" value="not_applicable" />
                      <p className="text-sm text-muted-foreground sm:col-span-2">Reproduction and lactation stay not applicable for a male.</p>
                    </>
                  ) : (
                    <>
                      <label className="text-sm">
                        Reproduction
                        <FormSelect name="reproduction" className={`mt-1 ${inputClass}`} defaultValue={record.reproduction} options={Object.entries(reproductionLabel).filter(([value]) => value !== "not_applicable" || record.reproduction === "not_applicable").map(([value, label]) => ({ value, label }))} />
                      </label>
                      <label className="text-sm">
                        Lactation
                        <FormSelect name="lactation" className={`mt-1 ${inputClass}`} defaultValue={record.lactation} options={Object.entries(lactationLabel).filter(([value]) => value !== "not_applicable" || record.lactation === "not_applicable").map(([value, label]) => ({ value, label }))} />
                      </label>
                      <label className="text-sm sm:col-span-2">
                        Expected calving
                        <input name="expectedCalving" type="date" defaultValue={record.expectedCalving ?? ""} className={`mt-1 ${inputClass}`} />
                      </label>
                      <p className="text-xs text-muted-foreground sm:col-span-2">Expected calving is kept when reproduction is Pregnant.</p>
                    </>
                  )}
                  <p className="text-xs text-muted-foreground sm:col-span-2">The cattle list shows Sold, Dead, or Transferred first, then Pregnant, then In milk or Dry, then the life stage.</p>
                  <div className="flex justify-end sm:col-span-2">
                    <Submit>Save status</Submit>
                  </div>
                </form>
              </RecordDialog>
            ) : null}
            {canEdit ? (
              <RecordDialog
                title="Update animal photo"
                button={record.photoKey ? "Change photo" : "Upload photo"}
                quiet
                open={query.error === "photo" || query.error === "storage"}
                notice={
                  query.error === "photo"
                    ? "Use a JPEG, PNG, or WebP under 5 MB."
                    : query.error === "storage"
                      ? "Cloudflare R2 is not configured, so the photo was not stored."
                      : undefined
                }
              >
                <form action={savePhoto} className="space-y-3">
                  <input type="hidden" name="code" value={record.code} />
                  <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                    Select photograph (JPEG, PNG, or WebP up to 5 MB)
                    <input
                      name="photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      required
                      className={`${inputClass} h-auto min-w-0 max-w-full py-2 file:mr-3 file:rounded-lg file:border file:border-border file:bg-muted file:px-3 file:py-1 file:text-xs file:font-medium`}
                    />
                  </label>
                  <div className="flex justify-end pt-1">
                    <Submit>Save photo</Submit>
                  </div>
                </form>
              </RecordDialog>
            ) : null}
            {farm.roles.length === 1 && farm.roles[0] === "worker" ? null : (
              <Link
                href={`/animals/${record.code}/pedigree`}
                className="inline-flex h-9 items-center rounded-full border border-border bg-background px-3.5 text-xs font-medium text-foreground transition hover:bg-muted"
              >
                Pedigree PDF
              </Link>
            )}
          </div>
        </div>

        {/* Main Profile Identity + QR Badge */}
        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <div className="relative shrink-0">
              {record.photoKey ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/animals/${record.code}/photo`} alt="" className="size-18 rounded-2xl object-cover ring-1 ring-border sm:size-22" />
              ) : (
                <span className="grid size-18 place-items-center rounded-2xl bg-gradient-to-br from-secondary via-secondary/70 to-muted text-2xl font-semibold text-primary ring-1 ring-primary/15 sm:size-22 sm:text-3xl">
                  {(record.name ?? record.code).slice(0, 1)}
                </span>
              )}
              <span
                className={`absolute -right-1.5 -bottom-1.5 grid size-6 place-items-center rounded-full text-xs font-bold ring-2 ring-card ${sexBadgeTone}`}
                title={record.sex}
              >
                {sexSymbol}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{record.name ?? "Unnamed"}</h1>
                <span className="rounded-lg border border-border/80 bg-muted/60 px-2.5 py-0.5 font-mono text-xs font-semibold text-foreground">
                  {record.code}
                </span>
                {record.earTag ? (
                  <span className="rounded-lg border border-border/60 bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Tag {record.earTag}
                  </span>
                ) : null}
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Pill tone={record.presence === "on_farm" ? "good" : "neutral"}>{presenceLabel[record.presence]}</Pill>
                <Pill>{lifeStageLabel[record.lifeStage]}</Pill>
                {record.sex !== "male" ? (
                  <>
                    <Pill tone={record.reproduction === "pregnant" ? "warn" : "neutral"}>{reproductionLabel[record.reproduction]}</Pill>
                    <Pill tone={record.lactation === "lactating" ? "good" : "neutral"}>{lactationLabel[record.lactation]}</Pill>
                  </>
                ) : null}
                {record.isolationReason ? (
                  <Pill tone="warn">Isolated · {record.isolationReason}</Pill>
                ) : null}
              </div>
            </div>
          </div>

          {/* Compact QR Card */}
          <div className="flex shrink-0 items-center gap-3 self-start rounded-2xl border border-border/75 bg-muted/30 p-2.5 sm:self-center">
            <Link
              href={`/animals/${record.code}/label`}
              className="rounded-xl border border-border bg-white p-1.5 shadow-2xs transition-transform hover:scale-[1.03]"
              title="Open printable QR label"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/animals/${record.code}/qr`} alt={`QR for ${record.code}`} className="size-12 sm:size-13" />
            </Link>
            <div className="flex flex-col gap-1 pr-1 text-xs">
              <span className="font-mono text-[11px] font-semibold text-foreground">{record.code}</span>
              <Link href={`/animals/${record.code}/label`} className="font-medium text-primary hover:underline">
                Print QR label →
              </Link>
              <a href={`/animals/${record.code}/qr?download=1`} download={`${record.code}-qr.png`} className="text-muted-foreground hover:text-foreground hover:underline">
                Download PNG
              </a>
            </div>
          </div>
        </div>

        {/* 6-Tile Vitals Strip */}
        <dl className="mt-5 grid grid-cols-2 gap-2.5 border-t border-border/75 pt-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Date of birth</dt>
            <dd className="mt-1 truncate text-sm font-medium text-foreground">
              {record.dob ? `${formatDisplayDate(record.dob)}${record.dobEstimated ? " (Est.)" : ""}` : "Unknown"}
            </dd>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Current shed</dt>
            <dd className="mt-1 truncate text-sm font-medium text-foreground">{animal.locationName ?? "Unassigned"}</dd>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Dam (♀)</dt>
            <dd className="mt-1 truncate text-sm font-medium text-foreground">
              {damCode ? (
                <Link href={`/animals/${damCode}`} className="text-primary hover:underline">
                  {damLabel}
                </Link>
              ) : (
                damLabel
              )}
            </dd>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sire (♂)</dt>
            <dd className="mt-1 truncate text-sm font-medium text-foreground">
              {record.geneticSireCode ? (
                <Link href={`/animals/${record.code}?tab=parentage`} className="text-primary hover:underline">
                  {sireLabel}
                </Link>
              ) : (
                sireLabel
              )}
            </dd>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Expected calving</dt>
            <dd className="mt-1 truncate text-sm font-medium text-foreground">
              {record.expectedCalving ? formatDisplayDate(record.expectedCalving) : "—"}
            </dd>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Origin / Source</dt>
            <dd className="mt-1 truncate text-sm font-medium text-foreground">
              {record.purchasePrice
                ? `₹${Number(record.purchasePrice).toLocaleString("en-IN")}`
                : record.purchaseSource || "Farm bred"}
            </dd>
          </div>
        </dl>
      </section>

      {query.error && profileErrorMessages[query.error] ? (
        <Notice tone="danger">{profileErrorMessages[query.error]}</Notice>
      ) : null}

      <TabBar tabs={[...tabs]} current={tab} base={`/animals/${record.code}`} />

      <AnimalHub
        animal={record}
        breedName={animal.breedName}
        locationName={animal.locationName}
        damLabel={damLabel}
        sireLabel={sireLabel}
        tab={tab}
        breedingError={query.error}
        pedigreeEdit={query.edit}
        canBreed={canRecordBreeding(farm.roles)}
        canHealth={canRecordHealth(farm.roles)}
        canMilk={canWriteMilk(farm.roles)}
        canFeed={canRecordFeed(farm.roles)}
        canList={canPublish(farm.roles)}
        canEdit={canWriteAnimals(farm.roles)}
        canViewGenetics={canViewGenetics(farm.roles)}
        canSeeClinical={canSeeClinical(farm.roles)}
        roles={farm.roles}
        userId={farm.userId}
        timezone={farm.timezone}
      />
    </div>
  );
}
