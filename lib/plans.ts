import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { aiSessions, animals, farmMembers } from "@/db/schema";

export type PlanId = "starter" | "pro" | "enterprise";

export type PlanSpec = {
  id: PlanId;
  name: string;
  priceInrMonthly: number;
  maxAnimals: number;
  maxMembers: number;
  aiMonthlyLimit: number;
  tagline: string;
  highlights: string[];
};

export const PLANS: Record<PlanId, PlanSpec> = {
  starter: {
    id: "starter",
    name: "Starter Dairy",
    priceInrMonthly: 999,
    maxAnimals: 50,
    maxMembers: 5,
    aiMonthlyLimit: 100,
    tagline: "For small family dairies & gaushalas digitizing their herd.",
    highlights: ["Up to 50 on-farm animals", "Up to 5 staff accounts", "100 AI assistant turns / month", "Public farm page & QR ear tags"],
  },
  pro: {
    id: "pro",
    name: "Commercial Pro",
    priceInrMonthly: 2999,
    maxAnimals: 250,
    maxMembers: 25,
    aiMonthlyLimit: 500,
    tagline: "Full herd genetics, milk quality, pharmacy, rations & storefront.",
    highlights: ["Up to 250 on-farm animals", "Up to 25 staff accounts", "500 AI assistant turns / month", "WhatsApp bot, IoT ingest & GST invoices"],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise Co-op",
    priceInrMonthly: 8999,
    maxAnimals: 5000,
    maxMembers: 200,
    aiMonthlyLimit: 5000,
    tagline: "Multi-shed commercial operations, breeding centres & co-ops.",
    highlights: ["Up to 5,000 on-farm animals", "Up to 200 staff accounts", "5,000 AI assistant turns / month", "Dedicated PostgreSQL RLS & priority SLA"],
  },
};

export function planSpec(plan: string | null | undefined): PlanSpec {
  if (plan === "starter" || plan === "pro" || plan === "enterprise") return PLANS[plan];
  return PLANS.pro;
}

export function isQuotaExceeded(current: number, limit: number) {
  return limit > 0 && current >= limit;
}

export async function getFarmUsage(farmId: string) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [[animalRow], [memberRow], [aiRow]] = await Promise.all([
    db
      .select({ total: count() })
      .from(animals)
      .where(and(eq(animals.farmId, farmId), eq(animals.presence, "on_farm"))),
    db.select({ total: count() }).from(farmMembers).where(eq(farmMembers.farmId, farmId)),
    db
      .select({ total: count() })
      .from(aiSessions)
      .where(and(eq(aiSessions.farmId, farmId), gte(aiSessions.updatedAt, monthStart))),
  ]);

  return {
    onFarmAnimals: Number(animalRow?.total ?? 0),
    members: Number(memberRow?.total ?? 0),
    aiSessionsThisMonth: Number(aiRow?.total ?? 0),
  };
}

export async function checkAnimalQuota(farmId: string, maxAnimals: number) {
  const [row] = await db
    .select({ total: count() })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.presence, "on_farm")));
  const current = Number(row?.total ?? 0);
  return {
    allowed: !isQuotaExceeded(current, maxAnimals),
    current,
    limit: maxAnimals,
  };
}

export async function checkMemberQuota(farmId: string, maxMembers: number) {
  const [row] = await db.select({ total: count() }).from(farmMembers).where(eq(farmMembers.farmId, farmId));
  const current = Number(row?.total ?? 0);
  return {
    allowed: !isQuotaExceeded(current, maxMembers),
    current,
    limit: maxMembers,
  };
}
