import "server-only";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { farmMembers, farms, users } from "@/db/schema";
import { auth } from "@/lib/auth";

export async function requireFarm() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");

  const [membership] = await db
    .select({
      userId: users.id,
      userName: users.name,
      email: users.email,
      disabledAt: users.disabledAt,
      farmId: farms.id,
      farmName: farms.name,
      farmSlug: farms.slug,
      timezone: farms.timezone,
      animalPrefix: farms.animalPrefix,
      roles: farmMembers.roles,
    })
    .from(farmMembers)
    .innerJoin(users, eq(users.id, farmMembers.userId))
    .innerJoin(farms, eq(farms.id, farmMembers.farmId))
    .where(eq(farmMembers.userId, userId))
    .limit(1);

  if (!membership || membership.disabledAt) redirect("/signin");
  return membership;
}
