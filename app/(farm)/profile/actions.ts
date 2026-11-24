"use server";

import { hash, verify } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { farmMembers, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { requireFarm, setActiveFarmCookie } from "@/lib/farm-context";

export async function switchFarm(formData: FormData) {
  const farm = await requireFarm();
  const targetFarmId = String(formData.get("farmId") ?? "").trim();
  if (!targetFarmId) redirect("/profile");
  const [membership] = await db
    .select({ farmId: farmMembers.farmId })
    .from(farmMembers)
    .where(and(eq(farmMembers.farmId, targetFarmId), eq(farmMembers.userId, farm.userId)))
    .limit(1);
  if (!membership) redirect("/profile?error=farm");
  await setActiveFarmCookie(membership.farmId);
  redirect("/dashboard");
}

export async function updateProfileName(formData: FormData) {
  const farm = await requireFarm();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 120) redirect("/profile?error=name");
  await db.transaction(async (tx) => {
    await tx.update(users).set({ name }).where(eq(users.id, farm.userId));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "member",
      entityId: farm.userId,
      summary: `Updated display name to ${name}`,
      before: { name: farm.userName },
      after: { name },
    });
  });
  redirect("/profile?saved=name");
}

export async function changePassword(formData: FormData) {
  const farm = await requireFarm();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const nextPassword = String(formData.get("nextPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (!currentPassword || nextPassword.length < 8 || nextPassword.length > 128) redirect("/profile?error=password");
  if (nextPassword !== confirmPassword) redirect("/profile?error=mismatch");
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, farm.userId))
    .limit(1);
  if (!user?.passwordHash) redirect("/profile?error=current");
  const ok = await verify(user.passwordHash, currentPassword);
  if (!ok) redirect("/profile?error=current");
  const passwordHash = await hash(nextPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, farm.userId));
  redirect("/profile?saved=password");
}
