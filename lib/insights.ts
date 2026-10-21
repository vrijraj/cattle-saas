import { addDays } from "@/lib/dates";

export type Insight = {
  title: string;
  result: string;
  method: string;
  sample: string;
};

export function heatInsight(lastHeat: string | null, today: string): Insight {
  const method = "The window is day 18 to day 24 after the last recorded heat. The midpoint used is 21 days. This is a calendar rule, not a heat detector.";
  if (!lastHeat) {
    return { title: "Heat window", result: "No heat date is recorded, so no window is shown.", method, sample: "0 heat records" };
  }
  const start = addDays(lastHeat, 18);
  const end = addDays(lastHeat, 24);
  const open = today >= start && today <= end;
  return {
    title: "Heat window",
    result: open ? `Inside the window ${start} to ${end}.` : `Next window ${start} to ${end}.`,
    method,
    sample: "1 heat record",
  };
}

export function diseaseInsight(events: { animalId: string; problem: string; eventOn: string }[], today: string): Insight {
  const method = "Animals with the same problem text in the last 30 days are counted. Two or more animals is a herd signal. This is not a diagnosis.";
  const start = addDays(today, -30);
  const groups = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.eventOn < start || event.eventOn > today) continue;
    const key = event.problem.trim().toLowerCase();
    if (!key) continue;
    const animals = groups.get(key) ?? new Set<string>();
    animals.add(event.animalId);
    groups.set(key, animals);
  }
  const hits = [...groups.entries()].filter(([, animals]) => animals.size >= 2);
  return {
    title: "Herd health signal",
    result: hits.length === 0 ? "No problem is recorded on two or more animals in the last 30 days." : hits.map(([problem, animals]) => `${problem}: ${animals.size} animals`).join(". "),
    method,
    sample: `${events.length} health records considered`,
  };
}

export function weightInsight(weights: { weighedOn: string; kilograms: number }[]): Insight {
  const method = "The change is the latest weight minus the previous weight. No growth standard is applied.";
  const ordered = [...weights].sort((a, b) => a.weighedOn.localeCompare(b.weighedOn));
  if (ordered.length < 2) {
    return { title: "Weight change", result: "Two weights are needed before a change is shown.", method, sample: `${ordered.length} weight records` };
  }
  const previous = ordered[ordered.length - 2];
  const latest = ordered[ordered.length - 1];
  const change = Math.round((latest.kilograms - previous.kilograms) * 10) / 10;
  return {
    title: "Weight change",
    result: `${change >= 0 ? "+" : ""}${change} kg from ${previous.weighedOn} to ${latest.weighedOn}.`,
    method,
    sample: `${ordered.length} weight records`,
  };
}

export function valueInsight(input: { litres: number; price: number | null; medicine: number }): Insight {
  const method = "Milk litres × the farm price, minus medicine costs recorded on that animal. Unallocated feed stays out. This is not a sale price or a market valuation.";
  if (!input.price) {
    return { title: "Recorded value", result: "Set a milk price before a figure is shown.", method, sample: "0 priced milk rows" };
  }
  const amount = Math.round((input.litres * input.price - input.medicine) * 100) / 100;
  return {
    title: "Recorded value",
    result: `₹${amount.toLocaleString("en-IN")} from ${input.litres.toFixed(1)} L minus ₹${input.medicine.toLocaleString("en-IN")} medicine.`,
    method,
    sample: `${input.litres > 0 ? "milk rows" : "no milk rows"} and medicine costs`,
  };
}
