import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { farms, invites, users } from "@/db/schema";
import { PageTransition } from "@/components/page-transition";
import { inputClass, Notice, Submit } from "@/components/workspace";
import { auth } from "@/lib/auth";
import { siteConfig } from "@/lib/site-config";
import { roleLabel } from "@/lib/team";
import { acceptInvite } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const [invite] = await db.select({ farmId: invites.farmId }).from(invites).where(eq(invites.token, token)).limit(1);
  if (!invite) return { title: "Farm invite" };
  const [farm] = await db.select({ name: farms.name }).from(farms).where(eq(farms.id, invite.farmId)).limit(1);
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
  const [invite] = await db.select().from(invites).where(eq(invites.token, token)).limit(1);
  const open = invite && !invite.acceptedAt && invite.expiresAt.getTime() >= Date.now() ? invite : null;
  const [farm] = invite ? await db.select().from(farms).where(eq(farms.id, invite.farmId)).limit(1) : [];
  const session = await auth();
  const [existing] = invite ? await db.select().from(users).where(eq(users.email, invite.email.toLowerCase())).limit(1) : [];

  return (
    <PageTransition>
      <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-6 py-12">
        <section className="w-full rounded-2xl border border-border bg-card p-6">
          <p className="text-sm font-semibold text-primary">{siteConfig.name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Join {farm?.name ?? "this farm"}</h1>
          {open ? (
            <form action={acceptInvite} className="mt-5 grid gap-3">
              <input type="hidden" name="token" value={token} />
              <p className="text-sm text-muted-foreground">
                {open.email} · {open.roles.map((role) => roleLabel[role] ?? role).join(", ")}
              </p>
              {query.error === "form" ? <Notice tone="danger">Enter your name and a password of at least 8 characters.</Notice> : null}
              {query.error === "expired" ? <Notice tone="danger">This invite has expired or was already used.</Notice> : null}
              {existing && session?.user?.id !== existing.id ? (
                <p className="text-sm">
                  This email already has a sign-in.{" "}
                  <a className="font-medium text-primary" href={`/signin?callbackUrl=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(open.email)}`}>
                    Sign in
                  </a>{" "}
                  and open this link again.
                </p>
              ) : (
                <>
                  {existing ? null : (
                    <>
                      <input name="name" required placeholder="Your name" className={inputClass} />
                      <input name="password" type="password" required minLength={8} placeholder="Password" className={inputClass} />
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
