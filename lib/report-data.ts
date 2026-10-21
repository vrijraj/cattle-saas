import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  animals,
  breeds,
  bulls,
  calvings,
  dewormings,
  embryos,
  feedItems,
  feedMovements,
  financeEntries,
  healthEvents,
  inseminations,
  locations,
  milkYields,
  pregnancyChecks,
  semenBatches,
  straws,
  vaccinations,
  weights,
} from "@/db/schema";
import { formatDisplayDate } from "@/lib/dates";
import { embryoStatusLabel, embryoStorageLabel } from "@/lib/embryo-stock";
import { feedCategoryLabel, feedKindLabel, feedSign } from "@/lib/feed-stock";
import { geneticsPerformance } from "@/lib/genetics-snapshot";
import { healthOutcome } from "@/lib/health-register";
import { lactationLabel, lifeStageLabel, presenceLabel, reproductionLabel, sexLabel } from "@/lib/labels";
import { canSeeClinical, canViewFinance, canViewGenetics, canViewHealth, canViewReports, canViewSemen, canViewSemenCost } from "@/lib/permissions";
import { semenTypeLabel, strawStatusLabel } from "@/lib/semen-stock";

export type ReportScope = {
  roles?: string[];
  from?: string;
  to?: string;
  presence?: string;
  sex?: string;
  breed?: string;
};

const dated = new Set(["breeding", "milk", "health", "feed", "weight", "finance"]);

export function canOpenReport(kind: string, roles: string[]) {
  if (!canViewReports(roles)) return false;
  if (kind === "health") return canViewHealth(roles);
  if (kind === "finance") return canViewFinance(roles);
  if (kind === "genetics" || kind === "embryos") return canViewGenetics(roles);
  if (kind === "semen") return canViewSemen(roles);
  return kind === "cattle" || kind === "breeding" || kind === "milk" || kind === "feed" || kind === "weight";
}

export function reportWindow(from?: string, to?: string) {
  const start = iso(from);
  const end = iso(to);
  if (start && end && start > end) return { from: end, to: start };
  return { from: start, to: end };
}

export function inReportRange(day: string, from?: string, to?: string) {
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function chartFor(kind: string, rows: string[][]) {
  const counted =
    kind === "cattle"
      ? countBy(rows, 2)
      : kind === "breeding"
        ? countBy(rows.filter((row) => row[0] === "Insemination"), 4)
        : kind === "weight"
          ? countBy(rows, 1)
          : kind === "health" || kind === "semen" || kind === "embryos"
            ? countBy(rows, kind === "health" ? 0 : 1)
            : kind === "genetics"
              ? sumBy(rows, (row) => row[1] || row[0], (row) => Number(row[2] || 0))
              : kind === "milk"
                ? sumBy(rows, (row) => row[0], (row) => numberOf(row[5]))
                : kind === "feed"
                  ? sumBy(rows, (row) => row[1], (row) => numberOf(row[4]))
                  : sumBy(
                      rows.filter((row) => row[6] !== "Voided"),
                      (row) => row[1],
                      (row) => numberOf(row[3]),
                    );

  const top = [...counted.entries()]
    .filter(([label, value]) => label !== "" && value !== 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const max = Math.max(...top.map(([, value]) => Math.abs(value)), 1);
  return top.map(([label, value]) => ({
    label,
    display: chartValue(kind, value),
    width: Math.max(6, Math.round((Math.abs(value) / max) * 100)),
  }));
}

export async function reportRows(kind: string, farmId: string, scope: ReportScope = {}) {
  const roles = scope.roles ?? [];
  const window = dated.has(kind) ? reportWindow(scope.from, scope.to) : { from: undefined, to: undefined };
  if (kind === "cattle") return cattleRows(farmId, scope);
  if (kind === "breeding") return breedingRows(farmId, window);
  if (kind === "milk") return milkRows(farmId, window);
  if (kind === "health") return healthRows(farmId, window, canSeeClinical(roles));
  if (kind === "feed") return feedRows(farmId, window);
  if (kind === "semen") return semenRows(farmId, canViewSemenCost(roles));
  if (kind === "finance") return financeRows(farmId, window);
  if (kind === "weight") return weightRows(farmId, window);
  if (kind === "embryos") return embryoRows(farmId);
  if (kind === "genetics") return geneticsRows(farmId);
  return null;
}

async function cattleRows(farmId: string, scope: ReportScope) {
  const [herd, breedRows, sheds, weighed] = await Promise.all([
    db.select().from(animals).where(eq(animals.farmId, farmId)),
    db.select().from(breeds).where(eq(breeds.farmId, farmId)),
    db.select().from(locations).where(eq(locations.farmId, farmId)),
    db.select().from(weights).where(eq(weights.farmId, farmId)),
  ]);
  const breedName = new Map(breedRows.map((breed) => [breed.id, breed.name]));
  const shedName = new Map(sheds.map((shed) => [shed.id, shed.name]));
  const named = new Map(herd.map((animal) => [animal.id, animal]));
  const latest = new Map<string, { weighedOn: string; kilograms: string }>();
  for (const row of [...weighed].sort((a, b) => a.weighedOn.localeCompare(b.weighedOn))) {
    latest.set(row.animalId, row);
  }
  const showPrice = canViewFinance(scope.roles ?? []);
  const presence = scope.presence && scope.presence in presenceLabel ? scope.presence : "";
  const sex = scope.sex && scope.sex in sexLabel ? scope.sex : "";
  const rows = herd
    .filter((animal) => !presence || animal.presence === presence)
    .filter((animal) => !sex || animal.sex === sex)
    .filter((animal) => !scope.breed || animal.breedId === scope.breed)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((animal) => {
      const dam = animal.geneticDamId ? named.get(animal.geneticDamId) : undefined;
      const weight = latest.get(animal.id);
      const row = [
        animal.code,
        animal.name ?? "",
        breedName.get(animal.breedId) ?? "",
        sexLabel[animal.sex],
        animal.dob ? `${formatDisplayDate(animal.dob)}${animal.dobEstimated ? " estimated" : ""}` : "",
        presenceLabel[animal.presence],
        lifeStageLabel[animal.lifeStage],
        reproductionLabel[animal.reproduction],
        lactationLabel[animal.lactation],
        animal.locationId ? shedName.get(animal.locationId) ?? "" : "",
        joinName(animal.geneticSireName, animal.geneticSireCode),
        dam ? joinName(dam.name, dam.code) : "",
        animal.earTag ?? "",
        weight?.kilograms ?? "",
        weight ? formatDisplayDate(weight.weighedOn) : "",
      ];
      if (showPrice) row.push(animal.purchasePrice ?? "");
      return row;
    });
  return [
    ["Code", "Name", "Breed", "Sex", "Date of birth", "Presence", "Stage", "Reproduction", "Lactation", "Location", "Sire", "Dam", "Ear tag", "Latest weight", "Weighed on", ...(showPrice ? ["Purchase price"] : [])],
    ...rows,
  ];
}

async function breedingRows(farmId: string, window: { from?: string; to?: string }) {
  const [herd, services, checks, births] = await Promise.all([
    db.select().from(animals).where(eq(animals.farmId, farmId)),
    db.select().from(inseminations).where(eq(inseminations.farmId, farmId)),
    db.select().from(pregnancyChecks).where(eq(pregnancyChecks.farmId, farmId)),
    db.select().from(calvings).where(eq(calvings.farmId, farmId)),
  ]);
  const named = new Map(herd.map((animal) => [animal.id, animal]));
  const serviceById = new Map(services.map((row) => [row.id, row]));
  const lines = [
    ...services.filter((row) => !row.voidedAt && inReportRange(row.performedOn, window.from, window.to)).map((row) => ({
      date: row.performedOn,
      cells: ["Insemination", formatDisplayDate(row.performedOn), named.get(row.animalId)?.code ?? "", named.get(row.animalId)?.name ?? "", joinName(row.bullName, row.bullCode), [row.strawCode, `Attempt ${row.attemptNumber}`, row.technicianName].filter(Boolean).join(" · ")],
    })),
    ...checks.filter((row) => !row.voidedAt && inReportRange(row.checkedOn, window.from, window.to)).map((row) => ({
      date: row.checkedOn,
      cells: ["Pregnancy check", formatDisplayDate(row.checkedOn), named.get(row.animalId)?.code ?? "", named.get(row.animalId)?.name ?? "", "", [resultLabel(row.result), row.method].filter(Boolean).join(" · ")],
    })),
    ...births.filter((row) => !row.voidedAt && inReportRange(row.calvedOn, window.from, window.to)).map((row) => {
      const service = row.inseminationId ? serviceById.get(row.inseminationId) : undefined;
      const calf = row.calfId ? named.get(row.calfId) : undefined;
      return {
        date: row.calvedOn,
        cells: ["Calving", formatDisplayDate(row.calvedOn), named.get(row.damId)?.code ?? "", named.get(row.damId)?.name ?? "", service ? joinName(service.bullName, service.bullCode) : "", [row.outcome === "live" ? "Live calf" : row.outcome, calf?.code].filter(Boolean).join(" · ")],
      };
    }),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return [["Register", "Date", "Code", "Name", "Bull", "Detail"], ...lines.map((line) => line.cells)];
}

async function milkRows(farmId: string, window: { from?: string; to?: string }) {
  const [herd, yields] = await Promise.all([
    db.select({ id: animals.id, code: animals.code, name: animals.name }).from(animals).where(eq(animals.farmId, farmId)),
    db.select().from(milkYields).where(eq(milkYields.farmId, farmId)),
  ]);
  const named = new Map(herd.map((animal) => [animal.id, animal]));
  const rows = yields
    .filter((row) => !row.voidedAt && inReportRange(row.recordedOn, window.from, window.to))
    .sort((a, b) => b.recordedOn.localeCompare(a.recordedOn) || (named.get(a.animalId)?.code ?? "").localeCompare(named.get(b.animalId)?.code ?? ""))
    .map((row) => {
      const morning = Number(row.morningLitres ?? 0);
      const evening = Number(row.eveningLitres ?? 0);
      return [formatDisplayDate(row.recordedOn), named.get(row.animalId)?.code ?? "", named.get(row.animalId)?.name ?? "", morning.toFixed(1), evening.toFixed(1), (morning + evening).toFixed(1)];
    });
  return [["Date", "Code", "Name", "Morning", "Evening", "Total"], ...rows];
}

async function healthRows(farmId: string, window: { from?: string; to?: string }, clinical: boolean) {
  const [herd, events, doses, worms] = await Promise.all([
    db.select({ id: animals.id, code: animals.code, name: animals.name }).from(animals).where(eq(animals.farmId, farmId)),
    clinical ? db.select().from(healthEvents).where(eq(healthEvents.farmId, farmId)) : Promise.resolve([]),
    db.select().from(vaccinations).where(eq(vaccinations.farmId, farmId)),
    db.select().from(dewormings).where(eq(dewormings.farmId, farmId)),
  ]);
  const named = new Map(herd.map((animal) => [animal.id, animal]));
  const lines = [
    ...events.filter((row) => !row.voidedAt && inReportRange(row.eventOn, window.from, window.to)).map((row) => ({
      date: row.eventOn,
      cells: ["Treatment", formatDisplayDate(row.eventOn), named.get(row.animalId)?.code ?? "", named.get(row.animalId)?.name ?? "", [row.problem, row.medicine, healthOutcome(row.outcome)].filter(Boolean).join(" · ")],
    })),
    ...doses.filter((row) => !row.voidedAt && inReportRange(row.givenOn, window.from, window.to)).map((row) => ({
      date: row.givenOn,
      cells: ["Vaccine", formatDisplayDate(row.givenOn), named.get(row.animalId)?.code ?? "", named.get(row.animalId)?.name ?? "", row.vaccine],
    })),
    ...worms.filter((row) => !row.voidedAt && inReportRange(row.givenOn, window.from, window.to)).map((row) => ({
      date: row.givenOn,
      cells: ["Deworming", formatDisplayDate(row.givenOn), named.get(row.animalId)?.code ?? "", named.get(row.animalId)?.name ?? "", row.product],
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return [["Type", "Date", "Code", "Name", "Detail"], ...lines.map((line) => line.cells)];
}

async function feedRows(farmId: string, window: { from?: string; to?: string }) {
  const [items, movements] = await Promise.all([
    db.select().from(feedItems).where(eq(feedItems.farmId, farmId)),
    db.select().from(feedMovements).where(eq(feedMovements.farmId, farmId)),
  ]);
  const named = new Map(items.map((item) => [item.id, item]));
  const rows = movements
    .filter((row) => inReportRange(row.movedOn, window.from, window.to))
    .sort((a, b) => b.movedOn.localeCompare(a.movedOn))
    .map((row) => {
      const item = named.get(row.itemId);
      const amount = Math.abs(Number(row.quantity)).toFixed(1);
      const sign = feedSign(row.kind);
      return [formatDisplayDate(row.movedOn), item?.name ?? "", feedCategoryLabel[item?.category ?? ""] ?? item?.category ?? "", feedKindLabel[row.kind] ?? row.kind, `${sign < 0 ? "-" : sign > 0 ? "+" : ""}${amount}`, item?.unit ?? "", row.note ?? ""];
    });
  return [["Date", "Item", "Category", "Movement", "Quantity", "Unit", "Detail"], ...rows];
}

async function semenRows(farmId: string, showPrice: boolean) {
  const [list, batches, bullRows] = await Promise.all([
    db.select().from(straws).where(eq(straws.farmId, farmId)),
    db.select().from(semenBatches).where(eq(semenBatches.farmId, farmId)),
    db.select().from(bulls).where(eq(bulls.farmId, farmId)),
  ]);
  const batch = new Map(batches.map((row) => [row.id, row]));
  const bull = new Map(bullRows.map((row) => [row.id, row]));
  const rows = [...list]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((row) => {
      const source = batch.get(row.batchId);
      const sire = source ? bull.get(source.bullId) : undefined;
      const cells = [row.code, strawStatusLabel(row.status), sire ? joinName(sire.name, sire.code) : "", source?.batchNumber ?? "", semenTypeLabel(source?.semenType), row.tank ?? "", row.canister ?? "", row.goblet ?? "", row.position ?? ""];
      if (showPrice) cells.push(source?.pricePerStraw ?? "");
      return cells;
    });
  return [["Straw", "Status", "Bull", "Batch", "Type", "Tank", "Canister", "Goblet", "Position", ...(showPrice ? ["Price"] : [])], ...rows];
}

async function financeRows(farmId: string, window: { from?: string; to?: string }) {
  const [entries, herd] = await Promise.all([
    db.select().from(financeEntries).where(eq(financeEntries.farmId, farmId)),
    db.select({ id: animals.id, code: animals.code, name: animals.name }).from(animals).where(eq(animals.farmId, farmId)),
  ]);
  const named = new Map(herd.map((animal) => [animal.id, animal]));
  const rows = entries
    .filter((row) => inReportRange(row.entryOn, window.from, window.to))
    .sort((a, b) => b.entryOn.localeCompare(a.entryOn))
    .map((row) => {
      const animal = row.animalId ? named.get(row.animalId) : undefined;
      return [formatDisplayDate(row.entryOn), row.kind === "income" ? "Income" : "Expense", labelWords(row.category), Number(row.amount).toFixed(2), animal ? joinName(animal.name, animal.code) : "Whole farm", row.note?.startsWith("suggested:") ? "Confirmed from records" : row.note ?? "", row.voidedAt ? "Voided" : "Active"];
    });
  return [["Date", "Type", "Category", "Amount", "Animal", "Note", "Status"], ...rows];
}

async function weightRows(farmId: string, window: { from?: string; to?: string }) {
  const rows = await db
    .select({ weighedOn: weights.weighedOn, kilograms: weights.kilograms, note: weights.note, code: animals.code, name: animals.name })
    .from(weights)
    .innerJoin(animals, eq(animals.id, weights.animalId))
    .where(eq(weights.farmId, farmId));
  const body = rows
    .filter((row) => inReportRange(row.weighedOn, window.from, window.to))
    .sort((a, b) => b.weighedOn.localeCompare(a.weighedOn))
    .map((row) => [formatDisplayDate(row.weighedOn), row.code, row.name ?? "", row.kilograms, row.note ?? ""]);
  return [["Date", "Code", "Name", "Kilograms", "Note"], ...body];
}

async function embryoRows(farmId: string) {
  const [list, herd] = await Promise.all([
    db.select().from(embryos).where(eq(embryos.farmId, farmId)),
    db.select({ id: animals.id, code: animals.code, name: animals.name }).from(animals).where(eq(animals.farmId, farmId)),
  ]);
  const named = new Map(herd.map((animal) => [animal.id, animal]));
  const rows = [...list]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((row) => {
      const donor = row.donorId ? named.get(row.donorId) : undefined;
      return [row.code, embryoStatusLabel(row.status), donor ? joinName(donor.name, donor.code) : "", row.sireCode ?? "", row.grade ?? "", embryoStorageLabel(row.storage), row.location ?? ""];
    });
  return [["Code", "Status", "Donor", "Sire", "Grade", "Storage", "Location"], ...rows];
}

async function geneticsRows(farmId: string) {
  const [herd, bullRows, births, health, milk, services, checks] = await Promise.all([
    db.select().from(animals).where(eq(animals.farmId, farmId)),
    db.select().from(bulls).where(eq(bulls.farmId, farmId)),
    db.select().from(calvings).where(eq(calvings.farmId, farmId)),
    db.select().from(healthEvents).where(eq(healthEvents.farmId, farmId)),
    db.select().from(milkYields).where(eq(milkYields.farmId, farmId)),
    db.select().from(inseminations).where(eq(inseminations.farmId, farmId)),
    db.select().from(pregnancyChecks).where(eq(pregnancyChecks.farmId, farmId)),
  ]);
  const bullName = new Map(bullRows.map((bull) => [bull.code, bull.name]));
  const animalName = new Map(herd.map((animal) => [animal.code, animal.name]));
  const rows = geneticsPerformance({ herd, births, health, milk, ais: services, checks });
  return [
    ["Sire", "Name", "Offspring", "Daughters", "Daughters in milk", "Average daily litres", "Health events", "Live births", "Conception", "Calving interval", "Animals"],
    ...rows.map((row) => [
      row.sireCode,
      bullName.get(row.sireCode) ?? animalName.get(row.sireCode) ?? "",
      String(row.offspring),
      String(row.females),
      String(row.daughtersWithMilk),
      row.averageDailyYield === null ? "" : row.averageDailyYield.toFixed(1),
      String(row.healthEvents),
      String(row.liveCalvings),
      row.mateChecks ? `${row.conceptions} of ${row.mateChecks}` : "",
      row.averageCalvingInterval === null ? "" : String(row.averageCalvingInterval),
      row.animals.map((animal) => animal.code).join(" "),
    ]),
  ];
}

function joinName(name: string | null | undefined, code: string | null | undefined) {
  if (name && code && name !== code) return `${name} · ${code}`;
  return code || name || "";
}

function labelWords(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resultLabel(value: string) {
  if (value === "pregnant") return "Pregnant";
  if (value === "not_pregnant") return "Not pregnant";
  if (value === "doubtful") return "Doubtful";
  return value;
}

function iso(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function numberOf(value: string | undefined) {
  const amount = Number((value ?? "").replaceAll(",", ""));
  return Number.isFinite(amount) ? amount : 0;
}

function countBy(rows: string[][], index: number) {
  return sumBy(rows, (row) => row[index] || "", () => 1);
}

function sumBy(rows: string[][], labelOf: (row: string[]) => string, valueOf: (row: string[]) => number) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = labelOf(row);
    totals.set(key, (totals.get(key) ?? 0) + valueOf(row));
  }
  return totals;
}

function chartValue(kind: string, value: number) {
  if (kind === "finance") {
    const amount = Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${value < 0 ? "−" : ""}₹${amount}`;
  }
  if (kind === "milk" || kind === "feed") return value.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (kind === "weight") return `${value} ${value === 1 ? "record" : "records"}`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
