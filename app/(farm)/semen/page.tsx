import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { bulls, semenBatches, straws } from "@/db/schema";
import { saveBull, saveSemenBatch } from "@/app/(farm)/herd/actions";
import { requireFarm } from "@/lib/farm-context";
import { canUseGenetics } from "@/lib/permissions";
import { FormSelect } from "@/components/form-select";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Pill, Submit, Summary, Table, Td } from "@/components/workspace";

export default async function SemenPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const farm = await requireFarm();
  const { q } = await searchParams;
  const canEdit = canUseGenetics(farm.roles);
  const bullRows = await db.select().from(bulls).where(eq(bulls.farmId, farm.farmId));
  const batches = await db.select().from(semenBatches).where(eq(semenBatches.farmId, farm.farmId));
  const strawRows = await db.select().from(straws).where(eq(straws.farmId, farm.farmId));
  const query = (q ?? "").trim().toLowerCase();
  const bullName = new Map(bullRows.map((bull) => [bull.id, `${bull.code} · ${bull.name}`]));
  const visibleBulls = query
    ? bullRows.filter((bull) => [bull.code, bull.name, bull.breed, bull.semenCompany].some((value) => value?.toLowerCase().includes(query)))
    : bullRows;
  const visible = strawRows.filter((straw) => {
    if (!query) return true;
    const batch = batches.find((item) => item.id === straw.batchId);
    const bull = batch ? bullName.get(batch.bullId) : "";
    return [straw.code, straw.tank, straw.canister, batch?.batchNumber, bull].some((value) => value?.toLowerCase().includes(query));
  });
  const available = strawRows.filter((straw) => straw.status === "available").length;

  return (
    <div className="space-y-5">
      <Summary
        title="Semen"
        description={query ? `Showing semen matches for “${q?.trim()}”.` : "Straws in the tank, and the bulls they came from."}
        facts={[
          { label: "Available", value: String(available) },
          { label: "Bulls", value: String(bullRows.length) },
          { label: "Batches", value: String(batches.length) },
        ]}
        action={
          query ? (
            <Link href="/semen" className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-medium">
              Clear
            </Link>
          ) : null
        }
      />
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Straws</h2>
          {canEdit ? (
            <RecordDialog title="Receive straws" button="Receive straws">
              <form action={saveSemenBatch} className="grid gap-3">
                <FormSelect
                  name="bullId"
                  required
                  options={bullRows.map((bull) => ({ value: bull.id, label: `${bull.code} · ${bull.name}` }))}
                />
                <input name="batchNumber" required placeholder="Batch number" className={inputClass} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="quantity" type="number" min={1} placeholder="Quantity" required className={inputClass} />
                  <input name="price" placeholder="Price per straw" className={inputClass} />
                </div>
                <FormSelect
                  name="semenType"
                  defaultValue="conventional"
                  options={[
                    { value: "conventional", label: "Conventional" },
                    { value: "sexed_female", label: "Sexed female" },
                    { value: "sexed_male", label: "Sexed male" },
                  ]}
                />
                <input name="tank" placeholder="Tank" className={inputClass} />
                <div className="flex justify-end">
                  <Submit>Create straws</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null}
        </div>
      <Table headers={["Straw", "Status", "Location", "Bull", "Type"]}>
        {visible.length === 0 ? <EmptyRow cols={5}>{query ? "No straws match this search." : "No straws yet."}</EmptyRow> : null}
        {visible.map((straw) => {
          const batch = batches.find((item) => item.id === straw.batchId);
          return (
            <tr key={straw.id}>
              <Td className="font-medium">{straw.code}</Td>
              <Td>
                <Pill tone={straw.status === "available" ? "good" : "neutral"}>{straw.status}</Pill>
              </Td>
              <Td className="text-muted-foreground">
                {[straw.tank, straw.canister, straw.goblet, straw.position].filter(Boolean).join(" / ") || "—"}
              </Td>
              <Td>{batch ? bullName.get(batch.bullId) : "—"}</Td>
              <Td className="capitalize">{batch?.semenType?.replaceAll("_", " ") ?? "—"}</Td>
            </tr>
          );
        })}
      </Table>
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Bulls</h2>
          {canEdit ? (
            <RecordDialog title="Add bull" button="Add bull">
              <form action={saveBull} className="grid gap-3">
                <input name="code" required placeholder="Bull code" className={inputClass} />
                <input name="name" required placeholder="Name" className={inputClass} />
                <input name="breed" placeholder="Breed" className={inputClass} />
                <input name="company" placeholder="Semen company" className={inputClass} />
                <div className="flex justify-end">
                  <Submit>Save bull</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null}
        </div>
        <Table headers={["Code", "Name", "Breed", "Company"]}>
          {visibleBulls.length === 0 ? <EmptyRow cols={4}>{query ? "No bulls match this search." : "No bulls yet."}</EmptyRow> : null}
          {visibleBulls.map((bull) => (
            <tr key={bull.id}>
              <Td className="font-medium">{bull.code}</Td>
              <Td>{bull.name}</Td>
              <Td>{bull.breed ?? "—"}</Td>
              <Td className="text-muted-foreground">{bull.semenCompany ?? "—"}</Td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
