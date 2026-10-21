import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { farms, orders, products } from "@/db/schema";
import { RazorpayPay } from "@/components/razorpay-pay";
import { PublicFrame } from "@/components/public-frame";

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm || !query.order) notFound();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, query.order), eq(orders.farmId, farm.id)))
    .limit(1);
  if (!order) notFound();
  if (order.status === "paid") redirect(`/farms/${slug}/shop?paid=1`);

  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!order.razorpayOrderId || !keyId) redirect(`/farms/${slug}/shop?pending=${order.id}`);

  const [product] = order.productId ? await db.select().from(products).where(eq(products.id, order.productId)).limit(1) : [];

  return (
    <PublicFrame title={farm.name} subtitle="Shop" href={`/farms/${slug}/shop`}>
      <section className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6">
        <h1 className="text-3xl font-semibold tracking-tight">Pay</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {product?.name ?? "Order"} for {order.customerName}
        </p>
        <p className="mt-4 text-2xl font-semibold">₹{Number(order.amount).toLocaleString("en-IN")}</p>
        <div className="mt-6">
          <RazorpayPay
            keyId={keyId}
            orderId={order.razorpayOrderId}
            amount={Math.round(Number(order.amount) * 100)}
            farmName={farm.name}
            description={product?.name ?? "Farm shop"}
            customerName={order.customerName}
            phone={order.phone}
          />
        </div>
      </section>
    </PublicFrame>
  );
}
