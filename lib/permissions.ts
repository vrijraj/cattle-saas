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
const MILK_WRITE: Role[] = ["owner", "manager", "worker", "admin"];
const ALERT_VIEW: Role[] = ["owner", "manager", "vet", "ai_technician", "genetics", "admin", "worker"];

export function hasRole(roles: string[], allowed: readonly Role[]) {
  return roles.some((role) => allowed.includes(role as Role));
}

export function canWriteAnimals(roles: string[]) {
  return hasRole(roles, ANIMAL_WRITE);
}

export function canWriteMilk(roles: string[]) {
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

const BREEDING: Role[] = ["owner", "manager", "vet", "ai_technician", "admin"];
const HEALTH: Role[] = ["owner", "manager", "vet", "admin"];
const FINANCE: Role[] = ["owner", "accountant", "admin"];
const GENETICS: Role[] = ["owner", "manager", "genetics", "admin"];
const PUBLISH: Role[] = ["owner", "manager", "genetics", "admin"];

export function canRecordBreeding(roles: string[]) {
  return hasRole(roles, BREEDING);
}

export function canRecordHealth(roles: string[]) {
  return hasRole(roles, HEALTH);
}

export function canViewHealth(roles: string[]) {
  return hasRole(roles, ["owner", "manager", "vet", "genetics", "admin"]);
}

export function canSeeClinical(roles: string[]) {
  return hasRole(roles, ["owner", "manager", "vet", "admin"]);
}

const CLINICAL_ALERTS = new Set(["medication_due", "health_followup"]);

export function canReadAlert(roles: string[], type: string) {
  return canSeeClinical(roles) || !CLINICAL_ALERTS.has(type);
}

export function canRecordFinance(roles: string[]) {
  return hasRole(roles, FINANCE);
}

export function canViewFinance(roles: string[]) {
  return hasRole(roles, ["owner", "manager", "accountant", "admin"]);
}

export function canUseGenetics(roles: string[]) {
  return hasRole(roles, GENETICS);
}

export function canViewGenetics(roles: string[]) {
  return hasRole(roles, ["owner", "manager", "vet", "ai_technician", "genetics", "admin"]);
}

export function canVoidMatingNote(roles: string[], actorId: string | null, userId: string) {
  if (hasRole(roles, ["owner", "manager", "admin"])) return true;
  return roles.includes("genetics") && actorId === userId;
}

export function canPublish(roles: string[]) {
  return hasRole(roles, PUBLISH);
}

export function canManageTeam(roles: string[]) {
  return hasRole(roles, ["owner", "admin"]);
}

export function canViewAudit(roles: string[]) {
  return hasRole(roles, ["owner", "manager", "admin"]);
}

export function canViewReports(roles: string[]) {
  return !(roles.length === 1 && roles[0] === "worker");
}
