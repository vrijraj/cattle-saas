import { describe, expect, it } from "vitest";
import { animalMilkDrop, herdMilkDrop, type YieldDay } from "./milk-drop";

function day(date: string, morning: number, evening: number, explained = false): YieldDay {
  return { date, morning, evening, explained };
}

const steady = [
  day("2026-10-01", 7, 7),
  day("2026-10-02", 7, 7),
  day("2026-10-03", 7, 7),
  day("2026-10-04", 7, 7),
  day("2026-10-05", 7, 7),
  day("2026-10-06", 7, 7),
  day("2026-10-07", 7, 7),
];

describe("animal milk drop", () => {
  it("alerts at a 30 percent drop after 14 days in milk and 7 prior days", () => {
    const drop = animalMilkDrop({
      daysInMilk: 40,
      prior: steady,
      today: day("2026-10-08", 4, 4),
    });
    expect(drop).toEqual({ todayLitres: 8, baselineLitres: 14, percentBelow: 42.9 });
  });

  it("skips the first 14 days in milk", () => {
    const drop = animalMilkDrop({
      daysInMilk: 13,
      prior: steady,
      today: day("2026-10-08", 4, 4),
    });
    expect(drop).toBeNull();
  });

  it("ignores an explained day when building the baseline", () => {
    const prior = [...steady.slice(0, 6), day("2026-10-07", 1, 1, true), day("2026-09-30", 7, 7)];
    const drop = animalMilkDrop({
      daysInMilk: 40,
      prior,
      today: day("2026-10-08", 7, 7),
    });
    expect(drop).toBeNull();
  });

  it("does not alert when a required session is missing", () => {
    const today = { date: "2026-10-08", morning: 2, evening: null, explained: false };
    expect(animalMilkDrop({ daysInMilk: 40, prior: steady, today, requireBothSessions: true })).toBeNull();
  });

  it("supports a configurable drop percentage threshold", () => {
    // 14 L baseline -> 11 L today is a 21.4% drop (below 30%, above 20%)
    const today = day("2026-10-08", 5.5, 5.5);
    expect(animalMilkDrop({ daysInMilk: 40, prior: steady, today, dropPercent: 30 })).toBeNull();
    expect(animalMilkDrop({ daysInMilk: 40, prior: steady, today, dropPercent: 20 })).toEqual({
      todayLitres: 11,
      baselineLitres: 14,
      percentBelow: 21.4,
    });
  });
});

describe("herd milk drop", () => {
  it("uses the herd total against the previous 7 days", () => {
    const days = [
      ...Array.from({ length: 7 }, (_, index) => ({ date: `2026-10-0${index + 1}`, litres: 70, explained: false })),
      { date: "2026-10-08", litres: 40, explained: false },
    ];
    expect(herdMilkDrop(days, "2026-10-08")?.percentBelow).toBeGreaterThanOrEqual(30);
  });
});
