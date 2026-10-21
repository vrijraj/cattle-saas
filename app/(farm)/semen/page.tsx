import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, bulls, semenBatches, straws } from "@/db/schema";
import { discardStraw, saveBull, saveSemenBatch } from "@/app/(farm)/herd/actions";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canUseGenetics, canViewGenetics, canViewSemen, canViewSemenCost } from "@/lib/permissions";
import { semenTypeLabel, strawCounts, strawStatusLabel } from "@/lib/semen-stock";
import { FormSelect } from "@/components/form-select";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Notice, Pill, Submit, Summary, Table, Td } from "@/components/workspace";

const messages: Record<string, string> = {
  role: "Your role cannot change semen stock.",
  bull: "Enter a new bull code and name for this farm.",
  quantity: "Quantity is a whole number from 1 to 200.",
  batch: "That batch number is already on this farm.",
  straw: "Those straw codes are already in the tank.",
  adjust: "Choose an available straw on this farm.",
  reason: "Give a reason for the stock adjustment.",
  type: "Choose conventional or sexed semen.",
  cost: "Price per straw must be zero or more.",
  date: "Use a date in YYYY-MM-DD.",
};

const types = [
  { value: "conventional", label: "Conventional" },
  { value: "sexed_female", label: "Sexed female" },
  { value: "sexed_male", label: "Sexed male" },
];

function includes(values: Array<string | null | undefined>, term: string) {
  return values.some((value) => value?.toLowerCase().includes(term));
}

export default async function SemenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; tank?: string; stock?: string; error?: string; saved?: string }>;
}) {
  const farm = await requireFarm();
  if (!canViewSemen(farm.roles)) redirect("/dashboard");
  const query = await searchParams;
  const today = farmToday(farm.timezone);
  const canEdit = canUseGenetics(farm.roles);
  const canOpenGenetics = canViewGenetics(farm.roles);
  const showCost = canViewSemenCost(farm.roles);
  const [bullRows, batches, strawRows, herd] = await Promise.all([
    db.select().from(bulls).where(eq(bulls.farmId, farm.farmId)).orderBy(bulls.code),
    db.select().from(semenBatches).where(eq(semenBatches.farmId, farm.farmId)),
    db.select().from(straws).where(eq(straws.farmId, farm.farmId)).orderBy(straws.code),
    db.select({ id: animals.id, code: animals.code, name: animals.name }).from(animals).where(eq(animals.farmId, farm.farmId)),
  ]);
  const term = (query.q ?? "").trim().toLowerCase();
  const type = types.some((item) => item.value === query.type) ? query.type ?? "" : "";
  const stock = query.stock === "available" ? "available" : "";
  const tanks = [...new Set(strawRows.map((straw) => straw.tank).filter((tank): tank is string => Boolean(tank)))].sort();
  const tank = tanks.includes(query.tank ?? "") ? query.tank ?? "" : "";
  const bullById = new Map(bullRows.map((bull) => [bull.id, bull]));
  const animalById = new Map(herd.map((animal) => [animal.id, animal]));
  const filtered = Boolean(term || type || tank || stock);
  const batchRows = batches
    .map((batch) => {
      const rows = strawRows.filter((straw) => straw.batchId === batch.id);
      const counts = strawCounts(rows);
      return { batch, bull: bullById.get(batch.bullId), counts };
    })
    .filter((row) => {
      if (stock === "available" && row.counts.available <= 0) return false;
      if (type && row.batch.semenType !== type) return false;
      if (tank && !strawRows.some((straw) => straw.batchId === row.batch.id && straw.tank === tank)) return false;
      if (!term) return true;
      return includes(
        [row.batch.batchNumber, row.bull?.code, row.bull?.name, row.bull?.breed, row.bull?.semenCompany, semenTypeLabel(row.batch.semenType)],
        term,
      );
    })
    .sort((left, right) => left.batch.batchNumber.localeCompare(right.batch.batchNumber));
  const visibleStraws = strawRows.filter((straw) => {
    const batch = batches.find((item) => item.id === straw.batchId);
    const bull = batch ? bullById.get(batch.bullId) : undefined;
    if (stock === "available" && straw.status !== "available") return false;
    if (type && batch?.semenType !== type) return false;
    if (tank && straw.tank !== tank) return false;
    if (!term) return true;
    return includes(
      [straw.code, straw.tank, straw.canister, straw.goblet, batch?.batchNumber, bull?.code, bull?.name, bull?.semenCompany, semenTypeLabel(batch?.semenType)],
      term,
    );
  });
  const visibleBulls = term
    ? bullRows.filter((bull) => includes([bull.code, bull.name, bull.breed, bull.semenCompany, bull.registrationNumber, bull.sireCode, bull.damCode], term))
    : bullRows;
  const totals = strawCounts(strawRows);
  const bullLabel = (bull: { code: string; name: string } | undefined) => (bull ? `${bull.name} · ${bull.code}` : "—");

  return (
    <div className="space-y-5">
      <Summary
        title="Semen"
        description={filtered ? "Showing the batches and straws that match this filter." : "Batches, the straws in each tank, and the bulls they came from. Balance is the straws still available."}
        facts={[
          { label: "Available", value: String(totals.available) },
          { label: "Used", value: String(totals.used) },
          { label: "Batches", value: String(batches.length) },
          { label: "Bulls", value: String(bullRows.length) },
        ]}
        action={
          filtered ? (
            <Link href="/semen" className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-medium">
              Clear
            </Link>
          ) : null
        }
      />
      {query.error && messages[query.error] ? <Notice tone="danger">{messages[query.error]}</Notice> : null}
      {query.saved ? <Notice>Semen stock is saved.</Notice> : null}
      <form method="get" className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <input name="q" defaultValue={query.q ?? ""} placeholder="Bull, batch, company, straw" className={inputClass} />
        <FormSelect name="type" defaultValue={type} options={[{ value: "", label: "All types" }, ...types]} />
        <FormSelect name="tank" defaultValue={tank} options={[{ value: "", label: "All tanks" }, ...tanks.map((item) => ({ value: item, label: item }))]} />
        <FormSelect
          name="stock"
          defaultValue={stock}
          options={[
            { value: "", label: "All stock" },
            { value: "available", label: "Balance above zero" },
          ]}
        />
        <div className="sm:col-span-2 lg:col-span-4">
          <Submit>Filter</Submit>
        </div>
      </form>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Batches</h2>
        <Table headers={["Batch", "Bull", "Type", "Received", "Used", "Discarded", "Transferred", "Balance", ...(showCost ? ["Price"] : [])]}>
          {batchRows.length === 0 ? <EmptyRow cols={showCost ? 9 : 8}>{filtered ? "No batches match this filter." : "No batches yet."}</EmptyRow> : null}
          {batchRows.map(({ batch, bull, counts }) => (
            <tr key={batch.id}>
              <Td className="font-medium">
                <Link href={`/semen?q=${encodeURIComponent(batch.batchNumber)}`} className="hover:underline">
                  {batch.batchNumber}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {batch.collectedOn ? `Collected ${formatDisplayDate(batch.collectedOn)}` : "Collection date not recorded"}
                  {batch.receivedOn ? ` · Received ${formatDisplayDate(batch.receivedOn)}` : ""}
                </p>
              </Td>
              <Td>
                {bull && canOpenGenetics ? (
                  <Link href={`/genetics?tab=bulls&sire=${encodeURIComponent(bull.code)}`} className="hover:underline">
                    {bullLabel(bull)}
                  </Link>
                ) : (
                  bullLabel(bull)
                )}
              </Td>
              <Td>{semenTypeLabel(batch.semenType)}</Td>
              <Td>{batch.quantityReceived}</Td>
              <Td>{counts.used}</Td>
              <Td>{counts.discarded}</Td>
              <Td>{counts.transferred}</Td>
              <Td className="font-medium">{counts.available}</Td>
              {showCost ? <Td>{batch.pricePerStraw ? `₹${Number(batch.pricePerStraw).toLocaleString("en-IN")}` : "—"}</Td> : null}
            </tr>
          ))}
        </Table>
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Straws</h2>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
            <RecordDialog title="Receive straws" button="Receive straws">
              <form action={saveSemenBatch} className="grid gap-3">
                <FormSelect
                  name="bullId"
                  required
                  defaultValue=""
                  options={[{ value: "", label: "Bull" }, ...bullRows.map((bull) => ({ value: bull.id, label: `${bull.code} · ${bull.name}` }))]}
                />
                <input name="batchNumber" required placeholder="Batch number" className={inputClass} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="quantity" type="number" min={1} placeholder="Quantity" required className={inputClass} />
                  <input name="price" inputMode="decimal" placeholder="Price per straw" className={inputClass} />
                </div>
                <FormSelect name="semenType" defaultValue="conventional" options={types} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="collectedOn" type="date" className={inputClass} />
                  <input name="receivedOn" type="date" defaultValue={today} className={inputClass} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <input name="tank" placeholder="Tank" className={inputClass} />
                  <input name="canister" placeholder="Canister" className={inputClass} />
                  <input name="goblet" placeholder="Goblet" className={inputClass} />
                </div>
                <div className="flex justify-end">
                  <Submit>Create straws</Submit>
                </div>
              </form>
            </RecordDialog>
            <RecordDialog title="Adjust a straw" button="Adjust count">
              <form action={discardStraw} className="grid gap-3">
                <FormSelect
                  name="code"
                  required
                  defaultValue=""
                  options={[
                    { value: "", label: "Available straw" },
                    ...strawRows.filter((straw) => straw.status === "available").map((straw) => ({ value: straw.code, label: straw.code })),
                  ]}
                />
                <input name="reason" required placeholder="Reason for the count" className={inputClass} />
                <p className="text-xs text-muted-foreground">This marks the straw discarded and keeps the reason on the audit log. The batch receipt stays as it was received.</p>
                <div className="flex justify-end">
                  <Submit>Discard straw</Submit>
                </div>
              </form>
            </RecordDialog>
            </div>
          ) : null}
        </div>
        <Table headers={["Straw", "Status", "Location", "Bull", "Type", "Used on"]}>
          {visibleStraws.length === 0 ? <EmptyRow cols={6}>{filtered ? "No straws match this filter." : "No straws yet."}</EmptyRow> : null}
          {visibleStraws.map((straw) => {
            const batch = batches.find((item) => item.id === straw.batchId);
            const bull = batch ? bullById.get(batch.bullId) : undefined;
            const used = straw.usedOnAnimalId ? animalById.get(straw.usedOnAnimalId) : undefined;
            return (
              <tr key={straw.id}>
                <Td className="font-medium">
                  <Link href={`/scan?code=${encodeURIComponent(straw.code)}`} className="hover:underline">
                    {straw.code}
                  </Link>
                </Td>
                <Td>
                  <Pill tone={straw.status === "available" ? "good" : straw.status === "discarded" ? "warn" : "neutral"}>{strawStatusLabel(straw.status)}</Pill>
                </Td>
                <Td className="text-muted-foreground">{[straw.tank, straw.canister, straw.goblet, straw.position].filter(Boolean).join(" / ") || "—"}</Td>
                <Td>
                  {bull && canOpenGenetics ? (
                    <Link href={`/genetics?tab=bulls&sire=${encodeURIComponent(bull.code)}`} className="hover:underline">
                      {bullLabel(bull)}
                    </Link>
                  ) : (
                    bullLabel(bull)
                  )}
                </Td>
                <Td>{semenTypeLabel(batch?.semenType)}</Td>
                <Td>
                  {used ? (
                    <Link href={`/animals/${used.code}?tab=breeding`} className="hover:underline">
                      {used.name ?? used.code} · {used.code}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="breed" placeholder="Breed" className={inputClass} />
                  <input name="registration" placeholder="Registration number" className={inputClass} />
                </div>
                <input name="company" placeholder="Semen company" className={inputClass} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="sireCode" placeholder="Sire code" className={inputClass} />
                  <input name="damCode" placeholder="Dam code" className={inputClass} />
                </div>
                <input name="notes" placeholder="Notes" className={inputClass} />
                <div className="flex justify-end">
                  <Submit>Save bull</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null}
        </div>
        <Table headers={["Code", "Name", "Breed", "Registration", "Sire", "Company"]}>
          {visibleBulls.length === 0 ? <EmptyRow cols={6}>{term ? "No bulls match this filter." : "No bulls yet."}</EmptyRow> : null}
          {visibleBulls.map((bull) => (
            <tr key={bull.id}>
              <Td className="font-medium">
                {canOpenGenetics ? (
                  <Link href={`/genetics?tab=bulls&sire=${encodeURIComponent(bull.code)}`} className="hover:underline">
                    {bull.code}
                  </Link>
                ) : (
                  bull.code
                )}
              </Td>
              <Td>
                {bull.name}
                {bull.notes ? <p className="text-xs text-muted-foreground">{bull.notes}</p> : null}
              </Td>
              <Td>{bull.breed ?? "—"}</Td>
              <Td>{bull.registrationNumber ?? "—"}</Td>
              <Td>{bull.sireCode ?? "—"}</Td>
              <Td className="text-muted-foreground">{bull.semenCompany ?? "—"}</Td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
