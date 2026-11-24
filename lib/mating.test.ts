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

  it("flags a bull who is the son of the female", () => {
    const flags = matingFlags("MIL-GIR-001", "MIL-GIR-002", links);
    expect(flags.some((flag) => flag.flag === "Son" && flag.code === "MIL-GIR-002")).toBe(true);
  });

  it("flags a female calf as a daughter", () => {
    const withSex = links.map((link) => (link.code === "MIL-GIR-002" ? { ...link, sex: "female" } : link));
    const flags = matingFlags("MIL-GIR-001", "MIL-GIR-002", withSex);
    expect(flags.some((flag) => flag.flag === "Daughter" && flag.code === "MIL-GIR-002")).toBe(true);
    expect(flags.some((flag) => flag.flag === "Son")).toBe(false);
  });

  it("flags a grandmother mated to her grandson", () => {
    const flags = matingFlags("MIL-GIR-001", "MIL-GIR-006", links);
    expect(flags.some((flag) => flag.flag === "Grandparent" && flag.code === "MIL-GIR-001")).toBe(true);
  });

  it("flags full siblings and half siblings", () => {
    const siblings = [
      { code: "COW-A", sireCode: "BULL-1", damCode: "DAM-1", sex: "female" },
      { code: "BULL-FULL", sireCode: "BULL-1", damCode: "DAM-1", sex: "male" },
      { code: "BULL-HALF", sireCode: "BULL-1", damCode: "DAM-2", sex: "male" },
    ];
    expect(matingFlags("COW-A", "BULL-FULL", siblings).some((flag) => flag.flag === "Full sibling")).toBe(true);
    expect(matingFlags("COW-A", "BULL-HALF", siblings).some((flag) => flag.flag === "Half sibling")).toBe(true);
  });

  it("flags a shared ancestor who is not the proposed bull", () => {
    const shared = [
      { code: "DAM", sireCode: "SHARED", damCode: null },
      { code: "BULL", sireCode: "SHARED", damCode: null },
    ];
    const flags = matingFlags("DAM", "BULL", shared);
    expect(flags.some((flag) => flag.flag === "Common ancestor" && flag.code === "SHARED")).toBe(true);
    expect(flags.some((flag) => flag.flag === "Parent")).toBe(false);
  });
});
