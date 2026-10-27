import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { publicFarm, publicTitle } from "@/lib/page-title";
import { placeCart, updateCart } from "@/app/farms/actions";
import { db } from "@/db";
import { farms, products } from "@/db/schema";
import { readCart } from "@/lib/cart";
import { PublicFrame } from "@/components/public-frame";
import { inputClass, Notice, Submit } from "@/components/workspace";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const farm = await publicFarm(slug);
  if (!farm) return publicTitle("Cart", "This farm shop is not available.");
  return publicTitle(`Cart · ${farm.name}`, `Items selected from ${farm.name}.`);
}

export default async function CartPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm) notFound();
  const cart = await readCart();
  const lines = cart.slug === slug ? cart.lines : [];
  const catalogue = await db.select().from(products).where(and(eq(products.farmId, farm.id), eq(products.published, "yes")));
  const byId = new Map(catalogue.map((product) => [product.id, product]));
  const rows = lines.flatMap((line) => {
    const product = byId.get(line.productId);
    return product ? [{ product, quantity: line.quantity }] : [];
  });
  const total = rows.reduce((sum, row) => sum + Number(row.product.price) * row.quantity, 0);

  return (
    <PublicFrame
      title={farm.name}
      subtitle="Cart"
      href={`/farms/${slug}/shop`}
      action={
        <Link href={`/farms/${slug}/shop`} className="text-sm font-medium text-primary">
          Shop
        </Link>
      }
    >
      <div className="mx-auto max-w-xl space-y-5">
        <h1 className="text-3xl font-semibold tracking-tight">Cart</h1>
        {query.error === "stock" ? <Notice tone="danger">One of those products does not have enough stock.</Notice> : null}
        {query.error === "1" ? <Notice tone="danger">Add a name, phone, and address before checkout.</Notice> : null}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">The cart is empty.</p>
        ) : (
          <>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {rows.map((row) => (
                <li key={row.product.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium">{row.product.name}</p>
                    <p className="text-sm text-muted-foreground">₹{Number(row.product.price).toLocaleString("en-IN")} each</p>
                  </div>
                  <form action={updateCart} className="flex items-center gap-2">
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="productId" value={row.product.id} />
                    <input name="quantity" type="number" min={0} defaultValue={row.quantity} className="h-10 w-16 rounded-xl border border-border bg-background px-2 text-sm" />
                    <button type="submit" className="text-sm font-medium text-primary">
                      Update
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <p className="text-lg font-semibold">Total ₹{total.toLocaleString("en-IN")}</p>
            <form action={placeCart} className="grid gap-3 rounded-2xl border border-border bg-card p-5">
              <input type="hidden" name="slug" value={slug} />
              <label className="grid gap-1 text-sm">
                Full name
                <input name="name" required maxLength={120} placeholder="Name" className={inputClass} />
              </label>
              <label className="grid gap-1 text-sm">
                Phone number
                <input name="phone" type="tel" required minLength={7} maxLength={20} placeholder="Phone" className={inputClass} />
              </label>
              <label className="grid gap-1 text-sm">
                Delivery address
                <input name="address" required maxLength={240} placeholder="Address" className={inputClass} />
              </label>
              <div>
                <Submit>Checkout</Submit>
              </div>
            </form>
          </>
        )}
      </div>
    </PublicFrame>
  );
}
