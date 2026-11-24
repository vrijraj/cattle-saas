import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, farmMembers, farms, listings, users } from "@/db/schema";
import { auth } from "@/lib/auth";

export const metadata = { title: "Animal tag" };

export default async function QrLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth();

  const [animal] = await db
    .select({ id: animals.id, code: animals.code, farmId: animals.farmId, farmSlug: farms.slug })
    .from(animals)
    .innerJoin(farms, eq(farms.id, animals.farmId))
    .where(eq(animals.qrToken, token))
    .limit(1);

  if (!session?.user?.id) {
    if (animal) {
      const [published] = await db
        .select({ id: listings.id })
        .from(listings)
        .where(and(eq(listings.farmId, animal.farmId), eq(listings.animalId, animal.id), eq(listings.published, "yes")))
        .limit(1);
      if (published) {
        redirect(`/farms/${animal.farmSlug}/${encodeURIComponent(animal.code)}`);
      }
    }
    const callbackUrl = encodeURIComponent(`/q/${token}`);
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold tracking-tight">Animal tag</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to open the animal this tag belongs to.</p>
          <Link href={`/signin?callbackUrl=${callbackUrl}`} className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  if (!animal) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold tracking-tight">No access</h1>
          <p className="mt-2 text-sm text-muted-foreground">This tag is not available to your farm.</p>
        </div>
      </main>
    );
  }

  const [membership] = await db
    .select({ farmId: farmMembers.farmId })
    .from(farmMembers)
    .innerJoin(users, eq(users.id, farmMembers.userId))
    .where(and(eq(farmMembers.userId, session.user.id), eq(farmMembers.farmId, animal.farmId), isNull(users.disabledAt)))
    .limit(1);

  if (!membership) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold tracking-tight">No access</h1>
          <p className="mt-2 text-sm text-muted-foreground">This tag is not available to your farm.</p>
        </div>
      </main>
    );
  }

  redirect(`/animals/${encodeURIComponent(animal.code)}`);
}
