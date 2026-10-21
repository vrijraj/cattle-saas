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
  const when = today < start ? "Next window" : open ? "Inside the window" : "The window";
  return {
    title: "Heat window",
    result: open || today < start ? `${when} ${start} to ${end}.` : `${when} ${start} to ${end} has passed.`,
    method,
    sample: "1 heat record",
  };
}

export type HeatWindow = {
  animalId: string;
  anchor: "heat" | "insemination";
  anchorOn: string;
  start: string;
  end: string;
  state: "inside" | "upcoming" | "past";
};

export function heatWindows(events: { animalId: string; observedOn: string; anchor: HeatWindow["anchor"] }[], today: string): HeatWindow[] {
  const latest = new Map<string, { observedOn: string; anchor: HeatWindow["anchor"] }>();
  for (const event of events) {
    const current = latest.get(event.animalId);
    if (!current || event.observedOn > current.observedOn) latest.set(event.animalId, event);
  }
  return [...latest.entries()]
    .map(([animalId, event]) => {
      const start = addDays(event.observedOn, 18);
      const end = addDays(event.observedOn, 24);
      const state = today < start ? "upcoming" : today > end ? "past" : "inside";
      return { animalId, anchor: event.anchor, anchorOn: event.observedOn, start, end, state } as const;
    })
    .sort((left, right) => left.start.localeCompare(right.start) || left.animalId.localeCompare(right.animalId));
}

export function diseaseSignals(events: { animalId: string; problem: string; eventOn: string }[], today: string) {
  const start = addDays(today, -30);
  const groups = new Map<string, { problem: string; animalIds: Set<string> }>();
  let considered = 0;
  for (const event of events) {
    if (event.eventOn < start || event.eventOn > today) continue;
    const key = event.problem.trim().toLowerCase();
    if (!key) continue;
    considered += 1;
    const group = groups.get(key) ?? { problem: event.problem.trim(), animalIds: new Set<string>() };
    group.animalIds.add(event.animalId);
    groups.set(key, group);
  }
  return {
    considered,
    hits: [...groups.values()]
      .filter((group) => group.animalIds.size >= 2)
      .map((group) => ({ problem: group.problem, animalIds: [...group.animalIds] })),
  };
}

export function diseaseInsight(events: { animalId: string; problem: string; eventOn: string }[], today: string): Insight {
  const method = "Animals with the same problem text in the last 30 days are counted. Two or more animals is a herd signal. This is not a diagnosis.";
  const signal = diseaseSignals(events, today);
  return {
    title: "Herd health signal",
    result:
      signal.hits.length === 0
        ? "No problem is recorded on two or more animals in the last 30 days."
        : signal.hits.map((hit) => `${hit.problem}: ${hit.animalIds.length} animals`).join(". "),
    method,
    sample: `${signal.considered} health records in the last 30 days`,
  };
}

export function weightChanges(weights: { animalId: string; weighedOn: string; kilograms: number }[]) {
  const grouped = new Map<string, { weighedOn: string; kilograms: number }[]>();
  for (const row of weights) {
    const list = grouped.get(row.animalId) ?? [];
    list.push(row);
    grouped.set(row.animalId, list);
  }
  return [...grouped.entries()].flatMap(([animalId, rows]) => {
    const ordered = [...rows].sort((left, right) => left.weighedOn.localeCompare(right.weighedOn));
    if (ordered.length < 2) return [];
    const previous = ordered[ordered.length - 2];
    const latest = ordered[ordered.length - 1];
    return [
      {
        animalId,
        from: previous.weighedOn,
        to: latest.weighedOn,
        change: Math.round((latest.kilograms - previous.kilograms) * 10) / 10,
      },
    ];
  });
}

export function weightInsight(weights: { weighedOn: string; kilograms: number }[]): Insight {
  const method = "The change is the latest weight minus the previous weight on the same animal. No growth standard is applied.";
  const changes = weightChanges(weights.map((row) => ({ animalId: "one", ...row })));
  if (weights.length < 2 || changes.length === 0) {
    return { title: "Weight change", result: "Two weights on the same animal are needed before a change is shown.", method, sample: `${weights.length} weight records` };
  }
  const change = changes[0];
  return {
    title: "Weight change",
    result: `${change.change >= 0 ? "+" : ""}${change.change} kg from ${change.from} to ${change.to}.`,
    method,
    sample: `${weights.length} weight records`,
  };
}

export function valueInsight(input: { litres: number; price: number | null; medicine: number }): Insight {
  const method = "Recorded milk litres × the farm price, minus medicine costs entered on health events. Feed is not included. This is not a sale price or a market valuation.";
  if (!input.price) {
    return { title: "Recorded value", result: "Set a milk price before a figure is shown.", method, sample: "0 priced milk rows" };
  }
  const amount = Math.round((input.litres * input.price - input.medicine) * 100) / 100;
  return {
    title: "Recorded value",
    result: `₹${amount.toLocaleString("en-IN")} from ${input.litres.toFixed(1)} L minus ₹${input.medicine.toLocaleString("en-IN")} medicine.`,
    method,
    sample: `${input.litres.toFixed(1)} L of recorded milk`,
  };
}
