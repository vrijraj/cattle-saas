import { describe, expect, it } from "vitest";
import { feedAverageUnitCost, feedBalance, feedIsLow, feedQuantityLabel } from "./feed-stock";

describe("feed stock", () => {
  it("closes the period as opening plus purchases minus use and wastage", () => {
    const balance = feedBalance([
      { kind: "opening", quantity: "1000.0" },
      { kind: "purchase", quantity: "500.0" },
      { kind: "consumption", quantity: "1200.0" },
      { kind: "wastage", quantity: "15.0" },
    ]);
    expect(balance).toBe(285);
    expect(feedIsLow(balance, "300.0")).toBe(true);
    expect(feedQuantityLabel("consumption", "1200.0")).toBe("−1200.0");
    expect(feedQuantityLabel("purchase", "500")).toBe("+500.0");
  });

  it("supports signed adjustments and excludes voided rows", () => {
    const balance = feedBalance([
      { kind: "opening", quantity: "500.0" },
      { kind: "adjustment", quantity: "-50.0" },
      { kind: "adjustment", quantity: "20.0" },
      { kind: "consumption", quantity: "100.0", voidedAt: new Date("2026-10-01T00:00:00Z") },
    ]);
    expect(balance).toBe(470);
    expect(feedQuantityLabel("adjustment", "-50.0")).toBe("−50.0");
    expect(feedQuantityLabel("adjustment", "20.0")).toBe("+20.0");
  });

  it("computes weighted average unit cost from active openings and purchases", () => {
    const avg = feedAverageUnitCost([
      { kind: "opening", quantity: "100", unitCost: "20.00" },
      { kind: "purchase", quantity: "300", unitCost: "24.00" },
      { kind: "consumption", quantity: "50", unitCost: "99.00" },
      { kind: "purchase", quantity: "100", unitCost: "10.00", voidedAt: new Date() },
    ]);
    expect(avg).toBe(23);
  });

  it("leaves an unknown movement out of the balance", () => {
    expect(feedBalance([{ kind: "transfer", quantity: "40" }])).toBe(0);
    expect(feedIsLow(10, null)).toBe(false);
  });
});
