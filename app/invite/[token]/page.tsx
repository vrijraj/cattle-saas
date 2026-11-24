import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db";
import { farms, invites, users } from "@/db/schema";
import { PageTransition } from "@/components/page-transition";
import { inputClass, Notice, Submit } from "@/components/workspace";
import { auth } from "@/lib/auth";
import { siteConfig } from "@/lib/site-config";
import { roleLabel } from "@/lib/team";
import { acceptInvite } from "../actions";

async function loadOpenInvite(token: string) {
  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.token, token), isNull(invites.acceptedAt), gte(invites.expiresAt, new Date())))
    .limit(1);
  return invite ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const open = await loadOpenInvite(token);
  if (!open) return { title: "Farm invite" };
  const [farm] = await db.select({ name: farms.name }).from(farms).where(eq(farms.id, open.farmId)).limit(1);
  return { title: farm ? `Join ${farm.name}` : "Farm invite" };
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const open = await loadOpenInvite(token);
  const [farm] = open ? await db.select().from(farms).where(eq(farms.id, open.farmId)).limit(1) : [];
  const session = await auth();
  const [existing] = open ? await db.select().from(users).where(eq(users.email, open.email.toLowerCase())).limit(1) : [];

  return (
    <PageTransition>
      <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-6 py-12">
        <section className="w-full rounded-2xl border border-border bg-card p-6">
          <p className="text-sm font-semibold text-primary">{siteConfig.name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{open && farm ? `Join ${farm.name}` : "Farm invite"}</h1>
          {open ? (
            <form action={acceptInvite} className="mt-5 grid gap-3">
              <input type="hidden" name="token" value={token} />
              <p className="text-sm text-muted-foreground">
                {open.email} · {open.roles.map((role) => roleLabel[role] ?? role).join(", ")}
              </p>
              {query.error === "form" ? <Notice tone="danger">Enter your name and a password of at least 8 characters.</Notice> : null}
              {query.error === "expired" ? <Notice tone="danger">This invite has expired or was already used.</Notice> : null}
              {query.error === "disabled" ? <Notice tone="danger">This account is disabled. Ask your farm administrator to enable it first.</Notice> : null}
              {existing && session?.user?.id !== existing.id ? (
                <p className="text-sm">
                  This email already has a sign-in.{" "}
                  <Link className="font-medium text-primary underline" href={`/signin?callbackUrl=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(open.email)}`}>
                    Sign in
                  </Link>{" "}
                  and open this link again.
                </p>
              ) : (
                <>
                  {existing ? null : (
                    <>
                      <label className="grid gap-1 text-sm">
                        Your name
                        <input name="name" required maxLength={120} placeholder="Your name" className={inputClass} />
                      </label>
                      <label className="grid gap-1 text-sm">
                        Password (at least 8 characters)
                        <input name="password" type="password" required minLength={8} maxLength={128} placeholder="Password" className={inputClass} />
                      </label>
                    </>
                  )}
                  <Submit>{existing ? "Accept invite" : "Create account"}</Submit>
                </>
              )}
            </form>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">This invite has expired or was already used.</p>
          )}
        </section>
      </main>
    </PageTransition>
  );
}
