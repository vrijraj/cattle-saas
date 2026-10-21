import { describe, expect, it } from "vitest";
import { milkDaySummary } from "./milk-sheet";

describe("milk day summary", () => {
  it("leaves a missing cow out of the total and ignores a voided row", () => {
    const summary = milkDaySummary(
      ["jamuna", "radha"],
      [
        { animalId: "jamuna", morningLitres: "3.0", eveningLitres: "4.0", voidedAt: null },
        { animalId: "radha", morningLitres: "8.0", eveningLitres: "8.0", voidedAt: new Date() },
      ],
    );
    expect(summary.entered).toBe(1);
    expect(summary.notEntered).toBe(1);
    expect(summary.total).toBe(7);
    expect(summary.active.has("radha")).toBe(false);
    expect(summary.completion).toBe(50);
  });
});
