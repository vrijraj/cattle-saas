import "server-only";

import { and, eq } from "drizzle-orm";
import { FunctionTool } from "@google/adk";
import { z } from "zod";
import {
  recordCalving,
  recordDeworming,
  recordHealth,
  recordHeat,
  recordAi,
  recordPd,
  recordVaccine,
  recordWeight,
  saveFeed,
  saveFinance,
} from "@/app/(farm)/herd/actions";
import { saveMilk } from "@/app/(farm)/milk/actions";
import { db } from "@/db";
import { animals, feedItems, inseminations } from "@/db/schema";
import type { FarmScope } from "@/lib/ai/tools";

const dateField = z.string().optional().describe("Date as YYYY-MM-DD. Omit to use today on the farm.");

function redirectDestination(error: unknown) {
  if (typeof error !== "object" || error === null || !("digest" in error)) return null;
  const parts = String((error as { digest: unknown }).digest).split(";");
  if (parts[0] !== "NEXT_REDIRECT" || (parts[1] !== "push" && parts[1] !== "replace")) return null;
  return parts.slice(2, -2).join(";");
}

async function runForm(action: (formData: FormData) => Promise<unknown>, fields: Record<string, string | number | null | undefined>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    formData.set(key, String(value));
  }
  try {
    await action(formData);
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
      category: z.enum(["green", "dry", "silage", "concentrate", "mineral"]).optional(),
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
  ];
}
