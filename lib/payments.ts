import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, products } from "@/db/schema";

export async function markOrderPaid(razorpayOrderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.razorpayOrderId, razorpayOrderId)).limit(1);
  if (!order || order.status === "paid") return order ?? null;

  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(orders).where(eq(orders.id, order.id)).for("update").limit(1);
    if (!current || current.status === "paid") return;
    await tx.update(orders).set({ status: "paid" }).where(eq(orders.id, order.id));
    if (!order.productId) return;
    const [product] = await tx.select().from(products).where(eq(products.id, order.productId)).for("update").limit(1);
    if (!product || product.stock < 1) return;
    await tx.update(products).set({ stock: product.stock - 1 }).where(eq(products.id, product.id));
  });

  return order;
}
