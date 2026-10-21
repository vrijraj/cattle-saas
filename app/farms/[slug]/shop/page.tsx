import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { farms, products } from "@/db/schema";
import Link from "next/link";
import { addToCart } from "@/app/farms/actions";
import { readCart } from "@/lib/cart";
import { PublicFrame } from "@/components/public-frame";
import { Notice, PageHeader, Submit } from "@/components/workspace";

export default async function PublicShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pending?: string; paid?: string; error?: string; added?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm) notFound();
  const catalogue = await db.select().from(products).where(and(eq(products.farmId, farm.id), eq(products.published, "yes")));
  const cart = await readCart();
  const count = cart.slug === slug ? cart.lines.reduce((sum, line) => sum + line.quantity, 0) : 0;

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
        <PageHeader title="Shop" description="Dairy products from this farm." />
        {query.added ? <Notice>Added to the cart.</Notice> : null}
        {query.pending ? <Notice>Order saved. Razorpay is not configured, so it stays pending payment.</Notice> : null}
        {query.paid ? <Notice>Payment received. Thank you.</Notice> : null}
        {query.error === "pay" ? <Notice tone="danger">Payment could not be confirmed.</Notice> : null}
        {query.error && query.error !== "pay" ? <Notice tone="danger">That product could not be ordered.</Notice> : null}
        <ul className="grid gap-4 md:grid-cols-2">
          {catalogue.map((product) => (
            <li key={product.id} className="rounded-2xl border border-border bg-card p-5">
              <p className="font-medium">{product.name}</p>
              <p className="text-sm text-muted-foreground">₹{Number(product.price).toLocaleString("en-IN")} · {product.stock} in stock</p>
              <form action={addToCart} className="mt-4">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="productId" value={product.id} />
                <Submit>Add to cart</Submit>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </PublicFrame>
  );
}
