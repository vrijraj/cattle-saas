export type YieldDay = {
  date: string;
  morning: number | null;
  evening: number | null;
  explained: boolean;
};

export type MilkDrop = {
  todayLitres: number;
  baselineLitres: number;
  percentBelow: number;
};

const DROP_PERCENT = 30;
const PRIOR_DAYS = 7;
const FRESH_DAYS = 14;

function litres(day: { morning: number | null; evening: number | null }) {
  return Math.round(((day.morning ?? 0) + (day.evening ?? 0)) * 10) / 10;
}

function mean(values: number[]) {
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function animalMilkDrop(input: {
  daysInMilk: number | null;
  prior: YieldDay[];
  today: YieldDay;
  requireBothSessions?: boolean;
  dropPercent?: number;
}): MilkDrop | null {
  const threshold = input.dropPercent ?? DROP_PERCENT;
  if (input.daysInMilk === null || input.daysInMilk < FRESH_DAYS) return null;
  if (input.requireBothSessions && (input.today.morning === null || input.today.evening === null)) return null;
  if (input.today.morning === null && input.today.evening === null) return null;

  const baselineDays = input.prior
    .filter((day) => day.date < input.today.date && !day.explained && (day.morning !== null || day.evening !== null))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, PRIOR_DAYS);
  if (baselineDays.length < PRIOR_DAYS) return null;

  const baseline = mean(baselineDays.map(litres));
  if (baseline <= 0) return null;
  const todayLitres = litres(input.today);
  const percentBelow = Math.round(((baseline - todayLitres) / baseline) * 1000) / 10;
  if (percentBelow < threshold) return null;
  return { todayLitres, baselineLitres: baseline, percentBelow };
}

export function herdMilkDrop(
  days: { date: string; litres: number; explained: boolean }[],
  today: string,
  dropPercent: number = DROP_PERCENT,
): MilkDrop | null {
  const todayRow = days.find((day) => day.date === today);
  if (!todayRow || todayRow.explained) return null;
  const baselineDays = days
    .filter((day) => day.date < today && !day.explained)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, PRIOR_DAYS);
  if (baselineDays.length < PRIOR_DAYS) return null;
  const baseline = mean(baselineDays.map((day) => day.litres));
  if (baseline <= 0) return null;
  const percentBelow = Math.round(((baseline - todayRow.litres) / baseline) * 1000) / 10;
  if (percentBelow < dropPercent) return null;
  return { todayLitres: todayRow.litres, baselineLitres: baseline, percentBelow };
}

export function milkDropBody(drop: MilkDrop) {
  return `Today ${drop.todayLitres.toFixed(1)} L. Baseline ${drop.baselineLitres.toFixed(1)} L over the previous 7 days. Down ${drop.percentBelow}%.`;
}
