"use server";

import { randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { animals, breeds, bulls, locationMoves, locations } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { farmToday, parseFarmDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { issueAnimalCode } from "@/lib/issue-code";
import { parentLinkCreatesCycle, type PedigreeAnimal } from "@/lib/pedigree-tree";
import { canManageTeam, canOverrideStatus, canWriteAnimals } from "@/lib/permissions";
import { checkAnimalQuota } from "@/lib/plans";

const animalSchema = z.object({
  name: z.string().trim().max(80),
  sex: z.enum(["female", "male", "unknown"]),
  breedId: z.string().min(1),
  dob: z.string(),
  dobEstimated: z.boolean(),
  earTag: z.string().trim().max(40),
  rfid: z.string().trim().max(64),
  locationId: z.string(),
  colour: z.string().trim().max(80),
  marks: z.string().trim().max(200),
  purchaseSource: z.string().trim().max(120),
  purchaseDate: z.string(),
  purchasePrice: z.string().trim(),
  lifeStage: z.enum(["calf", "heifer", "cow", "bull", "steer"]),
  reproduction: z.enum(["not_applicable", "open", "bred", "pregnant", "fresh"]),
  lactation: z.enum(["not_applicable", "pre_lactation", "lactating", "dry"]),
});

async function loadPedigreeGraph(farmId: string) {
  const [herd, bullRows] = await Promise.all([
    db
      .select({
        id: animals.id,
        code: animals.code,
        name: animals.name,
        sex: animals.sex,
        presence: animals.presence,
        geneticDamId: animals.geneticDamId,
        geneticSireCode: animals.geneticSireCode,
        geneticSireName: animals.geneticSireName,
      })
      .from(animals)
      .where(eq(animals.farmId, farmId)),
    db
      .select({
        code: bulls.code,
        name: bulls.name,
        sireCode: bulls.sireCode,
        damCode: bulls.damCode,
      })
      .from(bulls)
      .where(eq(bulls.farmId, farmId)),
  ]);
  return { herd, bullRows };
}

function pedigreeAnimalsWithBulls(
  herd: {
    id: string;
    code: string;
    name: string | null;
    sex: string;
    presence: string;
    geneticDamId: string | null;
    geneticSireCode: string | null;
    geneticSireName: string | null;
  }[],
  bullRows: { code: string; name: string; sireCode: string | null; damCode: string | null }[],
): PedigreeAnimal[] {
  const byCode = new Map(herd.map((row) => [row.code.toLowerCase(), row]));
  const bullNodes: PedigreeAnimal[] = bullRows
    .filter((bull) => !byCode.has(bull.code.toLowerCase()))
    .map((bull) => ({
      id: `bull:${bull.code}`,
      code: bull.code,
      name: bull.name,
      sex: "male",
      presence: "on_farm",
      geneticDamId: bull.damCode ? (byCode.get(bull.damCode.toLowerCase())?.id ?? `bull:${bull.damCode}`) : null,
      geneticSireCode: bull.sireCode,
      geneticSireName: bull.sireCode,
    }));
  return [...herd, ...bullNodes];
}

export async function createAnimal(_prev: { error: string }, formData: FormData): Promise<{ error: string }> {
  const farm = await requireFarm();
  if (!canWriteAnimals(farm.roles)) return { error: "Your role cannot add animals." };
  const quota = await checkAnimalQuota(farm.farmId, farm.maxAnimals);
  if (!quota.allowed) {
    return { error: `Plan limit reached (${quota.current}/${quota.limit} on-farm animals). Upgrade your plan in Farm settings.` };
  }

  const parsed = animalSchema.safeParse({
    name: formData.get("name") ?? "",
    sex: formData.get("sex"),
    breedId: formData.get("breedId"),
    dob: formData.get("dob") ?? "",
    dobEstimated: formData.get("dobEstimated") === "on",
    earTag: formData.get("earTag") ?? "",
    rfid: formData.get("rfid") ?? "",
    locationId: formData.get("locationId") ?? "",
    colour: formData.get("colour") ?? "",
    marks: formData.get("marks") ?? "",
    purchaseSource: formData.get("purchaseSource") ?? "",
    purchaseDate: formData.get("purchaseDate") ?? "",
    purchasePrice: formData.get("purchasePrice") ?? "",
    lifeStage: formData.get("lifeStage"),
    reproduction: formData.get("reproduction"),
    lactation: formData.get("lactation"),
  });
  if (!parsed.success) return { error: "Check the animal details and try again." };

  const input = parsed.data;
  const today = farmToday(farm.timezone);
  if (input.dob && (!parseFarmDate(input.dob) || input.dob > today)) return { error: "Date of birth cannot be in the future." };
  if (input.purchaseDate && (!parseFarmDate(input.purchaseDate) || input.purchaseDate > today)) return { error: "Purchase date cannot be in the future." };
  const priceNum = input.purchasePrice ? Number(input.purchasePrice) : null;
  if (priceNum !== null && (!Number.isFinite(priceNum) || priceNum < 0 || priceNum > 100_000_000)) return { error: "Purchase price must be zero or more." };
  if (input.sex === "male" && (input.reproduction === "pregnant" || input.lactation === "lactating")) {
    return { error: "A male cannot be saved as pregnant or lactating." };
  }

  const [breed] = await db
    .select()
    .from(breeds)
    .where(and(eq(breeds.id, input.breedId), eq(breeds.farmId, farm.farmId), eq(breeds.active, true)))
    .limit(1);
  if (!breed) return { error: "Choose an active breed from this farm." };

  if (input.locationId) {
    const [location] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, input.locationId), eq(locations.farmId, farm.farmId), eq(locations.active, true)))
      .limit(1);
    if (!location) return { error: "Choose an active location from this farm." };
  }

  let code: string;
  try {
    code = await db.transaction(async (tx) => {
      if (input.earTag) {
        const [taken] = await tx
          .select({ id: animals.id })
          .from(animals)
          .where(and(eq(animals.farmId, farm.farmId), eq(animals.earTag, input.earTag)))
          .limit(1);
        if (taken) throw new Error("EARTAG_TAKEN");
      }
      if (input.rfid) {
        const [takenRfid] = await tx
          .select({ id: animals.id })
          .from(animals)
          .where(and(eq(animals.farmId, farm.farmId), eq(animals.rfid, input.rfid)))
          .limit(1);
        if (takenRfid) throw new Error("RFID_TAKEN");
      }

      const animalCode = await issueAnimalCode(tx, farm.farmId, farm.animalPrefix, breed.code);
      const [created] = await tx
        .insert(animals)
        .values({
          farmId: farm.farmId,
          code: animalCode,
          name: input.name || null,
          species: breed.species,
          breedId: breed.id,
          sex: input.sex,
          dob: input.dob || null,
          dobEstimated: input.dobEstimated,
          earTag: input.earTag || null,
          rfid: input.rfid || null,
          locationId: input.locationId || null,
          colour: input.colour || null,
          marks: input.marks || null,
          purchaseSource: input.purchaseSource || null,
          purchaseDate: input.purchaseDate || null,
          purchasePrice: priceNum !== null ? priceNum.toFixed(2) : null,
          lifeStage: input.lifeStage,
          reproduction: input.sex === "male" ? "not_applicable" : input.reproduction,
          lactation: input.sex === "male" ? "not_applicable" : input.lactation,
          qrToken: randomBytes(32).toString("base64url"),
          createdBy: farm.userId,
        })
        .returning({ id: animals.id });

      if (input.locationId) {
        await tx.insert(locationMoves).values({
          farmId: farm.farmId,
          animalId: created.id,
          locationId: input.locationId,
          movedOn: today,
          note: "Initial location",
          createdBy: farm.userId,
        });
      }

      await writeAudit(tx, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "create",
        entity: "animal",
        entityId: created.id,
        summary: `Animal ${animalCode} added`,
        after: { code: animalCode, name: input.name || null, sex: input.sex, earTag: input.earTag || null, rfid: input.rfid || null },
      });
      return animalCode;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EARTAG_TAKEN") {
      return { error: "That ear tag is already used on another animal." };
    }
    if (error instanceof Error && error.message === "RFID_TAKEN") {
      return { error: "That RFID is already used on another animal." };
    }
    return { error: "Could not save animal. Check that ear tag and RFID are unique." };
  }

  redirect(`/animals/${encodeURIComponent(code)}?saved=1`);
}

const statusSchema = z.object({
  presence: z.enum(["on_farm", "sold", "dead", "transferred"]),
  lifeStage: z.enum(["calf", "heifer", "cow", "bull", "steer"]),
  reproduction: z.enum(["not_applicable", "open", "bred", "pregnant", "fresh"]),
  lactation: z.enum(["not_applicable", "pre_lactation", "lactating", "dry"]),
});

export async function updateAnimalStatus(formData: FormData) {
  const farm = await requireFarm();
  const code = String(formData.get("code") ?? "").trim();

  const [animal] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)))
    .limit(1);
  if (!animal) redirect("/animals");
  if (!canOverrideStatus(farm.roles)) redirect(`/animals/${encodeURIComponent(animal.code)}?error=status`);

  const parsed = statusSchema.safeParse({
    presence: formData.get("presence"),
    lifeStage: formData.get("lifeStage"),
    reproduction: formData.get("reproduction"),
    lactation: formData.get("lactation"),
  });
  if (!parsed.success) redirect(`/animals/${encodeURIComponent(animal.code)}?error=status`);

  const male = animal.sex === "male";
  const reproduction = male ? "not_applicable" : parsed.data.reproduction;
  const lactation = male ? "not_applicable" : parsed.data.lactation;
  const expectedRaw = String(formData.get("expectedCalving") ?? "").trim();
  if (reproduction === "pregnant" && expectedRaw && !parseFarmDate(expectedRaw)) {
    redirect(`/animals/${encodeURIComponent(animal.code)}?error=status`);
  }

  const leaving = parsed.data.presence !== "on_farm";
  const today = farmToday(farm.timezone);
  const exitOnRaw = String(formData.get("exitOn") ?? "").trim();
  const exitOn = leaving ? parseFarmDate(exitOnRaw || animal.exitOn || today) : null;
  if (leaving && !exitOn) redirect(`/animals/${encodeURIComponent(animal.code)}?error=date`);
  const exitReason = leaving ? String(formData.get("exitReason") ?? "").trim().slice(0, 200) || null : null;
  const exitAmountRaw = String(formData.get("exitAmount") ?? "").trim();
  const exitAmountNum = leaving && exitAmountRaw ? Number(exitAmountRaw) : null;
  if (exitAmountNum !== null && (!Number.isFinite(exitAmountNum) || exitAmountNum < 0 || exitAmountNum > 100_000_000)) {
    redirect(`/animals/${encodeURIComponent(animal.code)}?error=status`);
  }

  const next = {
    presence: parsed.data.presence,
    lifeStage: parsed.data.lifeStage,
    reproduction,
    lactation,
    expectedCalving: reproduction === "pregnant" ? expectedRaw || null : null,
    conceptionOn: reproduction === "pregnant" ? animal.conceptionOn : null,
    exitOn,
    exitReason,
    exitAmount: exitAmountNum !== null ? exitAmountNum.toFixed(2) : leaving ? animal.exitAmount : null,
    updatedAt: new Date(),
  };

  await db.transaction(async (tx) => {
    await tx.update(animals).set(next).where(and(eq(animals.id, animal.id), eq(animals.farmId, farm.farmId)));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "animal",
      entityId: animal.id,
      summary: `Status updated for ${animal.code}`,
      before: {
        presence: animal.presence,
        lifeStage: animal.lifeStage,
        reproduction: animal.reproduction,
        lactation: animal.lactation,
        expectedCalving: animal.expectedCalving,
        exitOn: animal.exitOn,
        exitReason: animal.exitReason,
        exitAmount: animal.exitAmount,
      },
      after: {
        presence: next.presence,
        lifeStage: next.lifeStage,
        reproduction: next.reproduction,
        lactation: next.lactation,
        expectedCalving: next.expectedCalving,
        exitOn: next.exitOn,
        exitReason: next.exitReason,
        exitAmount: next.exitAmount,
      },
    });
  });
  redirect(`/animals/${encodeURIComponent(animal.code)}?saved=1`);
}

const detailSchema = z.object({
  name: z.string().trim().max(80),
  sex: z.enum(["female", "male", "unknown"]),
  breedId: z.string().min(1),
  dob: z.string(),
  dobEstimated: z.boolean(),
  earTag: z.string().trim().max(40),
  rfid: z.string().trim().max(64),
  colour: z.string().trim().max(80),
  marks: z.string().trim().max(200),
  purchaseSource: z.string().trim().max(120),
  purchaseDate: z.string(),
  purchasePrice: z.string().trim(),
  damId: z.string(),
  sireCode: z.string().trim().max(40),
  sireName: z.string().trim().max(80),
});

export async function updateAnimalDetails(formData: FormData) {
  const farm = await requireFarm();
  const code = String(formData.get("code") ?? "").trim();
  const [animal] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)))
    .limit(1);
  if (!animal) redirect("/animals");
  function back(error: string): never {
    redirect(`/animals/${encodeURIComponent(animal.code)}?error=${error}`);
  }
  if (!canWriteAnimals(farm.roles)) back("details");

  const parsed = detailSchema.safeParse({
    name: formData.get("name") ?? "",
    sex: formData.get("sex"),
    breedId: formData.get("breedId"),
    dob: formData.get("dob") ?? "",
    dobEstimated: formData.get("dobEstimated") === "on",
    earTag: formData.get("earTag") ?? "",
    rfid: formData.get("rfid") ?? "",
    colour: formData.get("colour") ?? "",
    marks: formData.get("marks") ?? "",
    purchaseSource: formData.get("purchaseSource") ?? "",
    purchaseDate: formData.get("purchaseDate") ?? "",
    purchasePrice: formData.get("purchasePrice") ?? "",
    damId: formData.get("damId") ?? "",
    sireCode: formData.get("sireCode") ?? "",
    sireName: formData.get("sireName") ?? "",
  });
  if (!parsed.success) back("details");
  const input = parsed.data;
  const today = farmToday(farm.timezone);
  if (input.dob && (!parseFarmDate(input.dob) || input.dob > today)) back("date");
  if (input.purchaseDate && (!parseFarmDate(input.purchaseDate) || input.purchaseDate > today)) back("date");
  const priceNum = input.purchasePrice ? Number(input.purchasePrice) : null;
  if (priceNum !== null && (!Number.isFinite(priceNum) || priceNum < 0 || priceNum > 100_000_000)) back("details");

  const [breed] = await db
    .select()
    .from(breeds)
    .where(and(eq(breeds.id, input.breedId), eq(breeds.farmId, farm.farmId)))
    .limit(1);
  if (!breed) back("details");

  const { herd, bullRows } = await loadPedigreeGraph(farm.farmId);
  const graph = pedigreeAnimalsWithBulls(herd, bullRows);

  if (input.damId) {
    const dam = herd.find((row) => row.id === input.damId);
    if (!dam || dam.sex === "male" || dam.id === animal.id) back("dam");
    if (parentLinkCreatesCycle(animal.id, input.damId, input.sireCode || null, graph)) back("dam");
  }

  if (input.sireCode) {
    if (input.sireCode.toLowerCase() === animal.code.toLowerCase()) back("sire");
    if (parentLinkCreatesCycle(animal.id, input.damId || null, input.sireCode, graph)) back("sire");
  }

  const male = input.sex === "male";
  const next = {
    name: input.name || null,
    sex: input.sex,
    species: breed.species,
    breedId: breed.id,
    dob: input.dob || null,
    dobEstimated: input.dobEstimated,
    earTag: input.earTag || null,
    rfid: input.rfid || null,
    colour: input.colour || null,
    marks: input.marks || null,
    purchaseSource: input.purchaseSource || null,
    purchaseDate: input.purchaseDate || null,
    purchasePrice: priceNum !== null ? priceNum.toFixed(2) : null,
    geneticDamId: input.damId || null,
    geneticSireCode: input.sireCode || null,
    geneticSireName: input.sireCode ? input.sireName || input.sireCode : null,
    reproduction: male ? ("not_applicable" as const) : animal.sex === "male" ? ("open" as const) : animal.reproduction,
    lactation: male ? ("not_applicable" as const) : animal.sex === "male" ? ("pre_lactation" as const) : animal.lactation,
    expectedCalving: male ? null : animal.expectedCalving,
    conceptionOn: male ? null : animal.conceptionOn,
    updatedAt: new Date(),
  };

  try {
    await db.transaction(async (tx) => {
      if (input.earTag) {
        const [taken] = await tx
          .select({ id: animals.id })
          .from(animals)
          .where(and(eq(animals.farmId, farm.farmId), eq(animals.earTag, input.earTag), ne(animals.id, animal.id)))
          .limit(1);
        if (taken) throw new Error("EARTAG_TAKEN");
      }
      if (input.rfid) {
        const [takenRfid] = await tx
          .select({ id: animals.id })
          .from(animals)
          .where(and(eq(animals.farmId, farm.farmId), eq(animals.rfid, input.rfid), ne(animals.id, animal.id)))
          .limit(1);
        if (takenRfid) throw new Error("RFID_TAKEN");
      }
      await tx.update(animals).set(next).where(and(eq(animals.id, animal.id), eq(animals.farmId, farm.farmId)));
      await writeAudit(tx, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "update",
        entity: "animal",
        entityId: animal.id,
        summary: `Details updated for ${animal.code}`,
        before: {
          name: animal.name,
          sex: animal.sex,
          breedId: animal.breedId,
          dob: animal.dob,
          earTag: animal.earTag,
          rfid: animal.rfid,
          colour: animal.colour,
          marks: animal.marks,
          geneticDamId: animal.geneticDamId,
          geneticSireCode: animal.geneticSireCode,
        },
        after: {
          name: next.name,
          sex: next.sex,
          breedId: next.breedId,
          dob: next.dob,
          earTag: next.earTag,
          rfid: next.rfid,
          colour: next.colour,
          marks: next.marks,
          geneticDamId: next.geneticDamId,
          geneticSireCode: next.geneticSireCode,
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EARTAG_TAKEN") back("eartag");
    if (error instanceof Error && error.message === "RFID_TAKEN") back("rfid");
    back("details");
  }
  redirect(`/animals/${encodeURIComponent(animal.code)}?saved=1`);
}

export async function updateAnimalPedigree(formData: FormData) {
  const farm = await requireFarm();
  const code = String(formData.get("code") ?? "").trim();
  const [animal] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)))
    .limit(1);
  if (!animal) redirect("/animals");
  function back(error: string): never {
    redirect(`/animals/${encodeURIComponent(animal.code)}?tab=parentage&error=${error}`);
  }
  if (!canWriteAnimals(farm.roles)) back("pedigree");

  const damId = String(formData.get("damId") ?? "").trim();
  const sireCode = String(formData.get("sireCode") ?? "").trim().slice(0, 40);
  const sireNameInput = String(formData.get("sireName") ?? "").trim().slice(0, 80);

  const { herd, bullRows } = await loadPedigreeGraph(farm.farmId);
  const graph = pedigreeAnimalsWithBulls(herd, bullRows);

  if (sireCode && sireCode.toLowerCase() === animal.code.toLowerCase()) back("sire");
  if (damId) {
    const dam = herd.find((row) => row.id === damId);
    if (!dam || dam.sex === "male" || dam.id === animal.id) back("dam");
  }
  if (parentLinkCreatesCycle(animal.id, damId || null, sireCode || null, graph)) {
    back(sireCode && !damId ? "sire" : "dam");
  }

  let sireName = sireNameInput;
  if (sireCode && !sireName) {
    const bull = bullRows.find((row) => row.code.toLowerCase() === sireCode.toLowerCase());
    if (bull) sireName = bull.name;
    else {
      const sire = herd.find((row) => row.code.toLowerCase() === sireCode.toLowerCase());
      if (sire) sireName = sire.name ?? sire.code;
    }
  }

  const next = {
    geneticDamId: damId || null,
    geneticSireCode: sireCode || null,
    geneticSireName: sireCode ? sireName || sireCode : null,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    await tx.update(animals).set(next).where(and(eq(animals.id, animal.id), eq(animals.farmId, farm.farmId)));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "animal",
      entityId: animal.id,
      summary: `Pedigree updated for ${animal.code}`,
      before: { geneticDamId: animal.geneticDamId, geneticSireCode: animal.geneticSireCode, geneticSireName: animal.geneticSireName },
      after: next,
    });
  });
  redirect(`/animals/${encodeURIComponent(animal.code)}?tab=parentage&saved=1`);
}

export async function updateGenerationParents(formData: FormData) {
  const farm = await requireFarm();
  const code = String(formData.get("code") ?? "").trim();
  const [animal] = await db
    .select({ id: animals.id, code: animals.code })
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)))
    .limit(1);
  if (!animal) redirect("/animals");
  function back(error: string): never {
    redirect(`/animals/${encodeURIComponent(animal.code)}?tab=parentage&error=${error}`);
  }
  if (!canWriteAnimals(farm.roles)) back("generation");

  const [ancestorCodeRaw, ancestorNameRaw = ""] = String(formData.get("ancestor") ?? "").split("\t");
  const ancestorCode = ancestorCodeRaw.trim().slice(0, 40);
  const ancestorName = ancestorNameRaw.trim().slice(0, 80);
  const sireCode = String(formData.get("sireCode") ?? "").trim().slice(0, 40);
  const sireNameInput = String(formData.get("sireName") ?? "").trim().slice(0, 80);
  const damCode = String(formData.get("damCode") ?? "").trim().slice(0, 40);
  if (!ancestorCode) back("generation");
  if (sireCode && sireCode.toLowerCase() === ancestorCode.toLowerCase()) back("gensire");
  if (damCode && damCode.toLowerCase() === ancestorCode.toLowerCase()) back("gendam");
  if (!sireCode && !damCode) back("generation");

  const { herd, bullRows } = await loadPedigreeGraph(farm.farmId);
  const graph = pedigreeAnimalsWithBulls(herd, bullRows);
  const ancestor = herd.find((row) => row.code.toLowerCase() === ancestorCode.toLowerCase());

  let sireName = sireNameInput;
  if (sireCode && !sireName) {
    const namedBull = bullRows.find((row) => row.code.toLowerCase() === sireCode.toLowerCase());
    if (namedBull) sireName = namedBull.name;
    else {
      const namedAnimal = herd.find((row) => row.code.toLowerCase() === sireCode.toLowerCase());
      sireName = namedAnimal?.name ?? namedAnimal?.code ?? sireCode;
    }
  }

  if (ancestor) {
    const patch: { geneticSireCode?: string; geneticSireName?: string; geneticDamId?: string; updatedAt: Date } = { updatedAt: new Date() };
    let nextDamId = ancestor.geneticDamId;
    const nextSireCode = sireCode || ancestor.geneticSireCode;
    if (sireCode) {
      patch.geneticSireCode = sireCode;
      patch.geneticSireName = sireName || sireCode;
    }
    if (damCode) {
      const dam = herd.find((row) => row.code.toLowerCase() === damCode.toLowerCase());
      if (!dam || dam.sex === "male" || dam.id === ancestor.id) back("gendam");
      nextDamId = dam.id;
      patch.geneticDamId = dam.id;
    }
    if (parentLinkCreatesCycle(ancestor.id, nextDamId, nextSireCode, graph)) {
      back(sireCode ? "gensire" : "gendam");
    }
    await db.transaction(async (tx) => {
      await tx.update(animals).set(patch).where(and(eq(animals.id, ancestor.id), eq(animals.farmId, farm.farmId)));
      await writeAudit(tx, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "update",
        entity: "animal",
        entityId: ancestor.id,
        summary: `Generation parents updated for ${ancestor.code}`,
        before: { geneticSireCode: ancestor.geneticSireCode, geneticDamId: ancestor.geneticDamId },
        after: { sireCode: sireCode || null, damCode: damCode || null },
      });
    });
    redirect(`/animals/${encodeURIComponent(animal.code)}?tab=parentage&saved=1`);
  }

  const bullNodeId = `bull:${ancestorCode}`;
  const damTargetId = damCode
    ? (herd.find((row) => row.code.toLowerCase() === damCode.toLowerCase())?.id ?? `bull:${damCode}`)
    : null;
  if (parentLinkCreatesCycle(bullNodeId, damTargetId, sireCode || null, graph)) {
    back(sireCode ? "gensire" : "gendam");
  }

  await db.transaction(async (tx) => {
    const [bull] = await tx
      .select()
      .from(bulls)
      .where(and(eq(bulls.farmId, farm.farmId), eq(bulls.code, ancestorCode)))
      .limit(1);
    let bullId = bull?.id;
    if (bull) {
      await tx
        .update(bulls)
        .set({
          ...(sireCode ? { sireCode } : {}),
          ...(damCode ? { damCode } : {}),
          ...(ancestorName ? { name: ancestorName } : {}),
        })
        .where(and(eq(bulls.id, bull.id), eq(bulls.farmId, farm.farmId)));
    } else {
      const [created] = await tx
        .insert(bulls)
        .values({
          farmId: farm.farmId,
          code: ancestorCode,
          name: ancestorName || ancestorCode,
          sireCode: sireCode || null,
          damCode: damCode || null,
        })
        .returning({ id: bulls.id });
      bullId = created.id;
    }
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: bull ? "update" : "create",
      entity: "bull",
      entityId: bullId ?? ancestorCode,
      summary: `Generation parents updated for ${ancestorCode}`,
      before: bull ? { sireCode: bull.sireCode, damCode: bull.damCode } : null,
      after: { sireCode: sireCode || null, damCode: damCode || null },
    });
  });
  redirect(`/animals/${encodeURIComponent(animal.code)}?tab=parentage&saved=1`);
}

export async function rotateQrToken(formData: FormData) {
  const farm = await requireFarm();
  const code = String(formData.get("code") ?? "").trim();
  const [animal] = await db
    .select({ id: animals.id, code: animals.code })
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)))
    .limit(1);
  if (!animal) redirect("/animals");
  if (!canManageTeam(farm.roles)) redirect(`/animals/${encodeURIComponent(animal.code)}?error=role`);
  const nextToken = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    await tx
      .update(animals)
      .set({ qrToken: nextToken, updatedAt: new Date() })
      .where(and(eq(animals.id, animal.id), eq(animals.farmId, farm.farmId)));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "animal",
      entityId: animal.id,
      summary: `Rotated QR tag token for ${animal.code}`,
      after: { qrRotated: true },
    });
  });
  redirect(`/animals/${encodeURIComponent(animal.code)}?saved=1`);
}
