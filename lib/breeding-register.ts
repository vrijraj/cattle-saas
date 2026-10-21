import { addDays } from "@/lib/dates";
import { dryOffDueOn } from "@/lib/lactation";

const pregnancyCheckDays = 35;
const dueWindowDays = 30;

type Stamp = { voidedAt: Date | null };

export type BreedingAnimal = {
  id: string;
  presence: string;
  sex: string;
  reproduction: string;
  lactation: string;
  species: string;
  expectedCalving: string | null;
};

export type BreedingInsemination = Stamp & {
  id: string;
  animalId: string;
  performedOn: string;
  bullCode: string;
  bullName: string | null;
  strawCode: string | null;
  attemptNumber: number;
};

export type BreedingCheck = Stamp & {
  id: string;
  animalId: string;
  inseminationId: string | null;
  checkedOn: string;
  result: string;
};

export type BreedingCalving = Stamp & {
  id: string;
  damId: string;
  calfId: string | null;
  inseminationId: string | null;
  calvedOn: string;
  outcome: string;
};

export type BreedingHeat = Stamp & {
  id: string;
  animalId: string;
  observedOn: string;
  signs: string;
};

export type DueRow = {
  animalId: string;
  kind: "Pregnancy check" | "Expected calving" | "Dry-off";
  dueOn: string | null;
};

export type InseminationRow = BreedingInsemination & {
  outcome: string | null;
  followUp: string | null;
};

function active<T extends Stamp>(rows: T[]) {
  return rows.filter((row) => !row.voidedAt);
}

function latest<T>(rows: T[], date: (row: T) => string) {
  return [...rows].sort((a, b) => date(b).localeCompare(date(a)))[0] ?? null;
}

export function breedingRegister(
  input: {
    herd: BreedingAnimal[];
    heats: BreedingHeat[];
    inseminations: BreedingInsemination[];
    checks: BreedingCheck[];
    calvings: BreedingCalving[];
  },
  today: string,
) {
  const heats = active(input.heats).sort((a, b) => b.observedOn.localeCompare(a.observedOn));
  const inseminations = active(input.inseminations);
  const checks = active(input.checks).sort((a, b) => b.checkedOn.localeCompare(a.checkedOn));
  const calvings = active(input.calvings).sort((a, b) => b.calvedOn.localeCompare(a.calvedOn));
  const horizon = addDays(today, dueWindowDays);
  const onFarm = input.herd.filter((animal) => animal.presence === "on_farm" && animal.sex === "female");
  const due: DueRow[] = [];

  for (const animal of onFarm) {
    const animalAis = inseminations.filter((row) => row.animalId === animal.id);
    const latestAi = latest(animalAis, (row) => row.performedOn);
    const checked = latestAi ? checks.some((row) => row.inseminationId === latestAi.id) : false;
    if (animal.reproduction === "bred" && latestAi && !checked) {
      due.push({ animalId: animal.id, kind: "Pregnancy check", dueOn: addDays(latestAi.performedOn, pregnancyCheckDays) });
    }
    if (animal.reproduction === "pregnant" && (!animal.expectedCalving || animal.expectedCalving <= horizon)) {
      due.push({ animalId: animal.id, kind: "Expected calving", dueOn: animal.expectedCalving });
    }
    if (animal.lactation === "lactating" && animal.reproduction === "pregnant" && animal.expectedCalving) {
      const dryOn = dryOffDueOn(animal.expectedCalving, animal.species);
      if (dryOn <= horizon) due.push({ animalId: animal.id, kind: "Dry-off", dueOn: dryOn });
    }
  }

  const rows: InseminationRow[] = inseminations
    .map((row) => {
      const animal = input.herd.find((item) => item.id === row.animalId);
      const calving = latest(
        calvings.filter((item) => item.inseminationId === row.id),
        (item) => item.calvedOn,
      );
      const check = latest(
        checks.filter((item) => item.inseminationId === row.id),
        (item) => item.checkedOn,
      );
      const animalAis = inseminations.filter((item) => item.animalId === row.animalId);
      const isLatest = latest(animalAis, (item) => item.performedOn)?.id === row.id;
      const waiting = animal?.reproduction === "bred" && isLatest && !check;
      const outcome = calving?.outcome ?? check?.result ?? null;
      return {
        ...row,
        outcome,
        followUp: waiting ? addDays(row.performedOn, pregnancyCheckDays) : null,
      };
    })
    .sort((a, b) => b.performedOn.localeCompare(a.performedOn));

  return {
    heats,
    inseminations: rows,
    checks,
    calvings,
    pregnant: onFarm
      .filter((animal) => animal.reproduction === "pregnant")
      .sort((a, b) => (a.expectedCalving ?? "9999").localeCompare(b.expectedCalving ?? "9999")),
    bred: onFarm.filter((animal) => animal.reproduction === "bred"),
    due: due.sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999")),
  };
}
