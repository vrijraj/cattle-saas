import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, auditLogs, embryos, embryoTransfers } from "@/db/schema";
import { discardEmbryo, recordFlush, saveEmbryo, transferEmbryo } from "@/app/(farm)/herd/actions";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { embryoStatusLabel, embryoStorageLabel } from "@/lib/embryo-stock";
import { requireFarm } from "@/lib/farm-context";
import { canUseGenetics, canViewGenetics } from "@/lib/permissions";
import { FormSelect } from "@/components/form-select";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Notice, Pill, Submit, Summary, Table, Td } from "@/components/workspace";

const messages: Record<string, string> = {
  role: "Your role cannot change embryo stock.",
  animal: "Choose a female on this farm.",
  code: "That embryo code is already on this farm.",
  embryo: "Choose an embryo that is still in stock.",
  date: "Use a date in YYYY-MM-DD.",
  count: "Oocytes and embryos are whole numbers. A collection can record at most 20 embryos.",
  storage: "Choose fresh or frozen.",
  result: "Choose a pregnancy result.",
  reason: "Give a reason for discarding the embryo.",
};

const results: Record<string, string> = {
  pregnant: "Pregnant",
  not_pregnant: "Not pregnant",
  doubtful: "Doubtful",
};

function includes(values: Array<string | number | null | undefined>, term: string) {
  return values.some((value) => String(value ?? "").toLowerCase().includes(term));
}

function flushFacts(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as { flushedOn?: unknown; oocytes?: unknown; produced?: unknown; sireCode?: unknown };
  return {
    flushedOn: typeof row.flushedOn === "string" ? row.flushedOn : null,
    oocytes: typeof row.oocytes === "number" ? row.oocytes : null,
    produced: typeof row.produced === "number" ? row.produced : null,
    sireCode: typeof row.sireCode === "string" ? row.sireCode : null,
  };
}

export default async function EmbryosPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; saved?: string }> }) {
  const farm = await requireFarm();
  if (!canViewGenetics(farm.roles)) redirect("/dashboard");
  const query = await searchParams;
  const today = farmToday(farm.timezone);
  const term = (query.q ?? "").trim().toLowerCase();
  const [rows, transfers, logs, herd] = await Promise.all([
    db.select().from(embryos).where(eq(embryos.farmId, farm.farmId)).orderBy(embryos.code),
    db.select().from(embryoTransfers).where(eq(embryoTransfers.farmId, farm.farmId)),
    db.select().from(auditLogs).where(eq(auditLogs.farmId, farm.farmId)),
    db
      .select({ id: animals.id, code: animals.code, name: animals.name, sex: animals.sex, presence: animals.presence })
      .from(animals)
      .where(eq(animals.farmId, farm.farmId))
      .orderBy(animals.code),
  ]);
  const canEdit = canUseGenetics(farm.roles);
  const byId = new Map(herd.map((animal) => [animal.id, animal]));
  const females = herd.filter((animal) => animal.sex === "female" && animal.presence === "on_farm");
  const femaleOptions = [{ value: "", label: "Female" }, ...females.map((animal) => ({ value: animal.id, label: `${animal.name ?? animal.code} · ${animal.code}` }))];
  const inStock = rows.filter((embryo) => embryo.status === "in_stock");
  const embryoById = new Map(rows.map((embryo) => [embryo.id, embryo]));
  const collections = logs
    .filter((row) => row.entity === "flush")
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const visibleEmbryos = term
    ? rows.filter((embryo) => {
        const donor = embryo.donorId ? byId.get(embryo.donorId) : undefined;
        return includes([embryo.code, embryo.grade, embryo.sireCode, embryo.location, embryoStorageLabel(embryo.storage), embryoStatusLabel(embryo.status), donor?.code, donor?.name], term);
      })
    : rows;
  const visibleTransfers = [...transfers]
    .sort((left, right) => right.transferredOn.localeCompare(left.transferredOn))
    .filter((transfer) => {
      if (!term) return true;
      const embryo = embryoById.get(transfer.embryoId);
      const recipient = byId.get(transfer.recipientId);
      return includes([embryo?.code, embryo?.sireCode, recipient?.code, recipient?.name, results[transfer.pregnancyResult ?? ""]], term);
    });
  const visibleCollections = term
    ? collections.filter((row) => {
        const donor = byId.get(row.entityId);
        const facts = flushFacts(row.afterState);
        return includes([row.summary, donor?.code, donor?.name, facts?.sireCode, facts?.flushedOn], term);
      })
    : collections;

  return (
    <div className="space-y-5">
      <Summary
        title="Embryos"
        description={term ? "Showing embryos, collections, and transfers that match this search." : "Collections, embryos in storage, and transfers to recipients. A transfer keeps the embryo out of stock."}
        facts={[
          { label: "In stock", value: String(inStock.length) },
          { label: "Transferred", value: String(rows.filter((embryo) => embryo.status === "transferred").length) },
          { label: "Discarded", value: String(rows.filter((embryo) => embryo.status === "discarded").length) },
        ]}
        action={
          term ? (
            <Link href="/embryos" className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-medium">
              Clear
            </Link>
          ) : null
        }
      />
      {query.error && messages[query.error] ? <Notice tone="danger">{messages[query.error]}</Notice> : null}
      {query.saved ? <Notice>Embryo stock is saved.</Notice> : null}
      <form method="get" className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <input name="q" defaultValue={query.q ?? ""} placeholder="Code, donor, sire, grade, location" className={`${inputClass} min-w-0 flex-1`} />
        <Submit>Search</Submit>
      </form>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Collections</h2>
          {canEdit ? (
            <RecordDialog title="Record collection" button="Record collection">
              <form action={recordFlush} className="grid gap-3">
                <FormSelect name="donorId" required defaultValue="" options={[{ value: "", label: "Donor" }, ...femaleOptions.slice(1)]} />
                <input name="sireCode" placeholder="Sire code" className={inputClass} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="flushedOn" type="date" defaultValue={today} className={inputClass} />
                  <input name="oocytes" required inputMode="numeric" placeholder="Oocytes collected" className={inputClass} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="produced" required inputMode="numeric" placeholder="Embryos produced" className={inputClass} />
                  <input name="grade" placeholder="Grade" className={inputClass} />
                </div>
                <input name="location" placeholder="Tank or location" className={inputClass} />
                <div className="flex justify-end">
                  <Submit>Save collection</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null}
        </div>
        <Table headers={["Date", "Donor", "Oocytes", "Embryos", "Sire"]}>
          {visibleCollections.length === 0 ? <EmptyRow cols={5}>{term ? "No collection matches this search." : "No collection recorded."}</EmptyRow> : null}
          {visibleCollections.map((row) => {
            const donor = byId.get(row.entityId);
            const facts = flushFacts(row.afterState);
            return (
              <tr key={row.id}>
                <Td>{facts?.flushedOn ? formatDisplayDate(facts.flushedOn) : formatDisplayDate(row.createdAt.toISOString().slice(0, 10))}</Td>
                <Td className="font-medium">
                  {donor ? (
                    <Link href={`/animals/${donor.code}`} className="hover:underline">
                      {donor.name ?? donor.code} · {donor.code}
                    </Link>
                  ) : (
                    row.summary
                  )}
                </Td>
                <Td>{facts?.oocytes ?? "—"}</Td>
                <Td>{facts?.produced ?? "—"}</Td>
                <Td>{facts?.sireCode ?? "—"}</Td>
              </tr>
            );
          })}
        </Table>
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Inventory</h2>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <RecordDialog title="Add embryo" button="Add embryo">
                <form action={saveEmbryo} className="grid gap-3">
                  <input name="code" required placeholder="EMB-2026-0001" className={inputClass} />
                  <FormSelect name="donorId" defaultValue="" options={femaleOptions} />
                  <input name="sireCode" placeholder="Sire code" className={inputClass} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input name="grade" placeholder="Grade" className={inputClass} />
                    <FormSelect
                      name="storage"
                      defaultValue="fresh"
                      options={[
                        { value: "fresh", label: "Fresh" },
                        { value: "frozen", label: "Frozen" },
                      ]}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input name="frozenOn" type="date" className={inputClass} />
                    <input name="location" placeholder="Tank or location" className={inputClass} />
                  </div>
                  <div className="flex justify-end">
                    <Submit>Save embryo</Submit>
                  </div>
                </form>
              </RecordDialog>
              <RecordDialog title="Discard an embryo" button="Discard">
                <form action={discardEmbryo} className="grid gap-3">
                  <FormSelect
                    name="code"
                    required
                    defaultValue=""
                    options={[{ value: "", label: "In stock" }, ...inStock.map((embryo) => ({ value: embryo.code, label: embryo.code }))]}
                  />
                  <input name="reason" required placeholder="Reason" className={inputClass} />
                  <div className="flex justify-end">
                    <Submit>Discard embryo</Submit>
                  </div>
                </form>
              </RecordDialog>
            </div>
          ) : null}
        </div>
        <Table headers={["Code", "Donor", "Sire", "Grade", "Storage", "Frozen", "Location", "Status"]}>
          {visibleEmbryos.length === 0 ? <EmptyRow cols={8}>{term ? "No embryo matches this search." : "No embryos recorded."}</EmptyRow> : null}
          {visibleEmbryos.map((embryo) => {
            const donor = embryo.donorId ? byId.get(embryo.donorId) : undefined;
            return (
              <tr key={embryo.id}>
                <Td className="font-medium">{embryo.code}</Td>
                <Td>
                  {donor ? (
                    <Link href={`/animals/${donor.code}`} className="hover:underline">
                      {donor.name ?? donor.code} · {donor.code}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>
                  {embryo.sireCode ? (
                    <Link href={`/genetics?tab=bulls&sire=${encodeURIComponent(embryo.sireCode)}`} className="hover:underline">
                      {embryo.sireCode}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>{embryo.grade ?? "—"}</Td>
                <Td>{embryoStorageLabel(embryo.storage)}</Td>
                <Td>{embryo.frozenOn ? formatDisplayDate(embryo.frozenOn) : "—"}</Td>
                <Td>{embryo.location ?? "—"}</Td>
                <Td>
                  <Pill tone={embryo.status === "in_stock" ? "good" : embryo.status === "discarded" ? "warn" : "neutral"}>{embryoStatusLabel(embryo.status)}</Pill>
                </Td>
              </tr>
            );
          })}
        </Table>
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Transfers</h2>
          {canEdit ? (
            <RecordDialog title="Record transfer" button="Record transfer">
              <form action={transferEmbryo} className="grid gap-3">
                <FormSelect
                  name="embryoId"
                  required
                  defaultValue=""
                  options={[{ value: "", label: "Embryo" }, ...inStock.map((embryo) => ({ value: embryo.id, label: embryo.code }))]}
                />
                <FormSelect name="recipientId" required defaultValue="" options={[{ value: "", label: "Recipient" }, ...femaleOptions.slice(1)]} />
                <input name="transferredOn" type="date" defaultValue={today} className={inputClass} />
                <FormSelect
                  name="pregnancyResult"
                  defaultValue=""
                  options={[
                    { value: "", label: "Pregnancy result" },
                    { value: "pregnant", label: "Pregnant" },
                    { value: "not_pregnant", label: "Not pregnant" },
                    { value: "doubtful", label: "Doubtful" },
                  ]}
                />
                <p className="text-xs text-muted-foreground">The result is stored on this transfer. The recipient&apos;s breeding record stays as it is until a pregnancy check or calving is recorded there.</p>
                <div className="flex justify-end">
                  <Submit>Record transfer</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null}
        </div>
        <Table headers={["Date", "Embryo", "Recipient", "Result"]}>
          {visibleTransfers.length === 0 ? <EmptyRow cols={4}>{term ? "No transfer matches this search." : "No transfers yet."}</EmptyRow> : null}
          {visibleTransfers.map((transfer) => {
            const embryo = embryoById.get(transfer.embryoId);
            const recipient = byId.get(transfer.recipientId);
            return (
              <tr key={transfer.id}>
                <Td>{formatDisplayDate(transfer.transferredOn)}</Td>
                <Td className="font-medium">{embryo?.code ?? "—"}</Td>
                <Td>
                  {recipient ? (
                    <Link href={`/animals/${recipient.code}?tab=breeding`} className="hover:underline">
                      {recipient.name ?? recipient.code} · {recipient.code}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>{transfer.pregnancyResult ? (results[transfer.pregnancyResult] ?? transfer.pregnancyResult) : "—"}</Td>
              </tr>
            );
          })}
        </Table>
      </section>
    </div>
  );
}
