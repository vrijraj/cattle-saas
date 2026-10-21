"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  alerts,
  animals,
  breeds,
  bulls,
  calvings,
  dewormings,
  embryoTransfers,
  embryos,
  feedItems,
  feedMovements,
  financeEntries,
  healthEvents,
  heats,
  inseminations,
  listings,
  pregnancyChecks,
  products,
  semenBatches,
  straws,
  vaccinations,
  weights,
} from "@/db/schema";
import { addDays, farmToday } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { issueAnimalCode } from "@/lib/issue-code";
import {
  canPublish,
  canRecordBreeding,
  canRecordFinance,
  canRecordHealth,
  canUseGenetics,
  canWriteAnimals,
} from "@/lib/permissions";

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
  await db.insert(heats).values({
    farmId: farm.farmId,
    animalId: animal.id,
    observedOn: text(formData, "observedOn") || farmToday(farm.timezone),
    signs: text(formData, "signs") || "standing",
    note: text(formData, "note") || null,
    createdBy: farm.userId,
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

    await tx.insert(inseminations).values({
      farmId: farm.farmId,
      animalId: animal.id,
      performedOn,
      technicianName: text(formData, "technician") || farm.userName || "Technician",
      bullCode,
      bullName: text(formData, "bullName") || null,
      batchNumber: text(formData, "batchNumber") || null,
      strawCode: strawCode || null,
      attemptNumber: Number(text(formData, "attempt") || "1") || 1,
      createdBy: farm.userId,
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
  await db.insert(pregnancyChecks).values({
    farmId: farm.farmId,
    animalId: animal.id,
    inseminationId: inseminationId || null,
    checkedOn,
    result,
    method: text(formData, "method") || null,
    createdBy: farm.userId,
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
    }
  }
  if (result === "not_pregnant") {
    await db
      .update(animals)
      .set({ reproduction: "open", conceptionOn: null, expectedCalving: null, updatedAt: new Date() })
      .where(eq(animals.id, animal.id));
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
  if (!ai) redirect(`/animals/${dam.code}?tab=breeding&event=calving&error=conception`);
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
          geneticSireCode: ai.bullCode,
          geneticSireName: ai.bullName,
          createdBy: farm.userId,
        })
        .returning();
      calfId = calf.id;
    }
    await tx.insert(calvings).values({
      farmId: farm.farmId,
      damId: dam.id,
      inseminationId: ai.id,
      calvedOn,
      calfId,
      outcome,
      ease: text(formData, "ease") || null,
      note: text(formData, "note") || null,
      createdBy: farm.userId,
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
  });
  redirect(`/animals/${dam.code}?tab=breeding`);
}

export async function recordHealth(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordHealth(farm.roles)) redirect("/health?error=role");
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal) redirect("/health?error=animal");
  const followUp = text(formData, "followUpOn");
  await db.insert(healthEvents).values({
    farmId: farm.farmId,
    animalId: animal.id,
    eventOn: text(formData, "eventOn") || farmToday(farm.timezone),
    problem: text(formData, "problem") || "Illness",
    signs: text(formData, "signs") || null,
    diagnosis: text(formData, "diagnosis") || null,
    treatment: text(formData, "treatment") || null,
    medicine: text(formData, "medicine") || null,
    dose: text(formData, "dose") || null,
    route: text(formData, "route") || null,
    veterinarian: text(formData, "veterinarian") || farm.userName,
    followUpOn: followUp || null,
    outcome: text(formData, "outcome") || "ongoing",
    createdBy: farm.userId,
  });
  if (followUp) {
    await db.insert(alerts).values({
      farmId: farm.farmId,
      animalId: animal.id,
      type: "health_followup",
      title: "Health follow-up",
      body: `${animal.code} follow-up for ${text(formData, "problem") || "treatment"} due ${followUp}.`,
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
  await db.insert(vaccinations).values({
    farmId: farm.farmId,
    animalId: animal.id,
    vaccine,
    batch: text(formData, "batch") || null,
    givenOn: text(formData, "givenOn") || farmToday(farm.timezone),
    nextDueOn: nextDue || null,
    administeredBy: farm.userName,
  });
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
  await db.insert(dewormings).values({
    farmId: farm.farmId,
    animalId: animal.id,
    product: text(formData, "product") || "Dewormer",
    givenOn: text(formData, "givenOn") || farmToday(farm.timezone),
    nextDueOn: text(formData, "nextDueOn") || null,
  });
  redirect(`/animals/${animal.code}?tab=health`);
}

export async function recordWeight(formData: FormData) {
  const farm = await requireFarm();
  const animal = await animalInFarm(farm.farmId, text(formData, "animalId"));
  if (!animal) redirect("/animals");
  const kilograms = Number(text(formData, "kilograms"));
  if (!Number.isFinite(kilograms) || kilograms <= 0 || kilograms > 1200) redirect(`/animals/${animal.code}?error=weight`);
  await db.insert(weights).values({
    farmId: farm.farmId,
    animalId: animal.id,
    weighedOn: text(formData, "weighedOn") || farmToday(farm.timezone),
    kilograms: kilograms.toFixed(1),
  });
  redirect(`/animals/${animal.code}`);
}

export async function saveBull(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles)) redirect("/semen?error=role");
  await db.insert(bulls).values({
    farmId: farm.farmId,
    code: text(formData, "code"),
    name: text(formData, "name"),
    breed: text(formData, "breed") || null,
    registrationNumber: text(formData, "registration") || null,
    semenCompany: text(formData, "company") || null,
    sireCode: text(formData, "sireCode") || null,
    damCode: text(formData, "damCode") || null,
  });
  redirect("/semen");
}

export async function saveSemenBatch(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles)) redirect("/semen?error=role");
  const quantity = Number(text(formData, "quantity") || "0");
  const [batch] = await db
    .insert(semenBatches)
    .values({
      farmId: farm.farmId,
      bullId: text(formData, "bullId"),
      batchNumber: text(formData, "batchNumber"),
      semenType: text(formData, "semenType") || "conventional",
      collectedOn: text(formData, "collectedOn") || null,
      quantityReceived: quantity,
      pricePerStraw: text(formData, "price") || null,
      receivedOn: farmToday(farm.timezone),
    })
    .returning();
  const tank = text(formData, "tank") || "Tank A";
  for (let index = 1; index <= quantity; index += 1) {
    await db.insert(straws).values({
      farmId: farm.farmId,
      batchId: batch.id,
      code: `${text(formData, "batchNumber")}-${String(index).padStart(3, "0")}`,
      tank,
      canister: text(formData, "canister") || "1",
      goblet: text(formData, "goblet") || "A",
      position: String(index),
      status: "available",
    });
  }
  redirect("/semen");
}

export async function saveFeed(formData: FormData) {
  const farm = await requireFarm();
  const name = text(formData, "name");
  let itemId = text(formData, "itemId");
  if (!itemId && name) {
    const [item] = await db
      .insert(feedItems)
      .values({
        farmId: farm.farmId,
        name,
        category: text(formData, "category") || "other",
        minimumQuantity: text(formData, "minimum") || null,
      })
      .returning();
    itemId = item.id;
  }
  const quantity = Number(text(formData, "quantity"));
  if (!itemId || !Number.isFinite(quantity)) redirect("/feed?error=1");
  await db.insert(feedMovements).values({
    farmId: farm.farmId,
    itemId,
    kind: text(formData, "kind") || "purchase",
    quantity: quantity.toFixed(1),
    unitCost: text(formData, "unitCost") || null,
    movedOn: text(formData, "movedOn") || farmToday(farm.timezone),
    note: text(formData, "note") || null,
  });
  redirect("/feed");
}

export async function saveFinance(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordFinance(farm.roles)) redirect("/finance?error=role");
  const amount = Number(text(formData, "amount"));
  if (!Number.isFinite(amount) || amount < 0) redirect("/finance?error=amount");
  await db.insert(financeEntries).values({
    farmId: farm.farmId,
    kind: text(formData, "kind") === "income" ? "income" : "expense",
    category: text(formData, "category") || "other",
    amount: amount.toFixed(2),
    entryOn: text(formData, "entryOn") || farmToday(farm.timezone),
    note: text(formData, "note") || null,
    createdBy: farm.userId,
  });
  redirect("/finance");
}

export async function saveEmbryo(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles)) redirect("/embryos?error=role");
  await db.insert(embryos).values({
    farmId: farm.farmId,
    code: text(formData, "code"),
    donorId: text(formData, "donorId") || null,
    sireCode: text(formData, "sireCode") || null,
    grade: text(formData, "grade") || null,
    storage: text(formData, "storage") || "frozen",
    frozenOn: text(formData, "frozenOn") || null,
    location: text(formData, "location") || null,
  });
  redirect("/embryos");
}

export async function transferEmbryo(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles)) redirect("/embryos?error=role");
  const embryoId = text(formData, "embryoId");
  const recipientId = text(formData, "recipientId");
  await db.insert(embryoTransfers).values({
    farmId: farm.farmId,
    embryoId,
    recipientId,
    transferredOn: text(formData, "transferredOn") || farmToday(farm.timezone),
  });
  await db.update(embryos).set({ status: "transferred" }).where(and(eq(embryos.id, embryoId), eq(embryos.farmId, farm.farmId)));
  redirect("/embryos");
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
