"use server";

import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { enquiries, farmMembers, farms, orderItems, orders, products, users } from "@/db/schema";
import { readCart, writeCart } from "@/lib/cart";
import { escapeHtml, sendMail } from "@/lib/mail";
import { markOrderPaid, orderAccessToken } from "@/lib/payments";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

async function farmRecipientEmail(farm: { id: string; enquiryEmail: string | null }) {
  if (farm.enquiryEmail) return farm.enquiryEmail;
  const members = await db
    .select({ email: users.email, roles: farmMembers.roles })
    .from(farmMembers)
    .innerJoin(users, eq(users.id, farmMembers.userId))
    .where(eq(farmMembers.farmId, farm.id));
  const owner = members.find((m) => m.roles.includes("owner")) ?? members.find((m) => m.roles.includes("admin")) ?? members[0];
  return owner?.email ?? null;
}

export async function sendEnquiry(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm) redirect("/");
  const safeSlug = encodeURIComponent(farm.slug);
  // Silently accept bots filling the hidden honeypot field without emailing or inserting.
  if (String(formData.get("website") ?? "").trim()) redirect(`/farms/${safeSlug}?sent=1`);

  const ip = clientIpFromHeaders(await headers());
  const rl = checkRateLimit(`enquiry:${farm.id}:${ip}`, { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!rl.allowed) redirect(`/farms/${safeSlug}?error=rate`);

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const animalCode = String(formData.get("animalCode") ?? "").trim() || null;
  if (!name || !phone || !message) redirect(`/farms/${safeSlug}?error=1`);

  await db.insert(enquiries).values({ farmId: farm.id, animalCode, name, phone, message, status: "new" });
  const recipient = await farmRecipientEmail(farm);
  if (recipient) {
    await sendMail({
      to: recipient,
      subject: `Enquiry ${animalCode || "catalogue"} · ${farm.name}`,
      html: `<p><strong>${escapeHtml(name)}</strong> (${escapeHtml(phone)})</p>${animalCode ? `<p>Regarding: ${escapeHtml(animalCode)}</p>` : ""}<p>${escapeHtml(message)}</p>`,
    });
  }
  redirect(`/farms/${safeSlug}?sent=1`);
}

export async function addToCart(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm) redirect("/");
  const safeSlug = encodeURIComponent(farm.slug);
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.farmId, farm.id), eq(products.published, "yes")))
    .limit(1);
  if (!product || product.stock < 1) redirect(`/farms/${safeSlug}/shop?error=1`);

  const rawQty = Number(formData.get("quantity") ?? "1");
  const addQty = Number.isInteger(rawQty) && rawQty >= 1 && rawQty <= 50 ? rawQty : 1;
  const cart = await readCart();
  const lines = cart.slug === farm.slug ? [...cart.lines] : [];
  const existing = lines.find((line) => line.productId === productId);
  if (existing) {
    if (existing.quantity + addQty > product.stock) redirect(`/farms/${safeSlug}/shop?error=stock`);
    existing.quantity += addQty;
  } else {
    if (addQty > product.stock) redirect(`/farms/${safeSlug}/shop?error=stock`);
    lines.push({ productId, quantity: addQty });
  }
  await writeCart({ slug: farm.slug, lines });
  redirect(`/farms/${safeSlug}/shop?added=1`);
}

export async function updateCart(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm) redirect("/");
  const safeSlug = encodeURIComponent(farm.slug);
  const rawQty = Number(formData.get("quantity") ?? "0");
  const quantity = Number.isFinite(rawQty) ? Math.trunc(rawQty) : 0;

  const [product] = productId
    ? await db
        .select({ stock: products.stock, published: products.published })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.farmId, farm.id)))
        .limit(1)
    : [];

  const cart = await readCart();
  const lines = (cart.slug === farm.slug ? cart.lines : []).flatMap((line) => {
    if (line.productId !== productId) return [line];
    if (quantity < 1 || !product || product.published !== "yes" || product.stock < 1) return [];
    return [{ productId, quantity: Math.min(quantity, product.stock) }];
  });
  await writeCart({ slug: farm.slug, lines });
  redirect(`/farms/${safeSlug}/cart`);
}

export async function placeCart(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm) redirect("/");
  const safeSlug = encodeURIComponent(farm.slug);
  const customerName = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const cart = await readCart();
  if (cart.slug !== farm.slug || cart.lines.length === 0 || !customerName || !phone || !address) {
    redirect(`/farms/${safeSlug}/cart?error=1`);
  }

  const catalogue = await db.select().from(products).where(and(eq(products.farmId, farm.id), eq(products.published, "yes")));
  const byId = new Map(catalogue.map((product) => [product.id, product]));

  // Prune any unavailable/unpublished items cleanly from the cart
  const availableLines = cart.lines.filter((line) => byId.has(line.productId));
  if (availableLines.length !== cart.lines.length) {
    await writeCart({ slug: farm.slug, lines: availableLines });
    redirect(`/farms/${safeSlug}/cart?error=stock`);
  }

  const lines = availableLines.flatMap((line) => {
    const product = byId.get(line.productId);
    const qty = Math.trunc(line.quantity);
    if (!product || qty < 1 || product.stock < qty) return [];
    return [{ product, quantity: qty }];
  });
  if (lines.length !== availableLines.length) redirect(`/farms/${safeSlug}/cart?error=stock`);

  const amount = lines.reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0);
  const order = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(orders)
      .values({
        farmId: farm.id,
        productId: lines.length === 1 ? lines[0].product.id : null,
        customerName,
        phone,
        address,
        amount: amount.toFixed(2),
        status: "pending_payment",
      })
      .returning();
    await tx.insert(orderItems).values(
      lines.map((line) => ({
        orderId: created.id,
        productId: line.product.id,
        name: line.product.name,
        quantity: line.quantity,
        price: line.product.price,
      })),
    );
    return created;
  });

  await writeCart({ slug: farm.slug, lines: [] });

  const token = orderAccessToken(order.id);
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) redirect(`/farms/${safeSlug}/shop?pending=${order.id}&t=${encodeURIComponent(token)}`);

  try {
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: "INR",
        receipt: order.id,
      }),
    });
    if (!response.ok) redirect(`/farms/${safeSlug}/shop?payError=${order.id}&t=${encodeURIComponent(token)}`);
    const payload = (await response.json()) as { id?: string };
    if (!payload.id) redirect(`/farms/${safeSlug}/shop?payError=${order.id}&t=${encodeURIComponent(token)}`);
    await db.update(orders).set({ razorpayOrderId: payload.id }).where(and(eq(orders.id, order.id), eq(orders.farmId, farm.id)));
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("Razorpay order creation failed:", error);
    redirect(`/farms/${safeSlug}/shop?payError=${order.id}&t=${encodeURIComponent(token)}`);
  }

  redirect(`/farms/${safeSlug}/shop/pay?order=${order.id}&t=${encodeURIComponent(token)}`);
}

export async function placeOrder(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm) redirect("/");
  const safeSlug = encodeURIComponent(farm.slug);
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.farmId, farm.id), eq(products.published, "yes")))
    .limit(1);
  const customerName = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  if (!product || product.stock < 1 || !customerName || !phone || !address) {
    redirect(`/farms/${safeSlug}/shop?error=1`);
  }
  const order = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(orders)
      .values({
        farmId: farm.id,
        productId: product.id,
        customerName,
        phone,
        address,
        amount: product.price,
        status: "pending_payment",
      })
      .returning();
    await tx.insert(orderItems).values({
      orderId: created.id,
      productId: product.id,
      name: product.name,
      quantity: 1,
      price: product.price,
    });
    return created;
  });

  const token = orderAccessToken(order.id);
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) redirect(`/farms/${safeSlug}/shop?pending=${order.id}&t=${encodeURIComponent(token)}`);

  try {
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(Number(product.price) * 100),
        currency: "INR",
        receipt: order.id,
      }),
    });
    if (!response.ok) redirect(`/farms/${safeSlug}/shop?payError=${order.id}&t=${encodeURIComponent(token)}`);
    const payload = (await response.json()) as { id?: string };
    if (!payload.id) redirect(`/farms/${safeSlug}/shop?payError=${order.id}&t=${encodeURIComponent(token)}`);
    await db.update(orders).set({ razorpayOrderId: payload.id }).where(and(eq(orders.id, order.id), eq(orders.farmId, farm.id)));
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("Razorpay order creation failed:", error);
    redirect(`/farms/${safeSlug}/shop?payError=${order.id}&t=${encodeURIComponent(token)}`);
  }

  redirect(`/farms/${safeSlug}/shop/pay?order=${order.id}&t=${encodeURIComponent(token)}`);
}

export async function verifyPayment(formData: FormData) {
  const orderId = String(formData.get("razorpay_order_id") ?? "");
  const paymentId = String(formData.get("razorpay_payment_id") ?? "");
  const signature = String(formData.get("razorpay_signature") ?? "");
  const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  const [order] = orderId ? await db.select().from(orders).where(eq(orders.razorpayOrderId, orderId)).limit(1) : [];
  const [farm] = order ? await db.select().from(farms).where(eq(farms.id, order.farmId)).limit(1) : [];
  const shop = farm ? `/farms/${encodeURIComponent(farm.slug)}/shop` : "/";
  if (!secret || !order || left.length !== right.length || !timingSafeEqual(left, right)) {
    redirect(`${shop}?error=pay`);
  }
  await markOrderPaid(orderId, paymentId || undefined);
  const token = orderAccessToken(order.id);
  redirect(`/farms/${encodeURIComponent(farm.slug)}/orders/${order.id}?t=${encodeURIComponent(token)}&paid=1`);
}
