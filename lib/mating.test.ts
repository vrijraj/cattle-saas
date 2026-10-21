import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { matingFlags } from "./mating";

describe("expected calving", () => {
  it("adds Gir gestation to the conception date", () => {
    expect(addDays("2026-01-02", 287)).toBe("2026-10-16");
  });
});

describe("mating flags", () => {
  const links = [
    { code: "MIL-GIR-001", sireCode: "BULL-GIR-002", damCode: null },
    { code: "MIL-GIR-002", sireCode: "BULL-GIR-002", damCode: "MIL-GIR-001" },
    { code: "MIL-GIR-006", sireCode: "BULL-GIR-014", damCode: "MIL-GIR-002" },
  ];

  it("flags a sire mated back to his daughter", () => {
    expect(matingFlags("MIL-GIR-002", "BULL-GIR-002", links)[0]?.flag).toBe("Parent");
  });

  it("flags a great-grandsire relationship without calling it a parent", () => {
    const flags = matingFlags("MIL-GIR-006", "BULL-GIR-002", links);
    expect(flags.some((flag) => flag.flag === "Parent")).toBe(false);
    expect(flags.some((flag) => flag.flag === "Grandparent" || flag.flag === "Common ancestor")).toBe(true);
  });
});
