import { addDays } from "@/lib/dates";

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function dryOffLeadDays(species: string, custom?: { cattle?: number | null; buffalo?: number | null }) {
  if (species === "buffalo") return custom?.buffalo ?? 90;
  return custom?.cattle ?? 60;
}

export function dryOffDueOn(expectedCalving: string, species: string, custom?: { cattle?: number | null; buffalo?: number | null }) {
  return addDays(expectedCalving, -dryOffLeadDays(species, custom));
}

export function lactationSummary(input: {
  calvedOn: string[];
  driedOn: string | null;
  state: string;
  today: string;
  presence?: string;
  exitOn?: string | null;
}) {
  const dates = input.calvedOn.filter(Boolean).sort();
  const number = dates.length;
  const started = dates.at(-1) ?? null;
  if (!started || (input.state !== "lactating" && input.state !== "dry")) {
    return { number, daysInMilk: null as number | null };
  }
  const offFarmEnd = input.presence && input.presence !== "on_farm" ? (input.exitOn ?? input.driedOn) : null;
  const end = offFarmEnd ?? (input.state === "lactating" ? input.today : input.driedOn);
  if (!end) return { number, daysInMilk: null as number | null };
  const days = daysBetween(started, end);
  return { number, daysInMilk: days >= 0 ? days : null };
}

export type LactationCycle = {
  number: number;
  calvedOn: string;
  endedOn: string | null;
  active: boolean;
  daysInMilk: number | null;
  recordedDays: number;
  totalLitres: number;
  peakLitres: number;
  peakOn: string | null;
  averageLitres: number;
};

export function lactationHistory(input: {
  calvedOn: string[];
  driedOn: string[];
  yields: { recordedOn: string; morningLitres: string | null; eveningLitres: string | null }[];
  state: string;
  today: string;
  presence?: string;
  exitOn?: string | null;
}): LactationCycle[] {
  const calvings = [...new Set(input.calvedOn.filter(Boolean))].sort();
  const dryDates = [...new Set(input.driedOn.filter(Boolean))].sort();
  if (calvings.length === 0) return [];
  const onFarm = !input.presence || input.presence === "on_farm";

  return calvings
    .map((start, index) => {
      const nextCalving = calvings[index + 1] ?? null;
      const isLatest = index === calvings.length - 1;
      const matchingDry = dryDates.find((dry) => dry >= start && (!nextCalving || dry < nextCalving)) ?? null;
      const active = isLatest && onFarm && input.state === "lactating" && !matchingDry;
      const closedEnd = !onFarm && isLatest ? (input.exitOn ?? matchingDry) : matchingDry;
      const endBound = closedEnd ?? (nextCalving ? addDays(nextCalving, -1) : active ? input.today : null);
      const upperYieldDate = closedEnd ?? (nextCalving ? addDays(nextCalving, -1) : input.today);

      const cycleYields = input.yields.filter((row) => row.recordedOn >= start && row.recordedOn <= upperYieldDate);
      let total = 0;
      let peak = 0;
      let peakOn: string | null = null;
      for (const row of cycleYields) {
        const daily = Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0);
        total += daily;
        if (daily > peak) {
          peak = daily;
          peakOn = row.recordedOn;
        }
      }
      const recordedDays = cycleYields.length;
      const totalLitres = Math.round(total * 10) / 10;
      const peakLitres = Math.round(peak * 10) / 10;
      const averageLitres = recordedDays > 0 ? Math.round((total / recordedDays) * 10) / 10 : 0;
      const dim = endBound ? daysBetween(start, endBound) : null;

      return {
        number: index + 1,
        calvedOn: start,
        endedOn: closedEnd,
        active,
        daysInMilk: dim !== null && dim >= 0 ? dim : null,
        recordedDays,
        totalLitres,
        peakLitres,
        peakOn,
        averageLitres,
      };
    })
    .reverse();
}
