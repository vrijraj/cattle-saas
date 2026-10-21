import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { animals, dewormings, healthEvents, vaccinations } from "@/db/schema";
import { formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { EmptyRow, Summary, Table, Td } from "@/components/workspace";

export default async function HealthPage() {
  const farm = await requireFarm();
  const events = await db.select().from(healthEvents).where(eq(healthEvents.farmId, farm.farmId)).orderBy(desc(healthEvents.eventOn));
  const doses = await db.select().from(vaccinations).where(eq(vaccinations.farmId, farm.farmId)).orderBy(desc(vaccinations.givenOn));
  const worms = await db.select().from(dewormings).where(eq(dewormings.farmId, farm.farmId)).orderBy(desc(dewormings.givenOn));
  const herd = await db.select({ id: animals.id, code: animals.code, name: animals.name }).from(animals).where(eq(animals.farmId, farm.farmId));
  const byId = new Map(herd.map((animal) => [animal.id, animal]));

  function animalLink(animalId: string) {
    const animal = byId.get(animalId);
    if (!animal) return "—";
    return (
      <Link href={`/animals/${animal.code}?tab=health`} className="font-medium text-primary">
        {animal.code}
      </Link>
    );
  }

  return (
    <div className="space-y-8">
      <Summary
        title="Health"
        description="Treatments, vaccines, and deworming are recorded on each animal. Due dates appear on Alerts."
        facts={[
          { label: "Treatments", value: String(events.length) },
          { label: "Vaccines", value: String(doses.length) },
          { label: "Deworming", value: String(worms.length) },
        ]}
      />
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Treatments</h2>
        <Table headers={["Date", "Animal", "Problem", "Medicine", "Outcome"]}>
          {events.length === 0 ? <EmptyRow cols={5}>No treatments yet.</EmptyRow> : null}
          {events.map((event) => (
            <tr key={event.id}>
              <Td>{formatDisplayDate(event.eventOn)}</Td>
              <Td>{animalLink(event.animalId)}</Td>
              <Td>{event.problem}</Td>
              <Td className="text-muted-foreground">{event.medicine ?? "—"}</Td>
              <Td>{event.outcome}</Td>
            </tr>
          ))}
        </Table>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Vaccines</h2>
        <Table headers={["Animal", "Vaccine", "Given", "Next due"]}>
          {doses.length === 0 ? <EmptyRow cols={4}>No doses yet.</EmptyRow> : null}
          {doses.map((dose) => (
            <tr key={dose.id}>
              <Td>{animalLink(dose.animalId)}</Td>
              <Td>{dose.vaccine}</Td>
              <Td>{formatDisplayDate(dose.givenOn)}</Td>
              <Td className="text-muted-foreground">{dose.nextDueOn ? formatDisplayDate(dose.nextDueOn) : "—"}</Td>
            </tr>
          ))}
        </Table>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Deworming</h2>
        <Table headers={["Animal", "Product", "Given", "Next due"]}>
          {worms.length === 0 ? <EmptyRow cols={4}>No deworming yet.</EmptyRow> : null}
          {worms.map((row) => (
            <tr key={row.id}>
              <Td>{animalLink(row.animalId)}</Td>
              <Td>{row.product}</Td>
              <Td>{formatDisplayDate(row.givenOn)}</Td>
              <Td className="text-muted-foreground">{row.nextDueOn ? formatDisplayDate(row.nextDueOn) : "—"}</Td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
