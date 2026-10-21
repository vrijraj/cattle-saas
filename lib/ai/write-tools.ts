import "server-only";

import { and, eq } from "drizzle-orm";
import { FunctionTool } from "@google/adk";
import { z } from "zod";
import { createAnimal } from "@/app/(farm)/animals/actions";
import {
  recordCalving,
  recordDeworming,
  recordHealth,
  recordHeat,
  recordAi,
  recordPd,
  recordVaccine,
  recordWeight,
  saveBull,
  saveEmbryo,
  saveFeed,
  saveFinance,
  saveListing,
  saveProduct,
  saveSemenBatch,
  transferEmbryo,
  voidRecord,
} from "@/app/(farm)/herd/actions";
import { saveMilk } from "@/app/(farm)/milk/actions";
import { createInvite } from "@/app/(farm)/team/actions";
import { db } from "@/db";
import {
  animals,
  breeds,
  bulls,
  calvings,
  dewormings,
  embryos,
  feedItems,
  financeEntries,
  healthEvents,
  heats,
  inseminations,
  locations,
  milkYields,
  pregnancyChecks,
  vaccinations,
} from "@/db/schema";
import type { FarmScope } from "@/lib/ai/tools";

const dateField = z.string().optional().describe("Date as YYYY-MM-DD. Omit to use today on the farm.");

function redirectDestination(error: unknown) {
  if (typeof error !== "object" || error === null || !("digest" in error)) return null;
  const parts = String((error as { digest: unknown }).digest).split(";");
  if (parts[0] !== "NEXT_REDIRECT" || (parts[1] !== "push" && parts[1] !== "replace")) return null;
  return parts.slice(2, -2).join(";");
}

async function runForm(
  action: (formData: FormData) => Promise<unknown>,
  fields: Record<string, string | number | string[] | null | undefined>,
) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) formData.append(key, item);
      continue;
    }
    formData.set(key, String(value));
  }
  try {
    const result = await action(formData);
    if (result && typeof result === "object" && "error" in result && result.error) {
      return { saved: false as const, error: String(result.error) };
    }
    return { saved: true as const };
  } catch (error) {
    const destination = redirectDestination(error);
    if (!destination) throw error;
    const url = new URL(destination, "http://localhost");
    const problem = url.searchParams.get("error");
    if (problem) return { saved: false as const, error: problem, href: `${url.pathname}${url.search}` };
    return { saved: true as const, href: `${url.pathname}${url.search}` };
  }
}

async function resolveAnimal(farmId: string, codeOrName: string) {
  const rows = await db
    .select({ id: animals.id, code: animals.code, name: animals.name })
    .from(animals)
    .where(eq(animals.farmId, farmId));
  const needle = codeOrName.trim().toLowerCase();
  const byCode = rows.find((row) => row.code.toLowerCase() === needle);
  if (byCode) return { animal: byCode };
  const byName = rows.filter((row) => (row.name ?? "").toLowerCase() === needle);
  if (byName.length === 1) return { animal: byName[0] };
  if (byName.length > 1) return { error: `${codeOrName} matches more than one animal. Use the animal code.` };
  return { error: `No animal named ${codeOrName} is on this farm.` };
}

async function latestRecordId(farmId: string, entity: string, animalId?: string) {
  const lists = {
    heat: await db.select().from(heats).where(eq(heats.farmId, farmId)),
    insemination: await db.select().from(inseminations).where(eq(inseminations.farmId, farmId)),
    pregnancy_check: await db.select().from(pregnancyChecks).where(eq(pregnancyChecks.farmId, farmId)),
    calving: await db.select().from(calvings).where(eq(calvings.farmId, farmId)),
    health: await db.select().from(healthEvents).where(eq(healthEvents.farmId, farmId)),
    vaccination: await db.select().from(vaccinations).where(eq(vaccinations.farmId, farmId)),
    deworming: await db.select().from(dewormings).where(eq(dewormings.farmId, farmId)),
    milk: await db.select().from(milkYields).where(eq(milkYields.farmId, farmId)),
    finance: await db.select().from(financeEntries).where(eq(financeEntries.farmId, farmId)),
  } as const;
  const rows = lists[entity as keyof typeof lists];
  if (!rows) return undefined;
  const matches = rows.filter((row) => {
    if (row.voidedAt) return false;
    if (!animalId) return true;
    if ("animalId" in row) return row.animalId === animalId;
    if ("damId" in row) return row.damId === animalId;
    return false;
  });
  return matches.at(-1)?.id;
}

async function latestInsemination(farmId: string, animalId: string) {
  const rows = await db
    .select()
    .from(inseminations)
    .where(and(eq(inseminations.farmId, farmId), eq(inseminations.animalId, animalId)));
  return rows.filter((row) => !row.voidedAt).sort((a, b) => b.performedOn.localeCompare(a.performedOn))[0];
}

export function writeTools(scope: FarmScope) {
  const animalField = z.string().describe("Animal code, such as MIL-GIR-001, or the animal's exact name.");

  const recordHeatTool = new FunctionTool({
    name: "record_heat",
    description: "Save a heat observation for one animal. The person must confirm before this runs.",
    parameters: z.object({
      animal: animalField,
      observedOn: dateField,
      signs: z.string().optional().describe("Heat signs. Defaults to standing."),
      note: z.string().optional(),
    }),
    requireConfirmation: true,
    execute: async ({ animal, observedOn, signs, note }) => {
      const found = await resolveAnimal(scope.farmId, animal);
      if ("error" in found) return { saved: false, error: found.error };
      return runForm(recordHeat, { animalId: found.animal.id, observedOn, signs, note });
    },
  });

  const recordInsemination = new FunctionTool({
    name: "record_insemination",
    description: "Save an insemination for a female animal and mark her bred. The person must confirm before this runs.",
    parameters: z.object({
      animal: animalField,
      bullCode: z.string().describe("Bull or semen code."),
      performedOn: dateField,
      strawCode: z.string().optional().describe("Straw code, when a stored straw is used."),
      technician: z.string().optional(),
    }),
    requireConfirmation: true,
    execute: async ({ animal, bullCode, performedOn, strawCode, technician }) => {
      const found = await resolveAnimal(scope.farmId, animal);
      if ("error" in found) return { saved: false, error: found.error };
      return runForm(recordAi, { animalId: found.animal.id, bullCode, performedOn, strawCode, technician });
    },
  });

  const recordPregnancy = new FunctionTool({
    name: "record_pregnancy_check",
    description: "Save a pregnancy check against the animal's latest insemination. The person must confirm before this runs.",
    parameters: z.object({
      animal: animalField,
      result: z.enum(["pregnant", "not_pregnant", "doubtful"]),
      checkedOn: dateField,
    }),
    requireConfirmation: true,
    execute: async ({ animal, result, checkedOn }) => {
      const found = await resolveAnimal(scope.farmId, animal);
      if ("error" in found) return { saved: false, error: found.error };
      const ai = await latestInsemination(scope.farmId, found.animal.id);
      return runForm(recordPd, { animalId: found.animal.id, result, checkedOn, inseminationId: ai?.id });
    },
  });

  const recordCalvingTool = new FunctionTool({
    name: "record_calving",
    description: "Save a calving for a female and, for a live birth, create the calf linked to the latest insemination. The person must confirm before this runs.",
    parameters: z.object({
      animal: animalField,
      outcome: z.enum(["live", "dead"]).optional(),
      calfSex: z.enum(["female", "male"]).optional(),
      calfName: z.string().optional(),
      calvedOn: dateField,
    }),
    requireConfirmation: true,
    execute: async ({ animal, outcome, calfSex, calfName, calvedOn }) => {
      const found = await resolveAnimal(scope.farmId, animal);
      if ("error" in found) return { saved: false, error: found.error };
      const ai = await latestInsemination(scope.farmId, found.animal.id);
      if (!ai) return { saved: false, error: "No insemination is stored for this animal, so a calving cannot be linked." };
      return runForm(recordCalving, { animalId: found.animal.id, inseminationId: ai.id, outcome, calfSex, calfName, calvedOn });
    },
  });

  const recordTreatment = new FunctionTool({
    name: "record_treatment",
    description: "Save a health treatment. The person must confirm before this runs.",
    parameters: z.object({
      animal: animalField,
      problem: z.string(),
      treatment: z.string().optional(),
      eventOn: dateField,
      followUpOn: dateField,
    }),
    requireConfirmation: true,
    execute: async ({ animal, problem, treatment, eventOn, followUpOn }) => {
      const found = await resolveAnimal(scope.farmId, animal);
      if ("error" in found) return { saved: false, error: found.error };
      return runForm(recordHealth, { animalId: found.animal.id, problem, treatment, eventOn, followUpOn });
    },
  });

  const recordVaccineTool = new FunctionTool({
    name: "record_vaccine",
    description: "Save a vaccination. The person must confirm before this runs.",
    parameters: z.object({
      animal: animalField,
      vaccine: z.string(),
      givenOn: dateField,
      nextDueOn: dateField,
    }),
    requireConfirmation: true,
    execute: async ({ animal, vaccine, givenOn, nextDueOn }) => {
      const found = await resolveAnimal(scope.farmId, animal);
      if ("error" in found) return { saved: false, error: found.error };
      return runForm(recordVaccine, { animalId: found.animal.id, vaccine, givenOn, nextDueOn });
    },
  });

  const recordDewormingTool = new FunctionTool({
    name: "record_deworming",
    description: "Save a deworming dose. The person must confirm before this runs.",
    parameters: z.object({
      animal: animalField,
      product: z.string(),
      givenOn: dateField,
      nextDueOn: dateField,
    }),
    requireConfirmation: true,
    execute: async ({ animal, product, givenOn, nextDueOn }) => {
      const found = await resolveAnimal(scope.farmId, animal);
      if ("error" in found) return { saved: false, error: found.error };
      return runForm(recordDeworming, { animalId: found.animal.id, product, givenOn, nextDueOn });
    },
  });

  const recordWeightTool = new FunctionTool({
    name: "record_weight",
    description: "Save a body weight in kilograms. The person must confirm before this runs.",
    parameters: z.object({
      animal: animalField,
      kilograms: z.number().describe("Weight in kilograms."),
      weighedOn: dateField,
    }),
    requireConfirmation: true,
    execute: async ({ animal, kilograms, weighedOn }) => {
      const found = await resolveAnimal(scope.farmId, animal);
      if ("error" in found) return { saved: false, error: found.error };
      return runForm(recordWeight, { animalId: found.animal.id, kilograms, weighedOn });
    },
  });

  const recordMilkTool = new FunctionTool({
    name: "record_milk",
    description: "Save morning and evening milk litres for one animal on today. The person must confirm before this runs.",
    parameters: z.object({
      animal: animalField,
      morningLitres: z.number().optional(),
      eveningLitres: z.number().optional(),
    }),
    requireConfirmation: true,
    execute: async ({ animal, morningLitres, eveningLitres }) => {
      if (morningLitres === undefined && eveningLitres === undefined) return { saved: false, error: "Give a morning or evening amount." };
      const found = await resolveAnimal(scope.farmId, animal);
      if ("error" in found) return { saved: false, error: found.error };
      return runForm(saveMilk, {
        [`morning-${found.animal.id}`]: morningLitres,
        [`evening-${found.animal.id}`]: eveningLitres,
      });
    },
  });

  const recordFeedTool = new FunctionTool({
    name: "record_feed",
    description: "Save a feed stock movement. The person must confirm before this runs.",
    parameters: z.object({
      item: z.string().describe("Feed item name."),
      kind: z.enum(["opening", "purchase", "consumption", "wastage", "adjustment"]),
      quantity: z.number(),
      category: z.enum(["green", "dry", "silage", "concentrate", "mineral", "other"]).optional(),
      movedOn: dateField,
      note: z.string().optional(),
    }),
    requireConfirmation: true,
    execute: async ({ item, kind, quantity, category, movedOn, note }) => {
      const items = await db.select().from(feedItems).where(eq(feedItems.farmId, scope.farmId));
      const existing = items.find((row) => row.name.toLowerCase() === item.trim().toLowerCase());
      return runForm(saveFeed, {
        itemId: existing?.id,
        name: existing ? undefined : item.trim(),
        category,
        kind,
        quantity,
        movedOn,
        note,
      });
    },
  });

  const addAnimal = new FunctionTool({
    name: "add_animal",
    description: "Add an animal to this farm. A male is stored with reproduction and lactation not applicable. The person must confirm before this runs.",
    parameters: z.object({
      name: z.string().optional(),
      sex: z.enum(["female", "male", "unknown"]),
      breed: z.string().describe("Breed name on this farm, such as Gir."),
      dob: dateField,
      lifeStage: z.enum(["calf", "heifer", "cow", "bull", "steer"]),
      reproduction: z.enum(["not_applicable", "open", "bred", "pregnant", "fresh"]).optional(),
      lactation: z.enum(["not_applicable", "pre_lactation", "lactating", "dry"]).optional(),
      location: z.string().optional().describe("Shed or location name."),
      earTag: z.string().optional(),
    }),
    requireConfirmation: true,
    execute: async ({ name, sex, breed, dob, lifeStage, reproduction, lactation, location, earTag }) => {
      const breedRows = await db.select().from(breeds).where(eq(breeds.farmId, scope.farmId));
      const match = breedRows.find((row) => row.name.toLowerCase() === breed.trim().toLowerCase());
      if (!match) return { saved: false, error: `No breed named ${breed} is on this farm.` };
      const places = await db.select().from(locations).where(eq(locations.farmId, scope.farmId));
      const place = location ? places.find((row) => row.name.toLowerCase() === location.trim().toLowerCase()) : undefined;
      if (location && !place) return { saved: false, error: `No location named ${location} is on this farm.` };
      return runForm((formData) => createAnimal({ error: "" }, formData), {
        name,
        sex,
        breedId: match.id,
        dob,
        lifeStage,
        reproduction: sex === "male" ? "not_applicable" : (reproduction ?? "open"),
        lactation: sex === "male" ? "not_applicable" : (lactation ?? "pre_lactation"),
        locationId: place?.id,
        earTag,
      });
    },
  });

  const voidEntry = new FunctionTool({
    name: "void_record",
    description: "Void the latest heat, insemination, pregnancy check, calving, treatment, vaccine, deworming, milk, or finance entry. The person must confirm before this runs.",
    parameters: z.object({
      entity: z.enum(["heat", "insemination", "pregnancy_check", "calving", "health", "vaccination", "deworming", "milk", "finance"]),
      animal: z.string().optional().describe("Animal code or name. Omit only for a farm-wide finance entry."),
      reason: z.string(),
    }),
    requireConfirmation: true,
    execute: async ({ entity, animal, reason }) => {
      let animalId: string | undefined;
      if (animal) {
        const found = await resolveAnimal(scope.farmId, animal);
        if ("error" in found) return { saved: false, error: found.error };
        animalId = found.animal.id;
      }
      const id = await latestRecordId(scope.farmId, entity, animalId);
      if (!id) return { saved: false, error: "No matching record to void." };
      return runForm(voidRecord, { entity, id, reason, returnTo: "/ai" });
    },
  });

  const receiveStraws = new FunctionTool({
    name: "receive_straws",
    description: "Receive a semen batch and create its straws. Creates the bull when the code is new. The person must confirm before this runs.",
    parameters: z.object({
      bullCode: z.string(),
      bullName: z.string().optional().describe("Required when the bull code is not already on the farm."),
      batchNumber: z.string(),
      quantity: z.number(),
      semenType: z.enum(["conventional", "sexed_female", "sexed_male"]).optional(),
      tank: z.string().optional(),
    }),
    requireConfirmation: true,
    execute: async ({ bullCode, bullName, batchNumber, quantity, semenType, tank }) => {
      const existing = (await db.select().from(bulls).where(eq(bulls.farmId, scope.farmId))).find(
        (bull) => bull.code.toLowerCase() === bullCode.trim().toLowerCase(),
      );
      let bullId = existing?.id;
      if (!bullId) {
        if (!bullName) return { saved: false, error: "That bull is new. Include the bull name." };
        const created = await runForm(saveBull, { code: bullCode.trim(), name: bullName });
        if (!created.saved) return created;
        bullId = (await db.select().from(bulls).where(eq(bulls.farmId, scope.farmId))).find(
          (bull) => bull.code.toLowerCase() === bullCode.trim().toLowerCase(),
        )?.id;
      }
      if (!bullId) return { saved: false, error: "The bull could not be saved." };
      return runForm(saveSemenBatch, { bullId, batchNumber, quantity, semenType, tank });
    },
  });

  const addEmbryo = new FunctionTool({
    name: "add_embryo",
    description: "Add an embryo to stock. The person must confirm before this runs.",
    parameters: z.object({
      code: z.string(),
      donor: z.string().optional().describe("Donor animal code or name."),
      sireCode: z.string().optional(),
      grade: z.string().optional(),
      storage: z.enum(["fresh", "frozen"]).optional(),
    }),
    requireConfirmation: true,
    execute: async ({ code, donor, sireCode, grade, storage }) => {
      let donorId: string | undefined;
      if (donor) {
        const found = await resolveAnimal(scope.farmId, donor);
        if ("error" in found) return { saved: false, error: found.error };
        donorId = found.animal.id;
      }
      return runForm(saveEmbryo, { code, donorId, sireCode, grade, storage });
    },
  });

  const recordTransfer = new FunctionTool({
    name: "record_embryo_transfer",
    description: "Record an embryo transfer to a recipient. The person must confirm before this runs.",
    parameters: z.object({
      embryoCode: z.string(),
      recipient: animalField,
      transferredOn: dateField,
    }),
    requireConfirmation: true,
    execute: async ({ embryoCode, recipient, transferredOn }) => {
      const stock = await db.select().from(embryos).where(eq(embryos.farmId, scope.farmId));
      const embryo = stock.find((item) => item.code.toLowerCase() === embryoCode.trim().toLowerCase());
      if (!embryo) return { saved: false, error: `No embryo ${embryoCode} is in stock.` };
      const found = await resolveAnimal(scope.farmId, recipient);
      if ("error" in found) return { saved: false, error: found.error };
      return runForm(transferEmbryo, { embryoId: embryo.id, recipientId: found.animal.id, transferredOn });
    },
  });

  const publishListing = new FunctionTool({
    name: "publish_listing",
    description: "Save a catalogue listing for an animal. The person must confirm before this runs.",
    parameters: z.object({
      animal: animalField,
      category: z.string().optional(),
      price: z.number().optional(),
      published: z.boolean().optional(),
    }),
    requireConfirmation: true,
    execute: async ({ animal, category, price, published }) => {
      const found = await resolveAnimal(scope.farmId, animal);
      if ("error" in found) return { saved: false, error: found.error };
      return runForm(saveListing, {
        animalId: found.animal.id,
        category,
        price,
        published: published ? "on" : undefined,
      });
    },
  });

  const addProduct = new FunctionTool({
    name: "add_product",
    description: "Add a shop product. The person must confirm before this runs.",
    parameters: z.object({
      name: z.string(),
      category: z.string(),
      price: z.number(),
      stock: z.number().optional(),
    }),
    requireConfirmation: true,
    execute: async ({ name, category, price, stock }) => runForm(saveProduct, { name, category, price, stock }),
  });

  const inviteStaff = new FunctionTool({
    name: "invite_staff",
    description: "Invite a staff email with one or more roles. The person must confirm before this runs. The invite link is copied from the Team page when email is not configured.",
    parameters: z.object({
      email: z.string(),
      roles: z.array(z.enum(["owner", "manager", "vet", "ai_technician", "worker", "accountant", "genetics", "admin"])).min(1),
    }),
    requireConfirmation: true,
    execute: async ({ email, roles }) => {
      const saved = await runForm(createInvite, { email, roles });
      if (!saved.saved) return saved;
      return { ...saved, href: "/team", note: "The invite is on the Team page. Copy the link there when email is not configured." };
    },
  });

  const recordFinanceTool = new FunctionTool({
    name: "record_finance",
    description: "Save an income or expense entry in INR. The person must confirm before this runs.",
    parameters: z.object({
      kind: z.enum(["income", "expense"]),
      category: z.string(),
      amount: z.number().describe("Amount in INR."),
      entryOn: dateField,
      note: z.string().optional(),
    }),
    requireConfirmation: true,
    execute: async ({ kind, category, amount, entryOn, note }) => runForm(saveFinance, { kind, category, amount, entryOn, note }),
  });

  return [
    recordHeatTool,
    recordInsemination,
    recordPregnancy,
    recordCalvingTool,
    recordTreatment,
    recordVaccineTool,
    recordDewormingTool,
    recordWeightTool,
    recordMilkTool,
    recordFeedTool,
    recordFinanceTool,
    addAnimal,
    voidEntry,
    receiveStraws,
    addEmbryo,
    recordTransfer,
    publishListing,
    addProduct,
    inviteStaff,
  ];
}
