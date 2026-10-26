import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { alerts, animals, dewormings, healthEvents, vaccinations } from "@/db/schema";
import { healthOutcome, healthRegister } from "@/lib/health-register";
import { formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canSeeClinical, canViewHealth } from "@/lib/permissions";
import { PanelTabs } from "@/components/panel-tabs";
import { EmptyRow, Notice, pickTab, Summary, Table, Td } from "@/components/workspace";

const errors: Record<string, string> = {
  role: "Your role cannot record this health event.",
  animal: "Choose an animal on this farm.",
};

export const metadata = { title: "Health records" };

export default async function HealthPage({ searchParams }: { searchParams: Promise<{ error?: string; tab?: string }> }) {
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
  const tabs = [
    { id: "due", label: "Due", count: register.due.length },
    ...(clinical ? [{ id: "treatments", label: "Treatments", count: register.events.length }] : []),
    { id: "vaccines", label: "Vaccines", count: register.doses.length },
    { id: "deworming", label: "Deworming", count: register.dewormings.length },
  ];
  const tab = pickTab(query.tab, tabs, "due");

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
    <div className="space-y-5">
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

      <PanelTabs
        initialTab={tab}
        tabs={tabs}
        panels={{
          due: (
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
          ),
          ...(clinical
            ? {
                treatments: (
        <Table headers={["Date", "Animal", "Problem & Diagnosis", "Medicine & Regimen", "Veterinarian", "Follow-up", "Outcome", "Attachment"]}>
          {register.events.length === 0 ? <EmptyRow cols={8}>No treatments yet.</EmptyRow> : null}
          {register.events.map((event) => {
            const animal = byId.get(event.animalId);
            return (
              <tr key={event.id}>
                <Td>{formatDisplayDate(event.eventOn)}</Td>
                <Td>{animalLink(event.animalId)}</Td>
                <Td>
                  <div className="font-medium">{event.problem}</div>
                  {event.diagnosis ? <div className="text-xs text-muted-foreground">Dx: {event.diagnosis}</div> : null}
                  {event.signs ? <div className="text-xs text-muted-foreground">Signs: {event.signs}</div> : null}
                </Td>
                <Td>
                  <div>{event.medicine ?? "—"}</div>
                  {event.dose || event.route || event.duration ? (
                    <div className="text-xs text-muted-foreground">{[event.dose, event.route, event.duration].filter(Boolean).join(" · ")}</div>
                  ) : null}
                  {event.treatment ? <div className="text-xs text-muted-foreground">{event.treatment}</div> : null}
                </Td>
                <Td>{event.veterinarian ?? "—"}</Td>
                <Td>{event.followUpOn ? formatDisplayDate(event.followUpOn) : "—"}</Td>
                <Td>{healthOutcome(event.outcome)}</Td>
                <Td>
                  {event.attachmentKey && animal ? (
                    <a
                      href={`/animals/${encodeURIComponent(animal.code)}/health/${encodeURIComponent(event.id)}/attachment`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-primary underline underline-offset-4"
                    >
                      {event.attachmentName ?? "View file"}
                    </a>
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
                ),
              }
            : {}),
          vaccines: (
        <Table headers={["Animal", "Vaccine", "Batch", "Given", "Next due"]}>
          {register.doses.length === 0 ? <EmptyRow cols={5}>No doses yet.</EmptyRow> : null}
          {register.doses.map((dose) => (
            <tr key={dose.id}>
              <Td>{animalLink(dose.animalId)}</Td>
              <Td>{dose.vaccine}</Td>
              <Td>{dose.batch ?? "—"}</Td>
              <Td>{formatDisplayDate(dose.givenOn)}</Td>
              <Td className="text-muted-foreground">{dose.nextDueOn ? formatDisplayDate(dose.nextDueOn) : "—"}</Td>
            </tr>
          ))}
        </Table>
          ),
          deworming: (
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
          ),
        }}
      />
    </div>
  );
}
