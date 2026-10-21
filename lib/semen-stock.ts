const STATUSES = ["available", "used", "discarded", "transferred", "reserved"] as const;

export type StrawCounts = Record<(typeof STATUSES)[number], number>;

export function strawCounts(rows: { status: string }[]): StrawCounts {
  const counts: StrawCounts = { available: 0, used: 0, discarded: 0, transferred: 0, reserved: 0 };
  for (const row of rows) {
    if (row.status === "available" || row.status === "used" || row.status === "discarded" || row.status === "transferred" || row.status === "reserved") {
      counts[row.status] += 1;
    }
  }
  return counts;
}

export function semenTypeLabel(value: string | null | undefined) {
  if (value === "sexed_female") return "Sexed female";
  if (value === "sexed_male") return "Sexed male";
  if (value === "conventional") return "Conventional";
  return value || "—";
}

export function strawStatusLabel(value: string) {
  if (value === "available") return "Available";
  if (value === "used") return "Used";
  if (value === "discarded") return "Discarded";
  if (value === "transferred") return "Transferred";
  if (value === "reserved") return "Reserved";
  return value;
}
