"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { farms } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { requireFarm } from "@/lib/farm-context";

export async function updateTenantFarm(formData: FormData) {
  const actor = await requireFarm();
  if (!actor.isSuperAdmin) redirect("/dashboard?error=denied");

  const farmId = String(formData.get("farmId") ?? "").trim();
  const plan = String(formData.get("plan") ?? "pro").trim();
  const subscriptionStatus = String(formData.get("subscriptionStatus") ?? "active").trim();
  const maxAnimals = Number(formData.get("maxAnimals") ?? 250);
  const maxMembers = Number(formData.get("maxMembers") ?? 25);
  const aiMonthlyLimit = Number(formData.get("aiMonthlyLimit") ?? 500);

  if (
    !farmId ||
    !["starter", "pro", "enterprise"].includes(plan) ||
    !["active", "trialing", "past_due", "suspended"].includes(subscriptionStatus) ||
    !Number.isInteger(maxAnimals) ||
    maxAnimals < 1 ||
    maxAnimals > 100000 ||
    !Number.isInteger(maxMembers) ||
    maxMembers < 1 ||
    maxMembers > 5000 ||
    !Number.isInteger(aiMonthlyLimit) ||
    aiMonthlyLimit < 0 ||
    aiMonthlyLimit > 100000
  ) {
    redirect("/admin?error=invalid");
  }

  const [target] = await db.select().from(farms).where(eq(farms.id, farmId)).limit(1);
  if (!target) redirect("/admin?error=missing");

  await db.transaction(async (tx) => {
    await tx
      .update(farms)
      .set({ plan, subscriptionStatus, maxAnimals, maxMembers, aiMonthlyLimit })
      .where(eq(farms.id, farmId));
    await writeAudit(tx, {
      farmId,
      actorId: actor.userId,
      action: "update",
      entity: "tenant_subscription",
      entityId: farmId,
      summary: `Platform admin updated ${target.name} (${plan}, ${subscriptionStatus})`,
      before: {
        plan: target.plan,
        subscriptionStatus: target.subscriptionStatus,
        maxAnimals: target.maxAnimals,
        maxMembers: target.maxMembers,
        aiMonthlyLimit: target.aiMonthlyLimit,
      },
      after: { plan, subscriptionStatus, maxAnimals, maxMembers, aiMonthlyLimit },
    });
  });

  redirect("/admin?saved=1");
}
