import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { animals, inseminations } from "@/db/schema";
import { formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { EmptyRow, Summary, Table, Td } from "@/components/workspace";

export default async function BreedingPage() {
  const farm = await requireFarm();
  const herd = await db.select().from(animals).where(eq(animals.farmId, farm.farmId));
  const pregnant = herd.filter((animal) => animal.reproduction === "pregnant");
  const byId = new Map(herd.map((animal) => [animal.id, animal]));
  const recent = await db.select().from(inseminations).where(eq(inseminations.farmId, farm.farmId));

  return (
    <div className="space-y-5">
      <Summary
        title="Breeding"
        description="Heat, AI, pregnancy checks, and calving are recorded on the animal profile."
        facts={[
          { label: "Pregnant", value: String(pregnant.length) },
          { label: "Inseminations", value: String(recent.length) },
        ]}
      />
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Pregnant</h2>
      <Table headers={["Animal", "Status", "Expected calving"]}>
        {pregnant.length === 0 ? <EmptyRow cols={3}>No pregnant animals.</EmptyRow> : null}
        {pregnant.map((animal) => (
          <tr key={animal.id}>
            <Td>
              <Link href={`/animals/${animal.code}`} className="font-medium text-primary">
                {animal.name ?? animal.code}
              </Link>
              <span className="mt-0.5 block text-xs text-muted-foreground">{animal.code}</span>
            </Td>
            <Td>Pregnant</Td>
            <Td>{animal.expectedCalving ? formatDisplayDate(animal.expectedCalving) : "Not calculated"}</Td>
          </tr>
        ))}
      </Table>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Inseminations</h2>
      <Table headers={["Animal", "Date", "Bull", "Attempt", "Straw"]}>
        {recent.length === 0 ? <EmptyRow cols={5}>No AI recorded yet.</EmptyRow> : null}
        {recent.map((row) => {
          const animal = byId.get(row.animalId);
          return (
            <tr key={row.id}>
              <Td>
                {animal ? (
                  <Link href={`/animals/${animal.code}`} className="font-medium text-primary">
                    {animal.code}
                  </Link>
                ) : (
                  "—"
                )}
              </Td>
              <Td>{formatDisplayDate(row.performedOn)}</Td>
              <Td>{row.bullCode}</Td>
              <Td>{row.attemptNumber}</Td>
              <Td className="text-muted-foreground">{row.strawCode ?? "—"}</Td>
            </tr>
          );
        })}
      </Table>
      </section>
    </div>
  );
}
