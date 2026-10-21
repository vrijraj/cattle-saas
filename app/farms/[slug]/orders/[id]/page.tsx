import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { publicFarm, publicTitle } from "@/lib/page-title";
import { db } from "@/db";
import { farms, orders } from "@/db/schema";
import { PublicFrame } from "@/components/public-frame";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const farm = await publicFarm(slug);
  if (!farm) return publicTitle("Order", "This order is not available.");
  return publicTitle(`Order · ${farm.name}`, `Order status at ${farm.name}.`);
}

export default async function PublicOrderPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm) notFound();
  const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.farmId, farm.id))).limit(1);
  if (!order) notFound();

  return (
    <PublicFrame title={farm.name} subtitle="Order" href={`/farms/${slug}/shop`}>
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold">Order status</h1>
        <p className="mt-2 text-sm text-muted-foreground">{order.customerName}</p>
        <p className="mt-4 text-lg font-medium capitalize">{order.status.replaceAll("_", " ")}</p>
        <p className="mt-1 text-sm text-muted-foreground">₹{Number(order.amount).toLocaleString("en-IN")}</p>
      </div>
    </PublicFrame>
  );
}
