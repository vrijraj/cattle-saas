import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { enquiries } from "@/db/schema";
import { formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { EmptyRow, Summary, Table, Td } from "@/components/workspace";

export default async function EnquiriesPage() {
  const farm = await requireFarm();
  const rows = await db.select().from(enquiries).where(eq(enquiries.farmId, farm.farmId)).orderBy(desc(enquiries.createdAt));

  return (
    <div className="space-y-5">
      <Summary
        title="Enquiries"
        description="Messages from the public catalogue stay here after a listing is unpublished."
        facts={[{ label: "Messages", value: String(rows.length) }]}
      />
      <Table headers={["When", "Name", "Phone", "About", "Message"]}>
        {rows.length === 0 ? <EmptyRow cols={5}>No enquiries yet.</EmptyRow> : null}
        {rows.map((row) => (
          <tr key={row.id}>
            <Td>{formatDisplayDate(row.createdAt.toISOString().slice(0, 10))}</Td>
            <Td className="font-medium">{row.name}</Td>
            <Td>{row.phone}</Td>
            <Td>{row.animalCode || "Catalogue"}</Td>
            <Td>{row.message}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
