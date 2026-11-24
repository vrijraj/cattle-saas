import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { publicFarm, publicTitle } from "@/lib/page-title";
import { db } from "@/db";
import { farms, orderItems, orders } from "@/db/schema";
import { verifyOrderAccessToken } from "@/lib/payments";
import { RazorpayPay } from "@/components/razorpay-pay";
import { PublicFrame } from "@/components/public-frame";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const farm = await publicFarm(slug);
  if (!farm) return publicTitle("Checkout", "This farm shop is not available.");
  return publicTitle(`Checkout · ${farm.name}`, `Pay ${farm.name} for this order.`);
}

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ order?: string; t?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm || !query.order || !verifyOrderAccessToken(query.order, query.t)) notFound();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, query.order), eq(orders.farmId, farm.id)))
    .limit(1);
  if (!order) notFound();
  if (order.status !== "pending_payment") {
    redirect(`/farms/${slug}/orders/${order.id}?t=${encodeURIComponent(query.t ?? "")}`);
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!order.razorpayOrderId || !keyId) {
    redirect(`/farms/${slug}/shop?pending=${order.id}&t=${encodeURIComponent(query.t ?? "")}`);
  }

  const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const summary = lines.length > 0 ? lines.map((line) => `${line.name} × ${line.quantity}`).join(", ") : "Farm shop order";

  return (
    <PublicFrame title={farm.name} subtitle="Shop" href={`/farms/${slug}/shop`}>
      <section className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6">
        <h1 className="text-3xl font-semibold tracking-tight">Pay</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {summary} for {order.customerName}
        </p>
        <p className="mt-4 text-2xl font-semibold">₹{Number(order.amount).toLocaleString("en-IN")}</p>
        <div className="mt-6">
          <RazorpayPay
            keyId={keyId}
            orderId={order.razorpayOrderId}
            amount={Math.round(Number(order.amount) * 100)}
            farmName={farm.name}
            description={summary}
            customerName={order.customerName}
            phone={order.phone}
          />
        </div>
      </section>
    </PublicFrame>
  );
}
