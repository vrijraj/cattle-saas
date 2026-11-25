import "server-only";

import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { farmMembers, farms, users } from "@/db/schema";
import { auth } from "@/lib/auth";

export const ACTIVE_FARM_COOKIE = "active_farm_id";

export async function setActiveFarmCookie(farmId: string) {
  const store = await cookies();
  store.set(ACTIVE_FARM_COOKIE, farmId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export const getFarm = cache(async function getFarm() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const memberships = await db
    .select({
      userId: users.id,
      userName: users.name,
      email: users.email,
      userPhone: users.phone,
      userLocale: users.locale,
      isSuperAdmin: users.isSuperAdmin,
      disabledAt: users.disabledAt,
      farmId: farms.id,
      farmName: farms.name,
      farmSlug: farms.slug,
      timezone: farms.timezone,
      currency: farms.currency,
      animalPrefix: farms.animalPrefix,
      enquiryEmail: farms.enquiryEmail,
      whatsappNumber: farms.whatsappNumber,
      farmLocale: farms.locale,
      milkPricePerLitre: farms.milkPricePerLitre,
      milkDropPercent: farms.milkDropPercent,
      requireBothMilkSessions: farms.requireBothMilkSessions,
      pdDueDaysCattle: farms.pdDueDaysCattle,
      pdDueDaysBuffalo: farms.pdDueDaysBuffalo,
      dryOffLeadCattle: farms.dryOffLeadCattle,
      dryOffLeadBuffalo: farms.dryOffLeadBuffalo,
      voluntaryWaitingDays: farms.voluntaryWaitingDays,
      matingGenerationWindow: farms.matingGenerationWindow,
      plan: farms.plan,
      subscriptionStatus: farms.subscriptionStatus,
      maxAnimals: farms.maxAnimals,
      maxMembers: farms.maxMembers,
      aiMonthlyLimit: farms.aiMonthlyLimit,
      roles: farmMembers.roles,
      canRecordVaccines: farmMembers.canRecordVaccines,
    })
    .from(farmMembers)
    .innerJoin(users, eq(users.id, farmMembers.userId))
    .innerJoin(farms, eq(farms.id, farmMembers.farmId))
    .where(eq(farmMembers.userId, userId))
    .orderBy(asc(farmMembers.createdAt));

  if (memberships.length === 0 || memberships[0].disabledAt) return null;

  let activeId: string | undefined;
  try {
    const store = await cookies();
    activeId = store.get(ACTIVE_FARM_COOKIE)?.value;
  } catch {
    activeId = undefined;
  }

  const active = memberships.find((item) => item.farmId === activeId) ?? memberships[0];
  return {
    ...active,
    locale: active.userLocale || active.farmLocale || "en",
    farms: memberships.map((item) => ({
      id: item.farmId,
      name: item.farmName,
      slug: item.farmSlug,
      roles: item.roles,
    })),
  };
});

export async function requireFarm() {
  const membership = await getFarm();
  if (!membership) redirect("/signin");
  return membership;
}
