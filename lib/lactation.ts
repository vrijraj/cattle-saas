import { addDays } from "@/lib/dates";

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function dryOffLeadDays(species: string) {
  return species === "buffalo" ? 90 : 60;
}

export function dryOffDueOn(expectedCalving: string, species: string) {
  return addDays(expectedCalving, -dryOffLeadDays(species));
}

export function lactationSummary(input: {
  calvedOn: string[];
  driedOn: string | null;
  state: string;
  today: string;
}) {
  const dates = input.calvedOn.filter(Boolean).sort();
  const number = dates.length;
  const started = dates.at(-1) ?? null;
  if (!started || (input.state !== "lactating" && input.state !== "dry")) {
    return { number, daysInMilk: null as number | null };
  }
  const end = input.state === "lactating" ? input.today : input.driedOn;
  if (!end) return { number, daysInMilk: null as number | null };
  const days = daysBetween(started, end);
  return { number, daysInMilk: days >= 0 ? days : null };
}
