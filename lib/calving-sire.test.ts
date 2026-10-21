import { describe, expect, it } from "vitest";
import { calfSireFromConception } from "./calving-sire";

describe("calving sire", () => {
  it("uses only the confirmed conception", () => {
    expect(calfSireFromConception({ bullCode: "BULL-GIR-014", bullName: "Sagar" })).toEqual({
      code: "BULL-GIR-014",
      name: "Sagar",
    });
  });

  it("does not invent a sire when the conception is missing", () => {
    expect(calfSireFromConception(null)).toBeNull();
    expect(calfSireFromConception({ bullCode: "  ", bullName: "Unknown bull" })).toBeNull();
  });
});
