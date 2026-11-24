import type { Metadata } from "next";
import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { publicFarm, publicTitle } from "@/lib/page-title";
import { db } from "@/db";
import { animals, breeds, calvings, dryOffs, farms, listings, milkYields } from "@/db/schema";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { reproductionLabel, sexLabel } from "@/lib/labels";
import { lactationHistory } from "@/lib/lactation";
import { sendEnquiry } from "@/app/farms/actions";
import { PublicFrame } from "@/components/public-frame";
import { inputClass, PageHeader, Panel, Submit } from "@/components/workspace";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; code: string }> }): Promise<Metadata> {
  const { slug, code } = await params;
  const farm = await publicFarm(slug);
  if (!farm) return publicTitle("Cattle for sale", "This animal is not published.");
  const [row] = await db
    .select({ name: animals.name, code: animals.code, breed: breeds.name, showName: listings.showName })
    .from(listings)
    .innerJoin(animals, eq(animals.id, listings.animalId))
    .innerJoin(breeds, eq(breeds.id, animals.breedId))
    .where(and(eq(listings.farmId, farm.id), eq(listings.published, "yes"), eq(animals.code, code)))
    .orderBy(desc(listings.createdAt))
    .limit(1);
  if (!row) return publicTitle(`${farm.name} cattle for sale`, `Published cattle from ${farm.name}.`);
  const name = row.showName === "yes" ? (row.name ?? row.code) : row.code;
  return publicTitle(`${name} at ${farm.name}`, `${row.breed} cattle from ${farm.name}.`);
}

export default async function PublicAnimalPage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm) notFound();
  const [row] = await db
    .select({ listing: listings, animal: animals, breed: breeds.name })
    .from(listings)
    .innerJoin(animals, eq(animals.id, listings.animalId))
    .innerJoin(breeds, eq(breeds.id, animals.breedId))
    .where(and(eq(listings.farmId, farm.id), eq(listings.published, "yes"), eq(animals.code, code)))
    .orderBy(desc(listings.createdAt))
    .limit(1);
  if (!row) notFound();

  let dam = "Unknown";
  if (row.listing.showPedigree === "yes" && row.animal.geneticDamId) {
    const [parent] = await db
      .select({ code: animals.code, name: animals.name })
      .from(animals)
      .where(and(eq(animals.id, row.animal.geneticDamId), eq(animals.farmId, farm.id)))
      .limit(1);
    dam = parent ? `${parent.code}${parent.name ? ` · ${parent.name}` : ""}` : "Unknown";
  }

  let milkSummaryText: string | null = null;
  if (row.listing.showMilk === "yes") {
    const [births, dries, yields] = await Promise.all([
      db.select().from(calvings).where(and(eq(calvings.farmId, farm.id), eq(calvings.damId, row.animal.id), isNull(calvings.voidedAt))),
      db.select().from(dryOffs).where(and(eq(dryOffs.farmId, farm.id), eq(dryOffs.animalId, row.animal.id), isNull(dryOffs.voidedAt))),
      db.select().from(milkYields).where(and(eq(milkYields.farmId, farm.id), eq(milkYields.animalId, row.animal.id), isNull(milkYields.voidedAt))),
    ]);
    const latest = lactationHistory({
      calvedOn: births.filter((b) => b.outcome !== "dead").map((b) => b.calvedOn),
      driedOn: dries.map((d) => d.driedOn),
      yields,
      state: row.animal.lactation,
      today: farmToday(farm.timezone),
      presence: row.animal.presence,
      exitOn: row.animal.exitOn,
    })[0];
    if (latest) {
      milkSummaryText = `Lactation ${latest.number} · ${latest.totalLitres.toFixed(1)} L total · Peak ${latest.peakLitres.toFixed(1)} L/day${latest.daysInMilk !== null ? ` · ${latest.daysInMilk} DIM` : ""}`;
    }
  }

  const sireText =
    row.animal.geneticSireName && row.animal.geneticSireCode && row.animal.geneticSireName !== row.animal.geneticSireCode
      ? `${row.animal.geneticSireName} · ${row.animal.geneticSireCode}`
      : row.animal.geneticSireCode ?? "Unknown";

  const pregnancyText =
    row.animal.reproduction === "pregnant" && row.animal.expectedCalving
      ? `Pregnant · expected ${formatDisplayDate(row.animal.expectedCalving).slice(3)}`
      : reproductionLabel[row.animal.reproduction] ?? row.animal.reproduction;

  const title = row.listing.showName === "yes" ? (row.animal.name ?? row.animal.code) : row.animal.code;

  return (
    <PublicFrame title={farm.name} subtitle="Cattle catalogue" href={`/farms/${slug}`}>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="space-y-5">
          <PageHeader title={title} description={`Animal ID ${row.animal.code}`} />
          <dl className="grid gap-3 sm:grid-cols-2">
            <Fact label="Breed" value={row.breed} />
            <Fact label="Sex" value={sexLabel[row.animal.sex] ?? row.animal.sex} />
            {row.animal.dob ? <Fact label="Date of birth" value={formatDisplayDate(row.animal.dob)} /> : null}
            {row.listing.showPedigree === "yes" ? <Fact label="Sire" value={sireText} /> : null}
            {row.listing.showPedigree === "yes" ? <Fact label="Dam" value={dam} /> : null}
            {row.listing.showPregnancy === "yes" ? <Fact label="Pregnancy" value={pregnancyText} /> : null}
            {milkSummaryText ? <Fact label="Milk summary" value={milkSummaryText} /> : null}
            <Fact label="Price" value={row.listing.price ? `₹${Number(row.listing.price).toLocaleString("en-IN")}` : "Price on enquiry"} />
          </dl>
          {row.listing.publicHealthNote ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">Health note</p>
              <p className="mt-1 text-sm">{row.listing.publicHealthNote}</p>
            </div>
          ) : null}
          {row.listing.publicNote ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">Farm notes</p>
              <p className="mt-1 text-sm text-muted-foreground">{row.listing.publicNote}</p>
            </div>
          ) : null}
        </section>
        <Panel title="Send enquiry">
          <form action={sendEnquiry} className="grid gap-3">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="animalCode" value={row.animal.code} />
            <label className="grid gap-1 text-sm">
              Your name
              <input name="name" required maxLength={120} placeholder="Your name" className={inputClass} />
            </label>
            <label className="grid gap-1 text-sm">
              Phone number
              <input name="phone" type="tel" required minLength={7} maxLength={20} placeholder="Phone" className={inputClass} />
            </label>
            <label className="grid gap-1 text-sm">
              Message
              <textarea name="message" required maxLength={1000} placeholder="Message" className="min-h-28 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </label>
            <Submit>Send enquiry</Submit>
          </form>
        </Panel>
      </div>
    </PublicFrame>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}
