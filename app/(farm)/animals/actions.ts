"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { animals, breeds, codeCounters, locations } from "@/db/schema";
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
    await tx.insert(animals).values({
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
    });
    return animalCode;
  });

  redirect(`/animals/${code}`);
}
