import { describe, expect, it } from "vitest";
import { isQuotaExceeded, planSpec } from "./plans";

describe("plans", () => {
  it("returns exact specs and defaults unknown plans to pro", () => {
    expect(planSpec("starter").maxAnimals).toBe(50);
    expect(planSpec("pro").maxAnimals).toBe(250);
    expect(planSpec("enterprise").maxAnimals).toBe(5000);
    expect(planSpec("unknown").id).toBe("pro");
  });

  it("enforces quota limits cleanly", () => {
    expect(isQuotaExceeded(49, 50)).toBe(false);
    expect(isQuotaExceeded(50, 50)).toBe(true);
    expect(isQuotaExceeded(100, 0)).toBe(false);
  });
});
