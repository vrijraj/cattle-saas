import { describe, expect, it } from "vitest";
import { herdCounts, isUnderOneYear } from "../lib/herd-stats";

const today = "2026-10-21";

describe("herd counts for the Shree Gir fixture", () => {
  const animals = [
    row("1", "on_farm", "lactating", "open", "2019-03-12", true),
    row("2", "on_farm", "dry", "pregnant", "2020-07-04", true),
    row("3", "on_farm", "lactating", "pregnant", "2021-01-19", true),
    row("4", "on_farm", "lactating", "fresh", "2021-11-02", true),
    row("5", "on_farm", "lactating", "open", "2022-05-15", false),
    row("6", "on_farm", "pre_lactation", "pregnant", "2023-09-09", false),
    row("7", "on_farm", "pre_lactation", "open", "2025-02-01", false),
    row("8", "on_farm", "not_applicable", "not_applicable", "2024-08-20", false),
    row("9", "on_farm", "lactating", "bred", "2022-12-11", false),
    row("10", "on_farm", "dry", "open", "2021-04-08", false),
    row("18", "on_farm", "pre_lactation", "open", "2026-10-14", false),
    row("sold", "sold", "dry", "open", "2018-06-03", false),
  ];

  it("matches the 21 Oct 2026 dashboard", () => {
    expect(herdCounts(animals, today)).toEqual({
      total: 11,
      lactating: 5,
      dry: 2,
      pregnant: 3,
      calves: 1,
    });
  });

  it("treats a first birthday as no longer a calf", () => {
    expect(isUnderOneYear("2025-10-21", today)).toBe(false);
    expect(isUnderOneYear("2025-10-22", today)).toBe(true);
  });
});

function row(
  id: string,
  presence: "on_farm" | "sold",
  lactation: "lactating" | "dry" | "pre_lactation" | "not_applicable",
  reproduction: "open" | "pregnant" | "fresh" | "bred" | "not_applicable",
  dob: string,
  isDam: boolean,
) {
  return { id, presence, lactation, reproduction, dob, isDam };
}
