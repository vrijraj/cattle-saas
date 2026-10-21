import { describe, expect, it } from "vitest";
import { auditChange, auditRecordHref, zonedDayBounds } from "./audit-log";

describe("audit log", () => {
  it("reads a short change and skips internal ids", () => {
    expect(
      auditChange({
        kind: "milk",
        format: "csv",
        from: "2026-10-21",
        breed: "11a3ae3d-8284-444a-8dfc-6ece312052bd",
        noteId: "hidden",
      }),
    ).toBe("Report milk · Format csv · From 21 Oct 2026");
    expect(auditRecordHref("export", { kind: "milk" })).toBe("/reports?tab=milk");
  });

  it("bounds a Kolkata day from the previous evening UTC", () => {
    const bounds = zonedDayBounds("2026-10-21", "Asia/Kolkata");
    expect(bounds.start.toISOString()).toBe("2026-10-20T18:30:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-10-21T18:30:00.000Z");
  });
});
