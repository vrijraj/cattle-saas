import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { enquiries } from "@/db/schema";
import { formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { EmptyRow, Summary, Table, Td } from "@/components/workspace";

export const metadata = { title: "Buyer enquiries" };

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const farm = await requireFarm();
  const query = await searchParams;
  const term = query.q?.trim().toLowerCase() ?? "";
  const rows = (await db.select().from(enquiries).where(eq(enquiries.farmId, farm.farmId)).orderBy(desc(enquiries.createdAt))).filter(
    (row) => !term || [row.name, row.phone, row.animalCode, row.message].some((value) => value?.toLowerCase().includes(term)),
  );

  return (
    <div className="space-y-5">
      <Summary
        title="Enquiries"
        description={term ? `Messages matching “${query.q?.trim()}”.` : "Messages from the public catalogue stay here after a listing is unpublished."}
        facts={[{ label: "Messages", value: String(rows.length) }]}
      />
      <Table headers={["When", "Name", "Phone", "About", "Message"]}>
        {rows.length === 0 ? <EmptyRow cols={5}>{term ? "No enquiries match this search." : "No enquiries yet."}</EmptyRow> : null}
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
