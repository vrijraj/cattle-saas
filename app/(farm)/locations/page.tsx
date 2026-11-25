import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { animals, locations } from "@/db/schema";
import { requireFarm } from "@/lib/farm-context";
import { canManageLocations } from "@/lib/permissions";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Notice, Pill, Submit, Summary, Table, Td } from "@/components/workspace";
import { saveShed } from "./actions";

const errorMessages: Record<string, string> = {
  role: "Your role cannot change sheds.",
  name: "Enter a shed name.",
  duplicate: "A shed with that name already exists on this farm.",
  missing: "That shed could not be found.",
};

export const metadata = { title: "Sheds" };

export default async function LocationsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const farm = await requireFarm();
  const query = await searchParams;
  const [rows, herd] = await Promise.all([
    db.select().from(locations).where(eq(locations.farmId, farm.farmId)).orderBy(asc(locations.name)),
    db
      .select({ locationId: animals.locationId })
      .from(animals)
      .where(and(eq(animals.farmId, farm.farmId), eq(animals.presence, "on_farm"))),
  ]);
  const countsByLocation = new Map<string, number>();
  let unassigned = 0;
  for (const row of herd) {
    if (!row.locationId) unassigned += 1;
    else countsByLocation.set(row.locationId, (countsByLocation.get(row.locationId) ?? 0) + 1);
  }
  const canEdit = canManageLocations(farm.roles);

  return (
    <div className="space-y-5">
      <Summary
        title="Sheds"
        description="Each animal has one current shed. A move keeps the earlier shed in the animal's history."
        facts={[
          { label: "Sheds", value: String(rows.length) },
          { label: "Active", value: String(rows.filter((row) => row.active).length) },
          { label: "Unassigned cattle", value: String(unassigned) },
        ]}
        action={
          canEdit ? (
            <RecordDialog title="Add shed" button="Add shed">
              <form action={saveShed} className="space-y-3">
                <label className="grid gap-1 text-sm">
                  Name
                  <input name="name" required placeholder="e.g. North Shed A" className={inputClass} />
                </label>
                <div className="flex justify-end">
                  <Submit>Save shed</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null
        }
      />
      {query.error && errorMessages[query.error] ? <Notice tone="danger">{errorMessages[query.error]}</Notice> : null}
      {query.saved ? <Notice>Shed saved.</Notice> : null}
      <Table headers={["Shed", "Animals on farm", "Status", ""]}>
        {rows.length === 0 ? <EmptyRow cols={4}>No sheds yet.</EmptyRow> : null}
        {rows.map((row) => {
          const count = countsByLocation.get(row.id) ?? 0;
          return (
            <tr key={row.id}>
              <Td className="font-medium">
                <Link href={`/animals?view=active&shed=${encodeURIComponent(row.id)}`} className="hover:underline">
                  {row.name}
                </Link>
              </Td>
              <Td className="tabular-nums">{count}</Td>
              <Td>{row.active ? <Pill tone="good">Active</Pill> : <Pill>Inactive</Pill>}</Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Link
                    href={`/animals/labels?shed=${encodeURIComponent(row.id)}`}
                    className="inline-flex h-8 items-center rounded-full border border-border bg-white px-3 text-xs font-medium text-foreground transition hover:bg-muted"
                  >
                    QR labels
                  </Link>
                  {canEdit ? (
                    <RecordDialog title={`Edit ${row.name}`} button="Edit" quiet>
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
                </div>
              </Td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
