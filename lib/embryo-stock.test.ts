import { describe, expect, it } from "vitest";
import { embryoCodeSeries } from "./embryo-stock";

describe("embryo codes", () => {
  it("continues the series when that day already has embryos", () => {
    expect(embryoCodeSeries(["EMB-20261021-01", "EMB-20261021-02"], "2026-10-21", 2)).toEqual(["EMB-20261021-03", "EMB-20261021-04"]);
  });
});
