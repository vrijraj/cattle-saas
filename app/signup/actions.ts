"use server";

import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { breeds, farmMembers, farms, locations, users, vaccineProtocols } from "@/db/schema";
import { breedCatalogue } from "@/db/seed/breeds";
import { DEFAULT_INDIAN_PROTOCOLS } from "@/db/seed/pro";
import { writeAudit } from "@/lib/audit";
import { signIn } from "@/lib/auth";
import { planSpec, type PlanId } from "@/lib/plans";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

const signupSchema = z.object({
  ownerName: z.string().trim().min(2, "Enter your full name.").max(80),
  email: z.email("Enter a valid email address."),
  phone: z.string().trim().max(24).optional(),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
  farmName: z.string().trim().min(2, "Enter your farm name.").max(100),
  animalPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,6}$/, "Animal prefix must be 2–6 letters or digits (e.g. MIL)."),
  plan: z.enum(["starter", "pro", "enterprise"]).default("starter"),
  locale: z.enum(["en", "hi", "gu", "mr"]).default("en"),
});

function slugifyFarm(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "dairy-farm";
}

export type SignupState = { error: string };

export async function registerFarm(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const ip = clientIpFromHeaders(await headers());
  const rl = checkRateLimit(`signup:${ip}`, { limit: 5, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) {
    return { error: "Too many signup attempts. Please wait a few minutes and try again." };
  }

  const parsed = signupSchema.safeParse({
    ownerName: formData.get("ownerName"),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    password: formData.get("password"),
    farmName: formData.get("farmName"),
    animalPrefix: formData.get("animalPrefix") || "FRM",
    plan: formData.get("plan") || "starter",
    locale: formData.get("locale") || "en",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details and try again." };
  }

  const input = parsed.data;
  const email = input.email.toLowerCase();
  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existingUser) {
    return { error: "An account with that email already exists. Please sign in instead." };
  }

  const baseSlug = slugifyFarm(input.farmName);
  let slug = baseSlug;
  for (let suffix = 2; suffix < 50; suffix += 1) {
    const [taken] = await db.select({ id: farms.id }).from(farms).where(eq(farms.slug, slug)).limit(1);
    if (!taken) break;
    slug = `${baseSlug}-${suffix}`;
  }

  const passwordHash = await hash(input.password);
  const spec = planSpec(input.plan as PlanId);

  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        name: input.ownerName,
        email,
        phone: input.phone || null,
        locale: input.locale,
        passwordHash,
      })
      .returning({ id: users.id });

    const [farm] = await tx
      .insert(farms)
      .values({
        name: input.farmName,
        slug,
        animalPrefix: input.animalPrefix,
        timezone: "Asia/Kolkata",
        locale: input.locale,
        enquiryEmail: email,
        plan: spec.id,
        subscriptionStatus: "active",
        maxAnimals: spec.maxAnimals,
        maxMembers: spec.maxMembers,
        aiMonthlyLimit: spec.aiMonthlyLimit,
      })
      .returning({ id: farms.id });

    await tx.insert(farmMembers).values({
      farmId: farm.id,
      userId: user.id,
      roles: ["owner", "admin"],
      canRecordVaccines: true,
    });

    await tx.insert(breeds).values(
      breedCatalogue.map(([name, code, species, gestationDays]) => ({
        farmId: farm.id,
        name,
        code,
        species,
        gestationDays,
        active: true,
      })),
    );

    await tx.insert(locations).values([
      { farmId: farm.id, name: "Milking Shed 1" },
      { farmId: farm.id, name: "Dry & Heifer Shed" },
      { farmId: farm.id, name: "Calf Pen" },
      { farmId: farm.id, name: "Quarantine / Sick Bay" },
    ]);

    await tx.insert(vaccineProtocols).values(
      DEFAULT_INDIAN_PROTOCOLS.map((p) => ({
        farmId: farm.id,
        name: p.name,
        kind: p.kind,
        species: p.species,
        startAgeDays: p.startAgeDays,
        repeatEveryDays: p.repeatEveryDays,
        note: p.note,
      })),
    );

    await writeAudit(tx, {
      farmId: farm.id,
      actorId: user.id,
      action: "create",
      entity: "farm",
      entityId: farm.id,
      summary: `Farm ${input.farmName} created via self-serve signup (${spec.name})`,
      after: { slug, plan: spec.id, animalPrefix: input.animalPrefix },
    });
  });

  await signIn("credentials", { email, password: input.password, redirectTo: "/dashboard" });
  redirect("/dashboard");
}
