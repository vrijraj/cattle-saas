"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
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
  milkYields,
  listings,
  locations,
  pregnancyChecks,
  products,
  semenBatches,
  straws,
  vaccinations,
  weights,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { calfSireFromConception } from "@/lib/calving-sire";
import { embryoCodeSeries } from "@/lib/embryo-stock";
import { canonicalCategory } from "@/lib/finance-suggestions";
import { isFeedCategory, isFeedKind } from "@/lib/feed-stock";
import { dryOffDueOn } from "@/lib/lactation";
import { addDays, farmToday, formatDisplayDate, parseFarmDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { issueAnimalCode } from "@/lib/issue-code";
import {
  canPublish,
  canRecordBreeding,
  canRecordFeed,
  canRecordFinance,
  canRecordHealth,
  canUseGenetics,
  canWriteAnimals,
  canWriteMilk,
} from "@/lib/permissions";
import { putPrivateObject, storageConfigured } from "@/lib/storage";
import { syncMilkDrops } from "@/lib/sync-milk-drops";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
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
  if (!canRecordBreeding(farm.roles)) redirect("/breeding?error=role");
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal) redirect("/breeding?error=animal");
  const observedOn = text(formData, "observedOn") || farmToday(farm.timezone);
  const signs = text(formData, "signs") || "standing";
  const [row] = await db
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
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "create",
    entity: "heat",
    entityId: row.id,
    summary: `Heat recorded for ${animal.code}`,
    after: { observedOn, signs },
  });
  redirect(`/animals/${animal.code}?tab=breeding`);
}

export async function recordAi(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordBreeding(farm.roles)) redirect("/breeding?error=role");
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal || animal.sex === "male") redirect("/breeding?error=animal");
  const bullCode = text(formData, "bullCode");
  if (!bullCode) redirect(`/animals/${animal.code}?tab=breeding&event=ai&error=bull`);
  const strawCode = text(formData, "strawCode");
  const performedOn = text(formData, "performedOn") || farmToday(farm.timezone);

  await db.transaction(async (tx) => {
    if (strawCode) {
      const [straw] = await tx
        .select()
        .from(straws)
        .where(and(eq(straws.farmId, farm.farmId), eq(straws.code, strawCode)))
        .for("update")
        .limit(1);
      if (!straw || straw.status !== "available") redirect(`/animals/${animal.code}?tab=breeding&event=ai&error=straw`);
      await tx
        .update(straws)
        .set({ status: "used", usedOnAnimalId: animal.id, usedAt: new Date() })
        .where(eq(straws.id, straw.id));
    }

    const attemptInput = Number(text(formData, "attempt"));
    let attemptNumber = Number.isInteger(attemptInput) && attemptInput > 0 ? attemptInput : 0;
    if (!attemptNumber) {
      const [priorAis, priorCalvings, priorChecks] = await Promise.all([
        tx.select().from(inseminations).where(eq(inseminations.animalId, animal.id)),
        tx.select().from(calvings).where(eq(calvings.damId, animal.id)),
        tx.select().from(pregnancyChecks).where(eq(pregnancyChecks.animalId, animal.id)),
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
        bullCode,
        bullName: text(formData, "bullName") || null,
        batchNumber: text(formData, "batchNumber") || null,
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
      summary: `Insemination for ${animal.code} with ${bullCode}`,
      after: { performedOn, bullCode, strawCode: strawCode || null },
    });
    await tx
      .update(animals)
      .set({ reproduction: "bred", updatedAt: new Date() })
      .where(eq(animals.id, animal.id));
    await tx.insert(alerts).values({
      farmId: farm.farmId,
      animalId: animal.id,
      type: "pd_due",
      title: "Pregnancy check due",
      body: `${animal.code} was inseminated on ${performedOn}. Check due ${addDays(performedOn, 35)}.`,
      dueOn: addDays(performedOn, 35),
    });
  });
  redirect(`/animals/${animal.code}?tab=breeding`);
}

export async function recordPd(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordBreeding(farm.roles)) redirect("/breeding?error=role");
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal) redirect("/breeding?error=animal");
  const result = text(formData, "result");
  const inseminationId = text(formData, "inseminationId");
  const checkedOn = text(formData, "checkedOn") || farmToday(farm.timezone);
  const [row] = await db
    .insert(pregnancyChecks)
    .values({
      farmId: farm.farmId,
      animalId: animal.id,
      inseminationId: inseminationId || null,
      checkedOn,
      result,
      method: text(formData, "method") || null,
      createdBy: farm.userId,
    })
    .returning({ id: pregnancyChecks.id });
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "create",
    entity: "pregnancy_check",
    entityId: row.id,
    summary: `Pregnancy check for ${animal.code}: ${result}`,
    after: { checkedOn, result },
  });

  if (result === "pregnant" && inseminationId) {
    const [ai] = await db.select().from(inseminations).where(eq(inseminations.id, inseminationId)).limit(1);
    const [breed] = await db.select().from(breeds).where(eq(breeds.id, animal.breedId)).limit(1);
    const gestation = breed?.gestationDays ?? 280;
    const expected = ai ? addDays(ai.performedOn, gestation) : null;
    await db
      .update(animals)
      .set({
        reproduction: "pregnant",
        conceptionOn: ai?.performedOn ?? null,
        expectedCalving: expected,
        updatedAt: new Date(),
      })
      .where(eq(animals.id, animal.id));
    if (expected) {
      await db.insert(alerts).values({
        farmId: farm.farmId,
        animalId: animal.id,
        type: "calving_due",
        title: "Expected calving",
        body: `${animal.code} expected calving ${expected} (calculated, ${gestation} days from ${ai?.performedOn}).`,
        dueOn: expected,
      });
      if (animal.lactation === "lactating") {
        const dryOn = dryOffDueOn(expected, animal.species);
        await db.insert(alerts).values({
          farmId: farm.farmId,
          animalId: animal.id,
          type: "dry_off",
          title: "Dry-off due",
          body: `${animal.code} dry-off due ${dryOn}, ${animal.species === "buffalo" ? 90 : 60} days before expected calving ${expected}.`,
          dueOn: dryOn,
        });
      }
    }
  }
  if (result === "not_pregnant") {
    await db
      .update(animals)
      .set({ reproduction: "open", conceptionOn: null, expectedCalving: null, updatedAt: new Date() })
      .where(eq(animals.id, animal.id));
  }
  if (result === "doubtful") {
    const recheckOn = addDays(checkedOn, 14);
    await db.insert(alerts).values({
      farmId: farm.farmId,
      animalId: animal.id,
      type: "ai_followup",
      title: "AI follow-up / PD recheck",
      body: `${animal.code} had a doubtful pregnancy check on ${checkedOn}. Follow-up check due ${recheckOn}.`,
      dueOn: recheckOn,
    });
  }
  await db
    .update(alerts)
    .set({ status: "done" })
    .where(and(eq(alerts.animalId, animal.id), eq(alerts.type, "pd_due"), eq(alerts.status, "open")));
  redirect(`/animals/${animal.code}?tab=breeding`);
}

export async function recordCalving(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordBreeding(farm.roles)) redirect("/breeding?error=role");
  const dam = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!dam || dam.sex === "male") redirect("/breeding?error=animal");
  const inseminationId = text(formData, "inseminationId");
  if (!inseminationId) redirect(`/animals/${dam.code}?tab=breeding&event=calving&error=conception`);
  const [ai] = await db
    .select()
    .from(inseminations)
    .where(and(eq(inseminations.id, inseminationId), eq(inseminations.animalId, dam.id)))
    .limit(1);
  const sire = calfSireFromConception(ai ?? null);
  if (!ai || !sire) redirect(`/animals/${dam.code}?tab=breeding&event=calving&error=conception`);
  const outcome = text(formData, "outcome") || "live";
  const calvedOn = text(formData, "calvedOn") || farmToday(farm.timezone);
  const sex = text(formData, "calfSex") === "male" ? "male" : "female";

  await db.transaction(async (tx) => {
    let calfId: string | null = null;
    if (outcome === "live") {
      const [breed] = await tx.select().from(breeds).where(eq(breeds.id, dam.breedId)).limit(1);
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
          presence: "on_farm",
          lifeStage: "calf",
          reproduction: sex === "male" ? "not_applicable" : "open",
          lactation: sex === "male" ? "not_applicable" : "pre_lactation",
          locationId: dam.locationId,
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
      after: { calvedOn, outcome, calfId },
    });
    await tx
      .update(animals)
      .set({
        reproduction: "fresh",
        lactation: outcome === "live" ? "lactating" : dam.lactation,
        lifeStage: "cow",
        updatedAt: new Date(),
      })
      .where(eq(animals.id, dam.id));
    await tx
      .update(alerts)
      .set({ status: "done" })
      .where(and(eq(alerts.animalId, dam.id), eq(alerts.type, "calving_due"), eq(alerts.status, "open")));
  });
  redirect(`/animals/${dam.code}?tab=breeding`);
}

export async function recordDryOff(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordBreeding(farm.roles)) redirect("/breeding?error=role");
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal || animal.sex === "male") redirect("/breeding?error=animal");
  if (animal.lactation !== "lactating") redirect(`/animals/${animal.code}?tab=breeding&error=dry`);
  const driedOn = text(formData, "driedOn") || farmToday(farm.timezone);
  const [row] = await db
    .insert(dryOffs)
    .values({
      farmId: farm.farmId,
      animalId: animal.id,
      driedOn,
      note: text(formData, "note") || null,
      createdBy: farm.userId,
    })
    .returning({ id: dryOffs.id });
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "create",
    entity: "dry_off",
    entityId: row.id,
    summary: `Dry-off for ${animal.code}`,
    after: { driedOn },
  });
  await db.update(animals).set({ lactation: "dry", updatedAt: new Date() }).where(eq(animals.id, animal.id));
  await db
    .update(alerts)
    .set({ status: "done" })
    .where(and(eq(alerts.animalId, animal.id), eq(alerts.type, "dry_off"), eq(alerts.status, "open")));
  redirect(`/animals/${animal.code}?tab=breeding`);
}

const attachmentExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export async function recordHealth(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordHealth(farm.roles)) redirect("/health?error=role");
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal) redirect("/health?error=animal");
  const followUp = text(formData, "followUpOn");
  const medicine = text(formData, "medicine");
  const problem = text(formData, "problem") || "Illness";
  let attachmentKey: string | null = null;
  let attachmentName: string | null = null;
  const file = formData.get("attachment");
  if (file instanceof File && file.size > 0) {
    const ext = attachmentExtensions[file.type];
    if (ext && file.size <= 10 * 1024 * 1024 && storageConfigured()) {
      attachmentKey = `farms/${farm.farmId}/health/${animal.code}/${randomUUID()}.${ext}`;
      attachmentName = file.name || `prescription.${ext}`;
      await putPrivateObject(attachmentKey, Buffer.from(await file.arrayBuffer()), file.type);
    }
  }
  const [row] = await db
    .insert(healthEvents)
    .values({
      farmId: farm.farmId,
      animalId: animal.id,
      eventOn: text(formData, "eventOn") || farmToday(farm.timezone),
      problem,
      signs: text(formData, "signs") || null,
      diagnosis: text(formData, "diagnosis") || null,
      treatment: text(formData, "treatment") || null,
      medicine: medicine || null,
      dose: text(formData, "dose") || null,
      route: text(formData, "route") || null,
      duration: text(formData, "duration") || null,
      veterinarian: text(formData, "veterinarian") || farm.userName,
      followUpOn: followUp || null,
      outcome: text(formData, "outcome") || "ongoing",
      attachmentKey,
      attachmentName,
      createdBy: farm.userId,
    })
    .returning({ id: healthEvents.id });
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "create",
    entity: "health",
    entityId: row.id,
    summary: `Treatment for ${animal.code}: ${problem}`,
    after: { problem },
  });
  if (followUp && medicine) {
    await db.insert(alerts).values({
      farmId: farm.farmId,
      animalId: animal.id,
      type: "medication_due",
      title: "Medication due",
      body: `${animal.code} ${medicine} dose due ${followUp}.`,
      dueOn: followUp,
    });
  } else if (followUp) {
    await db.insert(alerts).values({
      farmId: farm.farmId,
      animalId: animal.id,
      type: "health_followup",
      title: "Health follow-up",
      body: `${animal.code} follow-up for ${problem} due ${followUp}.`,
      dueOn: followUp,
    });
  }
  redirect(`/animals/${animal.code}?tab=health`);
}

export async function recordVaccine(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordHealth(farm.roles)) redirect("/health?error=role");
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal) redirect("/health?error=animal");
  const nextDue = text(formData, "nextDueOn");
  const vaccine = text(formData, "vaccine") || "Vaccine";
  const [row] = await db
    .insert(vaccinations)
    .values({
      farmId: farm.farmId,
      animalId: animal.id,
      vaccine,
      batch: text(formData, "batch") || null,
      givenOn: text(formData, "givenOn") || farmToday(farm.timezone),
      nextDueOn: nextDue || null,
      administeredBy: farm.userName,
    })
    .returning({ id: vaccinations.id });
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "create",
    entity: "vaccination",
    entityId: row.id,
    summary: `Vaccine for ${animal.code}: ${vaccine}`,
    after: { vaccine, nextDue: nextDue || null },
  });
  await db
    .update(alerts)
    .set({ status: "done" })
    .where(and(eq(alerts.animalId, animal.id), eq(alerts.type, "vaccine_due"), eq(alerts.status, "open")));
  if (nextDue) {
    await db.insert(alerts).values({
      farmId: farm.farmId,
      animalId: animal.id,
      type: "vaccine_due",
      title: "Vaccination due",
      body: `${animal.code} ${vaccine} due ${nextDue}.`,
      dueOn: nextDue,
    });
  }
  redirect(`/animals/${animal.code}?tab=health`);
}

export async function recordDeworming(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordHealth(farm.roles)) redirect("/health?error=role");
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal) redirect("/health?error=animal");
  const product = text(formData, "product") || "Dewormer";
  const [row] = await db
    .insert(dewormings)
    .values({
      farmId: farm.farmId,
      animalId: animal.id,
      product,
      givenOn: text(formData, "givenOn") || farmToday(farm.timezone),
      nextDueOn: text(formData, "nextDueOn") || null,
    })
    .returning({ id: dewormings.id });
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "create",
    entity: "deworming",
    entityId: row.id,
    summary: `Deworming for ${animal.code}: ${product}`,
    after: { product },
  });
  await db
    .update(alerts)
    .set({ status: "done" })
    .where(and(eq(alerts.animalId, animal.id), eq(alerts.type, "deworming_due"), eq(alerts.status, "open")));
  const nextDue = text(formData, "nextDueOn");
  if (nextDue) {
    await db.insert(alerts).values({
      farmId: farm.farmId,
      animalId: animal.id,
      type: "deworming_due",
      title: "Deworming due",
      body: `${animal.code} ${product} due ${nextDue}.`,
      dueOn: nextDue,
    });
  }
  redirect(`/animals/${animal.code}?tab=health`);
}

export async function recordWeight(formData: FormData) {
  const farm = await requireFarm();
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal) redirect("/animals");
  if (!canWriteMilk(farm.roles) && !canWriteAnimals(farm.roles)) redirect(`/animals/${animal.code}?error=role`);
  const kilograms = Number(text(formData, "kilograms"));
  if (!Number.isFinite(kilograms) || kilograms <= 0 || kilograms > 1200) redirect(`/animals/${animal.code}?error=weight`);
  await db.insert(weights).values({
    farmId: farm.farmId,
    animalId: animal.id,
    weighedOn: text(formData, "weighedOn") || farmToday(farm.timezone),
    kilograms: kilograms.toFixed(1),
    note: text(formData, "note") || null,
  });
  redirect(`/animals/${animal.code}`);
}

export async function recordAnimalMilk(formData: FormData) {
  const farm = await requireFarm();
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal) redirect("/animals");
  if (!canWriteMilk(farm.roles)) redirect(`/animals/${animal.code}?tab=milk&error=role`);
  const today = farmToday(farm.timezone);
  const recordedOn = parseFarmDate(text(formData, "recordedOn") || today);
  if (!recordedOn || recordedOn > today) redirect(`/animals/${animal.code}?tab=milk&error=date`);

  const morningRaw = text(formData, "morningLitres");
  const eveningRaw = text(formData, "eveningLitres");
  const morningNum = morningRaw ? Number(morningRaw) : null;
  const eveningNum = eveningRaw ? Number(eveningRaw) : null;
  if (
    (morningNum !== null && (!Number.isFinite(morningNum) || morningNum < 0 || morningNum > 80)) ||
    (eveningNum !== null && (!Number.isFinite(eveningNum) || eveningNum < 0 || eveningNum > 80)) ||
    (morningNum === null && eveningNum === null)
  ) {
    redirect(`/animals/${animal.code}?tab=milk&error=milk`);
  }
  const morning = morningNum !== null ? morningNum.toFixed(1) : null;
  const evening = eveningNum !== null ? eveningNum.toFixed(1) : null;

  const [saved] = await db
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

  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "update",
    entity: "milk",
    entityId: saved.id,
    summary: `Milk for ${animal.code} on ${formatDisplayDate(recordedOn)}: ${[morning ? `${morning} L morning` : "", evening ? `${evening} L evening` : ""].filter(Boolean).join(", ")}`,
    after: { recordedOn, morning, evening },
  });

  await syncMilkDrops(farm.farmId, recordedOn);
  redirect(`/animals/${animal.code}?tab=milk`);
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
    const ext = attachmentExtensions[photo.type];
    if (ext && ext !== "pdf" && photo.size <= 5 * 1024 * 1024 && storageConfigured()) {
      photoKey = `farms/${farm.farmId}/bulls/${code}/${randomUUID()}.${ext}`;
      await putPrivateObject(photoKey, Buffer.from(await photo.arrayBuffer()), photo.type);
    }
  }
  const [bull] = await db
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
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "create",
    entity: "bull",
    entityId: bull.id,
    summary: `Bull ${code} · ${name}`,
    after: { code, name },
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
  const collectedOn = text(formData, "collectedOn");
  const receivedOn = text(formData, "receivedOn") || farmToday(farm.timezone);
  if (!batchNumber) semenRedirect(formData, { error: "batch" });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 200) semenRedirect(formData, { error: "quantity" });
  if (semenType !== "conventional" && semenType !== "sexed_female" && semenType !== "sexed_male") semenRedirect(formData, { error: "type" });
  if (price && (!Number.isFinite(Number(price)) || Number(price) < 0)) semenRedirect(formData, { error: "cost" });
  if ((collectedOn && !/^\d{4}-\d{2}-\d{2}$/.test(collectedOn)) || !/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) semenRedirect(formData, { error: "date" });
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
  const [batch] = await db
    .insert(semenBatches)
    .values({
      farmId: farm.farmId,
      bullId,
      batchNumber,
      semenType,
      collectedOn: collectedOn || null,
      quantityReceived: quantity,
      pricePerStraw: price || null,
      receivedOn,
    })
    .returning();
  const tank = text(formData, "tank") || "Tank A";
  const canister = text(formData, "canister") || "1";
  const goblet = text(formData, "goblet") || "A";
  for (const [index, code] of codes.entries()) {
    await db.insert(straws).values({
      farmId: farm.farmId,
      batchId: batch.id,
      code,
      tank,
      canister,
      goblet,
      position: String(index + 1),
      status: "available",
    });
  }
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "create",
    entity: "semen",
    entityId: batch.id,
    summary: `Batch ${batchNumber} · ${quantity} straws`,
    after: { batchNumber, quantity, semenType },
  });
  semenRedirect(formData, { saved: true });
}

export async function discardStraw(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles)) semenRedirect(formData, { error: "role" });
  const code = text(formData, "code");
  const reason = text(formData, "reason");
  if (!reason) semenRedirect(formData, { error: "reason" });
  const [straw] = await db
    .select()
    .from(straws)
    .where(and(eq(straws.farmId, farm.farmId), eq(straws.code, code)))
    .limit(1);
  if (!straw || straw.status !== "available") semenRedirect(formData, { error: "adjust" });
  await db.update(straws).set({ status: "discarded" }).where(eq(straws.id, straw.id));
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "update",
    entity: "semen",
    entityId: straw.id,
    summary: `Discarded straw ${code}: ${reason}`,
    before: { status: straw.status },
    after: { status: "discarded", reason },
  });
  semenRedirect(formData, { saved: true });
}

export async function saveFeed(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordFeed(farm.roles)) redirect("/feed?error=role");
  const name = text(formData, "name");
  let itemId = text(formData, "itemId");
  const category = text(formData, "category") || "other";
  if (!isFeedCategory(category)) redirect("/feed?error=item");
  if (!itemId && name) {
    const minimum = text(formData, "minimum");
    if (minimum && (!Number.isFinite(Number(minimum)) || Number(minimum) < 0)) redirect("/feed?error=quantity");
    const [item] = await db
      .insert(feedItems)
      .values({
        farmId: farm.farmId,
        name,
        category,
        minimumQuantity: minimum || null,
      })
      .returning();
    itemId = item.id;
  }
  if (!itemId) redirect("/feed?error=item");
  const [item] = await db
    .select({ id: feedItems.id })
    .from(feedItems)
    .where(and(eq(feedItems.id, itemId), eq(feedItems.farmId, farm.farmId)))
    .limit(1);
  if (!item) redirect("/feed?error=item");
  const quantity = Number(text(formData, "quantity"));
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) redirect("/feed?error=quantity");
  const kind = text(formData, "kind") || "purchase";
  if (!isFeedKind(kind)) redirect("/feed?error=kind");
  const unitCost = text(formData, "unitCost");
  if (unitCost && (!Number.isFinite(Number(unitCost)) || Number(unitCost) < 0)) redirect("/feed?error=cost");
  const movedOn = text(formData, "movedOn") || farmToday(farm.timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(movedOn)) redirect("/feed?error=date");

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
      if (!shed) redirect("/feed?error=target");
      note = `Shed · ${shed.name}`;
    }
    if (allocation.startsWith("animal:")) {
      const [animal] = await db
        .select({ code: animals.code, name: animals.name })
        .from(animals)
        .where(and(eq(animals.code, allocation.slice(7)), eq(animals.farmId, farm.farmId)))
        .limit(1);
      if (!animal) redirect("/feed?error=target");
      note = `${animal.name ?? animal.code} · ${animal.code}`;
    }
    if (allocation && allocation !== "herd" && !allocation.startsWith("shed:") && !allocation.startsWith("animal:")) {
      redirect("/feed?error=target");
    }
  }

  await db.insert(feedMovements).values({
    farmId: farm.farmId,
    itemId,
    kind,
    quantity: quantity.toFixed(1),
    unitCost: unitCost || null,
    movedOn,
    note,
  });
  const returnTo = text(formData, "returnTo");
  if (returnTo.startsWith("/animals/")) redirect(returnTo);
  redirect("/feed?saved=1");
}

export async function saveFinance(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordFinance(farm.roles)) redirect("/finance?error=role");
  const amount = Number(text(formData, "amount"));
  if (!Number.isFinite(amount) || amount <= 0) redirect("/finance?error=amount");
  const rawCategory = text(formData, "category");
  const prefixed = rawCategory.split(":");
  const kindFromPrefix = prefixed.length > 1 && (prefixed[0] === "income" || prefixed[0] === "expense") ? prefixed[0] : null;
  const kind = kindFromPrefix ?? (text(formData, "kind") === "income" ? "income" : "expense");
  const category = canonicalCategory(kind, kindFromPrefix ? prefixed.slice(1).join(":") : rawCategory);
  if (!category) redirect("/finance?error=category");
  const entryOn = text(formData, "entryOn") || farmToday(farm.timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryOn)) redirect("/finance?error=date");
  const requestedAnimal = text(formData, "animalId");
  const animal = requestedAnimal ? await animalInFarm(farm.farmId, requestedAnimal) : null;
  if (requestedAnimal && !animal) redirect("/finance?error=animal");
  const [row] = await db
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
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "create",
    entity: "finance",
    entityId: row.id,
    summary: `${kind} ${category} ₹${amount.toFixed(2)}`,
    after: { kind, category, amount: amount.toFixed(2) },
  });
  redirect("/finance?saved=1");
}

function wholeNumber(value: string, max: number) {
  if (!value) return null;
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > max) return null;
  return amount;
}

function isoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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
  const frozenOn = text(formData, "frozenOn");
  const donorId = text(formData, "donorId");
  if (!code) embryoRedirect(formData, { error: "code" });
  if (storage !== "fresh" && storage !== "frozen") embryoRedirect(formData, { error: "storage" });
  if (frozenOn && !isoDate(frozenOn)) embryoRedirect(formData, { error: "date" });
  const [duplicate] = await db
    .select({ id: embryos.id })
    .from(embryos)
    .where(and(eq(embryos.farmId, farm.farmId), eq(embryos.code, code)))
    .limit(1);
  if (duplicate) embryoRedirect(formData, { error: "code" });
  const donor = donorId ? await animalInFarm(farm.farmId, donorId) : null;
  if (donorId && (!donor || donor.sex !== "female" || donor.presence !== "on_farm")) embryoRedirect(formData, { error: "animal" });
  const [row] = await db
    .insert(embryos)
    .values({
      farmId: farm.farmId,
      code,
      donorId: donor?.id ?? null,
      sireCode: text(formData, "sireCode") || null,
      grade: text(formData, "grade") || null,
      storage,
      frozenOn: frozenOn || null,
      location: text(formData, "location") || null,
      status: "in_stock",
    })
    .returning({ id: embryos.id });
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "create",
    entity: "embryo",
    entityId: row.id,
    summary: `Embryo ${code}`,
    after: { code, storage },
  });
  embryoRedirect(formData, { saved: true });
}

export async function transferEmbryo(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles)) embryoRedirect(formData, { error: "role" });
  const embryoId = text(formData, "embryoId");
  const recipientId = text(formData, "recipientId");
  const transferredOn = text(formData, "transferredOn") || farmToday(farm.timezone);
  const pregnancyResult = text(formData, "pregnancyResult");
  if (!isoDate(transferredOn)) embryoRedirect(formData, { error: "date" });
  if (pregnancyResult && pregnancyResult !== "pregnant" && pregnancyResult !== "not_pregnant" && pregnancyResult !== "doubtful") {
    embryoRedirect(formData, { error: "result" });
  }
  const [embryo] = await db
    .select()
    .from(embryos)
    .where(and(eq(embryos.id, embryoId), eq(embryos.farmId, farm.farmId)))
    .limit(1);
  if (!embryo || embryo.status !== "in_stock") embryoRedirect(formData, { error: "embryo" });
  const recipient = await animalInFarm(farm.farmId, recipientId);
  if (!recipient || recipient.sex !== "female" || recipient.presence !== "on_farm") embryoRedirect(formData, { error: "animal" });
  const [transfer] = await db
    .insert(embryoTransfers)
    .values({
      farmId: farm.farmId,
      embryoId,
      recipientId,
      transferredOn,
      pregnancyResult: pregnancyResult || null,
    })
    .returning({ id: embryoTransfers.id });
  await db.update(embryos).set({ status: "transferred" }).where(and(eq(embryos.id, embryoId), eq(embryos.farmId, farm.farmId)));
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "update",
    entity: "embryo",
    entityId: embryoId,
    summary: `Transferred ${embryo.code} to ${recipient.code}`,
    before: { status: embryo.status },
    after: { status: "transferred", transferId: transfer.id, pregnancyResult: pregnancyResult || null },
  });
  embryoRedirect(formData, { saved: true });
}

export async function discardEmbryo(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles)) embryoRedirect(formData, { error: "role" });
  const code = text(formData, "code");
  const reason = text(formData, "reason");
  if (!reason) embryoRedirect(formData, { error: "reason" });
  const [embryo] = await db
    .select()
    .from(embryos)
    .where(and(eq(embryos.farmId, farm.farmId), eq(embryos.code, code)))
    .limit(1);
  if (!embryo || embryo.status !== "in_stock") embryoRedirect(formData, { error: "embryo" });
  await db.update(embryos).set({ status: "discarded" }).where(eq(embryos.id, embryo.id));
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "update",
    entity: "embryo",
    entityId: embryo.id,
    summary: `Discarded embryo ${code}: ${reason}`,
    before: { status: embryo.status },
    after: { status: "discarded", reason },
  });
  embryoRedirect(formData, { saved: true });
}

export async function recordFlush(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles)) embryoRedirect(formData, { error: "role" });
  const donor = await animalInFarm(farm.farmId, text(formData, "donorId"));
  if (!donor || donor.sex !== "female" || donor.presence !== "on_farm") embryoRedirect(formData, { error: "animal" });
  const flushedOn = text(formData, "flushedOn") || farmToday(farm.timezone);
  if (!isoDate(flushedOn)) embryoRedirect(formData, { error: "date" });
  const oocytes = wholeNumber(text(formData, "oocytes"), 200);
  const produced = wholeNumber(text(formData, "produced"), 20);
  if (oocytes === null || produced === null) embryoRedirect(formData, { error: "count" });
  const sireCode = text(formData, "sireCode") || null;
  const grade = text(formData, "grade") || null;
  const location = text(formData, "location") || null;
  const existing = await db.select({ code: embryos.code }).from(embryos).where(eq(embryos.farmId, farm.farmId));
  const codes = embryoCodeSeries(existing.map((row) => row.code), flushedOn, produced);
  for (const code of codes) {
    await db.insert(embryos).values({
      farmId: farm.farmId,
      code,
      donorId: donor.id,
      sireCode,
      grade,
      storage: "fresh",
      location,
      status: "in_stock",
    });
  }
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "create",
    entity: "flush",
    entityId: donor.id,
    summary: `OPU ${donor.code}: ${oocytes} oocytes, ${produced} embryos`,
    after: { flushedOn, oocytes, produced, sireCode, codes },
  });
  embryoRedirect(formData, { saved: true });
}

export async function saveListing(formData: FormData) {
  const farm = await requireFarm();
  if (!canPublish(farm.roles) && !canWriteAnimals(farm.roles)) redirect("/animals");
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal) redirect("/animals");
  await db.insert(listings).values({
    farmId: farm.farmId,
    animalId: animal.id,
    category: text(formData, "category") || "cows",
    price: text(formData, "price") || null,
    published: formData.get("published") === "on" ? "yes" : "no",
    showPedigree: formData.get("showPedigree") === "on" ? "yes" : "no",
    showPregnancy: formData.get("showPregnancy") === "on" ? "yes" : "no",
    publicNote: text(formData, "publicNote") || null,
  });
  redirect(`/animals/${animal.code}?tab=listing`);
}

export async function saveStockListing(formData: FormData) {
  const farm = await requireFarm();
  if (!canPublish(farm.roles)) redirect("/shop?error=role");
  const category = text(formData, "category") === "embryos" ? "embryos" : "semen";
  const title = text(formData, "title");
  if (!title) redirect("/shop?error=listing");
  await db.insert(listings).values({
    farmId: farm.farmId,
    category,
    price: text(formData, "price") || null,
    published: "yes",
    publicNote: title,
  });
  redirect("/shop");
}

export async function saveProduct(formData: FormData) {
  const farm = await requireFarm();
  if (!canPublish(farm.roles)) redirect("/shop?error=role");
  await db.insert(products).values({
    farmId: farm.farmId,
    name: text(formData, "name"),
    category: text(formData, "category") || "other",
    price: Number(text(formData, "price") || "0").toFixed(2),
    stock: Number(text(formData, "stock") || "0"),
    published: "yes",
  });
  redirect("/shop");
}

const voidable = {
  heat: heats,
  insemination: inseminations,
  pregnancy_check: pregnancyChecks,
  calving: calvings,
  health: healthEvents,
  vaccination: vaccinations,
  deworming: dewormings,
  finance: financeEntries,
  milk: milkYields,
} as const;

export async function voidRecord(formData: FormData) {
  const farm = await requireFarm();
  const entity = text(formData, "entity") as keyof typeof voidable;
  const id = text(formData, "id");
  const reason = text(formData, "reason");
  const returnTo = text(formData, "returnTo");
  const back = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/audit";
  const table = voidable[entity];
  if (!table || !id || !reason) redirect(back);

  const breeding = entity === "heat" || entity === "insemination" || entity === "pregnancy_check" || entity === "calving";
  const health = entity === "health" || entity === "vaccination" || entity === "deworming";
  if (breeding && !canRecordBreeding(farm.roles)) redirect(back);
  if (health && !canRecordHealth(farm.roles)) redirect(back);
  if (entity === "finance" && !canRecordFinance(farm.roles)) redirect(back);
  if (entity === "milk" && !canWriteMilk(farm.roles)) redirect(back);

  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(table).where(and(eq(table.id, id), eq(table.farmId, farm.farmId))).limit(1);
    if (!current || current.voidedAt) return;
    await tx.update(table).set({ voidedAt: new Date(), voidReason: reason, voidedBy: farm.userId }).where(eq(table.id, id));
    if (entity === "insemination" && formData.get("restoreStraw") === "on" && "strawCode" in current && current.strawCode) {
      await tx
        .update(straws)
        .set({ status: "available", usedOnAnimalId: null, usedAt: null })
        .where(and(eq(straws.farmId, farm.farmId), eq(straws.code, current.strawCode)));
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
  });
  redirect(back);
}
