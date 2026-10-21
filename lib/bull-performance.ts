export type Offspring = {
  id: string;
  code: string;
  name: string | null;
  sex: string;
  dob: string | null;
  sireCode: string | null;
  lactationNumber: number;
  dailyMilk: number[];
  healthEvents: number;
  calvingOutcome: string | null;
};

export type BullPerformance = {
  sireCode: string;
  offspring: number;
  females: number;
  daughtersWithMilk: number;
  averageDailyYield: number | null;
  healthEvents: number;
  liveCalvings: number;
  conceptions: number | null;
  mateChecks: number;
  averageCalvingInterval: number | null;
  animals: { code: string; name: string | null }[];
};

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function bullPerformance(
  rows: Offspring[],
  filters: { year?: string; lactation?: string },
  history: { mates?: { bullCode: string; result: string }[]; daughterBirths?: { damId: string; calvedOn: string }[] } = {},
): BullPerformance[] {
  const year = filters.year?.trim();
  const lactation = filters.lactation?.trim();
  const grouped = new Map<string, Offspring[]>();
  for (const row of rows) {
    if (!row.sireCode) continue;
    if (year && row.dob?.slice(0, 4) !== year) continue;
    if (lactation && String(row.lactationNumber) !== lactation) continue;
    const list = grouped.get(row.sireCode) ?? [];
    list.push(row);
    grouped.set(row.sireCode, list);
  }
  return [...grouped.entries()]
    .map(([sireCode, animals]) => {
      const daughters = animals.filter((animal) => animal.sex === "female");
      const yields = daughters.flatMap((animal) => animal.dailyMilk);
      const mates = (history.mates ?? []).filter((mate) => mate.bullCode === sireCode && mate.result);
      const births = new Map<string, string[]>();
      for (const birth of history.daughterBirths ?? []) {
        const list = births.get(birth.damId) ?? [];
        list.push(birth.calvedOn);
        births.set(birth.damId, list);
      }
      const intervals: number[] = [];
      for (const daughter of daughters) {
        const dates = (births.get(daughter.id) ?? []).sort();
        for (let index = 1; index < dates.length; index += 1) intervals.push(daysBetween(dates[index - 1], dates[index]));
      }
      return {
        sireCode,
        offspring: animals.length,
        females: daughters.length,
        daughtersWithMilk: daughters.filter((animal) => animal.dailyMilk.length > 0).length,
        averageDailyYield: yields.length ? Math.round((yields.reduce((sum, value) => sum + value, 0) / yields.length) * 10) / 10 : null,
        healthEvents: animals.reduce((sum, animal) => sum + animal.healthEvents, 0),
        liveCalvings: animals.filter((animal) => animal.calvingOutcome === "live").length,
        conceptions: mates.length ? mates.filter((mate) => mate.result === "pregnant").length : null,
        mateChecks: mates.length,
        averageCalvingInterval: intervals.length ? Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length) : null,
        animals: animals.map((animal) => ({ code: animal.code, name: animal.name })),
      };
    })
    .sort((a, b) => b.offspring - a.offspring || a.sireCode.localeCompare(b.sireCode));
}
