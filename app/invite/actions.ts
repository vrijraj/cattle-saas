"use server";

import { hash } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { farmMembers, invites, users } from "@/db/schema";
import { auth, signIn } from "@/lib/auth";

export async function acceptInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const invite = await loadInvite(token);
  if (!invite) redirect(`/invite/${token}?error=expired`);

  const email = invite.email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const session = await auth();

  if (existing) {
    if (session?.user?.id !== existing.id) {
      redirect(`/signin?callbackUrl=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(email)}`);
    }
    await attach(existing.id, invite);
    redirect("/dashboard");
  }

  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (name.length < 2 || password.length < 8) redirect(`/invite/${token}?error=form`);

  const passwordHash = await hash(password);
  const [user] = await db
    .insert(users)
    .values({ name, email, passwordHash, emailVerified: new Date() })
    .returning();
  await attach(user.id, invite);
  await signIn("credentials", { email, password, redirectTo: "/dashboard" });
}

async function loadInvite(token: string) {
  const [invite] = await db.select().from(invites).where(eq(invites.token, token)).limit(1);
  if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) return null;
  return invite;
}

async function attach(userId: string, invite: { id: string; farmId: string; roles: string[] }) {
  await db.transaction(async (tx) => {
    const [member] = await tx
      .select({ userId: farmMembers.userId })
      .from(farmMembers)
      .where(and(eq(farmMembers.farmId, invite.farmId), eq(farmMembers.userId, userId)))
      .limit(1);
    if (!member) {
      await tx.insert(farmMembers).values({ farmId: invite.farmId, userId, roles: invite.roles });
    }
    await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
  });
}
