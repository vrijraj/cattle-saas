import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { enquiries } from "@/db/schema";
import { updateEnquiryStatus } from "@/app/(farm)/shop/actions";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canViewEnquiries } from "@/lib/permissions";
import { EmptyRow, Notice, Pill, Summary, Table, Td } from "@/components/workspace";

export const metadata = { title: "Buyer enquiries" };

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ q?: string; saved?: string }> }) {
  const farm = await requireFarm();
  if (!canViewEnquiries(farm.roles)) redirect("/dashboard");
  const query = await searchParams;
  const term = query.q?.trim().toLowerCase() ?? "";
  const rows = (await db.select().from(enquiries).where(eq(enquiries.farmId, farm.farmId)).orderBy(desc(enquiries.createdAt))).filter(
    (row) => !term || [row.name, row.phone, row.animalCode, row.message, row.status].some((value) => value?.toLowerCase().includes(term)),
  );
  const openCount = rows.filter((row) => row.status === "new").length;

  return (
    <div className="space-y-5">
      <Summary
        title="Enquiries"
        description={term ? `Messages matching “${query.q?.trim()}”.` : "Messages from the public catalogue stay here after a listing is unpublished."}
        facts={[
          { label: "Messages", value: String(rows.length) },
          { label: "New", value: String(openCount) },
        ]}
      />
      {query.saved ? <Notice>Enquiry status updated.</Notice> : null}
      <Table headers={["When", "Name", "Phone", "About", "Message", "Status"]}>
        {rows.length === 0 ? <EmptyRow cols={6}>{term ? "No enquiries match this search." : "No enquiries yet."}</EmptyRow> : null}
        {rows.map((row) => {
          const day = farmToday(farm.timezone, row.createdAt);
          return (
            <tr key={row.id}>
              <Td>{formatDisplayDate(day)}</Td>
              <Td className="font-medium">{row.name}</Td>
              <Td>{row.phone}</Td>
              <Td>
                {row.animalCode ? (
                  <Link href={`/animals/${encodeURIComponent(row.animalCode)}`} className="font-medium text-primary hover:underline">
                    {row.animalCode}
                  </Link>
                ) : (
                  "Catalogue"
                )}
              </Td>
              <Td>{row.message}</Td>
              <Td>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={row.status === "new" ? "warn" : row.status === "replied" ? "good" : "neutral"}>{row.status}</Pill>
                  {row.status !== "replied" ? (
                    <form action={updateEnquiryStatus}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="status" value="replied" />
                      <button type="submit" className="text-xs font-medium text-primary hover:underline">
                        Mark replied
                      </button>
                    </form>
                  ) : null}
                  {row.status !== "closed" ? (
                    <form action={updateEnquiryStatus}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="status" value="closed" />
                      <button type="submit" className="text-xs font-medium text-muted-foreground hover:text-foreground">
                        Close
                      </button>
                    </form>
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
