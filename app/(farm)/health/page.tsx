import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { alerts, animals, dewormings, healthEvents, vaccinations } from "@/db/schema";
import { healthOutcome, healthRegister } from "@/lib/health-register";
import { formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canSeeClinical, canViewHealth } from "@/lib/permissions";
import { EmptyRow, Notice, Summary, Table, Td } from "@/components/workspace";

const errors: Record<string, string> = {
  role: "Your role cannot record this health event.",
  animal: "Choose an animal on this farm.",
};

export default async function HealthPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const farm = await requireFarm();
  if (!canViewHealth(farm.roles)) redirect("/dashboard");
  const query = await searchParams;
  const clinical = canSeeClinical(farm.roles);
  const herd = await db.select().from(animals).where(eq(animals.farmId, farm.farmId));
  const events = await db.select().from(healthEvents).where(eq(healthEvents.farmId, farm.farmId));
  const doses = await db.select().from(vaccinations).where(eq(vaccinations.farmId, farm.farmId));
  const worms = await db.select().from(dewormings).where(eq(dewormings.farmId, farm.farmId));
  const openAlerts = await db.select().from(alerts).where(eq(alerts.farmId, farm.farmId));
  const byId = new Map(herd.map((animal) => [animal.id, animal]));
  const register = healthRegister({ herd, events, doses, dewormings: worms, alerts: openAlerts, clinical });
  const notice = query.error ? errors[query.error] : undefined;

  function animalLink(animalId: string) {
    const animal = byId.get(animalId);
    if (!animal) return "—";
    return (
      <Link href={`/animals/${animal.code}?tab=health`} className="font-medium text-primary">
        {animal.name ?? animal.code}
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{animal.code}</span>
      </Link>
    );
  }

  return (
    <div className="space-y-8">
      <Summary
        title="Health"
        description="Treatments, vaccines, deworming, and animals in isolation. Due dates are listed here and on Alerts."
        facts={[
          { label: "Due", value: String(register.due.length) },
          { label: "Isolated", value: String(register.isolated.length) },
          ...(clinical ? [{ label: "Treatments", value: String(register.events.length) }] : []),
          { label: "Vaccines", value: String(register.doses.length) },
          { label: "Deworming", value: String(register.dewormings.length) },
        ]}
      />
      {notice ? <Notice tone="danger">{notice}</Notice> : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Due</h2>
        <Table headers={["Animal", "Follow-up", "Date"]}>
          {register.due.length === 0 ? <EmptyRow cols={3}>Nothing is due.</EmptyRow> : null}
          {register.due.map((row) => (
            <tr key={row.id}>
              <Td>{animalLink(row.animalId)}</Td>
              <Td>{row.kind}</Td>
              <Td>{row.dueOn ? formatDisplayDate(row.dueOn) : "—"}</Td>
            </tr>
          ))}
        </Table>
      </section>

      {clinical ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Treatments</h2>
          <Table headers={["Date", "Animal", "Problem", "Medicine", "Dose", "Follow-up", "Outcome"]}>
            {register.events.length === 0 ? <EmptyRow cols={7}>No treatments yet.</EmptyRow> : null}
            {register.events.map((event) => (
              <tr key={event.id}>
                <Td>{formatDisplayDate(event.eventOn)}</Td>
                <Td>{animalLink(event.animalId)}</Td>
                <Td className="font-medium">{event.problem}</Td>
                <Td>{event.medicine ?? "—"}</Td>
                <Td>{event.dose ?? "—"}</Td>
                <Td>{event.followUpOn ? formatDisplayDate(event.followUpOn) : "—"}</Td>
                <Td>{healthOutcome(event.outcome)}</Td>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Vaccines</h2>
        <Table headers={["Animal", "Vaccine", "Given", "Next due"]}>
          {register.doses.length === 0 ? <EmptyRow cols={4}>No doses yet.</EmptyRow> : null}
          {register.doses.map((dose) => (
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
          {register.dewormings.length === 0 ? <EmptyRow cols={4}>No deworming yet.</EmptyRow> : null}
          {register.dewormings.map((row) => (
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
