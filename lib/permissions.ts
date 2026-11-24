export const ROLES = [
  "owner",
  "manager",
  "vet",
  "ai_technician",
  "worker",
  "accountant",
  "genetics",
  "admin",
] as const;

export type Role = (typeof ROLES)[number];

const ANIMAL_WRITE: Role[] = ["owner", "manager", "genetics", "admin"];
const STATUS_OVERRIDE: Role[] = ["owner", "manager", "admin"];
const MILK_WRITE: Role[] = ["owner", "manager", "worker", "admin"];
const ALERT_VIEW: Role[] = ["owner", "manager", "vet", "ai_technician", "genetics", "admin", "worker", "accountant"];
const HEAT_WRITE: Role[] = ["owner", "manager", "vet", "ai_technician", "worker", "admin"];
const AI_WRITE: Role[] = ["owner", "manager", "ai_technician", "admin"];
const BREEDING: Role[] = ["owner", "manager", "vet", "ai_technician", "admin"];
const HEALTH: Role[] = ["owner", "manager", "vet", "admin"];
const FINANCE: Role[] = ["owner", "accountant", "admin"];
const GENETICS: Role[] = ["owner", "manager", "genetics", "admin"];
const PUBLISH: Role[] = ["owner", "manager", "genetics", "admin"];

export function hasRole(roles: string[], allowed: readonly Role[]) {
  return roles.some((role) => allowed.includes(role as Role));
}

export function canWriteAnimals(roles: string[]) {
  return hasRole(roles, ANIMAL_WRITE);
}

export function canOverrideStatus(roles: string[]) {
  return hasRole(roles, STATUS_OVERRIDE);
}

export function canManageLocations(roles: string[]) {
  return hasRole(roles, STATUS_OVERRIDE);
}

export function canManageIsolation(roles: string[]) {
  return hasRole(roles, HEALTH);
}

export function canWriteMilk(roles: string[]) {
  return hasRole(roles, MILK_WRITE);
}

export function canRecordWeight(roles: string[]) {
  return hasRole(roles, MILK_WRITE);
}

export function canRecordFeed(roles: string[]) {
  return hasRole(roles, MILK_WRITE);
}

export function canViewHerd(roles: string[]) {
  return hasRole(roles, ROLES);
}

export function canViewAlerts(roles: string[]) {
  return hasRole(roles, ALERT_VIEW);
}

export function canRecordHeat(roles: string[]) {
  return hasRole(roles, HEAT_WRITE);
}

export function canRecordAi(roles: string[]) {
  return hasRole(roles, AI_WRITE);
}

export function canRecordPdOrCalving(roles: string[]) {
  return hasRole(roles, BREEDING);
}

export function canRecordBreeding(roles: string[]) {
  return hasRole(roles, BREEDING);
}

export function canRecordHealth(roles: string[]) {
  return hasRole(roles, HEALTH);
}

export function canRecordVaccine(roles: string[], canRecordVaccines = false) {
  return canRecordHealth(roles) || (roles.includes("worker") && canRecordVaccines);
}

export function canViewHealth(roles: string[]) {
  return hasRole(roles, ["owner", "manager", "vet", "genetics", "admin"]);
}

export function canSeeClinical(roles: string[]) {
  return hasRole(roles, ["owner", "manager", "vet", "admin"]);
}

export function canViewHeatWindow(roles: string[]) {
  return hasRole(roles, ["owner", "manager", "vet", "ai_technician", "genetics", "admin"]);
}

const CLINICAL_ALERTS = new Set(["medication_due", "health_followup"]);
const BREEDING_ALERTS = new Set(["pd_due", "ai_followup", "calving_due", "dry_off", "heat_expected"]);
const STOCK_ALERTS = new Set(["vaccine_due", "deworming_due", "deworm_due", "withdrawal", "milk_drop", "herd_milk_drop"]);

export function canReadAlert(roles: string[], type: string) {
  if (BREEDING_ALERTS.has(type)) return hasRole(roles, ["owner", "manager", "vet", "ai_technician", "genetics", "admin"]);
  if (type === "milk_drop" || type === "herd_milk_drop" || type === "withdrawal") return hasRole(roles, ["owner", "manager", "vet", "worker", "admin"]);
  if (CLINICAL_ALERTS.has(type) || STOCK_ALERTS.has(type)) return canSeeClinical(roles);
  if (type === "low_feed") return hasRole(roles, ["owner", "manager", "admin"]);
  if (type === "custom") return hasRole(roles, ["owner", "manager", "vet", "ai_technician", "admin"]);
  if (type === "finance") return hasRole(roles, ["owner", "manager", "accountant", "admin"]);
  return hasRole(roles, ["owner", "manager", "admin"]);
}

export function canResolveAlert(roles: string[], type: string) {
  if (hasRole(roles, ["owner", "manager", "admin"])) return true;
  if (BREEDING_ALERTS.has(type)) return hasRole(roles, ["vet", "ai_technician"]);
  if (type === "milk_drop" || type === "herd_milk_drop" || type === "withdrawal") return roles.includes("vet");
  if (CLINICAL_ALERTS.has(type) || STOCK_ALERTS.has(type)) return roles.includes("vet");
  if (type === "custom") return hasRole(roles, ["vet", "ai_technician"]);
  if (type === "finance") return roles.includes("accountant");
  return false;
}

export function canRecordFinance(roles: string[]) {
  return hasRole(roles, FINANCE);
}

export function canViewFinance(roles: string[]) {
  return hasRole(roles, ["owner", "manager", "accountant", "admin"]);
}

export function canViewPurchasePrice(roles: string[]) {
  return hasRole(roles, ["owner", "manager", "accountant", "genetics", "admin"]);
}

export function canUseGenetics(roles: string[]) {
  return hasRole(roles, GENETICS);
}

export function canViewGenetics(roles: string[]) {
  return hasRole(roles, ["owner", "manager", "vet", "ai_technician", "genetics", "admin"]);
}

export function canViewSemen(roles: string[]) {
  return hasRole(roles, ["owner", "manager", "vet", "ai_technician", "accountant", "genetics", "admin"]);
}

export function canViewSemenCost(roles: string[]) {
  return canViewFinance(roles) || roles.includes("genetics");
}

export function canVoidMatingNote(roles: string[], actorId: string | null, userId: string) {
  if (hasRole(roles, ["owner", "manager", "admin"])) return true;
  return roles.includes("genetics") && actorId === userId;
}

export function canPublish(roles: string[]) {
  return hasRole(roles, PUBLISH);
}

export function canViewShopAdmin(roles: string[]) {
  return hasRole(roles, ["owner", "manager", "accountant", "genetics", "admin"]);
}

export function canViewEnquiries(roles: string[]) {
  return hasRole(roles, ["owner", "manager", "genetics", "admin"]);
}

export function canManageTeam(roles: string[]) {
  return hasRole(roles, ["owner", "admin"]);
}

export function canManageSettings(roles: string[]) {
  return hasRole(roles, ["owner", "admin"]);
}

export function canViewAudit(roles: string[]) {
  return hasRole(roles, ["owner", "manager", "admin"]);
}

export function canExportPedigree(roles: string[]) {
  return hasRole(roles, ["owner", "manager", "genetics", "admin"]);
}

export function canViewReports(roles: string[]) {
  return roles.some((role) => role !== "worker" && ROLES.includes(role as Role));
}

export function canExportReport(roles: string[], kind: string) {
  if (hasRole(roles, ["owner", "admin"])) return true;
  if (roles.includes("manager") && kind !== "finance") return true;
  if (roles.includes("vet") && kind === "health") return true;
  if (roles.includes("ai_technician") && kind === "breeding") return true;
  if (roles.includes("accountant") && kind === "finance") return true;
  if (roles.includes("genetics") && ["cattle", "semen", "genetics", "embryos"].includes(kind)) return true;
  return false;
}

export function canVoidRecord(
  roles: string[],
  entity: string,
  createdBy: string | null | undefined,
  userId: string,
  createdAt?: Date | null,
  now = Date.now(),
) {
  if (hasRole(roles, ["owner", "manager", "admin"])) return true;
  const isOwnerOfRow = Boolean(createdBy && createdBy === userId);
  if (["health", "vaccine", "deworming"].includes(entity)) {
    return roles.includes("vet") && isOwnerOfRow;
  }
  if (["heat", "insemination", "pregnancy_check", "calving", "dry_off"].includes(entity)) {
    return roles.includes("ai_technician") && isOwnerOfRow;
  }
  if (["milk", "weight", "feed_movement"].includes(entity)) {
    if (!roles.includes("worker") || !isOwnerOfRow) return false;
    if (!createdAt) return true;
    return now - createdAt.getTime() <= 24 * 60 * 60 * 1000;
  }
  if (entity === "finance") {
    return roles.includes("accountant") && isOwnerOfRow;
  }
  return false;
}
