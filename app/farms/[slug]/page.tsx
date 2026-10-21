import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { animals, breeds, farms, listings } from "@/db/schema";
import { sendEnquiry } from "@/app/farms/actions";
import { PublicFrame } from "@/components/public-frame";
import { inputClass, Notice, PageHeader, Panel, Submit } from "@/components/workspace";

export default async function PublicFarmPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm) notFound();
  const published = await db
    .select({ listing: listings, animal: animals, breed: breeds.name })
    .from(listings)
    .innerJoin(animals, eq(animals.id, listings.animalId))
    .innerJoin(breeds, eq(breeds.id, animals.breedId))
    .where(and(eq(listings.farmId, farm.id), eq(listings.published, "yes")));

  return (
    <PublicFrame title={farm.name} subtitle="Cattle catalogue" href={`/farms/${slug}`}>
      <div className="space-y-5">
        <PageHeader
          title="Animals for sale"
          description="Published animals from this farm."
          action={
            <Link href={`/farms/${slug}/shop`} className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
              Shop
            </Link>
          }
        />
        {query.sent ? <Notice>Your enquiry has been sent to the farm.</Notice> : null}
        <ul className="grid gap-3 sm:grid-cols-2">
          {published.map(({ listing, animal, breed }) => (
            <li key={listing.id}>
              <Link href={`/farms/${slug}/${animal.code}`} className="block rounded-2xl border border-border bg-card p-5 shadow-sm">
                <span className="font-medium">{animal.name ?? animal.code}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {animal.code} · {breed} · {listing.category}
                  {listing.price ? ` · ₹${Number(listing.price).toLocaleString("en-IN")}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Panel title="Enquiry" className="max-w-lg">
          <form action={sendEnquiry} className="grid gap-3">
            <input type="hidden" name="slug" value={slug} />
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
