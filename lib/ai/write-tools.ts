import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { FunctionTool } from "@google/adk";
import { z } from "zod";
import { createAnimal } from "@/app/(farm)/animals/actions";
import { createCustomAlert } from "@/app/(farm)/alerts/actions";
import {
  recordAi,
  recordAnimalMilk,
  recordCalving,
  recordDeworming,
  recordDryOff,
  recordHealth,
  recordHeat,
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
import { createInvite } from "@/app/(farm)/team/actions";
import { db } from "@/db";
import {
  animals,
  breeds,
  bulls,
  calvings,
  dewormings,
  dryOffs,
  embryos,
  feedItems,
  feedMovements,
  financeEntries,
  healthEvents,
  heats,
  inseminations,
  locations,
  milkYields,
  pregnancyChecks,
  vaccinations,
  weights,
} from "@/db/schema";
import type { FarmScope } from "@/lib/ai/tools";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/finance-suggestions";
import {
  canManageTeam,
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
  canWriteAnimals,
  canWriteMilk,
  hasRole,
} from "@/lib/permissions";

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
  if (entity === "heat") {
    const [row] = await db.select({ id: heats.id }).from(heats).where(and(eq(heats.farmId, farmId), isNull(heats.voidedAt), ...(animalId ? [eq(heats.animalId, animalId)] : []))).orderBy(desc(heats.observedOn), desc(heats.createdAt)).limit(1);
    return row?.id;
  }
  if (entity === "insemination") {
    const [row] = await db.select({ id: inseminations.id }).from(inseminations).where(and(eq(inseminations.farmId, farmId), isNull(inseminations.voidedAt), ...(animalId ? [eq(inseminations.animalId, animalId)] : []))).orderBy(desc(inseminations.performedOn), desc(inseminations.createdAt)).limit(1);
    return row?.id;
  }
  if (entity === "pregnancy_check") {
    const [row] = await db.select({ id: pregnancyChecks.id }).from(pregnancyChecks).where(and(eq(pregnancyChecks.farmId, farmId), isNull(pregnancyChecks.voidedAt), ...(animalId ? [eq(pregnancyChecks.animalId, animalId)] : []))).orderBy(desc(pregnancyChecks.checkedOn), desc(pregnancyChecks.createdAt)).limit(1);
    return row?.id;
  }
  if (entity === "calving") {
    const [row] = await db.select({ id: calvings.id }).from(calvings).where(and(eq(calvings.farmId, farmId), isNull(calvings.voidedAt), ...(animalId ? [eq(calvings.damId, animalId)] : []))).orderBy(desc(calvings.calvedOn), desc(calvings.createdAt)).limit(1);
    return row?.id;
  }
  if (entity === "dry_off") {
    const [row] = await db.select({ id: dryOffs.id }).from(dryOffs).where(and(eq(dryOffs.farmId, farmId), isNull(dryOffs.voidedAt), ...(animalId ? [eq(dryOffs.animalId, animalId)] : []))).orderBy(desc(dryOffs.driedOn), desc(dryOffs.createdAt)).limit(1);
    return row?.id;
  }
  if (entity === "health") {
    const [row] = await db.select({ id: healthEvents.id }).from(healthEvents).where(and(eq(healthEvents.farmId, farmId), isNull(healthEvents.voidedAt), ...(animalId ? [eq(healthEvents.animalId, animalId)] : []))).orderBy(desc(healthEvents.eventOn), desc(healthEvents.createdAt)).limit(1);
    return row?.id;
  }
  if (entity === "vaccination") {
    const [row] = await db.select({ id: vaccinations.id }).from(vaccinations).where(and(eq(vaccinations.farmId, farmId), isNull(vaccinations.voidedAt), ...(animalId ? [eq(vaccinations.animalId, animalId)] : []))).orderBy(desc(vaccinations.givenOn), desc(vaccinations.createdAt)).limit(1);
    return row?.id;
  }
  if (entity === "deworming") {
    const [row] = await db.select({ id: dewormings.id }).from(dewormings).where(and(eq(dewormings.farmId, farmId), isNull(dewormings.voidedAt), ...(animalId ? [eq(dewormings.animalId, animalId)] : []))).orderBy(desc(dewormings.givenOn), desc(dewormings.createdAt)).limit(1);
    return row?.id;
  }
  if (entity === "milk") {
    const [row] = await db.select({ id: milkYields.id }).from(milkYields).where(and(eq(milkYields.farmId, farmId), isNull(milkYields.voidedAt), ...(animalId ? [eq(milkYields.animalId, animalId)] : []))).orderBy(desc(milkYields.recordedOn), desc(milkYields.createdAt)).limit(1);
    return row?.id;
  }
  if (entity === "weight") {
    const [row] = await db.select({ id: weights.id }).from(weights).where(and(eq(weights.farmId, farmId), isNull(weights.voidedAt), ...(animalId ? [eq(weights.animalId, animalId)] : []))).orderBy(desc(weights.weighedOn), desc(weights.createdAt)).limit(1);
    return row?.id;
  }
  if (entity === "feed_movement") {
    const [row] = await db.select({ id: feedMovements.id }).from(feedMovements).where(and(eq(feedMovements.farmId, farmId), isNull(feedMovements.voidedAt))).orderBy(desc(feedMovements.movedOn), desc(feedMovements.createdAt)).limit(1);
    return row?.id;
  }
  if (entity === "finance") {
    const [row] = await db.select({ id: financeEntries.id }).from(financeEntries).where(and(eq(financeEntries.farmId, farmId), isNull(financeEntries.voidedAt), ...(animalId ? [eq(financeEntries.animalId, animalId)] : []))).orderBy(desc(financeEntries.entryOn), desc(financeEntries.createdAt)).limit(1);
    return row?.id;
  }
  return undefined;
}

async function latestInsemination(farmId: string, animalId: string) {
  const [row] = await db
    .select()
    .from(inseminations)
    .where(and(eq(inseminations.farmId, farmId), eq(inseminations.animalId, animalId), isNull(inseminations.voidedAt)))
    .orderBy(desc(inseminations.performedOn), desc(inseminations.createdAt))
    .limit(1);
  return row;
}

async function confirmedConceptionInsemination(farmId: string, animalId: string) {
  const [pd] = await db
    .select({ inseminationId: pregnancyChecks.inseminationId })
    .from(pregnancyChecks)
    .where(
      and(
        eq(pregnancyChecks.farmId, farmId),
        eq(pregnancyChecks.animalId, animalId),
        eq(pregnancyChecks.result, "pregnant"),
        isNull(pregnancyChecks.voidedAt),
      ),
    )
    .orderBy(desc(pregnancyChecks.checkedOn), desc(pregnancyChecks.createdAt))
    .limit(1);
  if (!pd?.inseminationId) return null;
  const [ai] = await db
    .select()
    .from(inseminations)
    .where(and(eq(inseminations.id, pd.inseminationId), eq(inseminations.farmId, farmId), isNull(inseminations.voidedAt)))
    .limit(1);
  return ai ?? null;
}

export function writeTools(scope: FarmScope) {
  const animalField = z.string().describe("Animal code, such as MIL-GIR-001, or the animal's exact name.");
  const tools: FunctionTool[] = [];

  if (canRecordHeat(scope.roles)) {
    tools.push(
      new FunctionTool({
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
      }),
    );
  }

  if (canRecordAi(scope.roles)) {
    tools.push(
      new FunctionTool({
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
      }),
    );
  }

  if (canRecordPdOrCalving(scope.roles)) {
    tools.push(
      new FunctionTool({
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
          if (result === "pregnant" && !ai) {
            return { saved: false, error: "No open insemination is recorded for this animal." };
          }
          return runForm(recordPd, { animalId: found.animal.id, result, checkedOn, inseminationId: ai?.id });
        },
      }),
      new FunctionTool({
        name: "record_calving",
        description: "Save a calving for a female linked to her confirmed pregnant conception. The person must confirm before this runs.",
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
          const confirmed = await confirmedConceptionInsemination(scope.farmId, found.animal.id);
          if (!confirmed) {
            return { saved: false, error: "No confirmed pregnant conception exists for this animal. Record a pregnant PD or select the breeding event on her profile." };
          }
          return runForm(recordCalving, { animalId: found.animal.id, inseminationId: confirmed.id, outcome, calfSex, calfName, calvedOn });
        },
      }),
      new FunctionTool({
        name: "record_dry_off",
        description: "Mark a lactating animal dry and close her current lactation. The person must confirm before this runs.",
        parameters: z.object({
          animal: animalField,
          driedOn: dateField,
          note: z.string().optional(),
        }),
        requireConfirmation: true,
        execute: async ({ animal, driedOn, note }) => {
          const found = await resolveAnimal(scope.farmId, animal);
          if ("error" in found) return { saved: false, error: found.error };
          return runForm(recordDryOff, { animalId: found.animal.id, driedOn, note });
        },
      }),
    );
  }

  if (canRecordHealth(scope.roles)) {
    tools.push(
      new FunctionTool({
        name: "record_treatment",
        description: "Save a health treatment. The person must confirm before this runs.",
        parameters: z.object({
          animal: animalField,
          problem: z.string(),
          treatment: z.string().optional(),
          medicine: z.string().optional(),
          withdrawalDays: z.number().int().min(0).max(90).optional(),
          eventOn: dateField,
          followUpOn: dateField,
        }),
        requireConfirmation: true,
        execute: async ({ animal, problem, treatment, medicine, withdrawalDays, eventOn, followUpOn }) => {
          const found = await resolveAnimal(scope.farmId, animal);
          if ("error" in found) return { saved: false, error: found.error };
          return runForm(recordHealth, { animalId: found.animal.id, problem, treatment, medicine, withdrawalDays, eventOn, followUpOn });
        },
      }),
    );
  }

  if (canRecordVaccine(scope.roles, scope.canRecordVaccines)) {
    tools.push(
      new FunctionTool({
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
      }),
      new FunctionTool({
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
      }),
    );
  }

  if (canRecordWeight(scope.roles)) {
    tools.push(
      new FunctionTool({
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
      }),
    );
  }

  if (canWriteMilk(scope.roles)) {
    tools.push(
      new FunctionTool({
        name: "record_milk",
        description: "Save morning and evening milk litres for one animal. The person must confirm before this runs.",
        parameters: z.object({
          animal: animalField,
          morningLitres: z.number().optional(),
          eveningLitres: z.number().optional(),
          recordedOn: dateField,
        }),
        requireConfirmation: true,
        execute: async ({ animal, morningLitres, eveningLitres, recordedOn }) => {
          if (morningLitres === undefined && eveningLitres === undefined) return { saved: false, error: "Give a morning or evening amount." };
          const found = await resolveAnimal(scope.farmId, animal);
          if ("error" in found) return { saved: false, error: found.error };
          return runForm(recordAnimalMilk, {
            animalId: found.animal.id,
            morningLitres,
            eveningLitres,
            recordedOn,
          });
        },
      }),
    );
  }

  if (canRecordFeed(scope.roles)) {
    tools.push(
      new FunctionTool({
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
      }),
    );
  }

  if (canRecordFinance(scope.roles)) {
    const allCategories = [...new Set([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES])] as [string, ...string[]];
    tools.push(
      new FunctionTool({
        name: "record_finance",
        description: "Save an income or expense entry in INR. The person must confirm before this runs.",
        parameters: z.object({
          kind: z.enum(["income", "expense"]),
          category: z.enum(allCategories),
          amount: z.number().describe("Amount in INR."),
          entryOn: dateField,
          animal: z.string().optional().describe("Optional animal code or name."),
          note: z.string().optional(),
        }),
        requireConfirmation: true,
        execute: async ({ kind, category, amount, entryOn, animal, note }) => {
          let animalId: string | undefined;
          if (animal) {
            const found = await resolveAnimal(scope.farmId, animal);
            if ("error" in found) return { saved: false, error: found.error };
            animalId = found.animal.id;
          }
          return runForm(saveFinance, { kind, category, amount, entryOn, animalId, note });
        },
      }),
    );
  }

  if (canWriteAnimals(scope.roles)) {
    tools.push(
      new FunctionTool({
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
          rfid: z.string().optional(),
        }),
        requireConfirmation: true,
        execute: async ({ name, sex, breed, dob, lifeStage, reproduction, lactation, location, earTag, rfid }) => {
          const breedRows = await db.select().from(breeds).where(and(eq(breeds.farmId, scope.farmId), eq(breeds.active, true)));
          const match = breedRows.find((row) => row.name.toLowerCase() === breed.trim().toLowerCase());
          if (!match) return { saved: false, error: `No active breed named ${breed} is on this farm.` };
          const places = await db.select().from(locations).where(and(eq(locations.farmId, scope.farmId), eq(locations.active, true)));
          const place = location ? places.find((row) => row.name.toLowerCase() === location.trim().toLowerCase()) : undefined;
          if (location && !place) return { saved: false, error: `No active location named ${location} is on this farm.` };
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
            rfid,
          });
        },
      }),
    );
  }

  if (canUseGenetics(scope.roles)) {
    tools.push(
      new FunctionTool({
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
      }),
      new FunctionTool({
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
      }),
      new FunctionTool({
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
      }),
    );
  }

  if (canPublish(scope.roles)) {
    tools.push(
      new FunctionTool({
        name: "publish_listing",
        description: "Create or update a public catalogue listing for an animal. The person must confirm before this runs.",
        parameters: z.object({
          animal: animalField,
          category: z.string().optional(),
          price: z.number().optional(),
          published: z.boolean().optional().describe("Defaults to true."),
          showPedigree: z.boolean().optional(),
          showPregnancy: z.boolean().optional(),
          showMilk: z.boolean().optional(),
          publicNote: z.string().optional(),
        }),
        requireConfirmation: true,
        execute: async ({ animal, category, price, published, showPedigree, showPregnancy, showMilk, publicNote }) => {
          const found = await resolveAnimal(scope.farmId, animal);
          if ("error" in found) return { saved: false, error: found.error };
          return runForm(saveListing, {
            animalId: found.animal.id,
            category,
            price,
            published: published === false ? undefined : "on",
            showPedigree: showPedigree ? "on" : undefined,
            showPregnancy: showPregnancy ? "on" : undefined,
            showMilk: showMilk ? "on" : undefined,
            publicNote,
          });
        },
      }),
      new FunctionTool({
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
      }),
    );
  }

  if (canManageTeam(scope.roles)) {
    tools.push(
      new FunctionTool({
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
      }),
    );
  }

  if (hasRole(scope.roles, ["owner", "manager", "admin", "vet", "ai_technician", "accountant"])) {
    tools.push(
      new FunctionTool({
        name: "schedule_task",
        description: "Schedule a custom farm reminder/task on the Alerts page. The person must confirm before this runs.",
        parameters: z.object({
          title: z.string(),
          body: z.string().optional(),
          dueOn: dateField,
          animal: z.string().optional(),
        }),
        requireConfirmation: true,
        execute: async ({ title, body, dueOn, animal }) => {
          let animalId: string | undefined;
          if (animal) {
            const found = await resolveAnimal(scope.farmId, animal);
            if ("error" in found) return { saved: false, error: found.error };
            animalId = found.animal.id;
          }
          return runForm(createCustomAlert, { title, body, dueOn, animalId });
        },
      }),
    );
  }

  if (hasRole(scope.roles, ["owner", "manager", "admin", "vet", "ai_technician", "worker", "accountant"])) {
    tools.push(
      new FunctionTool({
        name: "void_record",
        description: "Void the latest non-voided record of an entity (respecting role ownership and 24-hour worker rules). The person must confirm before this runs.",
        parameters: z.object({
          entity: z.enum(["heat", "insemination", "pregnancy_check", "calving", "dry_off", "health", "vaccination", "deworming", "milk", "weight", "feed_movement", "finance"]),
          animal: z.string().optional().describe("Animal code or name. Omit only for farm-wide finance or feed."),
          reason: z.string(),
          restoreStraw: z.boolean().optional().describe("Only for insemination: set true if the semen straw was NOT consumed."),
        }),
        requireConfirmation: true,
        execute: async ({ entity, animal, reason, restoreStraw }) => {
          let animalId: string | undefined;
          if (animal) {
            const found = await resolveAnimal(scope.farmId, animal);
            if ("error" in found) return { saved: false, error: found.error };
            animalId = found.animal.id;
          }
          const id = await latestRecordId(scope.farmId, entity, animalId);
          if (!id) return { saved: false, error: "No matching record to void." };
          return runForm(voidRecord, {
            entity,
            id,
            reason,
            restoreStraw: restoreStraw ? "on" : undefined,
            returnTo: "/ai",
          });
        },
      }),
    );
  }

  return tools;
}
