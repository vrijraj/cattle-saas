"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  alerts,
  animals,
  breeds,
  bulls,
  calvings,
  dewormings,
  dryOffs,
  embryoTransfers,
  embryos,
  feedItems,
  feedMovements,
  financeEntries,
  healthEvents,
  heats,
  inseminations,
  listings,
  locations,
  milkYields,
  pregnancyChecks,
  products,
  semenBatches,
  straws,
  vaccinations,
  weights,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { calfSireFromConception } from "@/lib/calving-sire";
import { addDays, farmToday, formatDisplayDate, parseFarmDate } from "@/lib/dates";
import { embryoCodeSeries } from "@/lib/embryo-stock";
import { requireFarm } from "@/lib/farm-context";
import { isFeedCategory, isFeedKind } from "@/lib/feed-stock";
import { canonicalCategory } from "@/lib/finance-suggestions";
import { issueAnimalCode } from "@/lib/issue-code";
import { dryOffDueOn, dryOffLeadDays } from "@/lib/lactation";
import {
  canPublish,
  canRecordAi,
  canRecordFeed,
  canRecordFinance,
  canRecordHealth,
  canRecordHeat,
  canRecordPdOrCalving,
  canRecordVaccine,
  canRecordWeight,
  canUseGenetics,
  canVoidRecord,
  canWriteMilk,
} from "@/lib/permissions";
import { detectAllowedFileType, putPrivateObject, storageConfigured } from "@/lib/storage";
import { syncMilkDrops } from "@/lib/sync-milk-drops";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function safeBack(value: string, fallback: string) {
  if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) return value;
  return fallback;
}

function appendQuery(path: string, key: string, value: string) {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

async function animalInFarm(farmId: string, animalId: string) {
  const [animal] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.id, animalId), eq(animals.farmId, farmId)))
    .limit(1);
  return animal;
}

export async function recordHeat(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordHeat(farm.roles)) redirect("/breeding?error=role");
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal || animal.sex === "male" || animal.presence !== "on_farm") redirect("/breeding?error=animal");
  const today = farmToday(farm.timezone);
  const observedOn = parseFarmDate(text(formData, "observedOn") || today);
  if (!observedOn || observedOn > today) redirect(`/animals/${encodeURIComponent(animal.code)}?tab=breeding&error=date`);
  const signs = text(formData, "signs") || "standing";

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(heats)
      .values({
        farmId: farm.farmId,
        animalId: animal.id,
        observedOn,
        signs,
        note: text(formData, "note") || null,
        createdBy: farm.userId,
      })
      .returning({ id: heats.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "heat",
      entityId: row.id,
      summary: `Heat recorded for ${animal.code}`,
      after: { observedOn, signs },
    });
  });
  redirect(`/animals/${encodeURIComponent(animal.code)}?tab=breeding&saved=1`);
}

export async function recordAi(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordAi(farm.roles)) redirect("/breeding?error=role");
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal || animal.sex === "male" || animal.presence !== "on_farm") redirect("/breeding?error=animal");
  const safeCode = encodeURIComponent(animal.code);
  const bullCodeInput = text(formData, "bullCode");
  const strawCode = text(formData, "strawCode");
  if (!bullCodeInput && !strawCode) redirect(`/animals/${safeCode}?tab=breeding&event=ai&error=bull`);
  const today = farmToday(farm.timezone);
  const performedOn = parseFarmDate(text(formData, "performedOn") || today);
  if (!performedOn || performedOn > today) redirect(`/animals/${safeCode}?tab=breeding&error=date`);

  const pdDays = animal.species === "buffalo" ? farm.pdDueDaysBuffalo : farm.pdDueDaysCattle;
  const pdDue = addDays(performedOn, pdDays);

  await db.transaction(async (tx) => {
    let resolvedBullCode = bullCodeInput;
    let resolvedBullName = text(formData, "bullName") || null;
    let resolvedBatchNumber = text(formData, "batchNumber") || null;

    if (strawCode) {
      const [straw] = await tx
        .select()
        .from(straws)
        .where(and(eq(straws.farmId, farm.farmId), eq(straws.code, strawCode)))
        .for("update")
        .limit(1);
      if (!straw || straw.status !== "available") redirect(`/animals/${safeCode}?tab=breeding&event=ai&error=straw`);
      const [batch] = await tx
        .select({
          batchNumber: semenBatches.batchNumber,
          bullCode: bulls.code,
          bullName: bulls.name,
        })
        .from(semenBatches)
        .innerJoin(bulls, eq(bulls.id, semenBatches.bullId))
        .where(and(eq(semenBatches.id, straw.batchId), eq(semenBatches.farmId, farm.farmId)))
        .limit(1);
      if (batch) {
        if (resolvedBullCode && resolvedBullCode.toLowerCase() !== batch.bullCode.toLowerCase()) {
          redirect(`/animals/${safeCode}?tab=breeding&event=ai&error=straw`);
        }
        resolvedBullCode = batch.bullCode;
        resolvedBullName = resolvedBullName || batch.bullName;
        resolvedBatchNumber = resolvedBatchNumber || batch.batchNumber;
      }
      await tx
        .update(straws)
        .set({ status: "used", usedOnAnimalId: animal.id, usedAt: new Date() })
        .where(and(eq(straws.id, straw.id), eq(straws.farmId, farm.farmId)));
    }
    if (!resolvedBullCode) redirect(`/animals/${safeCode}?tab=breeding&event=ai&error=bull`);

    const attemptInput = Number(text(formData, "attempt"));
    let attemptNumber = Number.isInteger(attemptInput) && attemptInput > 0 ? attemptInput : 0;
    if (!attemptNumber) {
      const [priorAis, priorCalvings, priorChecks] = await Promise.all([
        tx.select().from(inseminations).where(and(eq(inseminations.farmId, farm.farmId), eq(inseminations.animalId, animal.id))),
        tx.select().from(calvings).where(and(eq(calvings.farmId, farm.farmId), eq(calvings.damId, animal.id))),
        tx.select().from(pregnancyChecks).where(and(eq(pregnancyChecks.farmId, farm.farmId), eq(pregnancyChecks.animalId, animal.id))),
      ]);
      const resetDates = [
        ...priorCalvings.filter((row) => !row.voidedAt).map((row) => row.calvedOn),
        ...priorChecks.filter((row) => !row.voidedAt && row.result === "not_pregnant").map((row) => row.checkedOn),
      ].sort();
      const latestReset = resetDates.at(-1) ?? "";
      const cycleAis = priorAis.filter((row) => !row.voidedAt && (!latestReset || row.performedOn > latestReset));
      attemptNumber = cycleAis.length + 1;
    }

    const [row] = await tx
      .insert(inseminations)
      .values({
        farmId: farm.farmId,
        animalId: animal.id,
        performedOn,
        technicianName: text(formData, "technician") || farm.userName || "Technician",
        bullCode: resolvedBullCode,
        bullName: resolvedBullName,
        batchNumber: resolvedBatchNumber,
        strawCode: strawCode || null,
        attemptNumber,
        note: text(formData, "note") || null,
        createdBy: farm.userId,
      })
      .returning({ id: inseminations.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "insemination",
      entityId: row.id,
      summary: `Insemination for ${animal.code} with ${resolvedBullCode}`,
      after: { performedOn, bullCode: resolvedBullCode, strawCode: strawCode || null, attemptNumber },
    });
    await tx
      .update(animals)
      .set({ reproduction: "bred", updatedAt: new Date() })
      .where(and(eq(animals.id, animal.id), eq(animals.farmId, farm.farmId)));
    await tx
      .update(alerts)
      .set({ status: "done" })
      .where(and(eq(alerts.farmId, farm.farmId), eq(alerts.animalId, animal.id), eq(alerts.type, "pd_due"), eq(alerts.status, "open")));
    await tx.insert(alerts).values({
      farmId: farm.farmId,
      animalId: animal.id,
      type: "pd_due",
      title: "Pregnancy check due",
      body: `${animal.code} was inseminated on ${performedOn}. Check due ${pdDue}.`,
      dueOn: pdDue,
    });
  });
  redirect(`/animals/${safeCode}?tab=breeding&saved=1`);
}

export async function recordPd(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordPdOrCalving(farm.roles)) redirect("/breeding?error=role");
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal || animal.sex === "male" || animal.presence !== "on_farm") redirect("/breeding?error=animal");
  const safeCode = encodeURIComponent(animal.code);
  const result = text(formData, "result");
  if (result !== "pregnant" && result !== "not_pregnant" && result !== "doubtful") {
    redirect(`/animals/${safeCode}?tab=breeding&error=result`);
  }
  const inseminationId = text(formData, "inseminationId");
  const today = farmToday(farm.timezone);
  const checkedOn = parseFarmDate(text(formData, "checkedOn") || today);
  if (!checkedOn || checkedOn > today) redirect(`/animals/${safeCode}?tab=breeding&error=date`);

  const [ai] = inseminationId
    ? await db
        .select()
        .from(inseminations)
        .where(
          and(
            eq(inseminations.id, inseminationId),
            eq(inseminations.farmId, farm.farmId),
            eq(inseminations.animalId, animal.id),
            isNull(inseminations.voidedAt),
          ),
        )
        .limit(1)
    : [undefined];

  if (inseminationId && !ai) redirect(`/animals/${safeCode}?tab=breeding&error=conception`);
  if (result === "pregnant" && !ai) redirect(`/animals/${safeCode}?tab=breeding&error=conception`);
  if (ai && checkedOn < ai.performedOn) redirect(`/animals/${safeCode}?tab=breeding&error=date`);

  const [breed] = await db
    .select()
    .from(breeds)
    .where(and(eq(breeds.id, animal.breedId), eq(breeds.farmId, farm.farmId)))
    .limit(1);
  const gestation = breed?.gestationDays ?? (animal.species === "buffalo" ? 310 : 280);
  const dryCustom = { cattle: farm.dryOffLeadCattle, buffalo: farm.dryOffLeadBuffalo };

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(pregnancyChecks)
      .values({
        farmId: farm.farmId,
        animalId: animal.id,
        inseminationId: ai?.id ?? null,
        checkedOn,
        result,
        method: text(formData, "method") || null,
        createdBy: farm.userId,
      })
      .returning({ id: pregnancyChecks.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "pregnancy_check",
      entityId: row.id,
      summary: `Pregnancy check for ${animal.code}: ${result}`,
      after: { checkedOn, result, inseminationId: ai?.id ?? null },
    });

    if (result === "pregnant" && ai) {
      const expected = addDays(ai.performedOn, gestation);
      await tx
        .update(animals)
        .set({
          reproduction: "pregnant",
          conceptionOn: ai.performedOn,
          expectedCalving: expected,
          updatedAt: new Date(),
        })
        .where(and(eq(animals.id, animal.id), eq(animals.farmId, farm.farmId)));
      await tx
        .update(alerts)
        .set({ status: "done" })
        .where(and(eq(alerts.farmId, farm.farmId), eq(alerts.animalId, animal.id), inArray(alerts.type, ["calving_due", "dry_off"]), eq(alerts.status, "open")));
      await tx.insert(alerts).values({
        farmId: farm.farmId,
        animalId: animal.id,
        type: "calving_due",
        title: "Expected calving",
        body: `${animal.code} expected calving ${expected} (calculated, ${gestation} days from ${ai.performedOn}).`,
        dueOn: expected,
      });
      if (animal.lactation === "lactating") {
        const leadDays = dryOffLeadDays(animal.species, dryCustom);
        const dryOn = dryOffDueOn(expected, animal.species, dryCustom);
        await tx.insert(alerts).values({
          farmId: farm.farmId,
          animalId: animal.id,
          type: "dry_off",
          title: "Dry-off due",
          body: `${animal.code} dry-off due ${dryOn}, ${leadDays} days before expected calving ${expected}.`,
          dueOn: dryOn,
        });
      }
    }

    if (result === "not_pregnant") {
      await tx
        .update(animals)
        .set({ reproduction: "open", conceptionOn: null, expectedCalving: null, updatedAt: new Date() })
        .where(and(eq(animals.id, animal.id), eq(animals.farmId, farm.farmId)));
      await tx
        .update(alerts)
        .set({ status: "done" })
        .where(and(eq(alerts.farmId, farm.farmId), eq(alerts.animalId, animal.id), inArray(alerts.type, ["calving_due", "dry_off"]), eq(alerts.status, "open")));
    }

    await tx
      .update(alerts)
      .set({ status: "done" })
      .where(and(eq(alerts.farmId, farm.farmId), eq(alerts.animalId, animal.id), inArray(alerts.type, ["pd_due", "ai_followup"]), eq(alerts.status, "open")));

    if (result === "doubtful") {
      const recheckOn = addDays(checkedOn, 14);
      await tx.insert(alerts).values({
        farmId: farm.farmId,
        animalId: animal.id,
        type: "ai_followup",
        title: "AI follow-up / PD recheck",
        body: `${animal.code} had a doubtful pregnancy check on ${checkedOn}. Follow-up check due ${recheckOn}.`,
        dueOn: recheckOn,
      });
    }
  });
  redirect(`/animals/${safeCode}?tab=breeding&saved=1`);
}

export async function recordCalving(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordPdOrCalving(farm.roles)) redirect("/breeding?error=role");
  const dam = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!dam || dam.sex === "male" || dam.presence !== "on_farm") redirect("/breeding?error=animal");
  const safeCode = encodeURIComponent(dam.code);
  const inseminationId = text(formData, "inseminationId");
  if (!inseminationId) redirect(`/animals/${safeCode}?tab=breeding&event=calving&error=conception`);

  const [ai] = await db
    .select()
    .from(inseminations)
    .where(
      and(
        eq(inseminations.id, inseminationId),
        eq(inseminations.farmId, farm.farmId),
        eq(inseminations.animalId, dam.id),
        isNull(inseminations.voidedAt),
      ),
    )
    .limit(1);
  const sire = calfSireFromConception(ai ?? null);
  if (!ai || !sire) redirect(`/animals/${safeCode}?tab=breeding&event=calving&error=conception`);

  const outcome = text(formData, "outcome") || "live";
  if (outcome !== "live" && outcome !== "dead") redirect(`/animals/${safeCode}?tab=breeding&error=outcome`);
  const today = farmToday(farm.timezone);
  const calvedOn = parseFarmDate(text(formData, "calvedOn") || today);
  if (!calvedOn || calvedOn > today || calvedOn < ai.performedOn) {
    redirect(`/animals/${safeCode}?tab=breeding&error=date`);
  }
  const sex = text(formData, "calfSex") === "male" ? "male" : "female";
  const recordDeadOffspring = outcome === "dead" && formData.get("recordDeadCalf") === "on";
  const startLactation = formData.has("startLactation") ? formData.get("startLactation") === "on" : outcome === "live";

  await db.transaction(async (tx) => {
    let calfId: string | null = null;
    if (outcome === "live" || recordDeadOffspring) {
      const [breed] = await tx
        .select()
        .from(breeds)
        .where(and(eq(breeds.id, dam.breedId), eq(breeds.farmId, farm.farmId)))
        .limit(1);
      const code = await issueAnimalCode(tx, farm.farmId, farm.animalPrefix, breed?.code ?? "OTH");
      const [calf] = await tx
        .insert(animals)
        .values({
          farmId: farm.farmId,
          code,
          name: text(formData, "calfName") || null,
          species: dam.species,
          breedId: dam.breedId,
          sex,
          dob: calvedOn,
          presence: outcome === "live" ? "on_farm" : "dead",
          exitOn: outcome === "dead" ? calvedOn : null,
          exitReason: outcome === "dead" ? "Stillborn / dead at calving" : null,
          lifeStage: "calf",
          reproduction: sex === "male" ? "not_applicable" : "open",
          lactation: sex === "male" ? "not_applicable" : "pre_lactation",
          locationId: outcome === "live" ? dam.locationId : null,
          qrToken: randomBytes(32).toString("base64url"),
          geneticDamId: dam.id,
          geneticSireCode: sire.code,
          geneticSireName: sire.name,
          createdBy: farm.userId,
        })
        .returning();
      calfId = calf.id;
    }
    const [calving] = await tx
      .insert(calvings)
      .values({
        farmId: farm.farmId,
        damId: dam.id,
        inseminationId: ai.id,
        calvedOn,
        expectedCalving: dam.expectedCalving,
        calfId,
        outcome,
        ease: text(formData, "ease") || null,
        note: text(formData, "note") || null,
        createdBy: farm.userId,
      })
      .returning({ id: calvings.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "calving",
      entityId: calving.id,
      summary: `Calving for ${dam.code}: ${outcome}`,
      after: { calvedOn, outcome, calfId, sireCode: sire.code },
    });
    await tx
      .update(animals)
      .set({
        reproduction: "fresh",
        lactation: startLactation ? "lactating" : dam.lactation,
        lifeStage: "cow",
        conceptionOn: null,
        expectedCalving: null,
        updatedAt: new Date(),
      })
      .where(and(eq(animals.id, dam.id), eq(animals.farmId, farm.farmId)));
    await tx
      .update(alerts)
      .set({ status: "done" })
      .where(
        and(
          eq(alerts.farmId, farm.farmId),
          eq(alerts.animalId, dam.id),
          inArray(alerts.type, ["calving_due", "dry_off"]),
          eq(alerts.status, "open"),
        ),
      );
  });
  redirect(`/animals/${safeCode}?tab=breeding&saved=1`);
}

export async function recordDryOff(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordPdOrCalving(farm.roles)) redirect("/breeding?error=role");
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal || animal.sex === "male" || animal.presence !== "on_farm") redirect("/breeding?error=animal");
  const safeCode = encodeURIComponent(animal.code);
  if (animal.lactation !== "lactating") redirect(`/animals/${safeCode}?tab=breeding&error=dry`);
  const today = farmToday(farm.timezone);
  const driedOn = parseFarmDate(text(formData, "driedOn") || today);
  if (!driedOn || driedOn > today) redirect(`/animals/${safeCode}?tab=breeding&error=date`);

  const [latestBirth] = await db
    .select({ calvedOn: calvings.calvedOn })
    .from(calvings)
    .where(and(eq(calvings.farmId, farm.farmId), eq(calvings.damId, animal.id), isNull(calvings.voidedAt)))
    .orderBy(desc(calvings.calvedOn))
    .limit(1);
  if (latestBirth && driedOn < latestBirth.calvedOn) redirect(`/animals/${safeCode}?tab=breeding&error=date`);

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(dryOffs)
      .values({
        farmId: farm.farmId,
        animalId: animal.id,
        driedOn,
        note: text(formData, "note") || null,
        createdBy: farm.userId,
      })
      .returning({ id: dryOffs.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "dry_off",
      entityId: row.id,
      summary: `Dry-off for ${animal.code}`,
      before: { lactation: animal.lactation },
      after: { driedOn, lactation: "dry" },
    });
    await tx
      .update(animals)
      .set({ lactation: "dry", updatedAt: new Date() })
      .where(and(eq(animals.id, animal.id), eq(animals.farmId, farm.farmId)));
    await tx
      .update(alerts)
      .set({ status: "done" })
      .where(and(eq(alerts.farmId, farm.farmId), eq(alerts.animalId, animal.id), eq(alerts.type, "dry_off"), eq(alerts.status, "open")));
  });
  redirect(`/animals/${safeCode}?tab=breeding&saved=1`);
}

const attachmentExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const attachmentMimeSet = new Set(Object.keys(attachmentExtensions));
const photoMimeSet = new Set(["image/jpeg", "image/png", "image/webp"]);
const HEALTH_OUTCOMES = new Set(["ongoing", "resolved", "died", "culled", "referred", "unknown"]);

export async function recordHealth(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordHealth(farm.roles)) redirect("/health?error=role");
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal) redirect("/health?error=animal");
  const safeCode = encodeURIComponent(animal.code);
  const today = farmToday(farm.timezone);
  const eventOn = parseFarmDate(text(formData, "eventOn") || today);
  if (!eventOn || eventOn > today) redirect(`/animals/${safeCode}?tab=health&error=date`);
  const followUpRaw = text(formData, "followUpOn");
  const followUp = followUpRaw ? parseFarmDate(followUpRaw) : null;
  if (followUpRaw && (!followUp || followUp < eventOn)) redirect(`/animals/${safeCode}?tab=health&error=date`);
  const medicine = text(formData, "medicine");
  const problem = text(formData, "problem") || "Illness";
  const outcomeRaw = text(formData, "outcome") || "ongoing";
  const outcome = HEALTH_OUTCOMES.has(outcomeRaw) ? outcomeRaw : "ongoing";
  const costRaw = text(formData, "cost");
  const costNum = costRaw ? Number(costRaw) : null;
  if (costRaw && (costNum === null || !Number.isFinite(costNum) || costNum < 0 || costNum > 10_000_000)) {
    redirect(`/animals/${safeCode}?tab=health&error=cost`);
  }
  const cost = costNum !== null ? costNum.toFixed(2) : null;

  const withdrawalRaw = text(formData, "withdrawalDays");
  const withdrawalDays = withdrawalRaw ? Number(withdrawalRaw) : null;
  if (withdrawalRaw && (withdrawalDays === null || !Number.isInteger(withdrawalDays) || withdrawalDays < 0 || withdrawalDays > 90)) {
    redirect(`/animals/${safeCode}?tab=health&error=cost`);
  }
  const withdrawalUntil = withdrawalDays && withdrawalDays > 0 ? addDays(eventOn, withdrawalDays) : null;
  const quarters = formData
    .getAll("quarters")
    .map(String)
    .filter((q) => ["LF", "RF", "LH", "RH"].includes(q))
    .join(", ") || text(formData, "quarters") || null;

  let attachmentKey: string | null = null;
  let attachmentName: string | null = null;
  const file = formData.get("attachment");
  if (file instanceof File && file.size > 0) {
    if (!storageConfigured()) redirect(`/animals/${safeCode}?tab=health&error=storage`);
    if (file.size > 10 * 1024 * 1024) redirect(`/animals/${safeCode}?tab=health&error=photo`);
    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = detectAllowedFileType(buffer, attachmentMimeSet);
    if (!detected) redirect(`/animals/${safeCode}?tab=health&error=photo`);
    const ext = attachmentExtensions[detected];
    attachmentKey = `farms/${farm.farmId}/health/${animal.code}/${randomUUID()}.${ext}`;
    attachmentName = file.name || `prescription.${ext}`;
    await putPrivateObject(attachmentKey, buffer, detected);
  }

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(healthEvents)
      .values({
        farmId: farm.farmId,
        animalId: animal.id,
        eventOn,
        problem,
        signs: text(formData, "signs") || null,
        diagnosis: text(formData, "diagnosis") || null,
        treatment: text(formData, "treatment") || null,
        medicine: medicine || null,
        dose: text(formData, "dose") || null,
        route: text(formData, "route") || null,
        duration: text(formData, "duration") || null,
        quarters,
        withdrawalDays: withdrawalDays && withdrawalDays > 0 ? withdrawalDays : null,
        withdrawalUntil,
        veterinarian: text(formData, "veterinarian") || farm.userName,
        followUpOn: followUp || null,
        outcome,
        cost,
        attachmentKey,
        attachmentName,
        createdBy: farm.userId,
      })
      .returning({ id: healthEvents.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "health",
      entityId: row.id,
      summary: `Treatment for ${animal.code}: ${problem}`,
      after: { problem, outcome, cost, withdrawalUntil },
    });

    if (followUp && medicine && outcome === "ongoing") {
      await tx.insert(alerts).values({
        farmId: farm.farmId,
        animalId: animal.id,
        type: "medication_due",
        title: "Medication due",
        body: `${animal.code} ${medicine} dose due ${followUp}.`,
        dueOn: followUp,
      });
    } else if (followUp && outcome === "ongoing") {
      await tx.insert(alerts).values({
        farmId: farm.farmId,
        animalId: animal.id,
        type: "health_followup",
        title: "Health follow-up",
        body: `${animal.code} follow-up for ${problem} due ${followUp}.`,
        dueOn: followUp,
      });
    }
    if (withdrawalUntil) {
      await tx.insert(alerts).values({
        farmId: farm.farmId,
        animalId: animal.id,
        type: "withdrawal",
        title: "Milk withdrawal",
        body: `${animal.code} milk withdrawal until ${withdrawalUntil} (${medicine || problem}).`,
        dueOn: withdrawalUntil,
      });
    }
  });
  redirect(`/animals/${safeCode}?tab=health&saved=1`);
}

export async function updateHealthOutcome(formData: FormData) {
  const farm = await requireFarm();
  const id = text(formData, "id");
  const outcome = text(formData, "outcome");
  const returnTo = safeBack(text(formData, "returnTo"), "/health");
  if (!canRecordHealth(farm.roles) || !id || !HEALTH_OUTCOMES.has(outcome)) {
    redirect(appendQuery(returnTo, "error", "role"));
  }
  const [event] = await db
    .select()
    .from(healthEvents)
    .where(and(eq(healthEvents.id, id), eq(healthEvents.farmId, farm.farmId), isNull(healthEvents.voidedAt)))
    .limit(1);
  if (!event) redirect(returnTo);

  await db.transaction(async (tx) => {
    await tx
      .update(healthEvents)
      .set({ outcome })
      .where(and(eq(healthEvents.id, event.id), eq(healthEvents.farmId, farm.farmId)));
    if (outcome === "resolved" || outcome === "died") {
      await tx
        .update(alerts)
        .set({ status: "done" })
        .where(
          and(
            eq(alerts.farmId, farm.farmId),
            eq(alerts.animalId, event.animalId),
            inArray(alerts.type, ["health_followup", "medication_due"]),
            eq(alerts.status, "open"),
          ),
        );
    }
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "health",
      entityId: event.id,
      summary: `Treatment outcome updated to ${outcome} (${event.problem})`,
      before: { outcome: event.outcome },
      after: { outcome },
    });
  });
  redirect(appendQuery(returnTo, "saved", "1"));
}

export async function recordVaccine(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordVaccine(farm.roles, farm.canRecordVaccines)) redirect("/health?error=role");
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal) redirect("/health?error=animal");
  const safeCode = encodeURIComponent(animal.code);
  const today = farmToday(farm.timezone);
  const givenOn = parseFarmDate(text(formData, "givenOn") || today);
  const nextDueRaw = text(formData, "nextDueOn");
  const nextDue = nextDueRaw ? parseFarmDate(nextDueRaw) : null;
  if (!givenOn || givenOn > today || (nextDueRaw && (!nextDue || nextDue < givenOn))) {
    redirect(`/animals/${safeCode}?tab=health&error=date`);
  }
  const vaccine = text(formData, "vaccine") || "Vaccine";

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(vaccinations)
      .values({
        farmId: farm.farmId,
        animalId: animal.id,
        vaccine,
        batch: text(formData, "batch") || null,
        givenOn,
        nextDueOn: nextDue || null,
        administeredBy: farm.userName,
        createdBy: farm.userId,
      })
      .returning({ id: vaccinations.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "vaccination",
      entityId: row.id,
      summary: `Vaccine for ${animal.code}: ${vaccine}`,
      after: { vaccine, nextDue: nextDue || null },
    });

    const openAlerts = await tx
      .select({ id: alerts.id, body: alerts.body })
      .from(alerts)
      .where(and(eq(alerts.farmId, farm.farmId), eq(alerts.animalId, animal.id), eq(alerts.type, "vaccine_due"), eq(alerts.status, "open")));
    const matchingIds = openAlerts
      .filter((alert) => alert.body.toLowerCase().includes(vaccine.toLowerCase()))
      .map((alert) => alert.id);
    if (matchingIds.length > 0) {
      await tx.update(alerts).set({ status: "done" }).where(and(eq(alerts.farmId, farm.farmId), inArray(alerts.id, matchingIds)));
    }
    if (nextDue) {
      await tx.insert(alerts).values({
        farmId: farm.farmId,
        animalId: animal.id,
        type: "vaccine_due",
        title: `Vaccination due · ${vaccine}`,
        body: `${animal.code} ${vaccine} due ${nextDue}.`,
        dueOn: nextDue,
      });
    }
  });
  redirect(`/animals/${safeCode}?tab=health&saved=1`);
}

export async function recordDeworming(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordVaccine(farm.roles, farm.canRecordVaccines)) redirect("/health?error=role");
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal) redirect("/health?error=animal");
  const safeCode = encodeURIComponent(animal.code);
  const today = farmToday(farm.timezone);
  const givenOn = parseFarmDate(text(formData, "givenOn") || today);
  const nextDueRaw = text(formData, "nextDueOn");
  const nextDue = nextDueRaw ? parseFarmDate(nextDueRaw) : null;
  if (!givenOn || givenOn > today || (nextDueRaw && (!nextDue || nextDue < givenOn))) {
    redirect(`/animals/${safeCode}?tab=health&error=date`);
  }
  const product = text(formData, "product") || "Dewormer";

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(dewormings)
      .values({
        farmId: farm.farmId,
        animalId: animal.id,
        product,
        givenOn,
        nextDueOn: nextDue || null,
        createdBy: farm.userId,
      })
      .returning({ id: dewormings.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "deworming",
      entityId: row.id,
      summary: `Deworming for ${animal.code}: ${product}`,
      after: { product, nextDue: nextDue || null },
    });
    await tx
      .update(alerts)
      .set({ status: "done" })
      .where(and(eq(alerts.farmId, farm.farmId), eq(alerts.animalId, animal.id), eq(alerts.type, "deworming_due"), eq(alerts.status, "open")));
    if (nextDue) {
      await tx.insert(alerts).values({
        farmId: farm.farmId,
        animalId: animal.id,
        type: "deworming_due",
        title: `Deworming due · ${product}`,
        body: `${animal.code} ${product} due ${nextDue}.`,
        dueOn: nextDue,
      });
    }
  });
  redirect(`/animals/${safeCode}?tab=health&saved=1`);
}

export async function recordWeight(formData: FormData) {
  const farm = await requireFarm();
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal) redirect("/animals");
  const safeCode = encodeURIComponent(animal.code);
  if (!canRecordWeight(farm.roles)) redirect(`/animals/${safeCode}?error=role`);
  const kilograms = Number(text(formData, "kilograms"));
  if (!Number.isFinite(kilograms) || kilograms <= 0 || kilograms > 1200) redirect(`/animals/${safeCode}?error=weight`);
  const today = farmToday(farm.timezone);
  const weighedOn = parseFarmDate(text(formData, "weighedOn") || today);
  if (!weighedOn || weighedOn > today) redirect(`/animals/${safeCode}?error=date`);

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(weights)
      .values({
        farmId: farm.farmId,
        animalId: animal.id,
        weighedOn,
        kilograms: kilograms.toFixed(1),
        note: text(formData, "note") || null,
        createdBy: farm.userId,
      })
      .returning({ id: weights.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "weight",
      entityId: row.id,
      summary: `Weight for ${animal.code}: ${kilograms.toFixed(1)} kg`,
      after: { weighedOn, kilograms: kilograms.toFixed(1) },
    });
  });
  redirect(`/animals/${safeCode}?saved=1`);
}

export async function recordAnimalMilk(formData: FormData) {
  const farm = await requireFarm();
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal) redirect("/animals");
  const safeCode = encodeURIComponent(animal.code);
  if (!canWriteMilk(farm.roles)) redirect(`/animals/${safeCode}?tab=milk&error=role`);
  const today = farmToday(farm.timezone);
  const recordedOn = parseFarmDate(text(formData, "recordedOn") || today);
  if (!recordedOn || recordedOn > today) redirect(`/animals/${safeCode}?tab=milk&error=date`);

  const morningRaw = text(formData, "morningLitres");
  const eveningRaw = text(formData, "eveningLitres");
  const morningNum = morningRaw ? Number(morningRaw) : null;
  const eveningNum = eveningRaw ? Number(eveningRaw) : null;
  if (
    (morningNum !== null && (!Number.isFinite(morningNum) || morningNum < 0 || morningNum > 80)) ||
    (eveningNum !== null && (!Number.isFinite(eveningNum) || eveningNum < 0 || eveningNum > 80)) ||
    (morningNum === null && eveningNum === null)
  ) {
    redirect(`/animals/${safeCode}?tab=milk&error=milk`);
  }
  const morning = morningNum !== null ? morningNum.toFixed(1) : null;
  const evening = eveningNum !== null ? eveningNum.toFixed(1) : null;

  await db.transaction(async (tx) => {
    const [prev] = await tx
      .select()
      .from(milkYields)
      .where(and(eq(milkYields.farmId, farm.farmId), eq(milkYields.animalId, animal.id), eq(milkYields.recordedOn, recordedOn)))
      .limit(1);
    const [saved] = await tx
      .insert(milkYields)
      .values({
        farmId: farm.farmId,
        animalId: animal.id,
        recordedOn,
        morningLitres: morning,
        eveningLitres: evening,
        createdBy: farm.userId,
      })
      .onConflictDoUpdate({
        target: [milkYields.animalId, milkYields.recordedOn],
        set: {
          morningLitres: morning,
          eveningLitres: evening,
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
      summary: `Milk for ${animal.code} on ${formatDisplayDate(recordedOn)}: ${[morning ? `${morning} L morning` : "", evening ? `${evening} L evening` : ""].filter(Boolean).join(", ")}`,
      before: prev ? { recordedOn, morning: prev.morningLitres, evening: prev.eveningLitres } : null,
      after: { recordedOn, morning, evening },
    });
  });

  await syncMilkDrops(farm.farmId, recordedOn);
  redirect(`/animals/${safeCode}?tab=milk&saved=1`);
}

export async function saveBull(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles)) semenRedirect(formData, { error: "role" });
  const code = text(formData, "code");
  const name = text(formData, "name");
  if (!code || !name) semenRedirect(formData, { error: "bull" });
  const [existing] = await db
    .select({ id: bulls.id })
    .from(bulls)
    .where(and(eq(bulls.farmId, farm.farmId), eq(bulls.code, code)))
    .limit(1);
  if (existing) semenRedirect(formData, { error: "bull" });

  let photoKey: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (!storageConfigured()) semenRedirect(formData, { error: "storage" });
    if (photo.size > 5 * 1024 * 1024) semenRedirect(formData, { error: "photo" });
    const buffer = Buffer.from(await photo.arrayBuffer());
    const detected = detectAllowedFileType(buffer, photoMimeSet);
    if (!detected) semenRedirect(formData, { error: "photo" });
    photoKey = `farms/${farm.farmId}/bulls/${code}/${randomUUID()}.${attachmentExtensions[detected]}`;
    await putPrivateObject(photoKey, buffer, detected);
  }

  await db.transaction(async (tx) => {
    const [bull] = await tx
      .insert(bulls)
      .values({
        farmId: farm.farmId,
        code,
        name,
        breed: text(formData, "breed") || null,
        registrationNumber: text(formData, "registration") || null,
        semenCompany: text(formData, "company") || null,
        sireCode: text(formData, "sireCode") || null,
        damCode: text(formData, "damCode") || null,
        photoKey,
        notes: text(formData, "notes") || null,
      })
      .returning({ id: bulls.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "bull",
      entityId: bull.id,
      summary: `Bull ${code} · ${name}`,
      after: { code, name },
    });
  });
  semenRedirect(formData, { saved: true });
}

export async function saveSemenBatch(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles)) semenRedirect(formData, { error: "role" });
  const bullId = text(formData, "bullId");
  const batchNumber = text(formData, "batchNumber");
  const quantity = Number(text(formData, "quantity"));
  const semenType = text(formData, "semenType") || "conventional";
  const price = text(formData, "price");
  const collectedOnRaw = text(formData, "collectedOn");
  const receivedOnRaw = text(formData, "receivedOn") || farmToday(farm.timezone);
  const collectedOn = collectedOnRaw ? parseFarmDate(collectedOnRaw) : null;
  const receivedOn = parseFarmDate(receivedOnRaw);
  if (!batchNumber) semenRedirect(formData, { error: "batch" });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 200) semenRedirect(formData, { error: "quantity" });
  if (semenType !== "conventional" && semenType !== "sexed_female" && semenType !== "sexed_male") semenRedirect(formData, { error: "type" });
  if (price && (!Number.isFinite(Number(price)) || Number(price) < 0 || Number(price) > 10_000_000)) semenRedirect(formData, { error: "cost" });
  if ((collectedOnRaw && !collectedOn) || !receivedOn) semenRedirect(formData, { error: "date" });

  const [bull] = await db
    .select({ id: bulls.id })
    .from(bulls)
    .where(and(eq(bulls.id, bullId), eq(bulls.farmId, farm.farmId)))
    .limit(1);
  if (!bull) semenRedirect(formData, { error: "bull" });
  const [duplicate] = await db
    .select({ id: semenBatches.id })
    .from(semenBatches)
    .where(and(eq(semenBatches.farmId, farm.farmId), eq(semenBatches.batchNumber, batchNumber)))
    .limit(1);
  if (duplicate) semenRedirect(formData, { error: "batch" });

  const codes = Array.from({ length: quantity }, (_, index) => `${batchNumber}-${String(index + 1).padStart(3, "0")}`);
  const taken = await db
    .select({ code: straws.code })
    .from(straws)
    .where(and(eq(straws.farmId, farm.farmId), inArray(straws.code, codes)));
  if (taken.length > 0) semenRedirect(formData, { error: "straw" });

  const tank = text(formData, "tank") || "Tank A";
  const canister = text(formData, "canister") || "1";
  const goblet = text(formData, "goblet") || "A";

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(semenBatches)
      .values({
        farmId: farm.farmId,
        bullId,
        batchNumber,
        semenType,
        collectedOn,
        quantityReceived: quantity,
        pricePerStraw: price ? Number(price).toFixed(2) : null,
        receivedOn,
      })
      .returning();
    await tx.insert(straws).values(
      codes.map((code, index) => ({
        farmId: farm.farmId,
        batchId: batch.id,
        code,
        tank,
        canister,
        goblet,
        position: String(index + 1),
        status: "available",
      })),
    );
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "semen",
      entityId: batch.id,
      summary: `Batch ${batchNumber} · ${quantity} straws`,
      after: { batchNumber, quantity, semenType },
    });
  });
  semenRedirect(formData, { saved: true });
}

export async function discardStraw(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles)) semenRedirect(formData, { error: "role" });
  const code = text(formData, "code");
  const reason = text(formData, "reason");
  if (!reason) semenRedirect(formData, { error: "reason" });

  let ok = false;
  await db.transaction(async (tx) => {
    const [straw] = await tx
      .select()
      .from(straws)
      .where(and(eq(straws.farmId, farm.farmId), eq(straws.code, code)))
      .for("update")
      .limit(1);
    if (!straw || straw.status !== "available") return;
    await tx
      .update(straws)
      .set({ status: "discarded" })
      .where(and(eq(straws.id, straw.id), eq(straws.farmId, farm.farmId)));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "semen",
      entityId: straw.id,
      summary: `Discarded straw ${code}: ${reason}`,
      before: { status: straw.status },
      after: { status: "discarded", reason },
    });
    ok = true;
  });
  if (!ok) semenRedirect(formData, { error: "adjust" });
  semenRedirect(formData, { saved: true });
}

export async function saveFeed(formData: FormData) {
  const farm = await requireFarm();
  const returnToRaw = text(formData, "returnTo");
  const returnTo = returnToRaw.startsWith("/animals/") ? safeBack(returnToRaw, "/feed") : "/feed";
  const fail = (error: string): never => redirect(appendQuery(returnTo, "error", error));

  if (!canRecordFeed(farm.roles)) fail("role");
  const name = text(formData, "name");
  let itemId = text(formData, "itemId");
  const category = text(formData, "category") || "other";
  const minimum = text(formData, "minimum");
  if (!isFeedCategory(category)) fail("item");
  if (!itemId && !name) fail("item");
  if (minimum && (!Number.isFinite(Number(minimum)) || Number(minimum) < 0)) fail("quantity");

  const kind = text(formData, "kind") || "purchase";
  if (!isFeedKind(kind)) fail("kind");
  const quantity = Number(text(formData, "quantity"));
  if (kind === "adjustment") {
    if (!Number.isFinite(quantity) || quantity === 0 || Math.abs(quantity) > 1_000_000) fail("quantity");
  } else {
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) fail("quantity");
  }
  const unitCost = text(formData, "unitCost");
  if (unitCost && (!Number.isFinite(Number(unitCost)) || Number(unitCost) < 0 || Number(unitCost) > 10_000_000)) fail("cost");
  const movedOn = parseFarmDate(text(formData, "movedOn") || farmToday(farm.timezone));
  if (!movedOn) return fail("date");

  let note = text(formData, "note") || null;
  const supplier = text(formData, "supplier");
  const allocation = text(formData, "allocation");
  if (kind === "purchase" && supplier) note = `Supplier · ${supplier}`;
  if (kind === "consumption" || kind === "wastage") {
    if (allocation === "herd") note = "Herd";
    if (allocation.startsWith("shed:")) {
      const [shed] = await db
        .select({ name: locations.name })
        .from(locations)
        .where(and(eq(locations.id, allocation.slice(5)), eq(locations.farmId, farm.farmId)))
        .limit(1);
      if (!shed) fail("target");
      note = `Shed · ${shed.name}`;
    }
    if (allocation.startsWith("animal:")) {
      const [animal] = await db
        .select({ code: animals.code, name: animals.name })
        .from(animals)
        .where(and(eq(animals.code, allocation.slice(7)), eq(animals.farmId, farm.farmId)))
        .limit(1);
      if (!animal) fail("target");
      note = `${animal.name ?? animal.code} · ${animal.code}`;
    }
    if (allocation && allocation !== "herd" && !allocation.startsWith("shed:") && !allocation.startsWith("animal:")) {
      fail("target");
    }
  }

  let existingItemName = name;
  if (itemId) {
    const [item] = await db
      .select({ id: feedItems.id, name: feedItems.name })
      .from(feedItems)
      .where(and(eq(feedItems.id, itemId), eq(feedItems.farmId, farm.farmId)))
      .limit(1);
    if (!item) fail("item");
    existingItemName = item.name;
  }

  await db.transaction(async (tx) => {
    if (!itemId) {
      const [created] = await tx
        .insert(feedItems)
        .values({
          farmId: farm.farmId,
          name,
          category,
          minimumQuantity: minimum ? Number(minimum).toFixed(1) : null,
        })
        .returning({ id: feedItems.id });
      itemId = created.id;
    }
    const [movement] = await tx
      .insert(feedMovements)
      .values({
        farmId: farm.farmId,
        itemId,
        kind,
        quantity: quantity.toFixed(1),
        unitCost: unitCost ? Number(unitCost).toFixed(2) : null,
        movedOn,
        note,
        createdBy: farm.userId,
      })
      .returning({ id: feedMovements.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "feed",
      entityId: movement.id,
      summary: `Feed ${kind}: ${existingItemName} (${quantity.toFixed(1)})`,
      after: { itemId, kind, quantity: quantity.toFixed(1), movedOn, note },
    });
  });

  redirect(appendQuery(returnTo, "saved", "1"));
}

export async function updateFeedItem(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordFeed(farm.roles)) redirect("/feed?error=role");
  const itemId = text(formData, "itemId");
  const name = text(formData, "name");
  const minimum = text(formData, "minimum");
  if (!itemId || !name) redirect("/feed?error=item");
  if (minimum && (!Number.isFinite(Number(minimum)) || Number(minimum) < 0)) redirect("/feed?error=quantity");
  const [current] = await db
    .select()
    .from(feedItems)
    .where(and(eq(feedItems.id, itemId), eq(feedItems.farmId, farm.farmId)))
    .limit(1);
  if (!current) redirect("/feed?error=item");

  await db.transaction(async (tx) => {
    const nextMin = minimum ? Number(minimum).toFixed(1) : null;
    await tx
      .update(feedItems)
      .set({ name, minimumQuantity: nextMin })
      .where(and(eq(feedItems.id, current.id), eq(feedItems.farmId, farm.farmId)));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "feed",
      entityId: current.id,
      summary: `Updated feed item ${name}`,
      before: { name: current.name, minimumQuantity: current.minimumQuantity },
      after: { name, minimumQuantity: nextMin },
    });
  });
  redirect("/feed?saved=1");
}

export async function saveFinance(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordFinance(farm.roles)) redirect("/finance?error=role");
  const amount = Number(text(formData, "amount"));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) redirect("/finance?error=amount");
  const rawCategory = text(formData, "category");
  const prefixed = rawCategory.split(":");
  const kindFromPrefix = prefixed.length > 1 && (prefixed[0] === "income" || prefixed[0] === "expense") ? prefixed[0] : null;
  const kind = kindFromPrefix ?? (text(formData, "kind") === "income" ? "income" : "expense");
  const category = canonicalCategory(kind, kindFromPrefix ? prefixed.slice(1).join(":") : rawCategory);
  if (!category) redirect("/finance?error=category");
  const entryOn = parseFarmDate(text(formData, "entryOn") || farmToday(farm.timezone));
  if (!entryOn) redirect("/finance?error=date");
  const requestedAnimal = text(formData, "animalId");
  const animal = requestedAnimal ? await animalInFarm(farm.farmId, requestedAnimal) : null;
  if (requestedAnimal && !animal) redirect("/finance?error=animal");

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(financeEntries)
      .values({
        farmId: farm.farmId,
        kind,
        category,
        amount: amount.toFixed(2),
        entryOn,
        animalId: animal?.id ?? null,
        note: text(formData, "note") || null,
        createdBy: farm.userId,
      })
      .returning({ id: financeEntries.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "finance",
      entityId: row.id,
      summary: `${kind} ${category} ₹${amount.toFixed(2)}`,
      after: { kind, category, amount: amount.toFixed(2) },
    });
  });
  redirect("/finance?saved=1");
}

function wholeNumber(value: string, max: number) {
  if (!value) return null;
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > max) return null;
  return amount;
}

function embryoRedirect(formData: FormData, notice?: { error?: string; saved?: boolean }): never {
  const tab = text(formData, "returnTab");
  const params = new URLSearchParams();
  if (tab === "inventory" || tab === "transfers") params.set("tab", tab);
  if (notice?.error) params.set("error", notice.error);
  if (notice?.saved) params.set("saved", "1");
  const value = params.toString();
  redirect(value ? `/embryos?${value}` : "/embryos");
}

function semenRedirect(formData: FormData, notice?: { error?: string; saved?: boolean }): never {
  const tab = text(formData, "returnTab");
  const params = new URLSearchParams();
  if (tab === "straws" || tab === "bulls") params.set("tab", tab);
  if (notice?.error) params.set("error", notice.error);
  if (notice?.saved) params.set("saved", "1");
  const value = params.toString();
  redirect(value ? `/semen?${value}` : "/semen");
}

export async function saveEmbryo(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles)) embryoRedirect(formData, { error: "role" });
  const code = text(formData, "code");
  const storage = text(formData, "storage") || "fresh";
  const frozenOnRaw = text(formData, "frozenOn");
  const frozenOn = frozenOnRaw ? parseFarmDate(frozenOnRaw) : null;
  const donorId = text(formData, "donorId");
  if (!code) embryoRedirect(formData, { error: "code" });
  if (storage !== "fresh" && storage !== "frozen") embryoRedirect(formData, { error: "storage" });
  if (frozenOnRaw && !frozenOn) embryoRedirect(formData, { error: "date" });
  const [duplicate] = await db
    .select({ id: embryos.id })
    .from(embryos)
    .where(and(eq(embryos.farmId, farm.farmId), eq(embryos.code, code)))
    .limit(1);
  if (duplicate) embryoRedirect(formData, { error: "code" });
  const donor = donorId ? await animalInFarm(farm.farmId, donorId) : null;
  if (donorId && (!donor || donor.sex !== "female" || donor.presence !== "on_farm")) embryoRedirect(formData, { error: "animal" });

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(embryos)
      .values({
        farmId: farm.farmId,
        code,
        donorId: donor?.id ?? null,
        sireCode: text(formData, "sireCode") || null,
        grade: text(formData, "grade") || null,
        storage,
        frozenOn,
        location: text(formData, "location") || null,
        status: "in_stock",
      })
      .returning({ id: embryos.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "embryo",
      entityId: row.id,
      summary: `Embryo ${code}`,
      after: { code, storage },
    });
  });
  embryoRedirect(formData, { saved: true });
}

export async function transferEmbryo(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles)) embryoRedirect(formData, { error: "role" });
  const embryoId = text(formData, "embryoId");
  const recipientId = text(formData, "recipientId");
  const transferredOn = parseFarmDate(text(formData, "transferredOn") || farmToday(farm.timezone));
  const pregnancyResult = text(formData, "pregnancyResult");
  if (!transferredOn) embryoRedirect(formData, { error: "date" });
  if (pregnancyResult && pregnancyResult !== "pregnant" && pregnancyResult !== "not_pregnant" && pregnancyResult !== "doubtful") {
    embryoRedirect(formData, { error: "result" });
  }
  const recipient = await animalInFarm(farm.farmId, recipientId);
  if (!recipient || recipient.sex !== "female" || recipient.presence !== "on_farm") embryoRedirect(formData, { error: "animal" });

  let transferred = false;
  await db.transaction(async (tx) => {
    const [embryo] = await tx
      .select()
      .from(embryos)
      .where(and(eq(embryos.id, embryoId), eq(embryos.farmId, farm.farmId)))
      .for("update")
      .limit(1);
    if (!embryo || embryo.status !== "in_stock") return;

    const [transfer] = await tx
      .insert(embryoTransfers)
      .values({
        farmId: farm.farmId,
        embryoId,
        recipientId,
        transferredOn,
        pregnancyResult: pregnancyResult || null,
      })
      .returning({ id: embryoTransfers.id });
    await tx
      .update(embryos)
      .set({ status: "transferred" })
      .where(and(eq(embryos.id, embryoId), eq(embryos.farmId, farm.farmId)));

    const pdDays = recipient.species === "buffalo" ? farm.pdDueDaysBuffalo : farm.pdDueDaysCattle;
    if (!pregnancyResult || pregnancyResult === "doubtful") {
      await tx
        .update(animals)
        .set({ reproduction: "bred", updatedAt: new Date() })
        .where(and(eq(animals.id, recipient.id), eq(animals.farmId, farm.farmId)));
      const pdDue = addDays(transferredOn, pdDays);
      await tx.insert(alerts).values({
        farmId: farm.farmId,
        animalId: recipient.id,
        type: "pd_due",
        title: "Pregnancy check due",
        body: `${recipient.code} received embryo ${embryo.code} on ${transferredOn}. Check due ${pdDue}.`,
        dueOn: pdDue,
      });
    } else if (pregnancyResult === "pregnant") {
      const [breed] = await tx
        .select({ gestationDays: breeds.gestationDays })
        .from(breeds)
        .where(and(eq(breeds.id, recipient.breedId), eq(breeds.farmId, farm.farmId)))
        .limit(1);
      const gestation = breed?.gestationDays ?? (recipient.species === "buffalo" ? 310 : 280);
      const expected = addDays(transferredOn, gestation);
      await tx
        .update(animals)
        .set({ reproduction: "pregnant", conceptionOn: transferredOn, expectedCalving: expected, updatedAt: new Date() })
        .where(and(eq(animals.id, recipient.id), eq(animals.farmId, farm.farmId)));
      await tx.insert(alerts).values({
        farmId: farm.farmId,
        animalId: recipient.id,
        type: "calving_due",
        title: "Expected calving",
        body: `${recipient.code} (embryo ${embryo.code}) expected calving ${expected}.`,
        dueOn: expected,
      });
    }

    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "embryo",
      entityId: embryoId,
      summary: `Transferred ${embryo.code} to ${recipient.code}`,
      before: { status: embryo.status },
      after: { status: "transferred", transferId: transfer.id, pregnancyResult: pregnancyResult || null },
    });
    transferred = true;
  });
  if (!transferred) embryoRedirect(formData, { error: "embryo" });
  embryoRedirect(formData, { saved: true });
}

export async function updateTransferResult(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles) && !canRecordPdOrCalving(farm.roles)) embryoRedirect(formData, { error: "role" });
  const transferId = text(formData, "transferId");
  const result = text(formData, "pregnancyResult");
  if (!transferId || !["pregnant", "not_pregnant", "doubtful"].includes(result)) {
    embryoRedirect(formData, { error: "result" });
  }
  const [transfer] = await db
    .select()
    .from(embryoTransfers)
    .where(and(eq(embryoTransfers.id, transferId), eq(embryoTransfers.farmId, farm.farmId)))
    .limit(1);
  if (!transfer) embryoRedirect(formData, { error: "embryo" });

  const recipient = await animalInFarm(farm.farmId, transfer.recipientId);
  if (!recipient) embryoRedirect(formData, { error: "animal" });

  const [breed] = await db
    .select({ gestationDays: breeds.gestationDays })
    .from(breeds)
    .where(and(eq(breeds.id, recipient.breedId), eq(breeds.farmId, farm.farmId)))
    .limit(1);
  const gestation = breed?.gestationDays ?? (recipient.species === "buffalo" ? 310 : 280);

  await db.transaction(async (tx) => {
    await tx
      .update(embryoTransfers)
      .set({ pregnancyResult: result })
      .where(and(eq(embryoTransfers.id, transfer.id), eq(embryoTransfers.farmId, farm.farmId)));
    await tx
      .update(alerts)
      .set({ status: "done" })
      .where(and(eq(alerts.farmId, farm.farmId), eq(alerts.animalId, recipient.id), inArray(alerts.type, ["pd_due", "ai_followup"]), eq(alerts.status, "open")));

    if (result === "pregnant") {
      const expected = addDays(transfer.transferredOn, gestation);
      await tx
        .update(animals)
        .set({ reproduction: "pregnant", conceptionOn: transfer.transferredOn, expectedCalving: expected, updatedAt: new Date() })
        .where(and(eq(animals.id, recipient.id), eq(animals.farmId, farm.farmId)));
      await tx.insert(alerts).values({
        farmId: farm.farmId,
        animalId: recipient.id,
        type: "calving_due",
        title: "Expected calving",
        body: `${recipient.code} expected calving ${expected} (embryo transfer ${transfer.transferredOn}).`,
        dueOn: expected,
      });
    } else if (result === "not_pregnant") {
      await tx
        .update(animals)
        .set({ reproduction: "open", conceptionOn: null, expectedCalving: null, updatedAt: new Date() })
        .where(and(eq(animals.id, recipient.id), eq(animals.farmId, farm.farmId)));
    }

    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "embryo",
      entityId: transfer.embryoId,
      summary: `Transfer pregnancy result for ${recipient.code}: ${result}`,
      before: { pregnancyResult: transfer.pregnancyResult },
      after: { pregnancyResult: result },
    });
  });
  embryoRedirect(formData, { saved: true });
}

export async function discardEmbryo(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles)) embryoRedirect(formData, { error: "role" });
  const code = text(formData, "code");
  const reason = text(formData, "reason");
  if (!reason) embryoRedirect(formData, { error: "reason" });

  let discarded = false;
  await db.transaction(async (tx) => {
    const [embryo] = await tx
      .select()
      .from(embryos)
      .where(and(eq(embryos.farmId, farm.farmId), eq(embryos.code, code)))
      .for("update")
      .limit(1);
    if (!embryo || embryo.status !== "in_stock") return;
    await tx
      .update(embryos)
      .set({ status: "discarded" })
      .where(and(eq(embryos.id, embryo.id), eq(embryos.farmId, farm.farmId)));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "embryo",
      entityId: embryo.id,
      summary: `Discarded embryo ${code}: ${reason}`,
      before: { status: embryo.status },
      after: { status: "discarded", reason },
    });
    discarded = true;
  });
  if (!discarded) embryoRedirect(formData, { error: "embryo" });
  embryoRedirect(formData, { saved: true });
}

export async function recordFlush(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles)) embryoRedirect(formData, { error: "role" });
  const donor = await animalInFarm(farm.farmId, text(formData, "donorId"));
  if (!donor || donor.sex !== "female" || donor.presence !== "on_farm") embryoRedirect(formData, { error: "animal" });
  const flushedOn = parseFarmDate(text(formData, "flushedOn") || farmToday(farm.timezone));
  if (!flushedOn) embryoRedirect(formData, { error: "date" });
  const oocytes = wholeNumber(text(formData, "oocytes"), 200);
  const produced = wholeNumber(text(formData, "produced"), 20);
  if (oocytes === null || produced === null || produced > oocytes) embryoRedirect(formData, { error: "count" });
  const sireCode = text(formData, "sireCode") || null;
  const grade = text(formData, "grade") || null;
  const location = text(formData, "location") || null;

  await db.transaction(async (tx) => {
    const existing = await tx.select({ code: embryos.code }).from(embryos).where(eq(embryos.farmId, farm.farmId));
    const codes = embryoCodeSeries(existing.map((row) => row.code), flushedOn, produced);
    if (codes.length > 0) {
      await tx.insert(embryos).values(
        codes.map((code) => ({
          farmId: farm.farmId,
          code,
          donorId: donor.id,
          sireCode,
          grade,
          storage: "fresh",
          location,
          status: "in_stock",
        })),
      );
    }
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "flush",
      entityId: donor.id,
      summary: `OPU ${donor.code}: ${oocytes} oocytes, ${produced} embryos`,
      after: { flushedOn, oocytes, produced, sireCode, codes },
    });
  });
  embryoRedirect(formData, { saved: true });
}

export async function saveListing(formData: FormData) {
  const farm = await requireFarm();
  const returnTo = safeBack(text(formData, "returnTo"), "");
  if (!canPublish(farm.roles)) redirect(returnTo ? appendQuery(returnTo, "error", "role") : "/animals?error=role");
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal) redirect("/animals?error=animal");
  const safeCode = encodeURIComponent(animal.code);
  const target = returnTo || `/animals/${safeCode}?tab=listing`;

  const priceRaw = text(formData, "price");
  const priceNum = priceRaw ? Number(priceRaw) : null;
  if (priceRaw && (priceNum === null || !Number.isFinite(priceNum) || priceNum < 0 || priceNum > 100_000_000)) {
    redirect(appendQuery(target, "error", "price"));
  }
  const depthRaw = Number(text(formData, "pedigreeDepth") || "2");
  const pedigreeDepth = Number.isInteger(depthRaw) && depthRaw >= 1 && depthRaw <= 3 ? depthRaw : 2;
  const values = {
    category: text(formData, "category") || "cows",
    price: priceNum !== null ? priceNum.toFixed(2) : null,
    published: formData.get("published") === "on" ? "yes" : "no",
    showName: formData.has("showName") ? (formData.get("showName") === "on" ? "yes" : "no") : "yes",
    showPedigree: formData.get("showPedigree") === "on" ? "yes" : "no",
    pedigreeDepth,
    showMilk: formData.get("showMilk") === "on" ? "yes" : "no",
    showPregnancy: formData.get("showPregnancy") === "on" ? "yes" : "no",
    publicHealthNote: text(formData, "publicHealthNote") || null,
    publicNote: text(formData, "publicNote") || null,
  };

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(listings)
      .where(and(eq(listings.farmId, farm.farmId), eq(listings.animalId, animal.id)))
      .orderBy(desc(listings.createdAt))
      .limit(1);
    if (existing) {
      await tx
        .update(listings)
        .set(values)
        .where(and(eq(listings.id, existing.id), eq(listings.farmId, farm.farmId)));
      await writeAudit(tx, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "update",
        entity: "listing",
        entityId: existing.id,
        summary: `Listing ${values.published === "yes" ? "published" : "unpublished"} for ${animal.code}`,
        before: { published: existing.published, price: existing.price, category: existing.category },
        after: { published: values.published, price: values.price, category: values.category },
      });
    } else {
      const [created] = await tx
        .insert(listings)
        .values({ farmId: farm.farmId, animalId: animal.id, ...values })
        .returning({ id: listings.id });
      await writeAudit(tx, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "create",
        entity: "listing",
        entityId: created.id,
        summary: `Listing ${values.published === "yes" ? "published" : "saved"} for ${animal.code}`,
        after: { published: values.published, price: values.price, category: values.category },
      });
    }
  });
  redirect(appendQuery(target, "saved", "1"));
}

export async function toggleListing(formData: FormData) {
  const farm = await requireFarm();
  const returnTo = safeBack(text(formData, "returnTo"), "/listings");
  if (!canPublish(farm.roles)) redirect(appendQuery(returnTo, "error", "role"));
  const id = text(formData, "id");
  const nextPublished = text(formData, "published") === "yes" ? "yes" : "no";
  const [current] = await db
    .select()
    .from(listings)
    .where(and(eq(listings.id, id), eq(listings.farmId, farm.farmId)))
    .limit(1);
  if (!current) redirect(returnTo);

  await db.transaction(async (tx) => {
    await tx
      .update(listings)
      .set({ published: nextPublished })
      .where(and(eq(listings.id, current.id), eq(listings.farmId, farm.farmId)));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "listing",
      entityId: current.id,
      summary: `${nextPublished === "yes" ? "Published" : "Unpublished"} ${current.category} listing`,
      before: { published: current.published },
      after: { published: nextPublished },
    });
  });
  redirect(appendQuery(returnTo, "saved", "1"));
}

export async function saveStockListing(formData: FormData) {
  const farm = await requireFarm();
  const returnTo = safeBack(text(formData, "returnTo"), "/shop");
  if (!canPublish(farm.roles)) redirect(appendQuery(returnTo, "error", "role"));
  const category = text(formData, "category") === "embryos" ? "embryos" : "semen";
  const title = text(formData, "title");
  if (!title) redirect(appendQuery(returnTo, "error", "listing"));
  const priceRaw = text(formData, "price");
  const priceNum = priceRaw ? Number(priceRaw) : null;
  if (priceRaw && (priceNum === null || !Number.isFinite(priceNum) || priceNum < 0 || priceNum > 100_000_000)) {
    redirect(appendQuery(returnTo, "error", "price"));
  }
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(listings)
      .values({
        farmId: farm.farmId,
        category,
        price: priceNum !== null ? priceNum.toFixed(2) : null,
        published: "yes",
        publicNote: title,
      })
      .returning({ id: listings.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "listing",
      entityId: row.id,
      summary: `Published ${category} listing: ${title}`,
      after: { category, price: priceNum !== null ? priceNum.toFixed(2) : null, title },
    });
  });
  redirect(appendQuery(returnTo, "saved", "1"));
}

export async function saveProduct(formData: FormData) {
  const farm = await requireFarm();
  if (!canPublish(farm.roles)) redirect("/shop?error=role");
  const name = text(formData, "name");
  if (!name) redirect("/shop?error=product");
  const price = Number(text(formData, "price"));
  if (!Number.isFinite(price) || price <= 0 || price > 10_000_000) redirect("/shop?error=price");
  const stock = Number(text(formData, "stock"));
  if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) redirect("/shop?error=stock");

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(products)
      .values({
        farmId: farm.farmId,
        name,
        category: text(formData, "category") || "other",
        price: price.toFixed(2),
        stock,
        published: "yes",
      })
      .returning({ id: products.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "product",
      entityId: row.id,
      summary: `Added product ${name} (₹${price.toFixed(2)}, stock ${stock})`,
      after: { name, price: price.toFixed(2), stock, published: "yes" },
    });
  });
  redirect("/shop?saved=1");
}

export async function updateProduct(formData: FormData) {
  const farm = await requireFarm();
  if (!canPublish(farm.roles)) redirect("/shop?error=role");
  const id = text(formData, "id");
  const name = text(formData, "name");
  const price = Number(text(formData, "price"));
  const stock = Number(text(formData, "stock"));
  const published = formData.get("published") === "on" ? "yes" : "no";
  if (!id || !name) redirect("/shop?error=product");
  if (!Number.isFinite(price) || price <= 0 || price > 10_000_000) redirect("/shop?error=price");
  if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) redirect("/shop?error=stock");

  const [current] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.farmId, farm.farmId)))
    .limit(1);
  if (!current) redirect("/shop?error=product");

  await db.transaction(async (tx) => {
    await tx
      .update(products)
      .set({
        name,
        category: text(formData, "category") || current.category,
        price: price.toFixed(2),
        stock,
        published,
      })
      .where(and(eq(products.id, current.id), eq(products.farmId, farm.farmId)));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "product",
      entityId: current.id,
      summary: `Updated product ${name} (₹${price.toFixed(2)}, stock ${stock}, ${published === "yes" ? "published" : "hidden"})`,
      before: { name: current.name, price: current.price, stock: current.stock, published: current.published },
      after: { name, price: price.toFixed(2), stock, published },
    });
  });
  redirect("/shop?saved=1");
}

const voidable = {
  heat: heats,
  insemination: inseminations,
  pregnancy_check: pregnancyChecks,
  calving: calvings,
  dry_off: dryOffs,
  health: healthEvents,
  vaccination: vaccinations,
  deworming: dewormings,
  finance: financeEntries,
  milk: milkYields,
  weight: weights,
  feed_movement: feedMovements,
} as const;

export async function voidRecord(formData: FormData) {
  const farm = await requireFarm();
  const entity = text(formData, "entity") as keyof typeof voidable;
  const id = text(formData, "id");
  const reason = text(formData, "reason");
  const back = safeBack(text(formData, "returnTo"), "/audit");
  const table = voidable[entity];
  if (!table || !id || !reason) redirect(appendQuery(back, "error", "void"));

  let milkDateToSync: string | null = null;
  let voided = false;

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.farmId, farm.farmId)))
      .limit(1);
    if (!current || current.voidedAt) return;

    const createdBy = "createdBy" in current ? current.createdBy : null;
    const createdAt = "createdAt" in current ? current.createdAt : null;
    if (!canVoidRecord(farm.roles, entity, createdBy, farm.userId, createdAt)) return;

    await tx
      .update(table)
      .set({ voidedAt: new Date(), voidReason: reason, voidedBy: farm.userId })
      .where(and(eq(table.id, id), eq(table.farmId, farm.farmId)));

    const animalId = "animalId" in current && typeof current.animalId === "string" ? current.animalId : null;

    // Roll back derived state & alerts when voiding key records
    if (entity === "insemination" && animalId) {
      if (formData.get("restoreStraw") === "on" && "strawCode" in current && current.strawCode) {
        await tx
          .update(straws)
          .set({ status: "available", usedOnAnimalId: null, usedAt: null })
          .where(
            and(
              eq(straws.farmId, farm.farmId),
              eq(straws.code, current.strawCode),
              eq(straws.status, "used"),
              eq(straws.usedOnAnimalId, animalId),
            ),
          );
      }
      await tx
        .update(alerts)
        .set({ status: "done" })
        .where(and(eq(alerts.farmId, farm.farmId), eq(alerts.animalId, animalId), eq(alerts.type, "pd_due"), eq(alerts.status, "open")));
      const remainingAis = await tx
        .select({ id: inseminations.id })
        .from(inseminations)
        .where(and(eq(inseminations.farmId, farm.farmId), eq(inseminations.animalId, animalId), isNull(inseminations.voidedAt)));
      if (remainingAis.length === 0) {
        await tx
          .update(animals)
          .set({ reproduction: "open", updatedAt: new Date() })
          .where(and(eq(animals.id, animalId), eq(animals.farmId, farm.farmId), eq(animals.reproduction, "bred")));
      }
    }

    if (entity === "pregnancy_check" && animalId) {
      const remainingPregnant = await tx
        .select({ id: pregnancyChecks.id })
        .from(pregnancyChecks)
        .where(
          and(
            eq(pregnancyChecks.farmId, farm.farmId),
            eq(pregnancyChecks.animalId, animalId),
            eq(pregnancyChecks.result, "pregnant"),
            isNull(pregnancyChecks.voidedAt),
          ),
        )
        .limit(1);
      if (remainingPregnant.length === 0) {
        const openAi = await tx
          .select({ id: inseminations.id })
          .from(inseminations)
          .where(and(eq(inseminations.farmId, farm.farmId), eq(inseminations.animalId, animalId), isNull(inseminations.voidedAt)))
          .limit(1);
        await tx
          .update(animals)
          .set({
            reproduction: openAi.length > 0 ? "bred" : "open",
            conceptionOn: null,
            expectedCalving: null,
            updatedAt: new Date(),
          })
          .where(and(eq(animals.id, animalId), eq(animals.farmId, farm.farmId)));
        await tx
          .update(alerts)
          .set({ status: "done" })
          .where(
            and(
              eq(alerts.farmId, farm.farmId),
              eq(alerts.animalId, animalId),
              inArray(alerts.type, ["calving_due", "dry_off", "ai_followup"]),
              eq(alerts.status, "open"),
            ),
          );
      }
    }

    if (entity === "dry_off" && animalId) {
      await tx
        .update(animals)
        .set({ lactation: "lactating", updatedAt: new Date() })
        .where(and(eq(animals.id, animalId), eq(animals.farmId, farm.farmId), eq(animals.lactation, "dry")));
    }

    if (entity === "milk" && "recordedOn" in current) {
      milkDateToSync = current.recordedOn;
    }

    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "void",
      entity,
      entityId: id,
      summary: `Voided ${entity}: ${reason}`,
      before: current,
      after: { voidReason: reason },
    });
    voided = true;
  });

  if (!voided) redirect(appendQuery(back, "error", "void"));
  if (milkDateToSync) await syncMilkDrops(farm.farmId, milkDateToSync);
  redirect(appendQuery(back, "voided", "1"));
}
