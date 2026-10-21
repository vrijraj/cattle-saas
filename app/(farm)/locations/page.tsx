import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { requireFarm } from "@/lib/farm-context";
import { canWriteAnimals } from "@/lib/permissions";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Notice, Submit, Summary, Table, Td } from "@/components/workspace";
import { saveShed } from "./actions";

export default async function LocationsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const farm = await requireFarm();
  const query = await searchParams;
  const rows = await db.select().from(locations).where(eq(locations.farmId, farm.farmId)).orderBy(asc(locations.name));
  const canEdit = canWriteAnimals(farm.roles);

  return (
    <div className="space-y-5">
      <Summary
        title="Sheds"
        description="Each animal has one current shed. A move keeps the earlier shed in the animal's history."
        facts={[{ label: "Sheds", value: String(rows.length) }]}
      />
      {query.error === "role" ? <Notice tone="danger">Your role cannot change sheds.</Notice> : null}
      {query.error === "name" ? <Notice tone="danger">Enter a shed name.</Notice> : null}
      <div className="flex justify-end">
        {canEdit ? (
          <RecordDialog title="Add shed" button="Add shed">
            <form action={saveShed} className="space-y-3">
              <label className="grid gap-1 text-sm">
                Name
                <input name="name" required className={inputClass} />
              </label>
              <div className="flex justify-end">
                <Submit>Save shed</Submit>
              </div>
            </form>
          </RecordDialog>
        ) : null}
      </div>
      <Table headers={["Shed", "Status", ""]}>
        {rows.length === 0 ? <EmptyRow cols={3}>No sheds yet.</EmptyRow> : null}
        {rows.map((row) => (
          <tr key={row.id}>
            <Td className="font-medium">{row.name}</Td>
            <Td>{row.active ? "Active" : "Inactive"}</Td>
            <Td>
              {canEdit ? (
                <RecordDialog title={`Edit ${row.name}`} button="Edit">
                  <form action={saveShed} className="space-y-3">
                    <input type="hidden" name="id" value={row.id} />
                    <label className="grid gap-1 text-sm">
                      Name
                      <input name="name" required defaultValue={row.name} className={inputClass} />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input name="active" type="checkbox" defaultChecked={row.active} /> Active
                    </label>
                    <div className="flex justify-end">
                      <Submit>Save shed</Submit>
                    </div>
                  </form>
                </RecordDialog>
              ) : null}
            </Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
