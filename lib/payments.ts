import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, products } from "@/db/schema";

export async function markOrderPaid(razorpayOrderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.razorpayOrderId, razorpayOrderId)).limit(1);
  if (!order || order.status === "paid") return order ?? null;

  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(orders).where(eq(orders.id, order.id)).for("update").limit(1);
    if (!current || current.status === "paid") return;
    await tx.update(orders).set({ status: "paid" }).where(eq(orders.id, order.id));
    const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const stockLines = lines.length > 0 ? lines.map((line) => ({ productId: line.productId, quantity: line.quantity })) : order.productId ? [{ productId: order.productId, quantity: 1 }] : [];
    for (const line of stockLines) {
      if (!line.productId) continue;
      const [product] = await tx.select().from(products).where(eq(products.id, line.productId)).for("update").limit(1);
      if (!product || product.stock < line.quantity) continue;
      await tx.update(products).set({ stock: product.stock - line.quantity }).where(eq(products.id, product.id));
    }
  });

  return order;
}
