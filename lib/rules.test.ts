import { describe, expect, it } from "vitest";
import { formatAnimalCode } from "./animal-code";
import { canWriteAnimals, canWriteMilk } from "./permissions";

describe("animal codes", () => {
  it("pads the sequence to three digits", () => {
    expect(formatAnimalCode("MIL", "GIR", 1)).toBe("MIL-GIR-001");
    expect(formatAnimalCode("MIL", "GIR", 1000)).toBe("MIL-GIR-1000");
  });
});

describe("permissions", () => {
  it("lets a worker record milk and keeps identity edits with the manager", () => {
    expect(canWriteMilk(["worker"])).toBe(true);
    expect(canWriteAnimals(["worker"])).toBe(false);
    expect(canWriteAnimals(["manager"])).toBe(true);
  });
});
