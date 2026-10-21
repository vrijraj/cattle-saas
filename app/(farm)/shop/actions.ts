"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { requireFarm } from "@/lib/farm-context";
import { canPublish } from "@/lib/permissions";

const nextStatus: Record<string, string[]> = {
  pending_payment: ["cancelled"],
  paid: ["packed", "cancelled", "refunded"],
  packed: ["shipped", "cancelled"],
  shipped: ["completed"],
  completed: [],
  cancelled: [],
  refunded: [],
};

export async function updateOrderStatus(formData: FormData) {
  const farm = await requireFarm();
  if (!canPublish(farm.roles)) redirect("/shop?error=role");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.farmId, farm.farmId))).limit(1);
  if (!order || !nextStatus[order.status]?.includes(status)) redirect("/shop?error=status");
  await db.update(orders).set({ status }).where(eq(orders.id, order.id));
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "update",
    entity: "order",
    entityId: order.id,
    summary: `Order ${order.customerName} marked ${status}`,
    before: { status: order.status },
    after: { status },
  });
  redirect("/shop");
}
