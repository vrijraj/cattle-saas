import { describe, expect, it } from "vitest";
import { milkPriceOnDate, milkRevenueForRows } from "./milk-pricing";

const history = [
  { effectiveFrom: "2026-01-01", pricePerLitre: "50.00", fatBonusPerPoint: "2.00", snfBonusPerPoint: "1.00" },
  { effectiveFrom: "2026-06-01", pricePerLitre: "56.00", fatBonusPerPoint: "2.50", snfBonusPerPoint: "1.50" },
];

describe("milk-pricing", () => {
  it("resolves effective-dated base price and falls back before earliest rule", () => {
    expect(milkPriceOnDate("2026-03-15", history, "48.00")).toBe(50);
    expect(milkPriceOnDate("2026-07-01", history, "48.00")).toBe(56);
    expect(milkPriceOnDate("2025-12-01", history, "48.00")).toBe(48);
    expect(milkPriceOnDate("2025-12-01", history, null)).toBeNull();
  });

  it("applies fat & SNF bonus adjustments relative to 4.0% Fat and 8.5% SNF", () => {
    const price = milkPriceOnDate("2026-07-01", history, null, { fatPercent: "5.0", snfPercent: "9.5" });
    // 56 + (5.0 - 4.0)*2.5 + (9.5 - 8.5)*1.5 = 60.0
    expect(price).toBe(60);
  });

  it("computes total revenue skipping voided rows", () => {
    const rev = milkRevenueForRows(
      [
        { recordedOn: "2026-03-10", morningLitres: "6.0", eveningLitres: "4.0" }, // 10L * 50 = 500
        { recordedOn: "2026-07-10", morningLitres: "5.0", eveningLitres: "5.0", fatPercent: "5.0", snfPercent: "9.5" }, // 10L * 60 = 600
        { recordedOn: "2026-07-11", morningLitres: "10.0", eveningLitres: null, voidedAt: new Date() },
      ],
      history,
      null,
    );
    expect(rev).toBe(1100);
  });
});
