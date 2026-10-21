import { describe, expect, it } from "vitest";
import { chartFor, inReportRange, reportCharts, reportFacts, reportWindow } from "./report-data";

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

  it("summarises milk, cattle, and finance without counting a voided amount", () => {
    const milk = [
      ["21 Oct 2026", "MIL-GIR-001", "Jamuna", "3.0", "4.0", "7.0"],
      ["20 Oct 2026", "MIL-GIR-001", "Jamuna", "6.0", "6.0", "12.0"],
    ];
    expect(reportFacts("milk", milk)).toEqual([
      { label: "Litres", value: "19.0" },
      { label: "Morning", value: "9.0" },
      { label: "Evening", value: "10.0" },
      { label: "Animals", value: "1" },
    ]);
    expect(reportCharts("milk", milk).map((chart) => chart.title)).toEqual(["Litres by day", "Litres by animal", "Session"]);
    expect(reportCharts("milk", milk)[0]?.items.map((item) => item.label)).toEqual(["20 Oct 2026", "21 Oct 2026"]);

    expect(reportFacts("cattle", [["MIL-GIR-001", "Jamuna", "Gir", "Female", "", "On farm", "Cow", "Open", "Lactating"]])).toMatchObject([
      { label: "Animals", value: "1" },
      { label: "On farm", value: "1" },
      { label: "Lactating", value: "1" },
      { label: "Pregnant", value: "0" },
    ]);

    expect(reportFacts("finance", [["21 Oct 2026", "Income", "Feed", "120.00", "Whole farm", "", "Voided"]])).toEqual([
      { label: "Income", value: "₹0.00" },
      { label: "Expense", value: "₹0.00" },
      { label: "Balance", value: "₹0.00" },
      { label: "Voided", value: "1" },
    ]);
  });
});
