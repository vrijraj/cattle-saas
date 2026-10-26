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
  if (record.geneticDamId) {
    const [dam] = await db
      .select({ code: animals.code, name: animals.name })
      .from(animals)
      .where(eq(animals.id, record.geneticDamId))
      .limit(1);
    damLabel = dam ? `${dam.name ?? dam.code} · ${dam.code}` : "Not linked";
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

  const highlights = [
    ["Date of birth", record.dob ? formatDisplayDate(record.dob) : "Unknown"],
    ["Location", animal.locationName ?? "Unassigned"],
    ["Dam", damLabel],
    ["Sire", sireLabel],
    ["Expected calving", record.expectedCalving ? formatDisplayDate(record.expectedCalving) : "—"],
    ["Life stage", lifeStageLabel[record.lifeStage]],
  ];

  return (
    <div className="space-y-5">
      <section className="min-w-0 max-w-full rounded-2xl border border-border/85 bg-card p-4 shadow-[0_1px_3px_rgba(15,35,24,0.04)] sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex min-w-0 items-start gap-3.5 sm:gap-5">
            {record.photoKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/animals/${record.code}/photo`} alt="" className="size-16 shrink-0 rounded-2xl object-cover ring-1 ring-border sm:size-22" />
            ) : (
              <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-secondary text-xl font-semibold text-primary ring-1 ring-primary/15 sm:size-22 sm:text-2xl">
                {(record.name ?? record.code).slice(0, 1)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <Link href="/animals" className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-primary hover:underline">
                ← Cattle register
              </Link>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{record.name ?? "Unnamed"}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                <span className="font-medium text-foreground/85">{record.code}</span>
                {record.earTag ? ` · Tag ${record.earTag}` : ""} · {animal.breedName}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Pill tone={record.presence === "on_farm" ? "good" : "neutral"}>{presenceLabel[record.presence]}</Pill>
                <Pill tone={record.reproduction === "pregnant" ? "warn" : "neutral"}>{reproductionLabel[record.reproduction]}</Pill>
                <Pill>{lactationLabel[record.lactation]}</Pill>
                {canWriteAnimals(farm.roles) ? (
                  <RecordDialog title="Change status" button="Change status" quiet open={query.error === "status"} notice={query.error === "status" ? "Choose a status and try again." : undefined}>
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
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 self-start rounded-2xl border border-border/80 bg-muted/35 p-2.5 sm:flex-col sm:items-end sm:gap-2">
            <Link href={`/animals/${record.code}/label`} className="rounded-xl border border-border bg-white p-1.5 shadow-2xs transition-transform hover:scale-[1.02]" title="Open printable QR label">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/animals/${record.code}/qr`} alt={`QR for ${record.code}`} className="size-12 sm:size-14" />
            </Link>
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-primary sm:justify-end">
              <Link href={`/animals/${record.code}/label`} className="rounded-md px-1.5 py-0.5 hover:bg-secondary">
                Print QR
              </Link>
              <a href={`/animals/${record.code}/qr?download=1`} download={`${record.code}-qr.png`} className="rounded-md px-1.5 py-0.5 hover:bg-secondary">
                Download
              </a>
              {farm.roles.length === 1 && farm.roles[0] === "worker" ? null : (
                <Link href={`/animals/${record.code}/pedigree`} className="rounded-md px-1.5 py-0.5 hover:bg-secondary">
                  Pedigree PDF
                </Link>
              )}
            </div>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 border-t border-border/75 pt-4 sm:grid-cols-2 xl:grid-cols-3">
          {highlights.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border/60 bg-muted/25 px-3.5 py-2.5">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        {canWriteAnimals(farm.roles) ? (
          <form action={savePhoto} className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <input type="hidden" name="code" value={record.code} />
            <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className={`${inputClass} h-auto min-w-0 max-w-full py-2 file:max-w-full`} />
            <Submit>Save photo</Submit>
          </form>
        ) : null}
        {query.error === "storage" ? <div className="mt-3"><Notice>Cloudflare R2 is not configured, so the photo was not stored.</Notice></div> : null}
        {query.error === "photo" ? <div className="mt-3"><Notice tone="danger">Use a JPEG, PNG, or WebP under 5 MB.</Notice></div> : null}
      </section>

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
