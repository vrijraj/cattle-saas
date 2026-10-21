"use server";

import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { farmMembers, invites, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { requireFarm } from "@/lib/farm-context";
import { sendMail } from "@/lib/mail";
import { canManageTeam, ROLES, type Role } from "@/lib/permissions";
import { inviteIsOpen, keepsTeamAdmin, roleLabel } from "@/lib/team";

function chosenRoles(formData: FormData) {
  return formData
    .getAll("roles")
    .map(String)
    .filter((role): role is Role => ROLES.includes(role as Role));
}

async function farmRoster(farmId: string) {
  return db
    .select({ userId: farmMembers.userId, roles: farmMembers.roles, disabledAt: users.disabledAt, name: users.name, email: users.email })
    .from(farmMembers)
    .innerJoin(users, eq(users.id, farmMembers.userId))
    .where(eq(farmMembers.farmId, farmId));
}

export async function createInvite(formData: FormData) {
  const farm = await requireFarm();
  if (!canManageTeam(farm.roles)) redirect("/dashboard");

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const roles = chosenRoles(formData);
  if (!email.includes("@") || email.startsWith("@") || roles.length === 0) redirect("/team?error=form");

  const [person] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (person) {
    const [member] = await db
      .select({ userId: farmMembers.userId })
      .from(farmMembers)
      .where(and(eq(farmMembers.farmId, farm.farmId), eq(farmMembers.userId, person.id)))
      .limit(1);
    if (member) redirect("/team?error=member");
  }

  const existing = await db
    .select()
    .from(invites)
    .where(and(eq(invites.farmId, farm.farmId), eq(invites.email, email), isNull(invites.acceptedAt)));
  if (existing.some((invite) => inviteIsOpen(invite))) redirect("/team?error=invite");

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [invite] = await db
    .insert(invites)
    .values({ farmId: farm.farmId, email, roles, token, expiresAt })
    .returning({ id: invites.id });
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "create",
    entity: "invite",
    entityId: invite.id,
    summary: `Invited ${email} as ${roles.map((role) => roleLabel[role] ?? role).join(", ")}`,
    after: { email, roles },
  });

  const link = `${process.env.AUTH_URL ?? "http://localhost:3007"}/invite/${token}`;
  const mail = await sendMail({
    to: email,
    subject: `Invitation to ${farm.farmName}`,
    html: `<p>You are invited to ${farm.farmName}.</p><p><a href="${link}">Open the invite</a></p><p>This link expires in 7 days.</p>`,
  });
  redirect(`/team?sent=${mail.sent ? "1" : "0"}`);
}

export async function revokeInvite(formData: FormData) {
  const farm = await requireFarm();
  if (!canManageTeam(farm.roles)) redirect("/dashboard");
  const id = String(formData.get("id") ?? "");
  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.id, id), eq(invites.farmId, farm.farmId), isNull(invites.acceptedAt)))
    .limit(1);
  if (!invite || !inviteIsOpen(invite)) redirect("/team");
  const now = new Date();
  await db.update(invites).set({ expiresAt: now }).where(eq(invites.id, invite.id));
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "void",
    entity: "invite",
    entityId: invite.id,
    summary: `Revoked invite for ${invite.email}`,
    before: { expiresAt: invite.expiresAt.toISOString() },
    after: { expiresAt: now.toISOString() },
  });
  redirect("/team");
}

export async function updateRoles(formData: FormData) {
  const farm = await requireFarm();
  if (!canManageTeam(farm.roles)) redirect("/dashboard");
  const userId = String(formData.get("userId") ?? "");
  const roles = chosenRoles(formData);
  if (!userId || roles.length === 0) redirect("/team?error=roles");
  const roster = await farmRoster(farm.farmId);
  const member = roster.find((person) => person.userId === userId);
  if (!member) redirect("/team");
  if (!keepsTeamAdmin(roster.map((person) => ({ userId: person.userId, roles: person.roles, disabled: Boolean(person.disabledAt) })), userId, roles)) {
    redirect("/team?error=last");
  }
  await db.update(farmMembers).set({ roles }).where(and(eq(farmMembers.farmId, farm.farmId), eq(farmMembers.userId, userId)));
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "update",
    entity: "member",
    entityId: userId,
    summary: `Roles for ${member.name ?? member.email}: ${roles.map((role) => roleLabel[role] ?? role).join(", ")}`,
    before: { roles: member.roles },
    after: { roles },
  });
  redirect("/team");
}

export async function disableMember(formData: FormData) {
  const farm = await requireFarm();
  if (!canManageTeam(farm.roles)) redirect("/dashboard");
  const userId = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!userId || userId === farm.userId) redirect("/team?error=self");
  if (!reason) redirect("/team?error=reason");
  const roster = await farmRoster(farm.farmId);
  const member = roster.find((person) => person.userId === userId);
  if (!member || member.disabledAt) redirect("/team");
  const homes = await db.select({ farmId: farmMembers.farmId }).from(farmMembers).where(eq(farmMembers.userId, userId));
  if (homes.length > 1) redirect("/team?error=farms");
  if (!keepsTeamAdmin(roster.map((person) => ({ userId: person.userId, roles: person.roles, disabled: Boolean(person.disabledAt) })), userId, "disabled")) {
    redirect("/team?error=last");
  }
  const disabledAt = new Date();
  await db.update(users).set({ disabledAt }).where(eq(users.id, userId));
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "update",
    entity: "member",
    entityId: userId,
    summary: `Disabled ${member.name ?? member.email}: ${reason}`,
    before: { disabledAt: null },
    after: { reason },
  });
  redirect("/team");
}

export async function enableMember(formData: FormData) {
  const farm = await requireFarm();
  if (!canManageTeam(farm.roles)) redirect("/dashboard");
  const userId = String(formData.get("userId") ?? "");
  const roster = await farmRoster(farm.farmId);
  const member = roster.find((person) => person.userId === userId);
  if (!member?.disabledAt) redirect("/team");
  const homes = await db.select({ farmId: farmMembers.farmId }).from(farmMembers).where(eq(farmMembers.userId, userId));
  if (homes.length > 1) redirect("/team?error=farms");
  await db.update(users).set({ disabledAt: null }).where(eq(users.id, userId));
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "update",
    entity: "member",
    entityId: userId,
    summary: `Enabled ${member.name ?? member.email}`,
    before: { disabledAt: member.disabledAt.toISOString() },
    after: { disabledAt: null },
  });
  redirect("/team");
}
