import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { publicFarm, publicTitle } from "@/lib/page-title";
import { db } from "@/db";
import { farms, orderItems, orders } from "@/db/schema";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { verifyOrderAccessToken } from "@/lib/payments";
import { PublicFrame } from "@/components/public-frame";
import { Notice, Pill } from "@/components/workspace";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const farm = await publicFarm(slug);
  if (!farm) return publicTitle("Order", "This order is not available.");
  return publicTitle(`Order · ${farm.name}`, `Order status at ${farm.name}.`);
}

export default async function PublicOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ t?: string; paid?: string }>;
}) {
  const { slug, id } = await params;
  const query = await searchParams;
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm) notFound();
  if (!verifyOrderAccessToken(id, query.t)) notFound();
  const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.farmId, farm.id))).limit(1);
  if (!order) notFound();
  const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));

  return (
    <PublicFrame title={farm.name} subtitle="Order" href={`/farms/${slug}/shop`}>
      <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Order status</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {order.customerName} · {formatDisplayDate(farmToday(farm.timezone, order.createdAt))}
            </p>
          </div>
          <Pill tone={order.status === "paid" || order.status === "completed" ? "good" : order.status === "pending_payment" ? "warn" : "neutral"}>
            {order.status.replaceAll("_", " ")}
          </Pill>
        </div>
        {query.paid ? <Notice>Payment received. Thank you for your order.</Notice> : null}
        {lines.length > 0 ? (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {lines.map((line) => (
              <li key={line.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  {line.name} × {line.quantity}
                </span>
                <span>₹{(Number(line.price) * line.quantity).toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-lg font-semibold">Total ₹{Number(order.amount).toLocaleString("en-IN")}</p>
        <p className="text-xs text-muted-foreground">Delivery address: {order.address}</p>
      </div>
    </PublicFrame>
  );
}
