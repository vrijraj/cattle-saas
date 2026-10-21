"use server";

import { randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { animals, breeds, bulls, codeCounters, locations } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { formatAnimalCode } from "@/lib/animal-code";
import { requireFarm } from "@/lib/farm-context";
import { canWriteAnimals } from "@/lib/permissions";

const animalSchema = z.object({
  name: z.string().trim().max(80),
  sex: z.enum(["female", "male", "unknown"]),
  breedId: z.string().min(1),
  dob: z.string(),
  dobEstimated: z.boolean(),
  earTag: z.string().trim().max(40),
  locationId: z.string(),
  colour: z.string().trim().max(80),
  marks: z.string().trim().max(200),
  lifeStage: z.enum(["calf", "heifer", "cow", "bull", "steer"]),
  reproduction: z.enum(["not_applicable", "open", "bred", "pregnant", "fresh"]),
  lactation: z.enum(["not_applicable", "pre_lactation", "lactating", "dry"]),
});

export async function createAnimal(_prev: { error: string }, formData: FormData): Promise<{ error: string }> {
  const farm = await requireFarm();
  if (!canWriteAnimals(farm.roles)) return { error: "Your role cannot add animals." };

  const parsed = animalSchema.safeParse({
    name: formData.get("name") ?? "",
    sex: formData.get("sex"),
    breedId: formData.get("breedId"),
    dob: formData.get("dob") ?? "",
    dobEstimated: formData.get("dobEstimated") === "on",
    earTag: formData.get("earTag") ?? "",
    locationId: formData.get("locationId") ?? "",
    colour: formData.get("colour") ?? "",
    marks: formData.get("marks") ?? "",
    lifeStage: formData.get("lifeStage"),
    reproduction: formData.get("reproduction"),
    lactation: formData.get("lactation"),
  });
  if (!parsed.success) return { error: "Check the animal details and try again." };

  const input = parsed.data;
  if (input.dob && !/^\d{4}-\d{2}-\d{2}$/.test(input.dob)) return { error: "Date of birth is not valid." };
  if (input.sex === "male" && (input.reproduction === "pregnant" || input.lactation === "lactating")) {
    return { error: "A male cannot be saved as pregnant or lactating." };
  }

  const [breed] = await db
    .select()
    .from(breeds)
    .where(and(eq(breeds.id, input.breedId), eq(breeds.farmId, farm.farmId)))
    .limit(1);
  if (!breed) return { error: "Choose a breed from this farm." };

  if (input.locationId) {
    const [location] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, input.locationId), eq(locations.farmId, farm.farmId)))
      .limit(1);
    if (!location) return { error: "Choose a location from this farm." };
  }

  const code = await db.transaction(async (tx) => {
    await tx
      .insert(codeCounters)
      .values({ farmId: farm.farmId, breedCode: breed.code, nextValue: 1 })
      .onConflictDoNothing();
    const [counter] = await tx
      .select()
      .from(codeCounters)
      .where(and(eq(codeCounters.farmId, farm.farmId), eq(codeCounters.breedCode, breed.code)))
      .for("update");
    const sequence = counter?.nextValue ?? 1;
    await tx
      .update(codeCounters)
      .set({ nextValue: sequence + 1 })
      .where(and(eq(codeCounters.farmId, farm.farmId), eq(codeCounters.breedCode, breed.code)));

    const animalCode = formatAnimalCode(farm.animalPrefix, breed.code, sequence);
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
        locationId: input.locationId || null,
        colour: input.colour || null,
        marks: input.marks || null,
        lifeStage: input.lifeStage,
        reproduction: input.sex === "male" ? "not_applicable" : input.reproduction,
        lactation: input.sex === "male" ? "not_applicable" : input.lactation,
        qrToken: randomBytes(32).toString("base64url"),
        createdBy: farm.userId,
      })
      .returning({ id: animals.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "animal",
      entityId: created.id,
      summary: `Animal ${animalCode} added`,
      after: { code: animalCode, name: input.name || null, sex: input.sex },
    });
    return animalCode;
  });

  redirect(`/animals/${code}`);
}

const statusSchema = z.object({
  presence: z.enum(["on_farm", "sold", "dead", "transferred"]),
  lifeStage: z.enum(["calf", "heifer", "cow", "bull", "steer"]),
  reproduction: z.enum(["not_applicable", "open", "bred", "pregnant", "fresh"]),
  lactation: z.enum(["not_applicable", "pre_lactation", "lactating", "dry"]),
});

export async function updateAnimalStatus(formData: FormData) {
  const farm = await requireFarm();
  const code = String(formData.get("code") ?? "");
  if (!canWriteAnimals(farm.roles)) redirect(`/animals/${code}?error=status`);

  const [animal] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)))
    .limit(1);
  if (!animal) redirect("/animals");

  const parsed = statusSchema.safeParse({
    presence: formData.get("presence"),
    lifeStage: formData.get("lifeStage"),
    reproduction: formData.get("reproduction"),
    lactation: formData.get("lactation"),
  });
  if (!parsed.success) redirect(`/animals/${code}?error=status`);

  const male = animal.sex === "male";
  const reproduction = male ? "not_applicable" : parsed.data.reproduction;
  const lactation = male ? "not_applicable" : parsed.data.lactation;
  const expectedRaw = String(formData.get("expectedCalving") ?? "");
  if (reproduction === "pregnant" && expectedRaw && !/^\d{4}-\d{2}-\d{2}$/.test(expectedRaw)) {
    redirect(`/animals/${code}?error=status`);
  }

  const next = {
    presence: parsed.data.presence,
    lifeStage: parsed.data.lifeStage,
    reproduction,
    lactation,
    expectedCalving: reproduction === "pregnant" ? expectedRaw || null : null,
    conceptionOn: reproduction === "pregnant" ? animal.conceptionOn : null,
    updatedAt: new Date(),
  };
  await db.update(animals).set(next).where(eq(animals.id, animal.id));
  await writeAudit(db, {
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
    },
    after: {
      presence: next.presence,
      lifeStage: next.lifeStage,
      reproduction: next.reproduction,
      lactation: next.lactation,
      expectedCalving: next.expectedCalving,
    },
  });
  redirect(`/animals/${code}`);
}

const detailSchema = z.object({
  name: z.string().trim().max(80),
  sex: z.enum(["female", "male", "unknown"]),
  breedId: z.string().min(1),
  dob: z.string(),
  dobEstimated: z.boolean(),
  earTag: z.string().trim().max(40),
  colour: z.string().trim().max(80),
  marks: z.string().trim().max(200),
  damId: z.string(),
  sireCode: z.string().trim().max(40),
  sireName: z.string().trim().max(80),
});

export async function updateAnimalDetails(formData: FormData) {
  const farm = await requireFarm();
  const code = String(formData.get("code") ?? "");
  const back = (error: string) => redirect(`/animals/${code}?error=${error}`);
  if (!canWriteAnimals(farm.roles)) back("details");

  const [animal] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)))
    .limit(1);
  if (!animal) redirect("/animals");

  const parsed = detailSchema.safeParse({
    name: formData.get("name") ?? "",
    sex: formData.get("sex"),
    breedId: formData.get("breedId"),
    dob: formData.get("dob") ?? "",
    dobEstimated: formData.get("dobEstimated") === "on",
    earTag: formData.get("earTag") ?? "",
    colour: formData.get("colour") ?? "",
    marks: formData.get("marks") ?? "",
    damId: formData.get("damId") ?? "",
    sireCode: formData.get("sireCode") ?? "",
    sireName: formData.get("sireName") ?? "",
  });
  if (!parsed.success) back("details");
  const input = parsed.data;
  if (input.dob && !/^\d{4}-\d{2}-\d{2}$/.test(input.dob)) back("date");

  const [breed] = await db
    .select()
    .from(breeds)
    .where(and(eq(breeds.id, input.breedId), eq(breeds.farmId, farm.farmId)))
    .limit(1);
  if (!breed) back("details");

  if (input.earTag) {
    const [taken] = await db
      .select({ id: animals.id })
      .from(animals)
      .where(and(eq(animals.farmId, farm.farmId), eq(animals.earTag, input.earTag), ne(animals.id, animal.id)))
      .limit(1);
    if (taken) back("eartag");
  }

  if (input.damId) {
    const links = await db
      .select({ id: animals.id, geneticDamId: animals.geneticDamId, sex: animals.sex })
      .from(animals)
      .where(eq(animals.farmId, farm.farmId));
    const dam = links.find((row) => row.id === input.damId);
    if (!dam || dam.sex === "male" || dam.id === animal.id) back("dam");
    const byId = new Map(links.map((row) => [row.id, row.geneticDamId]));
    const seen = new Set<string>();
    let current: string | null = dam.id;
    while (current) {
      if (current === animal.id || seen.has(current)) back("dam");
      seen.add(current);
      current = byId.get(current) ?? null;
    }
  }

  if (input.sireCode && input.sireCode.toLowerCase() === animal.code.toLowerCase()) back("sire");

  const male = input.sex === "male";
  const next = {
    name: input.name || null,
    sex: input.sex,
    species: breed.species,
    breedId: breed.id,
    dob: input.dob || null,
    dobEstimated: input.dobEstimated,
    earTag: input.earTag || null,
    colour: input.colour || null,
    marks: input.marks || null,
    geneticDamId: input.damId || null,
    geneticSireCode: input.sireCode || null,
    geneticSireName: input.sireCode ? input.sireName || input.sireCode : null,
    reproduction: male ? ("not_applicable" as const) : animal.sex === "male" ? ("open" as const) : animal.reproduction,
    lactation: male ? ("not_applicable" as const) : animal.sex === "male" ? ("pre_lactation" as const) : animal.lactation,
    expectedCalving: male ? null : animal.expectedCalving,
    conceptionOn: male ? null : animal.conceptionOn,
    updatedAt: new Date(),
  };
  await db.update(animals).set(next).where(eq(animals.id, animal.id));
  await writeAudit(db, {
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
      colour: next.colour,
      marks: next.marks,
      geneticDamId: next.geneticDamId,
      geneticSireCode: next.geneticSireCode,
    },
  });
  redirect(`/animals/${code}`);
}

export async function updateAnimalPedigree(formData: FormData) {
  const farm = await requireFarm();
  const code = String(formData.get("code") ?? "");
  const back = (error: string) => redirect(`/animals/${code}?tab=parentage&error=${error}`);
  if (!canWriteAnimals(farm.roles)) back("pedigree");

  const [animal] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)))
    .limit(1);
  if (!animal) redirect("/animals");

  const damId = String(formData.get("damId") ?? "");
  const sireCode = String(formData.get("sireCode") ?? "").trim().slice(0, 40);
  const sireNameInput = String(formData.get("sireName") ?? "").trim().slice(0, 80);
  if (sireCode && sireCode.toLowerCase() === animal.code.toLowerCase()) back("sire");

  if (damId) {
    const links = await db
      .select({ id: animals.id, geneticDamId: animals.geneticDamId, sex: animals.sex })
      .from(animals)
      .where(eq(animals.farmId, farm.farmId));
    const dam = links.find((row) => row.id === damId);
    if (!dam || dam.sex === "male" || dam.id === animal.id) back("dam");
    const byId = new Map(links.map((row) => [row.id, row.geneticDamId]));
    const seen = new Set<string>();
    let current: string | null = dam.id;
    while (current) {
      if (current === animal.id || seen.has(current)) back("dam");
      seen.add(current);
      current = byId.get(current) ?? null;
    }
  }

  let sireName = sireNameInput;
  if (sireCode && !sireName) {
    const [bull] = await db
      .select({ name: bulls.name })
      .from(bulls)
      .where(and(eq(bulls.farmId, farm.farmId), eq(bulls.code, sireCode)))
      .limit(1);
    if (bull) sireName = bull.name;
    else {
      const [sire] = await db
        .select({ name: animals.name, code: animals.code })
        .from(animals)
        .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, sireCode)))
        .limit(1);
      if (sire) sireName = sire.name ?? sire.code;
    }
  }

  const next = {
    geneticDamId: damId || null,
    geneticSireCode: sireCode || null,
    geneticSireName: sireCode ? sireName || sireCode : null,
    updatedAt: new Date(),
  };
  await db.update(animals).set(next).where(eq(animals.id, animal.id));
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "update",
    entity: "animal",
    entityId: animal.id,
    summary: `Pedigree updated for ${animal.code}`,
    before: { geneticDamId: animal.geneticDamId, geneticSireCode: animal.geneticSireCode, geneticSireName: animal.geneticSireName },
    after: next,
  });
  redirect(`/animals/${code}?tab=parentage`);
}

export async function updateGenerationParents(formData: FormData) {
  const farm = await requireFarm();
  const code = String(formData.get("code") ?? "");
  const back = (error: string) => redirect(`/animals/${code}?tab=parentage&error=${error}`);
  if (!canWriteAnimals(farm.roles)) back("generation");

  const [animal] = await db
    .select({ id: animals.id })
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)))
    .limit(1);
  if (!animal) redirect("/animals");

  const [ancestorCodeRaw, ancestorNameRaw = ""] = String(formData.get("ancestor") ?? "").split("\t");
  const ancestorCode = ancestorCodeRaw.trim().slice(0, 40);
  const ancestorName = ancestorNameRaw.trim().slice(0, 80);
  const sireCode = String(formData.get("sireCode") ?? "").trim().slice(0, 40);
  const sireNameInput = String(formData.get("sireName") ?? "").trim().slice(0, 80);
  const damCode = String(formData.get("damCode") ?? "").trim().slice(0, 40);
  if (!ancestorCode) back("generation");
  if (sireCode && sireCode.toLowerCase() === ancestorCode.toLowerCase()) back("gensire");
  if (damCode && damCode.toLowerCase() === ancestorCode.toLowerCase()) back("gendam");

  const [ancestor] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, ancestorCode)))
    .limit(1);

  if (!sireCode && !damCode) back("generation");

  let sireName = sireNameInput;
  if (sireCode && !sireName) {
    const [namedBull] = await db
      .select({ name: bulls.name })
      .from(bulls)
      .where(and(eq(bulls.farmId, farm.farmId), eq(bulls.code, sireCode)))
      .limit(1);
    if (namedBull) sireName = namedBull.name;
    else {
      const [namedAnimal] = await db
        .select({ name: animals.name, code: animals.code })
        .from(animals)
        .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, sireCode)))
        .limit(1);
      sireName = namedAnimal?.name ?? namedAnimal?.code ?? sireCode;
    }
  }

  if (ancestor) {
    const patch: { geneticSireCode?: string; geneticSireName?: string; geneticDamId?: string; updatedAt: Date } = { updatedAt: new Date() };
    if (sireCode) {
      patch.geneticSireCode = sireCode;
      patch.geneticSireName = sireName || sireCode;
    }
    if (damCode) {
      const links = await db
        .select({ id: animals.id, geneticDamId: animals.geneticDamId, sex: animals.sex, code: animals.code })
        .from(animals)
        .where(eq(animals.farmId, farm.farmId));
      const dam = links.find((row) => row.code.toLowerCase() === damCode.toLowerCase());
      if (!dam || dam.sex === "male" || dam.id === ancestor.id) back("gendam");
      const byId = new Map(links.map((row) => [row.id, row.geneticDamId]));
      const seen = new Set<string>();
      let current: string | null = dam.id;
      while (current) {
        if (current === ancestor.id || seen.has(current)) back("gendam");
        seen.add(current);
        current = byId.get(current) ?? null;
      }
      patch.geneticDamId = dam.id;
    }
    await db.update(animals).set(patch).where(eq(animals.id, ancestor.id));
    await writeAudit(db, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "animal",
      entityId: ancestor.id,
      summary: `Generation parents updated for ${ancestor.code}`,
      after: { sireCode: sireCode || null, damCode: damCode || null },
    });
    redirect(`/animals/${code}?tab=parentage`);
  }

  const [bull] = await db
    .select()
    .from(bulls)
    .where(and(eq(bulls.farmId, farm.farmId), eq(bulls.code, ancestorCode)))
    .limit(1);
  let bullId = bull?.id;
  if (bull) {
    await db
      .update(bulls)
      .set({
        ...(sireCode ? { sireCode } : {}),
        ...(damCode ? { damCode } : {}),
        ...(ancestorName ? { name: ancestorName } : {}),
      })
      .where(eq(bulls.id, bull.id));
  } else {
    const [created] = await db
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
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: bull ? "update" : "create",
    entity: "bull",
    entityId: bullId ?? ancestorCode,
    summary: `Generation parents updated for ${ancestorCode}`,
    after: { sireCode: sireCode || null, damCode: damCode || null },
  });
  redirect(`/animals/${code}?tab=parentage`);
}
