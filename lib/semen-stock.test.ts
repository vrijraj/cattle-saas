import { describe, expect, it } from "vitest";
import { strawCounts } from "./semen-stock";

describe("semen stock", () => {
  it("counts received straws into used and balance", () => {
    const counts = strawCounts([{ status: "available" }, { status: "used" }]);
    expect(counts.available).toBe(1);
    expect(counts.used).toBe(1);
    expect(counts.discarded).toBe(0);
    expect(counts.transferred).toBe(0);
  });
});
