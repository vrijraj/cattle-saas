import { formatDisplayDate } from "@/lib/dates";

const actions: Record<string, string> = {
  create: "Create",
  update: "Update",
  void: "Void",
  export: "Export",
};

const entities: Record<string, string> = {
  animal: "Animal",
  heat: "Heat",
  insemination: "Insemination",
  pregnancy_check: "Pregnancy check",
  calving: "Calving",
  dry_off: "Dry-off",
  health: "Treatment",
  vaccination: "Vaccine",
  deworming: "Deworming",
  isolation: "Isolation",
  milk: "Milk",
  finance: "Finance",
  semen: "Semen",
  bull: "Bull",
  embryo: "Embryo",
  flush: "Embryo collection",
  mating_check: "Mating check",
  alert: "Alert",
  notification: "Reminder",
  export: "Report",
  location: "Location",
  location_move: "Shed move",
  order: "Order",
};

const changeLabels: Record<string, string> = {
  format: "Format",
  kind: "Report",
  from: "From",
  to: "To",
  presence: "Presence",
  sex: "Sex",
  status: "Status",
  morning: "Morning",
  evening: "Evening",
  recordedOn: "Date",
  voidReason: "Reason",
};

const destinations: Record<string, string> = {
  export: "/reports",
  finance: "/finance",
  alert: "/alerts",
  notification: "/alerts",
  bull: "/semen",
  semen: "/semen",
  embryo: "/embryos",
  flush: "/embryos",
  location: "/locations",
  location_move: "/locations",
  order: "/shop",
  health: "/health",
  vaccination: "/health",
  deworming: "/health",
  isolation: "/health",
  heat: "/breeding",
  insemination: "/breeding",
  pregnancy_check: "/breeding",
  calving: "/breeding",
  dry_off: "/breeding",
  mating_check: "/breeding",
  milk: "/milk",
  animal: "/animals",
};

export function auditActionLabel(action: string) {
  return actions[action] ?? title(action);
}

export function auditEntityLabel(entity: string) {
  return entities[entity] ?? title(entity.replaceAll("_", " "));
}

export function auditRecordHref(entity: string, after: unknown) {
  if (entity === "export") {
    const kind = record(after).kind;
    return typeof kind === "string" && kind ? `/reports?tab=${encodeURIComponent(kind)}` : "/reports";
  }
  return destinations[entity] ?? null;
}

export function auditChange(after: unknown) {
  return Object.entries(record(after))
    .filter((entry): entry is [string, string | number | boolean] => {
      const value = entry[1];
      if (value == null || value === "" || typeof value === "object") return false;
      if (/id$/i.test(entry[0])) return false;
      return !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value));
    })
    .slice(0, 6)
    .map(([key, value]) => {
      const text = String(value);
      const shown = /^\d{4}-\d{2}-\d{2}$/.test(text) ? formatDisplayDate(text) : text.length > 80 ? `${text.slice(0, 77)}...` : text;
      return `${changeLabels[key] ?? title(key)} ${shown}`;
    })
    .join(" · ");
}

export function auditWindow(from?: string, to?: string) {
  const start = iso(from);
  const end = iso(to);
  if (start && end && start > end) return { from: end, to: start };
  return { from: start, to: end };
}

export function zonedDayBounds(day: string, timeZone: string) {
  return { start: zonedMidnight(day, timeZone), end: zonedMidnight(nextDay(day), timeZone) };
}

function zonedMidnight(day: string, timeZone: string) {
  const utc = new Date(`${day}T00:00:00Z`);
  return new Date(utc.getTime() - zoneOffsetMs(utc, timeZone));
}

function zoneOffsetMs(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const hour = value("hour") === 24 ? 0 : value("hour");
  return Date.UTC(value("year"), value("month") - 1, value("day"), hour, value("minute"), value("second")) - instant.getTime();
}

function nextDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  const stamp = new Date(Date.UTC(year, month - 1, date));
  stamp.setUTCDate(stamp.getUTCDate() + 1);
  return stamp.toISOString().slice(0, 10);
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function iso(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
