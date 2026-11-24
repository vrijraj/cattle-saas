const outcomeLabels: Record<string, string> = {
  ongoing: "Ongoing",
  resolved: "Resolved",
  died: "Died",
  culled: "Culled",
  referred: "Referred",
  unknown: "Unknown",
};

export function healthOutcome(value: string) {
  return outcomeLabels[value] ?? value;
}

type Stamp = { voidedAt: Date | null };

export type HealthAnimal = {
  id: string;
  presence: string;
  isolationReason: string | null;
  isolatedOn: string | null;
};

export type HealthEvent = Stamp & {
  id: string;
  animalId: string;
  eventOn: string;
  problem: string;
  signs?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  medicine: string | null;
  dose: string | null;
  route?: string | null;
  duration?: string | null;
  quarters?: string | null;
  withdrawalDays?: number | null;
  withdrawalUntil?: string | null;
  veterinarian?: string | null;
  followUpOn: string | null;
  outcome: string;
  attachmentKey?: string | null;
  attachmentName?: string | null;
};

export type HealthDose = Stamp & {
  id: string;
  animalId: string;
  vaccine: string;
  batch?: string | null;
  givenOn: string;
  nextDueOn: string | null;
};

export type HealthDeworming = Stamp & {
  id: string;
  animalId: string;
  product: string;
  givenOn: string;
  nextDueOn: string | null;
};

export type HealthAlert = {
  id: string;
  animalId: string | null;
  type: string;
  title: string;
  body: string;
  dueOn: string | null;
  status: string;
};

export type HealthDue = {
  id: string;
  animalId: string;
  kind: string;
  dueOn: string | null;
};

const clinicalTypes = new Set(["medication_due", "health_followup"]);
const dueTypes = new Set(["vaccine_due", "deworming_due", "deworm_due", "medication_due", "health_followup", "withdrawal"]);

function active<T extends Stamp>(rows: T[]) {
  return rows.filter((row) => !row.voidedAt);
}

export function healthRegister(input: {
  herd: HealthAnimal[];
  events: HealthEvent[];
  doses: HealthDose[];
  dewormings: HealthDeworming[];
  alerts: HealthAlert[];
  clinical: boolean;
}) {
  const events = active(input.events).sort((a, b) => b.eventOn.localeCompare(a.eventOn));
  const doses = active(input.doses).sort((a, b) => b.givenOn.localeCompare(a.givenOn));
  const dewormings = active(input.dewormings).sort((a, b) => b.givenOn.localeCompare(a.givenOn));
  const due: HealthDue[] = [];
  const seen = new Set<string>();

  function add(row: HealthDue) {
    const key = `${row.animalId}:${row.kind.toLowerCase()}:${row.dueOn ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    due.push(row);
  }

  for (const alert of input.alerts) {
    if (alert.status !== "open" || !alert.animalId || !dueTypes.has(alert.type)) continue;
    if (!input.clinical && clinicalTypes.has(alert.type)) continue;
    add({ id: alert.id, animalId: alert.animalId, kind: alert.title, dueOn: alert.dueOn });
  }

  if (input.clinical) {
    for (const event of events) {
      if (!event.followUpOn || event.outcome === "resolved" || event.outcome === "died") continue;
      const covered = input.alerts.some(
        (alert) => alert.status === "open" && alert.animalId === event.animalId && alert.dueOn === event.followUpOn && clinicalTypes.has(alert.type),
      );
      if (covered) continue;
      add({ id: `follow-${event.id}`, animalId: event.animalId, kind: event.medicine ? `Medication · ${event.medicine}` : "Follow-up", dueOn: event.followUpOn });
    }
  }

  // Only consider the latest dose per (animal, vaccine) so historical completed doses don't linger in Due forever
  const latestVaccineKey = new Set<string>();
  for (const dose of doses) {
    const vKey = `${dose.animalId}:${dose.vaccine.trim().toLowerCase()}`;
    if (latestVaccineKey.has(vKey)) continue;
    latestVaccineKey.add(vKey);
    if (!dose.nextDueOn) continue;
    const coveredByAlert = input.alerts.some(
      (alert) => alert.status === "open" && alert.animalId === dose.animalId && alert.type === "vaccine_due" && alert.dueOn === dose.nextDueOn,
    );
    if (coveredByAlert) continue;
    add({ id: `vaccine-${dose.id}`, animalId: dose.animalId, kind: `Vaccination · ${dose.vaccine}`, dueOn: dose.nextDueOn });
  }

  const latestDewormKey = new Set<string>();
  for (const row of dewormings) {
    const dKey = `${row.animalId}:${row.product.trim().toLowerCase()}`;
    if (latestDewormKey.has(dKey)) continue;
    latestDewormKey.add(dKey);
    if (!row.nextDueOn) continue;
    const coveredByAlert = input.alerts.some(
      (alert) =>
        alert.status === "open" &&
        alert.animalId === row.animalId &&
        (alert.type === "deworming_due" || alert.type === "deworm_due") &&
        alert.dueOn === row.nextDueOn,
    );
    if (coveredByAlert) continue;
    add({ id: `deworm-${row.id}`, animalId: row.animalId, kind: `Deworming · ${row.product}`, dueOn: row.nextDueOn });
  }

  const isolated = input.herd.filter((animal) => animal.presence === "on_farm" && animal.isolationReason);
  for (const animal of isolated) {
    add({
      id: `isolation-${animal.id}`,
      animalId: animal.id,
      kind: input.clinical ? `Isolation · ${animal.isolationReason}` : "Isolation",
      dueOn: animal.isolatedOn,
    });
  }

  return {
    events: input.clinical ? events : [],
    doses,
    dewormings,
    due: due.sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999")),
    isolated,
  };
}
