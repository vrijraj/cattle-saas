import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { animals, breeds, locations } from "@/db/schema";
import { formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { AnimalHub, profileTabs, type ProfileTab } from "@/components/animal-hub";
import { inputClass, Notice, Pill, Submit, TabBar } from "@/components/workspace";
import { lactationLabel, lifeStageLabel, presenceLabel, reproductionLabel } from "@/lib/labels";
import { canPublish, canRecordBreeding, canRecordHealth, canWriteAnimals } from "@/lib/permissions";
import { savePhoto } from "../photo-actions";

export default async function AnimalProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ tab?: string; event?: string; error?: string }>;
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

  const tabs = profileTabs.filter((tab) => tab.id !== "listing" || canPublish(farm.roles));
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
      <section className="min-w-0 max-w-full rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          {record.photoKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/animals/${record.code}/photo`} alt="" className="size-14 shrink-0 rounded-2xl object-cover sm:size-20" />
          ) : (
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-secondary text-xl font-semibold text-primary sm:size-20 sm:text-2xl">
              {(record.name ?? record.code).slice(0, 1)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <Link href="/animals" className="text-sm text-primary">
              Cattle
            </Link>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{record.name ?? "Unnamed"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {record.code} · {animal.breedName}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill tone={record.presence === "on_farm" ? "good" : "neutral"}>{presenceLabel[record.presence]}</Pill>
              <Pill tone={record.reproduction === "pregnant" ? "warn" : "neutral"}>{reproductionLabel[record.reproduction]}</Pill>
              <Pill>{lactationLabel[record.lactation]}</Pill>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Link href={`/animals/${record.code}/qr`} className="rounded-xl border border-border p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/animals/${record.code}/qr`} alt="" className="size-11 sm:size-14" />
            </Link>
            {farm.roles.length === 1 && farm.roles[0] === "worker" ? null : (
              <Link href={`/animals/${record.code}/pedigree`} className="text-xs font-medium text-primary">
                Pedigree PDF
              </Link>
            )}
          </div>
        </div>
        <dl className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2 xl:grid-cols-3">
          {highlights.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm font-medium">{value}</dd>
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
        canBreed={canRecordBreeding(farm.roles)}
        canHealth={canRecordHealth(farm.roles)}
        canList={canPublish(farm.roles)}
      />
    </div>
  );
}
