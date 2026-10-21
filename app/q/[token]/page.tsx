import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, farmMembers } from "@/db/schema";
import { auth } from "@/lib/auth";

export default async function QrLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold tracking-tight">Animal tag</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to open the animal this tag belongs to.</p>
          <Link href="/signin" className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const [animal] = await db
    .select({ code: animals.code, farmId: animals.farmId })
    .from(animals)
    .where(eq(animals.qrToken, token))
    .limit(1);
  const [membership] = await db
    .select({ farmId: farmMembers.farmId })
    .from(farmMembers)
    .where(eq(farmMembers.userId, session.user.id))
    .limit(1);

  if (!animal || !membership || animal.farmId !== membership.farmId) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold tracking-tight">No access</h1>
          <p className="mt-2 text-sm text-muted-foreground">This tag is not available to your farm.</p>
        </div>
      </main>
    );
  }

  redirect(`/animals/${animal.code}`);
}
