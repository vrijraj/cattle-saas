import { describe, expect, it } from "vitest";
import {
  canExportReport,
  canManageIsolation,
  canOverrideStatus,
  canReadAlert,
  canRecordAi,
  canRecordHeat,
  canRecordVaccine,
  canResolveAlert,
  canViewReports,
  canVoidRecord,
} from "./permissions";

describe("alert visibility & resolution", () => {
  it("gives each role the alerts that belong to that work", () => {
    expect(canReadAlert(["worker"], "milk_drop")).toBe(true);
    expect(canReadAlert(["worker"], "withdrawal")).toBe(true);
    expect(canReadAlert(["worker"], "vaccine_due")).toBe(false);
    expect(canReadAlert(["worker"], "dry_off")).toBe(false);
    expect(canReadAlert(["genetics"], "dry_off")).toBe(true);
    expect(canReadAlert(["genetics"], "milk_drop")).toBe(false);
    expect(canReadAlert(["genetics"], "medication_due")).toBe(false);
    expect(canReadAlert(["ai_technician"], "pd_due")).toBe(true);
    expect(canReadAlert(["ai_technician"], "custom")).toBe(true);
    expect(canReadAlert(["ai_technician"], "milk_drop")).toBe(false);
    expect(canReadAlert(["accountant"], "finance")).toBe(true);
    expect(canReadAlert(["accountant"], "vaccine_due")).toBe(false);
    expect(canReadAlert(["vet"], "vaccine_due")).toBe(true);
    expect(canReadAlert(["vet"], "low_feed")).toBe(false);
    expect(canReadAlert(["owner"], "low_feed")).toBe(true);
  });

  it("gates alert resolution per role", () => {
    expect(canResolveAlert(["worker"], "milk_drop")).toBe(false);
    expect(canResolveAlert(["vet"], "vaccine_due")).toBe(true);
    expect(canResolveAlert(["vet"], "finance")).toBe(false);
    expect(canResolveAlert(["accountant"], "finance")).toBe(true);
    expect(canResolveAlert(["ai_technician"], "pd_due")).toBe(true);
    expect(canResolveAlert(["manager"], "low_feed")).toBe(true);
  });
});

describe("granular PRD §30 RBAC", () => {
  it("enforces report access without duplicate-role bypass", () => {
    expect(canViewReports(["worker"])).toBe(false);
    expect(canViewReports(["worker", "worker"])).toBe(false);
    expect(canViewReports(["vet"])).toBe(true);
    expect(canExportReport(["vet"], "health")).toBe(true);
    expect(canExportReport(["vet"], "finance")).toBe(false);
    expect(canExportReport(["ai_technician"], "breeding")).toBe(true);
    expect(canExportReport(["ai_technician"], "milk")).toBe(false);
    expect(canExportReport(["accountant"], "finance")).toBe(true);
    expect(canExportReport(["accountant"], "cattle")).toBe(false);
    expect(canExportReport(["manager"], "finance")).toBe(false);
    expect(canExportReport(["manager"], "cattle")).toBe(true);
    expect(canExportReport(["genetics"], "genetics")).toBe(true);
    expect(canExportReport(["genetics"], "health")).toBe(false);
    expect(canExportReport(["owner"], "finance")).toBe(true);
  });

  it("enforces breeding, vaccine, isolation, and status override separation", () => {
    expect(canRecordHeat(["worker"])).toBe(true);
    expect(canRecordAi(["worker"])).toBe(false);
    expect(canRecordAi(["vet"])).toBe(false);
    expect(canRecordAi(["ai_technician"])).toBe(true);
    expect(canManageIsolation(["vet"])).toBe(true);
    expect(canManageIsolation(["genetics"])).toBe(false);
    expect(canOverrideStatus(["genetics"])).toBe(false);
    expect(canOverrideStatus(["manager"])).toBe(true);
    expect(canRecordVaccine(["worker"], false)).toBe(false);
    expect(canRecordVaccine(["worker"], true)).toBe(true);
  });

  it("enforces ownership and 24-hour window on voiding", () => {
    const now = Date.parse("2026-11-25T12:00:00Z");
    const within24h = new Date("2026-11-25T06:00:00Z");
    const olderThan24h = new Date("2026-11-24T00:00:00Z");

    expect(canVoidRecord(["worker"], "milk", "u1", "u1", within24h, now)).toBe(true);
    expect(canVoidRecord(["worker"], "milk", "u1", "u1", olderThan24h, now)).toBe(false);
    expect(canVoidRecord(["worker"], "milk", "u2", "u1", within24h, now)).toBe(false);
    expect(canVoidRecord(["vet"], "health", "u1", "u1", olderThan24h, now)).toBe(true);
    expect(canVoidRecord(["vet"], "health", "u2", "u1", within24h, now)).toBe(false);
    expect(canVoidRecord(["manager"], "milk", "u2", "u1", olderThan24h, now)).toBe(true);
  });
});
