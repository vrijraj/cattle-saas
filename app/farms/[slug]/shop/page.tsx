import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { publicFarm, publicTitle } from "@/lib/page-title";
import { db } from "@/db";
import { farms, products } from "@/db/schema";
import Link from "next/link";
import { addToCart } from "@/app/farms/actions";
import { readCart } from "@/lib/cart";
import { PublicFrame } from "@/components/public-frame";
import { Notice, PageHeader, Submit } from "@/components/workspace";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const farm = await publicFarm(slug);
  if (!farm) return publicTitle("Farm shop", "This shop is not available.");
  return publicTitle(`${farm.name} shop`, `Products published by ${farm.name}.`);
}

export default async function PublicShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pending?: string; payError?: string; paid?: string; error?: string; added?: string; t?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm) notFound();
  const catalogue = await db
    .select()
    .from(products)
    .where(and(eq(products.farmId, farm.id), eq(products.published, "yes")))
    .orderBy(desc(products.createdAt));
  const cart = await readCart();
  const count = cart.slug === slug ? cart.lines.reduce((sum, line) => sum + line.quantity, 0) : 0;
  const trackOrderId = query.pending || query.payError;
  const trackHref = trackOrderId && query.t ? `/farms/${slug}/orders/${trackOrderId}?t=${encodeURIComponent(query.t)}` : null;

  return (
    <PublicFrame
      title={farm.name}
      subtitle="Shop"
      href={`/farms/${slug}`}
      action={
        <Link href={`/farms/${slug}/cart`} className="text-sm font-medium text-primary">
          Cart ({count})
        </Link>
      }
    >
      <div className="space-y-5">
        <PageHeader title="Shop" description="Farm products published for direct order." />
        {query.added ? <Notice>Added to the cart.</Notice> : null}
        {query.pending ? (
          <Notice>
            Order saved and waiting for payment (online checkout is not configured).
            {trackHref ? (
              <>
                {" "}
                <Link href={trackHref} className="font-medium underline">
                  View order status
                </Link>
              </>
            ) : null}
          </Notice>
        ) : null}
        {query.payError ? (
          <Notice tone="danger">
            Order was saved, but payment checkout could not be started right now. The farm can confirm payment directly.
            {trackHref ? (
              <>
                {" "}
                <Link href={trackHref} className="font-medium underline">
                  View order status
                </Link>
              </>
            ) : null}
          </Notice>
        ) : null}
        {query.paid ? <Notice>Payment received. Thank you.</Notice> : null}
        {query.error === "pay" ? <Notice tone="danger">Payment could not be confirmed.</Notice> : null}
        {query.error === "stock" ? <Notice tone="danger">You already have the maximum available stock in your cart.</Notice> : null}
        {query.error && query.error !== "pay" && query.error !== "stock" ? <Notice tone="danger">That product could not be ordered.</Notice> : null}

        {catalogue.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">No products are published in this farm shop yet.</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {catalogue.map((product) => (
              <li key={product.id} className="rounded-2xl border border-border bg-card p-5">
                <p className="font-medium">{product.name}</p>
                <p className="text-sm text-muted-foreground">
                  ₹{Number(product.price).toLocaleString("en-IN")} · {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
                </p>
                {product.stock > 0 ? (
                  <form action={addToCart} className="mt-4">
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="productId" value={product.id} />
                    <Submit>Add to cart</Submit>
                  </form>
                ) : (
                  <button type="button" disabled className="mt-4 h-10 rounded-full border border-border bg-muted px-4 text-sm font-medium text-muted-foreground">
                    Out of stock
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicFrame>
  );
}
