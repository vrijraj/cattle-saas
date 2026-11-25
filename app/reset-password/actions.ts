"use server";

import { createHash } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";

export type ResetState = { error: string };

export async function completePasswordReset(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!token) return { error: "Missing reset token." };
  if (password.length < 8) return { error: "Choose a password with at least 8 characters." };
  if (password.length > 128) return { error: "Password is too long." };
  if (password !== confirm) return { error: "Passwords do not match." };

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date();
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!row) return { error: "This reset link is invalid or has expired. Request a new link." };

  const passwordHash = await hash(password);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
    await tx.update(passwordResetTokens).set({ usedAt: now }).where(eq(passwordResetTokens.id, row.id));
  });

  redirect("/signin?reset=1");
}
