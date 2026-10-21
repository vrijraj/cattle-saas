import { eq } from "drizzle-orm";
import { db } from "@/db";
import { embryos, embryoTransfers } from "@/db/schema";
import { saveEmbryo, transferEmbryo } from "@/app/(farm)/herd/actions";
import { formatDisplayDate } from "@/lib/dates";
import { farmAnimals } from "@/lib/herd";
import { requireFarm } from "@/lib/farm-context";
import { canUseGenetics } from "@/lib/permissions";
import { AnimalSelect } from "@/components/animal-select";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Pill, Submit, Summary, Table, Td } from "@/components/workspace";

export default async function EmbryosPage() {
  const farm = await requireFarm();
  const rows = await db.select().from(embryos).where(eq(embryos.farmId, farm.farmId));
  const transfers = await db.select().from(embryoTransfers).where(eq(embryoTransfers.farmId, farm.farmId));
  const animals = await farmAnimals(farm.farmId);
  const females = animals.filter((animal) => animal.sex === "female");
  const inStock = rows.filter((embryo) => embryo.status === "in_stock");
  const canEdit = canUseGenetics(farm.roles);
  const animalName = new Map(animals.map((animal) => [animal.id, animal.name ?? animal.code]));
  const embryoCode = new Map(rows.map((embryo) => [embryo.id, embryo.code]));

  return (
    <div className="space-y-5">
      <Summary
        title="Embryos"
        description="Embryos in storage and transfers to recipients."
        facts={[
          { label: "In stock", value: String(inStock.length) },
          { label: "Recorded", value: String(rows.length) },
        ]}
      />
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Inventory</h2>
          {canEdit ? (
            <RecordDialog title="Add embryo" button="Add embryo">
              <form action={saveEmbryo} className="grid gap-3">
                <input name="code" required placeholder="EMB-2026-0001" className={inputClass} />
                <AnimalSelect animals={females} name="donorId" />
                <input name="sireCode" placeholder="Sire code" className={inputClass} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="grade" placeholder="Grade 1–5" className={inputClass} />
                  <select name="storage" className={inputClass}>
                    <option value="fresh">Fresh</option>
                    <option value="frozen">Frozen</option>
                  </select>
                </div>
                <input name="location" placeholder="Tank location" className={inputClass} />
                <div className="flex justify-end">
                  <Submit>Save embryo</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null}
        </div>
      <Table headers={["Code", "Grade", "Storage", "Status", "Sire"]}>
        {rows.length === 0 ? <EmptyRow cols={5}>No embryos recorded.</EmptyRow> : null}
        {rows.map((embryo) => (
          <tr key={embryo.id}>
            <Td className="font-medium">{embryo.code}</Td>
            <Td>{embryo.grade ?? "—"}</Td>
            <Td className="capitalize">{embryo.storage}</Td>
            <Td>
              <Pill tone={embryo.status === "in_stock" ? "good" : "neutral"}>{embryo.status.replaceAll("_", " ")}</Pill>
            </Td>
            <Td className="text-muted-foreground">{embryo.sireCode ?? "—"}</Td>
          </tr>
        ))}
      </Table>
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Transfers</h2>
          {canEdit ? (
            <RecordDialog title="Record transfer" button="Record transfer">
              <form action={transferEmbryo} className="grid gap-3">
                <select name="embryoId" className={inputClass}>
                  {inStock.map((embryo) => (
                    <option key={embryo.id} value={embryo.id}>
                      {embryo.code}
                    </option>
                  ))}
                </select>
                <AnimalSelect animals={females} name="recipientId" />
                <input name="transferredOn" type="date" className={inputClass} />
                <div className="flex justify-end">
                  <Submit>Record transfer</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null}
        </div>
        <Table headers={["Date", "Embryo", "Recipient"]}>
          {transfers.length === 0 ? <EmptyRow cols={3}>No transfers yet.</EmptyRow> : null}
          {[...transfers]
            .sort((a, b) => b.transferredOn.localeCompare(a.transferredOn))
            .map((transfer) => (
              <tr key={transfer.id}>
                <Td>{formatDisplayDate(transfer.transferredOn)}</Td>
                <Td className="font-medium">{embryoCode.get(transfer.embryoId) ?? "—"}</Td>
                <Td>{animalName.get(transfer.recipientId) ?? "—"}</Td>
              </tr>
            ))}
        </Table>
      </section>
    </div>
  );
}
