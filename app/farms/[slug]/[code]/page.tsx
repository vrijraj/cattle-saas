import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { animals, breeds, farms, listings } from "@/db/schema";
import { formatDisplayDate } from "@/lib/dates";
import { sendEnquiry } from "@/app/farms/actions";
import { PublicFrame } from "@/components/public-frame";
import { inputClass, PageHeader, Panel, Submit } from "@/components/workspace";

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
    .limit(1);
  if (!row) notFound();
  let dam = "Not published";
  if (row.listing.showPedigree === "yes" && row.animal.geneticDamId) {
    const [parent] = await db.select({ code: animals.code, name: animals.name }).from(animals).where(eq(animals.id, row.animal.geneticDamId)).limit(1);
    dam = parent ? `${parent.code}${parent.name ? ` · ${parent.name}` : ""}` : "Unknown";
  }

  return (
    <PublicFrame title={farm.name} subtitle="Cattle catalogue" href={`/farms/${slug}`}>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="space-y-5">
          <PageHeader title={row.animal.name ?? row.animal.code} description={row.animal.code} />
          <dl className="grid gap-3 sm:grid-cols-2">
            <Fact label="Breed" value={row.breed} />
            <Fact label="Sex" value={row.animal.sex} />
            {row.animal.dob ? <Fact label="Born" value={formatDisplayDate(row.animal.dob)} /> : null}
            {row.listing.showPedigree === "yes" ? <Fact label="Sire" value={row.animal.geneticSireCode ?? "Unknown"} /> : null}
            {row.listing.showPedigree === "yes" ? <Fact label="Dam" value={dam} /> : null}
            {row.listing.showPregnancy === "yes" ? <Fact label="Pregnancy" value={row.animal.reproduction} /> : null}
            {row.listing.price ? <Fact label="Price" value={`₹${Number(row.listing.price).toLocaleString("en-IN")}`} /> : null}
          </dl>
          {row.listing.publicNote ? <p className="text-sm text-muted-foreground">{row.listing.publicNote}</p> : null}
        </section>
        <Panel title="Send enquiry">
          <form action={sendEnquiry} className="grid gap-3">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="animalCode" value={row.animal.code} />
            <input name="name" required placeholder="Your name" className={inputClass} />
            <input name="phone" required placeholder="Phone" className={inputClass} />
            <textarea name="message" required placeholder="Message" className="min-h-28 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            <Submit>Send enquiry</Submit>
          </form>
        </Panel>
      </div>
    </PublicFrame>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium capitalize">{value}</dd>
    </div>
  );
}
