import { describe, expect, it } from "vitest";
import { milkValueSuggestion } from "./finance-suggestions";
import { diseaseInsight, heatInsight } from "./insights";

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
});
