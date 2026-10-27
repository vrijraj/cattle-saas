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
import { PanelTabs } from "@/components/panel-tabs";
import { SemenFilter } from "@/components/semen-filter";
import { FormSelect } from "@/components/form-select";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Notice, pickTab, Pill, Submit, Summary, Table, Td } from "@/components/workspace";

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

const tabs = [
  { id: "batches", label: "Batches" },
  { id: "straws", label: "Straws" },
  { id: "bulls", label: "Bulls" },
];

const types = [
  { value: "conventional", label: "Conventional" },
  { value: "sexed_female", label: "Sexed female" },
  { value: "sexed_male", label: "Sexed male" },
];

function includes(values: Array<string | null | undefined>, term: string) {
  return values.some((value) => value?.toLowerCase().includes(term));
}

export const metadata = { title: "Semen inventory" };

export default async function SemenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; tank?: string; stock?: string; error?: string; saved?: string; tab?: string }>;
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
  const tab = pickTab(query.tab, tabs, "batches");

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
      />
      {query.error && messages[query.error] ? <Notice tone="danger">{messages[query.error]}</Notice> : null}
      {query.saved ? <Notice>Semen stock is saved.</Notice> : null}
      <SemenFilter clear={filtered}>
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
      </SemenFilter>
      <PanelTabs
        initialTab={tab}
        tabs={[
          { id: "batches", label: "Batches", count: batchRows.length },
          { id: "straws", label: "Straws", count: visibleStraws.length },
          { id: "bulls", label: "Bulls", count: visibleBulls.length },
        ]}
        panels={{
          batches: (
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
          ),
          straws: (
        <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
            <RecordDialog title="Receive straws" button="Receive straws">
              <form action={saveSemenBatch} className="grid gap-3">
                <input type="hidden" name="returnTab" value="straws" />
                <label className="grid gap-1 text-sm">
                  Bull
                  <FormSelect
                    name="bullId"
                    required
                    defaultValue=""
                    options={[{ value: "", label: "Select bull" }, ...bullRows.map((bull) => ({ value: bull.id, label: `${bull.code} · ${bull.name}` }))]}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Batch number
                  <input name="batchNumber" required maxLength={60} placeholder="Batch number" className={inputClass} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Quantity (1–200)
                    <input name="quantity" type="number" min={1} max={200} step={1} placeholder="Quantity" required className={inputClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Price per straw (₹)
                    <input name="price" type="number" min={0} max={1000000} step="0.01" inputMode="decimal" placeholder="Price per straw" className={inputClass} />
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  Semen type
                  <FormSelect name="semenType" defaultValue="conventional" options={types} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Collection date
                    <input name="collectedOn" type="date" max={today} className={inputClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Received date
                    <input name="receivedOn" type="date" defaultValue={today} className={inputClass} />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-sm">
                    Tank
                    <input name="tank" maxLength={40} placeholder="Tank" className={inputClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Canister
                    <input name="canister" maxLength={40} placeholder="Canister" className={inputClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Goblet
                    <input name="goblet" maxLength={40} placeholder="Goblet" className={inputClass} />
                  </label>
                </div>
                <div className="flex justify-end">
                  <Submit>Create straws</Submit>
                </div>
              </form>
            </RecordDialog>
            <RecordDialog title="Adjust a straw" button="Adjust count">
              <form action={discardStraw} className="grid gap-3">
                <input type="hidden" name="returnTab" value="straws" />
                <label className="grid gap-1 text-sm">
                  Available straw
                  <FormSelect
                    name="code"
                    required
                    defaultValue=""
                    options={[
                      { value: "", label: "Select available straw" },
                      ...strawRows.filter((straw) => straw.status === "available").map((straw) => ({ value: straw.code, label: straw.code })),
                    ]}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Reason for adjustment
                  <input name="reason" required maxLength={240} placeholder="Reason for the count" className={inputClass} />
                </label>
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
        </div>
          ),
          bulls: (
        <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {canEdit ? (
            <RecordDialog title="Add bull" button="Add bull">
              <form action={saveBull} className="grid gap-3">
                <input type="hidden" name="returnTab" value="bulls" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Bull code
                    <input name="code" required maxLength={40} placeholder="Bull code" className={inputClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Name
                    <input name="name" required maxLength={80} placeholder="Name" className={inputClass} />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Breed
                    <input name="breed" maxLength={60} placeholder="Breed" className={inputClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Registration number
                    <input name="registration" maxLength={60} placeholder="Registration number" className={inputClass} />
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  Semen company
                  <input name="company" maxLength={80} placeholder="Semen company" className={inputClass} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Sire code
                    <input name="sireCode" maxLength={40} placeholder="Sire code" className={inputClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Dam code
                    <input name="damCode" maxLength={40} placeholder="Dam code" className={inputClass} />
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  Genetic & performance notes
                  <input name="notes" maxLength={240} placeholder="Genetic & performance notes" className={inputClass} />
                </label>
                <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                  Bull photograph
                  <input
                    name="photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
                  />
                </label>
                <div className="flex justify-end">
                  <Submit>Save bull</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null}
        </div>
        <Table headers={["Photo", "Code", "Name", "Breed", "Registration", "Sire / Dam", "Company"]}>
          {visibleBulls.length === 0 ? <EmptyRow cols={7}>{term ? "No bulls match this filter." : "No bulls yet."}</EmptyRow> : null}
          {visibleBulls.map((bull) => (
            <tr key={bull.id}>
              <Td>
                {bull.photoKey ? (
                  <img
                    src={`/animals/${encodeURIComponent(bull.code)}/photo`}
                    alt={bull.name}
                    className="size-10 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
                    {bull.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </Td>
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
              <Td>
                <div>{bull.sireCode ?? "—"}</div>
                {bull.damCode ? <div className="text-xs text-muted-foreground">Dam: {bull.damCode}</div> : null}
              </Td>
              <Td className="text-muted-foreground">{bull.semenCompany ?? "—"}</Td>
            </tr>
          ))}
        </Table>
        </div>
          ),
        }}
      />
    </div>
  );
}
