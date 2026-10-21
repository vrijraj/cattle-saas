import { describe, expect, it } from "vitest";
import { canReadAlert } from "./permissions";

describe("alert visibility", () => {
  it("gives each role the alerts that belong to that work", () => {
    expect(canReadAlert(["worker"], "milk_drop")).toBe(true);
    expect(canReadAlert(["worker"], "vaccine_due")).toBe(false);
    expect(canReadAlert(["worker"], "dry_off")).toBe(false);
    expect(canReadAlert(["genetics"], "dry_off")).toBe(true);
    expect(canReadAlert(["genetics"], "milk_drop")).toBe(false);
    expect(canReadAlert(["genetics"], "medication_due")).toBe(false);
    expect(canReadAlert(["ai_technician"], "pd_due")).toBe(true);
    expect(canReadAlert(["ai_technician"], "milk_drop")).toBe(false);
    expect(canReadAlert(["accountant"], "finance")).toBe(true);
    expect(canReadAlert(["accountant"], "vaccine_due")).toBe(false);
    expect(canReadAlert(["vet"], "vaccine_due")).toBe(true);
    expect(canReadAlert(["vet"], "low_feed")).toBe(false);
    expect(canReadAlert(["owner"], "low_feed")).toBe(true);
  });
});
