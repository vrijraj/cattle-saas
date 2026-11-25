import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { alerts, orderItems, orders, products } from "@/db/schema";
import { writeAudit } from "@/lib/audit";

function signingSecret() {
  return process.env.AUTH_SECRET || process.env.RAZORPAY_KEY_SECRET || "local-order-signing-secret";
}

export function orderAccessToken(orderId: string) {
  return createHmac("sha256", signingSecret()).update(`order:${orderId}`).digest("base64url").slice(0, 24);
}

export function verifyOrderAccessToken(orderId: string, token: string | undefined) {
  if (!token) return false;
  const expected = Buffer.from(orderAccessToken(orderId));
  const supplied = Buffer.from(token);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function markOrderPaid(razorpayOrderId: string, razorpayPaymentId?: string, paidAmountPaise?: number) {
  const [order] = await db.select().from(orders).where(eq(orders.razorpayOrderId, razorpayOrderId)).limit(1);
  if (!order) return null;
  if (order.status !== "pending_payment") return order;
  if (paidAmountPaise !== undefined && Math.round(Number(order.amount) * 100) !== paidAmountPaise) {
    return null;
  }

  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(orders).where(eq(orders.id, order.id)).for("update").limit(1);
    if (!current || current.status !== "pending_payment") return;

    const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const stockLines =
      lines.length > 0
        ? lines.map((line) => ({ productId: line.productId, quantity: line.quantity }))
        : order.productId
          ? [{ productId: order.productId, quantity: 1 }]
          : [];

    const oversold: string[] = [];
    for (const line of stockLines) {
      if (!line.productId) continue;
      const [product] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, line.productId), eq(products.farmId, current.farmId)))
        .for("update")
        .limit(1);
      if (!product) continue;
      if (product.stock < line.quantity) {
        oversold.push(`${product.name} (ordered ${line.quantity}, had ${product.stock})`);
      }
      const nextStock = Math.max(0, product.stock - line.quantity);
      await tx.update(products).set({ stock: nextStock }).where(and(eq(products.id, product.id), eq(products.farmId, current.farmId)));
    }

    await tx
      .update(orders)
      .set({
        status: "paid",
        ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
      })
      .where(and(eq(orders.id, order.id), eq(orders.farmId, current.farmId)));

    if (oversold.length > 0) {
      await tx.insert(alerts).values({
        farmId: current.farmId,
        type: "custom",
        title: `Oversold shop order · ${current.customerName}`,
        body: `Payment was captured for order ${current.id}, but stock was insufficient for: ${oversold.join("; ")}. Fulfill or refund.`,
      });
    }

    await writeAudit(tx, {
      farmId: current.farmId,
      actorId: null,
      action: "update",
      entity: "order",
      entityId: current.id,
      summary: `Order for ${current.customerName} paid (₹${current.amount})${oversold.length > 0 ? " [oversold alert raised]" : ""}`,
      before: { status: current.status },
      after: {
        status: "paid",
        razorpayOrderId,
        razorpayPaymentId: razorpayPaymentId ?? null,
        ...(oversold.length > 0 ? { oversold } : {}),
      },
    });
  });

  return order;
}
