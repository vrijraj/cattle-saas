"use server";

import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { escapeHtml, sendMail } from "@/lib/mail";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

export type ForgotState = {
  done: boolean;
  error?: string;
  devLink?: string;
};

export async function requestPasswordReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@") || email.startsWith("@")) {
    return { done: false, error: "Enter a valid email address." };
  }

  const ip = clientIpFromHeaders(await headers());
  const rl = checkRateLimit(`forgot:${ip}:${email}`, { limit: 4, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) {
    return { done: false, error: "Too many reset requests. Wait a few minutes before trying again." };
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || user.disabledAt) {
    // Do not leak whether the email exists.
    return { done: true };
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  const origin = process.env.AUTH_URL ?? "http://localhost:3007";
  const link = `${origin}/reset-password/${rawToken}`;

  const mail = await sendMail({
    to: user.email,
    subject: "Reset your farm portal password",
    html: `<p>Hello ${escapeHtml(user.name ?? "there")},</p><p>Use this link within 1 hour to set a new password:</p><p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p><p>If you did not ask for this, you can safely ignore this email.</p>`,
  });

  const devLink = !mail.sent && process.env.NODE_ENV !== "production" ? link : undefined;
  return { done: true, devLink };
}
