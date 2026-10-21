import { describe, expect, it } from "vitest";
import { chartFor, inReportRange, reportWindow } from "./report-data";

describe("report windows", () => {
  it("keeps a day inside the chosen dates and swaps a reversed range", () => {
    expect(inReportRange("2026-10-21", "2026-10-21", "2026-10-21")).toBe(true);
    expect(inReportRange("2026-10-14", "2026-10-21", undefined)).toBe(false);
    expect(reportWindow("2026-10-21", "2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-21" });
  });
});

describe("report charts", () => {
  it("charts the active amount, the bull, and the signed feed balance", () => {
    const finance = chartFor("finance", [
      ["21 Oct 2026", "Expense", "Feed", "120.00", "Whole farm", "", "Voided"],
      ["01 Oct 2026", "Income", "Milk", "5005.00", "Whole farm", "Confirmed from records", "Active"],
    ]);
    expect(finance).toEqual([{ label: "Income", display: "₹5,005.00", width: 100 }]);

    const breeding = chartFor("breeding", [
      ["Insemination", "02 Jan 2026", "MIL-GIR-004", "Ganga", "Sagar · BULL-GIR-014", "Attempt 1"],
      ["Pregnancy check", "18 Oct 2026", "MIL-GIR-006", "Kaveri", "", "Pregnant"],
      ["Insemination", "01 Oct 2026", "MIL-HF-001", "Holi", "Sagar · BULL-GIR-014", "Attempt 1"],
    ]);
    expect(breeding[0]).toMatchObject({ label: "Sagar · BULL-GIR-014", display: "2" });

    const feed = chartFor("feed", [
      ["01 Apr 2026", "Compound cattle feed", "Concentrate", "Opening", "+1000.0", "kg", ""],
      ["10 Apr 2026", "Compound cattle feed", "Concentrate", "Purchase", "+500.0", "kg", ""],
      ["30 Apr 2026", "Compound cattle feed", "Concentrate", "Consumption", "-1200.0", "kg", ""],
      ["30 Apr 2026", "Compound cattle feed", "Concentrate", "Wastage", "-15.0", "kg", ""],
    ]);
    expect(feed[0]).toMatchObject({ label: "Compound cattle feed", display: "285.0" });
  });
});
