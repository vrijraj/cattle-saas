import { describe, expect, it } from "vitest";
import { dryOffDueOn, lactationSummary } from "./lactation";

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
});
