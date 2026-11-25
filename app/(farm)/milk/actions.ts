"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { alerts, animals, farms, milkPriceHistory, milkYields } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { farmToday, formatDisplayDate, parseFarmDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canManageSettings, canWriteMilk } from "@/lib/permissions";
import { syncMilkDrops } from "@/lib/sync-milk-drops";

function parseLitres(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return { litres: null as string | null };
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0 || amount > 80) return { error: true as const };
  return { litres: amount.toFixed(1) };
}

function parsePercent(value: FormDataEntryValue | null, max = 15) {
  const text = String(value ?? "").trim();
  if (!text) return { value: null as string | null };
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0 || amount > max) return { error: true as const };
  return { value: amount.toFixed(2) };
}

const VALID_CMT = new Set(["", "negative", "trace", "1+", "2+", "3+"]);

function milkPath(recordedOn: string, today: string, extra: Record<string, string>) {
  const params = new URLSearchParams(extra);
  if (recordedOn !== today) params.set("date", recordedOn);
  const query = params.toString();
  return query ? `/milk?${query}` : "/milk";
}

export async function saveMilk(formData: FormData) {
  const farm = await requireFarm();
  if (!canWriteMilk(farm.roles)) redirect("/milk?error=role");

  const today = farmToday(farm.timezone);
  const recordedOn = parseFarmDate(String(formData.get("recordedOn") ?? ""));
  if (!recordedOn || recordedOn > today) redirect("/milk?error=date");
  const [herd, existingRows] = await Promise.all([
    db
      .select({ id: animals.id, code: animals.code })
      .from(animals)
      .where(and(eq(animals.farmId, farm.farmId), eq(animals.presence, "on_farm"), eq(animals.lactation, "lactating"))),
    db
      .select()
      .from(milkYields)
      .where(and(eq(milkYields.farmId, farm.farmId), eq(milkYields.recordedOn, recordedOn))),
  ]);
  const existingByAnimal = new Map(existingRows.map((row) => [row.animalId, row]));

  const rows: {
    id: string;
    code: string;
    morning: string | null;
    evening: string | null;
    fatPercent: string | null;
    snfPercent: string | null;
    cmtScore: string | null;
  }[] = [];

  for (const animal of herd) {
    const morning = parseLitres(formData.get(`morning-${animal.id}`));
    const evening = parseLitres(formData.get(`evening-${animal.id}`));
    const fat = parsePercent(formData.get(`fat-${animal.id}`), 15);
    const snf = parsePercent(formData.get(`snf-${animal.id}`), 15);
    const cmtRaw = String(formData.get(`cmt-${animal.id}`) ?? "").trim();
    if ("error" in morning || "error" in evening || "error" in fat || "error" in snf || !VALID_CMT.has(cmtRaw)) {
      redirect(milkPath(recordedOn, today, { error: "range" }));
    }
    const prev = existingByAnimal.get(animal.id);
    const hasQualityField = formData.has(`fat-${animal.id}`) || formData.has(`snf-${animal.id}`) || formData.has(`cmt-${animal.id}`);
    rows.push({
      id: animal.id,
      code: animal.code,
      morning: morning.litres,
      evening: evening.litres,
      fatPercent: hasQualityField ? fat.value : (prev?.fatPercent ?? null),
      snfPercent: hasQualityField ? snf.value : (prev?.snfPercent ?? null),
      cmtScore: hasQualityField ? (cmtRaw || null) : (prev?.cmtScore ?? null),
    });
  }

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const prev = existingByAnimal.get(row.id);
      if (row.morning === null && row.evening === null) continue;
      if (
        prev &&
        !prev.voidedAt &&
        prev.morningLitres === row.morning &&
        prev.eveningLitres === row.evening &&
        prev.fatPercent === row.fatPercent &&
        prev.snfPercent === row.snfPercent &&
        prev.cmtScore === row.cmtScore
      ) {
        continue;
      }

      const [saved] = await tx
        .insert(milkYields)
        .values({
          farmId: farm.farmId,
          animalId: row.id,
          recordedOn,
          morningLitres: row.morning,
          eveningLitres: row.evening,
          fatPercent: row.fatPercent,
          snfPercent: row.snfPercent,
          cmtScore: row.cmtScore,
          createdBy: farm.userId,
        })
        .onConflictDoUpdate({
          target: [milkYields.animalId, milkYields.recordedOn],
          set: {
            morningLitres: row.morning,
            eveningLitres: row.evening,
            fatPercent: row.fatPercent,
            snfPercent: row.snfPercent,
            cmtScore: row.cmtScore,
            voidedAt: null,
            voidReason: null,
            voidedBy: null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: milkYields.id });

      await writeAudit(tx, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: prev ? "update" : "create",
        entity: "milk",
        entityId: saved.id,
        summary: `Milk for ${row.code} on ${formatDisplayDate(recordedOn)}: ${[
          row.morning ? `${row.morning} L morning` : "",
          row.evening ? `${row.evening} L evening` : "",
          row.fatPercent ? `Fat ${row.fatPercent}%` : "",
          row.snfPercent ? `SNF ${row.snfPercent}%` : "",
          row.cmtScore ? `CMT ${row.cmtScore}` : "",
        ]
          .filter(Boolean)
          .join(", ")}`,
        before: prev ? { recordedOn, morning: prev.morningLitres, evening: prev.eveningLitres, fat: prev.fatPercent, snf: prev.snfPercent, cmt: prev.cmtScore } : null,
        after: { recordedOn, morning: row.morning, evening: row.evening, fat: row.fatPercent, snf: row.snfPercent, cmt: row.cmtScore },
      });

      if ((row.cmtScore === "2+" || row.cmtScore === "3+") && prev?.cmtScore !== row.cmtScore) {
        await tx.insert(alerts).values({
          farmId: farm.farmId,
          animalId: row.id,
          type: "health_followup",
          title: `CMT mastitis screen ${row.cmtScore} · ${row.code}`,
          body: `${row.code} scored CMT ${row.cmtScore} on ${recordedOn}. Inspect quarters and consider veterinary evaluation.`,
          dueOn: recordedOn,
        });
      }
    }
  });

  await syncMilkDrops(farm.farmId, recordedOn);
  redirect(milkPath(recordedOn, today, { saved: "1" }));
}

export async function clearMilkRow(formData: FormData) {
  const farm = await requireFarm();
  if (!canWriteMilk(farm.roles)) redirect("/milk?error=role");
  const today = farmToday(farm.timezone);
  const recordedOn = parseFarmDate(String(formData.get("recordedOn") ?? ""));
  const animalId = String(formData.get("clearAnimalId") ?? "").trim();
  if (!recordedOn || !animalId) redirect("/milk?error=date");

  const [row] = await db
    .select()
    .from(milkYields)
    .where(and(eq(milkYields.farmId, farm.farmId), eq(milkYields.animalId, animalId), eq(milkYields.recordedOn, recordedOn)))
    .limit(1);
  if (row && !row.voidedAt) {
    await db.transaction(async (tx) => {
      await tx
        .update(milkYields)
        .set({ voidedAt: new Date(), voidReason: "Cleared from milk sheet", voidedBy: farm.userId })
        .where(and(eq(milkYields.id, row.id), eq(milkYields.farmId, farm.farmId)));
      await writeAudit(tx, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "void",
        entity: "milk",
        entityId: row.id,
        summary: `Cleared milk entry on ${formatDisplayDate(recordedOn)}`,
        before: { morning: row.morningLitres, evening: row.eveningLitres },
      });
    });
    await syncMilkDrops(farm.farmId, recordedOn);
  }
  redirect(milkPath(recordedOn, today, { saved: "1" }));
}

export async function saveMilkPriceRule(formData: FormData) {
  const farm = await requireFarm();
  if (!canManageSettings(farm.roles)) redirect("/milk?error=role");

  const effectiveFrom = parseFarmDate(String(formData.get("effectiveFrom") ?? ""));
  const price = Number(String(formData.get("pricePerLitre") ?? "").trim());
  const fatBonusRaw = String(formData.get("fatBonusPerPoint") ?? "").trim();
  const snfBonusRaw = String(formData.get("snfBonusPerPoint") ?? "").trim();
  const fatBonus = fatBonusRaw ? Number(fatBonusRaw) : null;
  const snfBonus = snfBonusRaw ? Number(snfBonusRaw) : null;
  const note = String(formData.get("note") ?? "").trim().slice(0, 160) || null;

  if (
    !effectiveFrom ||
    !Number.isFinite(price) ||
    price < 0 ||
    price > 1000 ||
    (fatBonus !== null && (!Number.isFinite(fatBonus) || fatBonus < -100 || fatBonus > 100)) ||
    (snfBonus !== null && (!Number.isFinite(snfBonus) || snfBonus < -100 || snfBonus > 100))
  ) {
    redirect("/milk?error=settings");
  }

  await db.transaction(async (tx) => {
    const [saved] = await tx
      .insert(milkPriceHistory)
      .values({
        farmId: farm.farmId,
        effectiveFrom,
        pricePerLitre: price.toFixed(2),
        fatBonusPerPoint: fatBonus !== null ? fatBonus.toFixed(2) : null,
        snfBonusPerPoint: snfBonus !== null ? snfBonus.toFixed(2) : null,
        note,
        createdBy: farm.userId,
      })
      .onConflictDoUpdate({
        target: [milkPriceHistory.farmId, milkPriceHistory.effectiveFrom],
        set: {
          pricePerLitre: price.toFixed(2),
          fatBonusPerPoint: fatBonus !== null ? fatBonus.toFixed(2) : null,
          snfBonusPerPoint: snfBonus !== null ? snfBonus.toFixed(2) : null,
          note,
        },
      })
      .returning({ id: milkPriceHistory.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "milk_price",
      entityId: saved.id,
      summary: `Set milk rate ₹${price.toFixed(2)}/L effective ${effectiveFrom}`,
      after: { effectiveFrom, pricePerLitre: price.toFixed(2), fatBonus, snfBonus },
    });
  });
  redirect("/milk?settings=1");
}

export async function saveMilkSettings(formData: FormData) {
  const farm = await requireFarm();
  if (!canManageSettings(farm.roles)) redirect("/milk?error=role");
  const priceText = String(formData.get("milkPricePerLitre") ?? "").trim();
  const dropText = String(formData.get("milkDropPercent") ?? "").trim();
  const price = priceText ? Number(priceText) : null;
  const dropPercent = Number(dropText);
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 1000)) redirect("/milk?error=settings");
  if (!Number.isFinite(dropPercent) || dropPercent < 5 || dropPercent > 90) redirect("/milk?error=settings");
  const requireBoth = formData.get("requireBothMilkSessions") === "on";

  const roundedDrop = Math.round(dropPercent);
  const formattedPrice = price !== null ? price.toFixed(2) : null;
  await db.transaction(async (tx) => {
    await tx
      .update(farms)
      .set({
        milkPricePerLitre: formattedPrice,
        milkDropPercent: roundedDrop,
        requireBothMilkSessions: requireBoth,
      })
      .where(eq(farms.id, farm.farmId));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "farm_milk_settings",
      entityId: farm.farmId,
      summary: `Milk settings updated: ${formattedPrice ? `₹${formattedPrice}/L` : "price unset"} · ${roundedDrop}% drop threshold`,
      before: {
        milkPricePerLitre: farm.milkPricePerLitre,
        milkDropPercent: farm.milkDropPercent,
        requireBothMilkSessions: farm.requireBothMilkSessions,
      },
      after: { milkPricePerLitre: formattedPrice, milkDropPercent: roundedDrop, requireBothMilkSessions: requireBoth },
    });
  });

  await syncMilkDrops(farm.farmId, farmToday(farm.timezone));
  redirect("/milk?settings=1");
}
