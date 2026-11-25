import { describe, expect, it } from "vitest";
import { parseCsv, validateAnimalImportCsv, validateMilkImportCsv } from "./csv-import";

describe("csv-import", () => {
  it("parses RFC-4180 quoted values with commas and escaped quotes", () => {
    const parsed = parseCsv('name,note\n"Ganga, Gir","Born ""healthy"""');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].name).toBe("Ganga, Gir");
    expect(parsed.rows[0].note).toBe('Born "healthy"');
  });

  it("validates animal rows and reports errors cleanly", () => {
    const csv = [
      "name,breedCode,sex,dob,earTag,shed,lifeStage",
      "Ganga,GIR,female,2022-04-15,ET-10,Milking Shed,cow",
      ",GIR,badsex,not-a-date,,,cow",
    ].join("\n");
    const rows = validateAnimalImportCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors.length).toBeGreaterThanOrEqual(2);
  });

  it("validates milk rows and checks bounds", () => {
    const csv = [
      "animalCode,recordedOn,morningLitres,eveningLitres,fatPercent,snfPercent",
      "SGD-GIR-0001,2026-11-20,7.5,6.5,4.8,8.7",
      "SGD-GIR-0002,2026-11-20,99.0,,20,",
    ].join("\n");
    const rows = validateMilkImportCsv(csv);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].morningLitres).toBe("7.5");
    expect(rows[1].errors).toContain("Morning litres must be 0–80");
    expect(rows[1].errors).toContain("Fat % must be 0–15");
  });
});
