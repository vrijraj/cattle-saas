"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { enquiries, orderItems, orders, products } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { requireFarm } from "@/lib/farm-context";
import { canPublish, canViewEnquiries } from "@/lib/permissions";

const nextStatus: Record<string, string[]> = {
  pending_payment: ["cancelled"],
  paid: ["packed", "cancelled", "refunded"],
  packed: ["shipped", "cancelled", "refunded"],
  shipped: ["completed"],
  completed: [],
  cancelled: [],
  refunded: [],
};

const restockSource = new Set(["paid", "packed"]);
const restockTarget = new Set(["cancelled", "refunded"]);

export async function updateOrderStatus(formData: FormData) {
  const farm = await requireFarm();
  if (!canPublish(farm.roles)) redirect("/shop?error=role");
  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  let ok = false;
  await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.farmId, farm.farmId)))
      .for("update")
      .limit(1);
    if (!order || !nextStatus[order.status]?.includes(status)) return;

    // Restore product stock when cancelling/refunding a paid or packed order
    if (restockSource.has(order.status) && restockTarget.has(status)) {
      const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      const restoreLines =
        lines.length > 0
          ? lines.map((line) => ({ productId: line.productId, quantity: line.quantity }))
          : order.productId
            ? [{ productId: order.productId, quantity: 1 }]
            : [];
      for (const line of restoreLines) {
        if (!line.productId) continue;
        const [product] = await tx
          .select()
          .from(products)
          .where(and(eq(products.id, line.productId), eq(products.farmId, farm.farmId)))
          .for("update")
          .limit(1);
        if (!product) continue;
        await tx
          .update(products)
          .set({ stock: product.stock + line.quantity })
          .where(and(eq(products.id, product.id), eq(products.farmId, farm.farmId)));
      }
    }

    await tx
      .update(orders)
      .set({ status })
      .where(and(eq(orders.id, order.id), eq(orders.farmId, farm.farmId)));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "order",
      entityId: order.id,
      summary: `Order ${order.customerName} marked ${status}`,
      before: { status: order.status },
      after: { status },
    });
    ok = true;
  });

  if (!ok) redirect("/shop?error=status");
  redirect("/shop?saved=1");
}

export async function updateEnquiryStatus(formData: FormData) {
  const farm = await requireFarm();
  if (!canViewEnquiries(farm.roles)) redirect("/dashboard");
  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!id || !["new", "replied", "closed"].includes(status)) redirect("/enquiries");

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(enquiries)
      .where(and(eq(enquiries.id, id), eq(enquiries.farmId, farm.farmId)))
      .limit(1);
    if (!current || current.status === status) return;
    await tx
      .update(enquiries)
      .set({ status })
      .where(and(eq(enquiries.id, current.id), eq(enquiries.farmId, farm.farmId)));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "enquiry",
      entityId: current.id,
      summary: `Enquiry from ${current.name} marked ${status}`,
      before: { status: current.status },
      after: { status },
    });
  });
  redirect("/enquiries?saved=1");
}
