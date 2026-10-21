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
  animals: { code: string; name: string | null }[];
};

export function bullPerformance(rows: Offspring[], filters: { year?: string; lactation?: string }): BullPerformance[] {
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
      return {
        sireCode,
        offspring: animals.length,
        females: daughters.length,
        daughtersWithMilk: daughters.filter((animal) => animal.dailyMilk.length > 0).length,
        averageDailyYield: yields.length ? Math.round((yields.reduce((sum, value) => sum + value, 0) / yields.length) * 10) / 10 : null,
        healthEvents: animals.reduce((sum, animal) => sum + animal.healthEvents, 0),
        liveCalvings: animals.filter((animal) => animal.calvingOutcome === "live").length,
        animals: animals.map((animal) => ({ code: animal.code, name: animal.name })),
      };
    })
    .sort((a, b) => b.offspring - a.offspring || a.sireCode.localeCompare(b.sireCode));
}
