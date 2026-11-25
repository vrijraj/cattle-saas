"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, medicineItems, medicineMovements, vaccineProtocols } from "@/db/schema";
import { DEFAULT_INDIAN_PROTOCOLS } from "@/db/seed/pro";
import { writeAudit } from "@/lib/audit";
import { farmToday, parseFarmDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canRecordHealth, canRecordVaccine } from "@/lib/permissions";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveProtocol(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordHealth(farm.roles) && !canRecordVaccine(farm.roles, farm.canRecordVaccines)) {
    redirect("/health?tab=protocols&error=role");
  }
  const name = text(formData, "name").slice(0, 120);
  const kind = text(formData, "kind") === "deworming" ? "deworming" : "vaccine";
  const speciesRaw = text(formData, "species");
  const species = speciesRaw === "cattle" || speciesRaw === "buffalo" ? speciesRaw : "all";
  const startAgeDays = Number(text(formData, "startAgeDays") || "120");
  const repeatRaw = text(formData, "repeatEveryDays");
  const repeatEveryDays = repeatRaw ? Number(repeatRaw) : null;
  const note = text(formData, "note").slice(0, 240) || null;

  if (
    !name ||
    !Number.isInteger(startAgeDays) ||
    startAgeDays < 0 ||
    startAgeDays > 3650 ||
    (repeatEveryDays !== null && (!Number.isInteger(repeatEveryDays) || repeatEveryDays < 7 || repeatEveryDays > 1825))
  ) {
    redirect("/health?tab=protocols&error=form");
  }

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(vaccineProtocols)
      .values({
        farmId: farm.farmId,
        name,
        kind,
        species,
        startAgeDays,
        repeatEveryDays,
        active: true,
        note,
      })
      .returning({ id: vaccineProtocols.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "vaccine_protocol",
      entityId: row.id,
      summary: `Added ${kind} protocol: ${name}`,
      after: { name, kind, species, startAgeDays, repeatEveryDays },
    });
  });
  redirect("/health?tab=protocols&saved=1");
}

export async function toggleProtocol(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordHealth(farm.roles)) redirect("/health?tab=protocols&error=role");
  const id = text(formData, "id");
  const [current] = await db
    .select()
    .from(vaccineProtocols)
    .where(and(eq(vaccineProtocols.id, id), eq(vaccineProtocols.farmId, farm.farmId)))
    .limit(1);
  if (!current) redirect("/health?tab=protocols");

  await db.transaction(async (tx) => {
    await tx
      .update(vaccineProtocols)
      .set({ active: !current.active })
      .where(and(eq(vaccineProtocols.id, current.id), eq(vaccineProtocols.farmId, farm.farmId)));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "vaccine_protocol",
      entityId: current.id,
      summary: `${current.active ? "Paused" : "Activated"} protocol ${current.name}`,
      before: { active: current.active },
      after: { active: !current.active },
    });
  });
  redirect("/health?tab=protocols&saved=1");
}

export async function seedDefaultProtocols() {
  const farm = await requireFarm();
  if (!canRecordHealth(farm.roles)) redirect("/health?tab=protocols&error=role");
  const existing = await db
    .select({ name: vaccineProtocols.name })
    .from(vaccineProtocols)
    .where(eq(vaccineProtocols.farmId, farm.farmId));
  const names = new Set(existing.map((e) => e.name.toLowerCase()));
  const missing = DEFAULT_INDIAN_PROTOCOLS.filter((p) => !names.has(p.name.toLowerCase()));
  if (missing.length > 0) {
    await db.transaction(async (tx) => {
      await tx.insert(vaccineProtocols).values(
        missing.map((p) => ({
          farmId: farm.farmId,
          name: p.name,
          kind: p.kind,
          species: p.species,
          startAgeDays: p.startAgeDays,
          repeatEveryDays: p.repeatEveryDays,
          active: true,
          note: p.note,
        })),
      );
      await writeAudit(tx, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "create",
        entity: "vaccine_protocol",
        entityId: farm.farmId,
        summary: `Seeded ${missing.length} standard Indian dairy vaccination protocols`,
      });
    });
  }
  redirect("/health?tab=protocols&saved=1");
}

const MED_CATEGORIES = new Set(["antibiotic", "vaccine", "dewormer", "anti_inflammatory", "supplement", "antiseptic", "other"]);
const MED_KINDS = new Set(["opening", "purchase", "use", "wastage", "adjustment"]);

export async function saveMedicineItem(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordHealth(farm.roles)) redirect("/health?tab=pharmacy&error=role");

  const name = text(formData, "name").slice(0, 120);
  const categoryRaw = text(formData, "category") || "antibiotic";
  const category = MED_CATEGORIES.has(categoryRaw) ? categoryRaw : "other";
  const unit = text(formData, "unit").slice(0, 20) || "ml";
  const batchNumber = text(formData, "batchNumber").slice(0, 60) || null;
  const expiresRaw = text(formData, "expiresOn");
  const expiresOn = expiresRaw ? parseFarmDate(expiresRaw) : null;
  const minRaw = text(formData, "minimumQuantity");
  const minNum = minRaw ? Number(minRaw) : null;
  const costRaw = text(formData, "unitCost");
  const costNum = costRaw ? Number(costRaw) : null;
  const openingRaw = text(formData, "openingQuantity");
  const openingNum = openingRaw ? Number(openingRaw) : 0;

  if (
    !name ||
    (expiresRaw && !expiresOn) ||
    (minNum !== null && (!Number.isFinite(minNum) || minNum < 0 || minNum > 1_000_000)) ||
    (costNum !== null && (!Number.isFinite(costNum) || costNum < 0 || costNum > 1_000_000)) ||
    !Number.isFinite(openingNum) ||
    openingNum < 0 ||
    openingNum > 1_000_000
  ) {
    redirect("/health?tab=pharmacy&error=form");
  }

  const today = farmToday(farm.timezone);
  await db.transaction(async (tx) => {
    const [item] = await tx
      .insert(medicineItems)
      .values({
        farmId: farm.farmId,
        name,
        category,
        unit,
        batchNumber,
        expiresOn,
        minimumQuantity: minNum !== null ? minNum.toFixed(1) : null,
        unitCost: costNum !== null ? costNum.toFixed(2) : null,
      })
      .returning({ id: medicineItems.id });

    if (openingNum > 0) {
      await tx.insert(medicineMovements).values({
        farmId: farm.farmId,
        itemId: item.id,
        kind: "opening",
        quantity: openingNum.toFixed(1),
        unitCost: costNum !== null ? costNum.toFixed(2) : null,
        movedOn: today,
        note: "Opening stock",
        createdBy: farm.userId,
      });
    }

    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "medicine",
      entityId: item.id,
      summary: `Added medicine ${name} (${unit})`,
      after: { name, category, unit, batchNumber, expiresOn, openingNum },
    });
  });

  redirect("/health?tab=pharmacy&saved=1");
}

export async function recordMedicineMovement(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordHealth(farm.roles)) redirect("/health?tab=pharmacy&error=role");

  const itemId = text(formData, "itemId");
  const kind = text(formData, "kind");
  const qty = Number(text(formData, "quantity"));
  const unitCostRaw = text(formData, "unitCost");
  const unitCost = unitCostRaw ? Number(unitCostRaw) : null;
  const movedOn = parseFarmDate(text(formData, "movedOn") || farmToday(farm.timezone));
  const animalId = text(formData, "animalId") || null;
  const note = text(formData, "note").slice(0, 200) || null;

  if (
    !itemId ||
    !MED_KINDS.has(kind) ||
    !movedOn ||
    !Number.isFinite(qty) ||
    (kind === "adjustment" ? qty === 0 || Math.abs(qty) > 1_000_000 : qty <= 0 || qty > 1_000_000) ||
    (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > 1_000_000))
  ) {
    redirect("/health?tab=pharmacy&error=form");
  }

  const [item] = await db
    .select()
    .from(medicineItems)
    .where(and(eq(medicineItems.id, itemId), eq(medicineItems.farmId, farm.farmId)))
    .limit(1);
  if (!item) redirect("/health?tab=pharmacy&error=form");

  let verifiedAnimalId: string | null = null;
  if (animalId) {
    const [animal] = await db
      .select({ id: animals.id })
      .from(animals)
      .where(and(eq(animals.id, animalId), eq(animals.farmId, farm.farmId)))
      .limit(1);
    if (animal) verifiedAnimalId = animal.id;
  }

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(medicineMovements)
      .values({
        farmId: farm.farmId,
        itemId: item.id,
        kind,
        quantity: qty.toFixed(1),
        unitCost: unitCost !== null ? unitCost.toFixed(2) : item.unitCost,
        movedOn,
        animalId: verifiedAnimalId,
        note,
        createdBy: farm.userId,
      })
      .returning({ id: medicineMovements.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "medicine",
      entityId: row.id,
      summary: `Pharmacy ${kind}: ${item.name} (${qty.toFixed(1)} ${item.unit})`,
      after: { itemId: item.id, kind, quantity: qty.toFixed(1), movedOn, note },
    });
  });

  redirect("/health?tab=pharmacy&saved=1");
}
