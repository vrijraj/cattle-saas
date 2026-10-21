import { describe, expect, it } from "vitest";
import { bullPerformance, type Offspring } from "./bull-performance";

const rows: Offspring[] = [
  { id: "1", code: "A", name: "A", sex: "female", dob: "2024-01-01", sireCode: "SAGAR", lactationNumber: 1, dailyMilk: [10, 12], healthEvents: 1, calvingOutcome: "live" },
  { id: "2", code: "B", name: "B", sex: "male", dob: "2025-01-01", sireCode: "SAGAR", lactationNumber: 0, dailyMilk: [], healthEvents: 0, calvingOutcome: null },
  { id: "3", code: "C", name: null, sex: "female", dob: "2024-06-01", sireCode: "OTHER", lactationNumber: 2, dailyMilk: [], healthEvents: 0, calvingOutcome: null },
];

describe("bull performance", () => {
  it("counts offspring, daughters, milk, and health from recorded rows", () => {
    const [sagar] = bullPerformance(rows, {});
    expect(sagar.sireCode).toBe("SAGAR");
    expect(sagar.offspring).toBe(2);
    expect(sagar.females).toBe(1);
    expect(sagar.averageDailyYield).toBe(11);
    expect(sagar.healthEvents).toBe(1);
    expect(sagar.liveCalvings).toBe(1);
  });

  it("filters by birth year and lactation number", () => {
    expect(bullPerformance(rows, { year: "2024", lactation: "1" })).toHaveLength(1);
    expect(bullPerformance(rows, { year: "2025", lactation: "1" })).toHaveLength(0);
  });

  it("returns nothing when no offspring match", () => {
    expect(bullPerformance([], {})).toEqual([]);
  });
});
