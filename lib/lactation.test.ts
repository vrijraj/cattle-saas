import { describe, expect, it } from "vitest";
import { dryOffDueOn, lactationHistory, lactationSummary } from "./lactation";

describe("lactation", () => {
  it("numbers each calving and counts days in milk from the latest one", () => {
    const summary = lactationSummary({
      calvedOn: ["2024-01-01", "2026-09-01"],
      driedOn: null,
      state: "lactating",
      today: "2026-10-21",
    });
    expect(summary).toEqual({ number: 2, daysInMilk: 50 });
  });

  it("stops days in milk on the dry-off date", () => {
    const summary = lactationSummary({
      calvedOn: ["2026-08-01"],
      driedOn: "2026-10-01",
      state: "dry",
      today: "2026-10-21",
    });
    expect(summary).toEqual({ number: 1, daysInMilk: 61 });
  });

  it("leaves days in milk empty before the first calving", () => {
    expect(lactationSummary({ calvedOn: [], driedOn: null, state: "pre_lactation", today: "2026-10-21" })).toEqual({
      number: 0,
      daysInMilk: null,
    });
  });

  it("schedules dry-off 60 days before a cow calves and 90 days before a buffalo", () => {
    expect(dryOffDueOn("2026-12-20", "cattle")).toBe("2026-10-21");
    expect(dryOffDueOn("2026-12-20", "buffalo")).toBe("2026-09-21");
  });

  it("summarises multi-lactation performance history", () => {
    const cycles = lactationHistory({
      calvedOn: ["2025-01-01", "2026-06-01"],
      driedOn: ["2025-11-01"],
      yields: [
        { recordedOn: "2025-01-10", morningLitres: "6.0", eveningLitres: "5.5" },
        { recordedOn: "2025-02-15", morningLitres: "8.0", eveningLitres: "7.0" },
        { recordedOn: "2026-06-10", morningLitres: "9.0", eveningLitres: "8.0" },
      ],
      state: "lactating",
      today: "2026-06-21",
    });
    expect(cycles).toHaveLength(2);
    expect(cycles[0]).toMatchObject({
      number: 2,
      calvedOn: "2026-06-01",
      active: true,
      daysInMilk: 20,
      recordedDays: 1,
      totalLitres: 17,
      peakLitres: 17,
      averageLitres: 17,
    });
    expect(cycles[1]).toMatchObject({
      number: 1,
      calvedOn: "2025-01-01",
      endedOn: "2025-11-01",
      active: false,
      recordedDays: 2,
      totalLitres: 26.5,
      peakLitres: 15,
      averageLitres: 13.3,
    });
  });
});
