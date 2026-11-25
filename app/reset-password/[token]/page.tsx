import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import Link from "next/link";
import { Leaf } from "lucide-react";
import { db } from "@/db";
import { passwordResetTokens } from "@/db/schema";
import { siteConfig } from "@/lib/site-config";
import { ResetPasswordForm } from "./reset-form";

export const metadata = { title: "Set new password" };

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [valid] = await db
    .select({ id: passwordResetTokens.id })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f7f8f6] px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-7 shadow-xs">
        <Link href="/" className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Leaf className="size-4" />
          </span>
          <span>{siteConfig.name}</span>
        </Link>
        <h1 className="mt-5 text-2xl font-semibold">Choose a new password</h1>
        {valid ? (
          <>
            <p className="mt-1.5 text-sm text-muted-foreground">Enter a strong password of at least 8 characters.</p>
            <div className="mt-6">
              <ResetPasswordForm token={token} />
            </div>
          </>
        ) : (
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p>This password reset link is invalid or has already expired.</p>
            <Link href="/forgot-password" className="inline-flex font-medium text-primary hover:underline">
              Request a fresh reset link
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
