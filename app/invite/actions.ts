"use server";

import { hash } from "@node-rs/argon2";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { farmMembers, invites, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { auth, signIn } from "@/lib/auth";
import { setActiveFarmCookie } from "@/lib/farm-context";

export async function acceptInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const safeToken = encodeURIComponent(token);
  const invite = await loadInvite(token);
  if (!invite) redirect(`/invite/${safeToken}?error=expired`);

  const email = invite.email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const session = await auth();

  if (existing) {
    if (existing.disabledAt) redirect(`/invite/${safeToken}?error=disabled`);
    if (session?.user?.id !== existing.id) {
      redirect(`/signin?callbackUrl=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(email)}`);
    }
    const ok = await attach(existing.id, invite, email);
    if (!ok) redirect(`/invite/${safeToken}?error=expired`);
    await setActiveFarmCookie(invite.farmId);
    redirect("/dashboard");
  }

  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (name.length < 2 || password.length < 8) redirect(`/invite/${safeToken}?error=form`);

  const passwordHash = await hash(password);
  const created = await db.transaction(async (tx) => {
    const [fresh] = await tx
      .select()
      .from(invites)
      .where(and(eq(invites.id, invite.id), isNull(invites.acceptedAt)))
      .limit(1);
    if (!fresh || fresh.expiresAt.getTime() < Date.now()) return false;
    const [already] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (already) return false;
    const [user] = await tx
      .insert(users)
      .values({ name, email, passwordHash, emailVerified: new Date() })
      .returning();
    await tx.insert(farmMembers).values({ farmId: fresh.farmId, userId: user.id, roles: fresh.roles });
    await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, fresh.id));
    await writeAudit(tx, {
      farmId: fresh.farmId,
      actorId: user.id,
      action: "create",
      entity: "member",
      entityId: user.id,
      summary: `${name} (${email}) accepted farm invite`,
      after: { email, roles: fresh.roles },
    });
    return true;
  });

  if (!created) redirect(`/invite/${safeToken}?error=expired`);
  await setActiveFarmCookie(invite.farmId);
  await signIn("credentials", { email, password, redirectTo: "/dashboard" });
}

async function loadInvite(token: string) {
  if (!token) return null;
  const [invite] = await db.select().from(invites).where(eq(invites.token, token)).limit(1);
  if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) return null;
  return invite;
}

async function attach(userId: string, invite: { id: string; farmId: string; roles: string[] }, email: string) {
  return db.transaction(async (tx) => {
    const [fresh] = await tx
      .select()
      .from(invites)
      .where(and(eq(invites.id, invite.id), isNull(invites.acceptedAt)))
      .limit(1);
    if (!fresh || fresh.expiresAt.getTime() < Date.now()) return false;
    const [member] = await tx
      .select({ userId: farmMembers.userId })
      .from(farmMembers)
      .where(and(eq(farmMembers.farmId, fresh.farmId), eq(farmMembers.userId, userId)))
      .limit(1);
    if (!member) {
      await tx.insert(farmMembers).values({ farmId: fresh.farmId, userId, roles: fresh.roles });
    }
    await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, fresh.id));
    await writeAudit(tx, {
      farmId: fresh.farmId,
      actorId: userId,
      action: "create",
      entity: "member",
      entityId: userId,
      summary: `${email} accepted farm invite`,
      after: { email, roles: fresh.roles },
    });
    return true;
  });
}
