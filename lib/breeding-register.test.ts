import { describe, expect, it } from "vitest";
import { breedingRegister, type BreedingAnimal, type BreedingCalving, type BreedingCheck, type BreedingInsemination } from "./breeding-register";

const herd: BreedingAnimal[] = [
  { id: "savitri", presence: "on_farm", sex: "female", reproduction: "pregnant", lactation: "dry", species: "cattle", expectedCalving: null },
  { id: "radha", presence: "on_farm", sex: "female", reproduction: "pregnant", lactation: "lactating", species: "cattle", expectedCalving: "2026-12-10" },
  { id: "holi", presence: "on_farm", sex: "female", reproduction: "bred", lactation: "lactating", species: "cattle", expectedCalving: null },
  { id: "ganga", presence: "on_farm", sex: "female", reproduction: "fresh", lactation: "lactating", species: "cattle", expectedCalving: null },
];

const inseminations: BreedingInsemination[] = [
  { id: "old", animalId: "ganga", performedOn: "2026-01-02", bullCode: "BULL-GIR-014", bullName: "Sagar", strawCode: "STR-1", attemptNumber: 1, voidedAt: null },
  { id: "voided", animalId: "ganga", performedOn: "2026-08-01", bullCode: "BULL-GIR-014", bullName: "Sagar", strawCode: null, attemptNumber: 2, voidedAt: new Date() },
  { id: "holi-ai", animalId: "holi", performedOn: "2026-10-01", bullCode: "BULL-HF-010", bullName: null, strawCode: null, attemptNumber: 1, voidedAt: null },
];

const checks: BreedingCheck[] = [
  { id: "pd", animalId: "ganga", inseminationId: "old", checkedOn: "2026-02-08", result: "pregnant", voidedAt: null },
];

const calvings: BreedingCalving[] = [
  { id: "birth", damId: "ganga", calfId: "calf", inseminationId: "old", calvedOn: "2026-10-14", outcome: "live", voidedAt: null },
];

describe("breeding register", () => {
  const register = breedingRegister({ herd, heats: [], inseminations, checks, calvings }, "2026-10-21");

  it("lists a bred cow for a pregnancy check and a missing calving date", () => {
    expect(register.due.map((row) => `${row.animalId}:${row.kind}:${row.dueOn}`)).toEqual([
      "radha:Dry-off:2026-10-11",
      "holi:Pregnancy check:2026-11-05",
      "savitri:Expected calving:null",
    ]);
  });

  it("sorts inseminations newest first and keeps the calving result", () => {
    expect(register.inseminations.map((row) => row.id)).toEqual(["holi-ai", "old"]);
    expect(register.inseminations.find((row) => row.id === "old")?.outcome).toBe("live");
    expect(register.inseminations.find((row) => row.id === "holi-ai")?.followUp).toBe("2026-11-05");
  });
});
