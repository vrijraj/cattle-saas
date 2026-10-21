"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { farmMembers, invites, users } from "@/db/schema";
import { requireFarm } from "@/lib/farm-context";
import { sendMail } from "@/lib/mail";
import { canManageTeam, ROLES, type Role } from "@/lib/permissions";

export async function createInvite(formData: FormData) {
  const farm = await requireFarm();
  if (!canManageTeam(farm.roles)) redirect("/dashboard");

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const roles = formData
    .getAll("roles")
    .map(String)
    .filter((role): role is Role => ROLES.includes(role as Role));
  if (!email.includes("@") || roles.length === 0) redirect("/team?error=form");

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(invites).values({
    farmId: farm.farmId,
    email,
    roles,
    token,
    expiresAt,
  });

  const link = `${process.env.AUTH_URL ?? "http://localhost:3007"}/invite/${token}`;
  const mail = await sendMail({
    to: email,
    subject: `Invitation to ${farm.farmName}`,
    html: `<p>You are invited to ${farm.farmName}.</p><p><a href="${link}">Open the invite</a></p><p>This link expires in 7 days.</p>`,
  });
  redirect(`/team?sent=${mail.sent ? "1" : "0"}`);
}

export async function disableMember(formData: FormData) {
  const farm = await requireFarm();
  if (!canManageTeam(farm.roles)) redirect("/dashboard");
  const userId = String(formData.get("userId") ?? "");
  if (!userId || userId === farm.userId) redirect("/team?error=self");

  const [member] = await db
    .select({ userId: farmMembers.userId })
    .from(farmMembers)
    .where(and(eq(farmMembers.farmId, farm.farmId), eq(farmMembers.userId, userId)))
    .limit(1);
  if (!member) redirect("/team");
  await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, userId));
  redirect("/team");
}
