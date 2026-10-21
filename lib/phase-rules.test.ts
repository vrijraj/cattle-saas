import { describe, expect, it } from "vitest";
import { milkValueSuggestion } from "./finance-suggestions";
import { diseaseInsight, heatInsight, heatWindows, weightChanges } from "./insights";

describe("finance suggestions", () => {
  it("suggests milk value once", () => {
    const first = milkValueSuggestion({ month: "2026-10", litres: 10, price: 55, existingNotes: [] });
    expect(first?.amount).toBe(550);
    const again = milkValueSuggestion({ month: "2026-10", litres: 10, price: 55, existingNotes: [first?.key ?? ""] });
    expect(again).toBeNull();
  });
});

describe("insights", () => {
  it("places the heat window 18 to 24 days after the last heat", () => {
    const insight = heatInsight("2026-10-01", "2026-10-20");
    expect(insight.result).toContain("2026-10-19");
    expect(insight.result).toContain("2026-10-25");
    expect(insight.method).toContain("calendar rule");
  });

  it("signals a problem only when two animals share it", () => {
    const quiet = diseaseInsight([{ animalId: "a", problem: "Fever", eventOn: "2026-10-20" }], "2026-10-21");
    expect(quiet.result).toContain("No problem");
    const signal = diseaseInsight(
      [
        { animalId: "a", problem: "Fever", eventOn: "2026-10-20" },
        { animalId: "b", problem: "Fever", eventOn: "2026-10-18" },
      ],
      "2026-10-21",
    );
    expect(signal.result).toContain("2 animals");
  });

  it("opens each female's window from her own latest heat or insemination", () => {
    const windows = heatWindows(
      [
        { animalId: "holi", observedOn: "2026-10-01", anchor: "insemination" },
        { animalId: "sav", observedOn: "2026-10-21", anchor: "heat" },
      ],
      "2026-10-21",
    );
    const holi = windows.find((row) => row.animalId === "holi");
    expect(holi?.state).toBe("inside");
    expect(holi?.start).toBe("2026-10-19");
    expect(holi?.end).toBe("2026-10-25");
    expect(windows.find((row) => row.animalId === "sav")?.state).toBe("upcoming");
  });

  it("does not subtract one animal's weight from another's", () => {
    expect(
      weightChanges([
        { animalId: "cow", weighedOn: "2026-10-01", kilograms: 385 },
        { animalId: "calf", weighedOn: "2026-10-14", kilograms: 22.4 },
      ]),
    ).toEqual([]);
    expect(
      weightChanges([
        { animalId: "cow", weighedOn: "2026-10-01", kilograms: 385 },
        { animalId: "cow", weighedOn: "2026-10-14", kilograms: 390 },
      ])[0]?.change,
    ).toBe(5);
  });
});
