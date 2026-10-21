import { describe, expect, it } from "vitest";
import { ancestorChart, herdForest, type AnimalLink, type BullLink } from "./pedigree-tree";

const herd: AnimalLink[] = [
  { id: "1", code: "MIL-GIR-001", name: "Jamuna", geneticDamId: null, geneticSireCode: "BULL-GIR-002", geneticSireName: "BULL-GIR-002", presence: "on_farm" },
  { id: "2", code: "MIL-GIR-002", name: "Savitri", geneticDamId: "1", geneticSireCode: "BULL-GIR-002", geneticSireName: "BULL-GIR-002", presence: "on_farm" },
  { id: "3", code: "MIL-GIR-003", name: "Radha", geneticDamId: "1", geneticSireCode: "BULL-HF-010", geneticSireName: "BULL-HF-010", presence: "on_farm" },
  { id: "4", code: "MIL-GIR-004", name: "Ganga", geneticDamId: "1", geneticSireCode: "BULL-GIR-014", geneticSireName: "Sagar", presence: "on_farm" },
  { id: "6", code: "MIL-GIR-006", name: "Kaveri", geneticDamId: "2", geneticSireCode: "BULL-GIR-014", geneticSireName: "Sagar", presence: "on_farm" },
  { id: "18", code: "MIL-GIR-018", name: "Ganga's calf", geneticDamId: "4", geneticSireCode: "BULL-GIR-014", geneticSireName: "Sagar", presence: "on_farm" },
];

const bulls: BullLink[] = [{ code: "BULL-GIR-014", name: "Sagar", sireCode: "BULL-GIR-002", damCode: null }];

describe("herdForest", () => {
  it("nests daughters under their dam", () => {
    const [jamuna] = herdForest(herd);
    expect(jamuna.code).toBe("MIL-GIR-001");
    expect(jamuna.children.map((child) => child.code)).toEqual(["MIL-GIR-002", "MIL-GIR-003", "MIL-GIR-004"]);
    expect(jamuna.children[0].children.map((child) => child.code)).toEqual(["MIL-GIR-006"]);
    expect(jamuna.children[2].children.map((child) => child.code)).toEqual(["MIL-GIR-018"]);
  });

  it("stops when a dam link cycles", () => {
    const cycle: AnimalLink[] = [
      { id: "a", code: "A", name: null, geneticDamId: "b", geneticSireCode: null, geneticSireName: null, presence: "on_farm" },
      { id: "b", code: "B", name: null, geneticDamId: "a", geneticSireCode: null, geneticSireName: null, presence: "on_farm" },
    ];
    const forest = herdForest(cycle);
    expect(forest).toHaveLength(1);
    expect(forest[0].children[0].children[0].children).toEqual([]);
  });
});

describe("ancestorChart", () => {
  it("shows Kaveri's sire, dam, and Jamuna as maternal granddam", () => {
    const kaveri = herd.find((animal) => animal.code === "MIL-GIR-006")!;
    const chart = ancestorChart(kaveri, herd, bulls);
    expect(chart.parents.map((node) => node.code)).toEqual(["BULL-GIR-014", "MIL-GIR-002"]);
    expect(chart.parents[0].name).toBe("Sagar");
    expect(chart.parents[1].href).toBe("/animals/MIL-GIR-002");
    expect(chart.grandparents.map((node) => node.code)).toEqual(["BULL-GIR-002", null, "BULL-GIR-002", "MIL-GIR-001"]);
    expect(chart.grandparents[3].href).toBe("/animals/MIL-GIR-001");
    expect(chart.greatGrandparents).toHaveLength(8);
  });
});
