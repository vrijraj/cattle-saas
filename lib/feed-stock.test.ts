import { describe, expect, it } from "vitest";
import { feedBalance, feedIsLow, feedQuantityLabel } from "./feed-stock";

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

  it("leaves an unknown movement out of the balance", () => {
    expect(feedBalance([{ kind: "transfer", quantity: "40" }])).toBe(0);
    expect(feedIsLow(10, null)).toBe(false);
  });
});
