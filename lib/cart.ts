import { cookies } from "next/headers";

export type CartLine = { productId: string; quantity: number };

type Cart = { slug: string; lines: CartLine[] };

const empty: Cart = { slug: "", lines: [] };

export async function readCart(): Promise<Cart> {
  const raw = (await cookies()).get("shop_cart")?.value;
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Cart;
    if (!parsed || !Array.isArray(parsed.lines)) return empty;
    return {
      slug: parsed.slug ?? "",
      lines: parsed.lines.filter((line) => line.productId && line.quantity > 0),
    };
  } catch {
    return empty;
  }
}

export async function writeCart(cart: Cart) {
  const jar = await cookies();
  jar.set("shop_cart", JSON.stringify(cart), { httpOnly: true, sameSite: "lax", path: "/" });
}
