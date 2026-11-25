"use server";

import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { alerts, animals, breeds, dewormings, locationMoves, locations, milkYields, vaccinations } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { validateAnimalImportCsv, validateMilkImportCsv } from "@/lib/csv-import";
import { farmToday, parseFarmDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { issueAnimalCode } from "@/lib/issue-code";
import { canRecordVaccine, canWriteAnimals, canWriteMilk } from "@/lib/permissions";
import { checkAnimalQuota } from "@/lib/plans";
import { syncMilkDrops } from "@/lib/sync-milk-drops";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function bulkVaccinateOrDeworm(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordVaccine(farm.roles, farm.canRecordVaccines)) redirect("/animals/bulk?error=role");

  const kind = text(formData, "kind") === "deworming" ? "deworming" : "vaccine";
  const productName = text(formData, "productName").slice(0, 120);
  const batch = text(formData, "batch").slice(0, 60) || null;
  const today = farmToday(farm.timezone);
  const givenOn = parseFarmDate(text(formData, "givenOn") || today);
  const nextDueRaw = text(formData, "nextDueOn");
  const nextDueOn = nextDueRaw ? parseFarmDate(nextDueRaw) : null;
  const shedId = text(formData, "shedId");
  const selectedIds = formData.getAll("animalIds").map(String).filter(Boolean);

  if (!productName || !givenOn || givenOn > today || (nextDueRaw && (!nextDueOn || nextDueOn < givenOn))) {
    redirect("/animals/bulk?error=form");
  }

  let targets: { id: string; code: string }[] = [];
  if (selectedIds.length > 0) {
    targets = await db
      .select({ id: animals.id, code: animals.code })
      .from(animals)
      .where(and(eq(animals.farmId, farm.farmId), eq(animals.presence, "on_farm"), inArray(animals.id, selectedIds)));
  } else if (shedId) {
    targets = await db
      .select({ id: animals.id, code: animals.code })
      .from(animals)
      .where(and(eq(animals.farmId, farm.farmId), eq(animals.presence, "on_farm"), eq(animals.locationId, shedId)));
  }

  if (targets.length === 0) redirect("/animals/bulk?error=empty");

  await db.transaction(async (tx) => {
    if (kind === "vaccine") {
      await tx.insert(vaccinations).values(
        targets.map((a) => ({
          farmId: farm.farmId,
          animalId: a.id,
          vaccine: productName,
          batch,
          givenOn,
          nextDueOn,
          administeredBy: farm.userName,
          createdBy: farm.userId,
        })),
      );
      if (nextDueOn) {
        await tx.insert(alerts).values(
          targets.map((a) => ({
            farmId: farm.farmId,
            animalId: a.id,
            type: "vaccine_due",
            title: `Vaccination due · ${productName}`,
            body: `${a.code} ${productName} due ${nextDueOn}.`,
            dueOn: nextDueOn,
          })),
        );
      }
    } else {
      await tx.insert(dewormings).values(
        targets.map((a) => ({
          farmId: farm.farmId,
          animalId: a.id,
          product: productName,
          givenOn,
          nextDueOn,
          createdBy: farm.userId,
        })),
      );
      if (nextDueOn) {
        await tx.insert(alerts).values(
          targets.map((a) => ({
            farmId: farm.farmId,
            animalId: a.id,
            type: "deworming_due",
            title: `Deworming due · ${productName}`,
            body: `${a.code} ${productName} due ${nextDueOn}.`,
            dueOn: nextDueOn,
          })),
        );
      }
    }

    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: kind === "vaccine" ? "vaccination" : "deworming",
      entityId: farm.farmId,
      summary: `Bulk ${kind}: ${productName} recorded for ${targets.length} animals`,
      after: { kind, productName, givenOn, nextDueOn, count: targets.length },
    });
  });

  redirect(`/animals/bulk?saved=${targets.length}`);
}

export async function bulkMoveShed(formData: FormData) {
  const farm = await requireFarm();
  if (!canWriteAnimals(farm.roles)) redirect("/animals/bulk?tab=move&error=role");

  const toLocationId = text(formData, "toLocationId");
  const fromShedId = text(formData, "fromShedId");
  const selectedIds = formData.getAll("animalIds").map(String).filter(Boolean);
  const today = farmToday(farm.timezone);
  const movedOn = parseFarmDate(text(formData, "movedOn") || today);
  const note = text(formData, "note").slice(0, 160) || "Bulk shed move";

  if (!toLocationId || !movedOn || movedOn > today) redirect("/animals/bulk?tab=move&error=form");

  const [dest] = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(and(eq(locations.id, toLocationId), eq(locations.farmId, farm.farmId), eq(locations.active, true)))
    .limit(1);
  if (!dest) redirect("/animals/bulk?tab=move&error=form");

  let targets: { id: string; code: string }[] = [];
  if (selectedIds.length > 0) {
    targets = await db
      .select({ id: animals.id, code: animals.code })
      .from(animals)
      .where(and(eq(animals.farmId, farm.farmId), eq(animals.presence, "on_farm"), inArray(animals.id, selectedIds)));
  } else if (fromShedId) {
    targets = await db
      .select({ id: animals.id, code: animals.code })
      .from(animals)
      .where(and(eq(animals.farmId, farm.farmId), eq(animals.presence, "on_farm"), eq(animals.locationId, fromShedId)));
  }

  if (targets.length === 0) redirect("/animals/bulk?tab=move&error=empty");

  await db.transaction(async (tx) => {
    const ids = targets.map((a) => a.id);
    await tx
      .update(animals)
      .set({ locationId: dest.id, updatedAt: new Date() })
      .where(and(eq(animals.farmId, farm.farmId), inArray(animals.id, ids)));
    await tx.insert(locationMoves).values(
      targets.map((a) => ({
        farmId: farm.farmId,
        animalId: a.id,
        locationId: dest.id,
        movedOn,
        note,
        createdBy: farm.userId,
      })),
    );
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "location_move",
      entityId: dest.id,
      summary: `Moved ${targets.length} animals to ${dest.name}`,
      after: { locationId: dest.id, locationName: dest.name, count: targets.length },
    });
  });

  redirect(`/animals/bulk?tab=move&saved=${targets.length}`);
}

export type CsvImportResult = {
  ok?: boolean;
  imported?: number;
  skipped?: number;
  errors?: string[];
};

export async function importAnimalsCsv(_prev: CsvImportResult, formData: FormData): Promise<CsvImportResult> {
  const farm = await requireFarm();
  if (!canWriteAnimals(farm.roles)) return { ok: false, errors: ["Your role cannot add animals."] };

  const csvText = String(formData.get("csv") ?? "");
  const rows = validateAnimalImportCsv(csvText);
  if (rows.length === 0) return { ok: false, errors: ["No data rows found in CSV."] };

  const quota = await checkAnimalQuota(farm.farmId, farm.maxAnimals);
  const validRows = rows.filter((r) => r.errors.length === 0);
  if (quota.current + validRows.length > quota.limit) {
    return {
      ok: false,
      errors: [`Plan limit would be exceeded (${quota.current} on farm + ${validRows.length} rows > ${quota.limit} limit).`],
    };
  }

  const [breedList, shedList, existingAnimals] = await Promise.all([
    db.select().from(breeds).where(and(eq(breeds.farmId, farm.farmId), eq(breeds.active, true))),
    db.select().from(locations).where(and(eq(locations.farmId, farm.farmId), eq(locations.active, true))),
    db.select({ earTag: animals.earTag, rfid: animals.rfid }).from(animals).where(eq(animals.farmId, farm.farmId)),
  ]);

  const breedByCode = new Map(breedList.map((b) => [b.code.toUpperCase(), b]));
  const breedByName = new Map(breedList.map((b) => [b.name.toLowerCase(), b]));
  const shedByName = new Map(shedList.map((s) => [s.name.toLowerCase(), s]));
  const usedTags = new Set(existingAnimals.map((a) => a.earTag).filter(Boolean) as string[]);
  const usedRfids = new Set(existingAnimals.map((a) => a.rfid).filter(Boolean) as string[]);
  const today = farmToday(farm.timezone);

  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      if (row.errors.length > 0) {
        errors.push(`Line ${row.line}: ${row.errors.join("; ")}`);
        skipped += 1;
        continue;
      }
      const breed = breedByCode.get(row.breedCode) ?? breedByName.get(row.breedCode.toLowerCase());
      if (!breed) {
        errors.push(`Line ${row.line}: Unknown breed "${row.breedCode}"`);
        skipped += 1;
        continue;
      }
      if (row.earTag && usedTags.has(row.earTag)) {
        errors.push(`Line ${row.line}: Duplicate ear tag "${row.earTag}"`);
        skipped += 1;
        continue;
      }
      if (row.rfid && usedRfids.has(row.rfid)) {
        errors.push(`Line ${row.line}: Duplicate RFID "${row.rfid}"`);
        skipped += 1;
        continue;
      }

      const shed = row.shed ? shedByName.get(row.shed.toLowerCase()) : undefined;
      const code = await issueAnimalCode(tx, farm.farmId, farm.animalPrefix, breed.code);
      const [created] = await tx
        .insert(animals)
        .values({
          farmId: farm.farmId,
          code,
          name: row.name || null,
          species: breed.species,
          breedId: breed.id,
          sex: row.sex,
          dob: row.dob || null,
          earTag: row.earTag || null,
          rfid: row.rfid || null,
          locationId: shed?.id ?? null,
          lifeStage: row.lifeStage,
          lactation: row.lactation,
          reproduction: row.reproduction,
          purchasePrice: row.purchasePrice ? Number(row.purchasePrice).toFixed(2) : null,
          qrToken: randomBytes(32).toString("base64url"),
          createdBy: farm.userId,
        })
        .returning({ id: animals.id });

      if (shed) {
        await tx.insert(locationMoves).values({
          farmId: farm.farmId,
          animalId: created.id,
          locationId: shed.id,
          movedOn: today,
          note: "CSV import",
          createdBy: farm.userId,
        });
      }
      if (row.earTag) usedTags.add(row.earTag);
      if (row.rfid) usedRfids.add(row.rfid);
      imported += 1;
    }

    if (imported > 0) {
      await writeAudit(tx, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "create",
        entity: "animal",
        entityId: farm.farmId,
        summary: `CSV imported ${imported} animals (${skipped} skipped)`,
        after: { imported, skipped },
      });
    }
  });

  return { ok: true, imported, skipped, errors: errors.slice(0, 20) };
}

export async function importMilkCsv(_prev: CsvImportResult, formData: FormData): Promise<CsvImportResult> {
  const farm = await requireFarm();
  if (!canWriteMilk(farm.roles)) return { ok: false, errors: ["Your role cannot record milk."] };

  const csvText = String(formData.get("csv") ?? "");
  const rows = validateMilkImportCsv(csvText);
  if (rows.length === 0) return { ok: false, errors: ["No milk rows found in CSV."] };

  const herd = await db
    .select({ id: animals.id, code: animals.code })
    .from(animals)
    .where(eq(animals.farmId, farm.farmId));
  const byCode = new Map(herd.map((a) => [a.code.toLowerCase(), a]));
  const today = farmToday(farm.timezone);

  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;
  let latestDate = "";

  await db.transaction(async (tx) => {
    for (const row of rows) {
      if (row.errors.length > 0) {
        errors.push(`Line ${row.line}: ${row.errors.join("; ")}`);
        skipped += 1;
        continue;
      }
      if (row.recordedOn > today) {
        errors.push(`Line ${row.line}: Date ${row.recordedOn} is in the future`);
        skipped += 1;
        continue;
      }
      const animal = byCode.get(row.animalCode.toLowerCase());
      if (!animal) {
        errors.push(`Line ${row.line}: Unknown animal code "${row.animalCode}"`);
        skipped += 1;
        continue;
      }

      await tx
        .insert(milkYields)
        .values({
          farmId: farm.farmId,
          animalId: animal.id,
          recordedOn: row.recordedOn,
          morningLitres: row.morningLitres,
          eveningLitres: row.eveningLitres,
          fatPercent: row.fatPercent,
          snfPercent: row.snfPercent,
          createdBy: farm.userId,
        })
        .onConflictDoUpdate({
          target: [milkYields.animalId, milkYields.recordedOn],
          set: {
            morningLitres: row.morningLitres,
            eveningLitres: row.eveningLitres,
            fatPercent: row.fatPercent,
            snfPercent: row.snfPercent,
            voidedAt: null,
            voidReason: null,
            voidedBy: null,
            updatedAt: new Date(),
          },
        });
      imported += 1;
      if (row.recordedOn > latestDate) latestDate = row.recordedOn;
    }

    if (imported > 0) {
      await writeAudit(tx, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "create",
        entity: "milk",
        entityId: farm.farmId,
        summary: `CSV imported ${imported} milk records (${skipped} skipped)`,
        after: { imported, skipped },
      });
    }
  });

  if (latestDate) await syncMilkDrops(farm.farmId, latestDate);
  return { ok: true, imported, skipped, errors: errors.slice(0, 20) };
}
