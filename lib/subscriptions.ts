import { eq } from "drizzle-orm";
import { db } from "@/db";
import { alerts, farms } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { planSpec, type PlanId } from "@/lib/plans";

export function razorpayPlanIdFor(plan: PlanId): string | null {
  if (plan === "starter") return process.env.RAZORPAY_PLAN_STARTER?.trim() || null;
  if (plan === "pro") return process.env.RAZORPAY_PLAN_PRO?.trim() || null;
  if (plan === "enterprise") return process.env.RAZORPAY_PLAN_ENTERPRISE?.trim() || null;
  return null;
}

export function planFromRazorpayPlanId(razorpayPlanId: string | undefined): PlanId | null {
  if (!razorpayPlanId) return null;
  if (process.env.RAZORPAY_PLAN_STARTER && razorpayPlanId === process.env.RAZORPAY_PLAN_STARTER.trim()) return "starter";
  if (process.env.RAZORPAY_PLAN_PRO && razorpayPlanId === process.env.RAZORPAY_PLAN_PRO.trim()) return "pro";
  if (process.env.RAZORPAY_PLAN_ENTERPRISE && razorpayPlanId === process.env.RAZORPAY_PLAN_ENTERPRISE.trim()) return "enterprise";
  return null;
}

export function razorpaySubscriptionsConfigured(): boolean {
  const key = process.env.RAZORPAY_KEY_ID?.trim();
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  return Boolean(key && secret && (razorpayPlanIdFor("starter") || razorpayPlanIdFor("pro") || razorpayPlanIdFor("enterprise")));
}

export async function createRazorpaySubscriptionCheckout(input: {
  farmId: string;
  farmName: string;
  email: string;
  plan: PlanId;
}): Promise<{ ok: true; subscriptionId: string; shortUrl: string } | { ok: false; reason: string }> {
  const key = process.env.RAZORPAY_KEY_ID?.trim();
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const rzpPlanId = razorpayPlanIdFor(input.plan);
  if (!key || !secret || !rzpPlanId) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const authHeader = `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
    const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan_id: rzpPlanId,
        total_count: 120,
        customer_notify: 1,
        notes: {
          farmId: input.farmId,
          farmName: input.farmName,
          plan: input.plan,
          billingEmail: input.email,
        },
      }),
    });
    if (!response.ok) {
      return { ok: false, reason: `razorpay_http_${response.status}` };
    }
    const data = (await response.json()) as { id?: string; short_url?: string };
    if (!data.id || !data.short_url) {
      return { ok: false, reason: "invalid_response" };
    }

    await db
      .update(farms)
      .set({ razorpaySubscriptionId: data.id })
      .where(eq(farms.id, input.farmId));

    return { ok: true, subscriptionId: data.id, shortUrl: data.short_url };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

export type RazorpaySubscriptionEntity = {
  id?: string;
  plan_id?: string;
  status?: string;
  notes?: Record<string, unknown>;
};

export async function applySubscriptionWebhookEvent(
  eventName: string,
  entity: RazorpaySubscriptionEntity | undefined,
): Promise<{ applied: boolean; farmId?: string; status?: string }> {
  if (!entity?.id) return { applied: false };

  const noteFarmId = typeof entity.notes?.farmId === "string" ? entity.notes.farmId : undefined;
  const [farm] = noteFarmId
    ? await db.select().from(farms).where(eq(farms.id, noteFarmId)).limit(1)
    : await db.select().from(farms).where(eq(farms.razorpaySubscriptionId, entity.id)).limit(1);

  if (!farm) return { applied: false };

  const notePlan =
    entity.notes?.plan === "starter" || entity.notes?.plan === "pro" || entity.notes?.plan === "enterprise"
      ? (entity.notes.plan as PlanId)
      : null;
  const resolvedPlan = planFromRazorpayPlanId(entity.plan_id) ?? notePlan ?? (farm.plan as PlanId);

  if (eventName === "subscription.activated" || eventName === "subscription.charged" || eventName === "subscription.authenticated") {
    const spec = planSpec(resolvedPlan);
    await db.transaction(async (tx) => {
      await tx
        .update(farms)
        .set({
          plan: spec.id,
          subscriptionStatus: "active",
          razorpaySubscriptionId: entity.id,
          maxAnimals: spec.maxAnimals,
          maxMembers: spec.maxMembers,
          aiMonthlyLimit: spec.aiMonthlyLimit,
        })
        .where(eq(farms.id, farm.id));
      await writeAudit(tx, {
        farmId: farm.id,
        actorId: null,
        action: "update",
        entity: "subscription",
        entityId: farm.id,
        summary: `Razorpay ${eventName}: active on ${spec.name} (${entity.id})`,
        before: { plan: farm.plan, subscriptionStatus: farm.subscriptionStatus },
        after: { plan: spec.id, subscriptionStatus: "active", razorpaySubscriptionId: entity.id },
      });
    });
    return { applied: true, farmId: farm.id, status: "active" };
  }

  if (eventName === "subscription.halted" || eventName === "subscription.pending") {
    await db.transaction(async (tx) => {
      await tx
        .update(farms)
        .set({ subscriptionStatus: "past_due", razorpaySubscriptionId: entity.id })
        .where(eq(farms.id, farm.id));
      await tx.insert(alerts).values({
        farmId: farm.id,
        type: "finance",
        title: "Subscription payment past due",
        body: `Razorpay reported ${eventName} on subscription ${entity.id}. Update billing to avoid service interruption.`,
      });
      await writeAudit(tx, {
        farmId: farm.id,
        actorId: null,
        action: "update",
        entity: "subscription",
        entityId: farm.id,
        summary: `Razorpay ${eventName}: marked past_due (${entity.id})`,
        before: { subscriptionStatus: farm.subscriptionStatus },
        after: { subscriptionStatus: "past_due" },
      });
    });
    return { applied: true, farmId: farm.id, status: "past_due" };
  }

  if (eventName === "subscription.cancelled" || eventName === "subscription.completed") {
    const fallback = planSpec("starter");
    await db.transaction(async (tx) => {
      await tx
        .update(farms)
        .set({
          plan: fallback.id,
          subscriptionStatus: "active",
          maxAnimals: fallback.maxAnimals,
          maxMembers: fallback.maxMembers,
          aiMonthlyLimit: fallback.aiMonthlyLimit,
        })
        .where(eq(farms.id, farm.id));
      await writeAudit(tx, {
        farmId: farm.id,
        actorId: null,
        action: "update",
        entity: "subscription",
        entityId: farm.id,
        summary: `Razorpay ${eventName}: reverted to ${fallback.name} quotas`,
        before: { plan: farm.plan, subscriptionStatus: farm.subscriptionStatus },
        after: { plan: fallback.id, subscriptionStatus: "active" },
      });
    });
    return { applied: true, farmId: farm.id, status: "cancelled" };
  }

  return { applied: false };
}
