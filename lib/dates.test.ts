import { describe, expect, it } from "vitest";
import { parseFarmDate } from "./dates";

describe("parseFarmDate", () => {
  it("accepts a real calendar day", () => {
    expect(parseFarmDate("2026-10-20")).toBe("2026-10-20");
  });

  it("rejects a missing, malformed, or impossible day", () => {
    expect(parseFarmDate("")).toBeNull();
    expect(parseFarmDate("20-10-2026")).toBeNull();
    expect(parseFarmDate("2026-02-31")).toBeNull();
  });
});
