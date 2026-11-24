import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, breeds, listings } from "@/db/schema";
import { saveListing, saveStockListing, toggleListing } from "@/app/(farm)/herd/actions";
import { FormSelect } from "@/components/form-select";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Notice, Pill, Submit, Summary, Table, Td } from "@/components/workspace";
import { requireFarm } from "@/lib/farm-context";
import { canPublish } from "@/lib/permissions";

export const metadata = { title: "Public listings" };

const animalCategories = [
  { value: "cows", label: "Cows" },
  { value: "heifers", label: "Heifers" },
  { value: "calves", label: "Calves" },
  { value: "bulls", label: "Bulls" },
  { value: "pregnant", label: "Pregnant animals" },
];

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const farm = await requireFarm();
  if (!canPublish(farm.roles)) redirect("/dashboard");
  const query = await searchParams;

  const [listingRows, herd, breedRows] = await Promise.all([
    db.select().from(listings).where(eq(listings.farmId, farm.farmId)).orderBy(desc(listings.createdAt)),
    db.select().from(animals).where(eq(animals.farmId, farm.farmId)).orderBy(animals.code),
    db.select().from(breeds).where(eq(breeds.farmId, farm.farmId)),
  ]);
  const animalById = new Map(herd.map((a) => [a.id, a]));
  const breedById = new Map(breedRows.map((b) => [b.id, b.name]));
  const onFarm = herd.filter((a) => a.presence === "on_farm");
  const publishedCount = listingRows.filter((row) => row.published === "yes").length;

  return (
    <div className="space-y-5">
      <Summary
        title="Public listings"
        description="Manage which animals, semen, and embryos appear on your public catalogue. Unpublishing hides a listing immediately while keeping buyer enquiries."
        facts={[
          { label: "Total listings", value: String(listingRows.length) },
          { label: "Published", value: String(publishedCount) },
        ]}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/farms/${farm.farmSlug}`}
              className="inline-flex h-10 items-center rounded-full border border-border bg-background px-4 text-sm font-medium"
            >
              Open public catalogue
            </Link>
            <RecordDialog title="Publish animal listing" button="List animal">
              <form action={saveListing} className="grid gap-3">
                <input type="hidden" name="returnTo" value="/listings" />
                <label className="grid gap-1 text-sm">
                  Animal
                  <FormSelect
                    name="animalId"
                    required
                    options={onFarm.map((a) => ({
                      value: a.id,
                      label: `${a.name ? `${a.name} · ` : ""}${a.code} (${breedById.get(a.breedId) ?? ""})`,
                    }))}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Category
                    <FormSelect name="category" defaultValue="cows" options={animalCategories} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Price (₹, optional)
                    <input name="price" type="number" min={0} max={100000000} step="0.01" placeholder="Price on enquiry" className={inputClass} />
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  Public genetics / farm note
                  <input name="publicNote" maxLength={240} placeholder="Visible on public page" className={inputClass} />
                </label>
                <label className="grid gap-1 text-sm">
                  Public health summary (optional)
                  <input name="publicHealthNote" maxLength={240} placeholder="Only what you write here appears publicly" className={inputClass} />
                </label>
                <div className="grid gap-2 border-t border-border pt-2 text-sm sm:grid-cols-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="published" defaultChecked />
                    <span>Published now</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="showName" defaultChecked />
                    <span>Show animal name</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="showPedigree" />
                    <span>Include sire &amp; dam</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="showMilk" />
                    <span>Include lactation summary</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="showPregnancy" />
                    <span>Include pregnancy status</span>
                  </label>
                </div>
                <div className="flex justify-end">
                  <Submit>Save listing</Submit>
                </div>
              </form>
            </RecordDialog>
            <RecordDialog quiet title="Publish semen or embryo listing" button="List semen / embryo">
              <form action={saveStockListing} className="grid gap-3">
                <input type="hidden" name="returnTo" value="/listings" />
                <label className="grid gap-1 text-sm">
                  Category
                  <FormSelect
                    name="category"
                    defaultValue="semen"
                    options={[
                      { value: "semen", label: "Semen" },
                      { value: "embryos", label: "Embryos" },
                    ]}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Public description
                  <input name="title" required maxLength={240} placeholder="Bull name, batch type, straws available" className={inputClass} />
                </label>
                <label className="grid gap-1 text-sm">
                  Price (₹, optional)
                  <input name="price" type="number" min={0} max={100000000} step="0.01" placeholder="Price on enquiry" className={inputClass} />
                </label>
                <div className="flex justify-end">
                  <Submit>Publish</Submit>
                </div>
              </form>
            </RecordDialog>
          </div>
        }
      />

      {query.saved ? <Notice>Public listing updated.</Notice> : null}
      {query.error ? <Notice tone="danger">Could not update listing. Check price and fields.</Notice> : null}

      <Table headers={["Item", "Category", "Public fields", "Price", "Status", ""]}>
        {listingRows.length === 0 ? <EmptyRow cols={6}>No listings created yet.</EmptyRow> : null}
        {listingRows.map((row) => {
          const animal = row.animalId ? animalById.get(row.animalId) : null;
          const fields = animal
            ? [
                row.showName === "yes" ? "Name" : null,
                row.showPedigree === "yes" ? "Pedigree" : null,
                row.showMilk === "yes" ? "Milk summary" : null,
                row.showPregnancy === "yes" ? "Pregnancy" : null,
                row.publicHealthNote ? "Health note" : null,
              ]
                .filter(Boolean)
                .join(", ") || "Code, breed, sex, DOB"
            : row.publicNote ?? "—";
          return (
            <tr key={row.id}>
              <Td className="font-medium">
                {animal ? (
                  <Link href={`/animals/${encodeURIComponent(animal.code)}?tab=listing`} className="hover:underline">
                    {animal.name ? `${animal.name} · ` : ""}
                    {animal.code}
                  </Link>
                ) : (
                  row.publicNote ?? "Stock listing"
                )}
              </Td>
              <Td className="capitalize">{row.category}</Td>
              <Td className="text-muted-foreground">{fields}</Td>
              <Td>{row.price ? `₹${Number(row.price).toLocaleString("en-IN")}` : "Enquiry"}</Td>
              <Td>
                <Pill tone={row.published === "yes" ? "good" : "neutral"}>{row.published === "yes" ? "Published" : "Unpublished"}</Pill>
              </Td>
              <Td>
                <div className="flex flex-wrap items-center gap-3">
                  {animal && row.published === "yes" ? (
                    <Link href={`/farms/${farm.farmSlug}/${encodeURIComponent(animal.code)}`} className="text-xs font-medium text-primary hover:underline">
                      Preview
                    </Link>
                  ) : null}
                  <form action={toggleListing}>
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="published" value={row.published === "yes" ? "no" : "yes"} />
                    <input type="hidden" name="returnTo" value="/listings" />
                    <button type="submit" className="text-xs font-medium text-primary hover:underline">
                      {row.published === "yes" ? "Unpublish" : "Publish"}
                    </button>
                  </form>
                </div>
              </Td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
