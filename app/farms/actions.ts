"use server";

import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { enquiries, farms, orderItems, orders, products } from "@/db/schema";
import { readCart, writeCart } from "@/lib/cart";
import { sendMail } from "@/lib/mail";
import { markOrderPaid } from "@/lib/payments";

export async function sendEnquiry(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm) redirect("/");
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const animalCode = String(formData.get("animalCode") ?? "");
  if (!name || !phone || !message) redirect(`/farms/${slug}?error=1`);
  await db.insert(enquiries).values({ farmId: farm.id, animalCode, name, phone, message });
  await sendMail({
    to: process.env.ZEPTOMAIL_FROM || "asha@shreegir.test",
    subject: `Enquiry ${animalCode || "catalogue"}`,
    html: `<p>${name} (${phone})</p><p>${message}</p>`,
  });
  redirect(`/farms/${slug}?sent=1`);
}

export async function addToCart(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.published, "yes")))
    .limit(1);
  if (!farm || !product || product.farmId !== farm.id || product.stock < 1) redirect(`/farms/${slug}/shop?error=1`);
  const cart = await readCart();
  const lines = cart.slug === slug ? cart.lines : [];
  const existing = lines.find((line) => line.productId === productId);
  if (existing) existing.quantity += 1;
  else lines.push({ productId, quantity: 1 });
  await writeCart({ slug, lines });
  redirect(`/farms/${slug}/shop?added=1`);
}

export async function updateCart(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const quantity = Number(formData.get("quantity") ?? "0");
  const cart = await readCart();
  const lines = (cart.slug === slug ? cart.lines : []).flatMap((line) => {
    if (line.productId !== productId) return [line];
    if (!Number.isFinite(quantity) || quantity < 1) return [];
    return [{ productId, quantity }];
  });
  await writeCart({ slug, lines });
  redirect(`/farms/${slug}/cart`);
}

export async function placeCart(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const customerName = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  const cart = await readCart();
  if (!farm || cart.slug !== slug || cart.lines.length === 0 || !customerName || !phone || !address) {
    redirect(`/farms/${slug}/cart?error=1`);
  }

  const catalogue = await db.select().from(products).where(and(eq(products.farmId, farm.id), eq(products.published, "yes")));
  const byId = new Map(catalogue.map((product) => [product.id, product]));
  const lines = cart.lines.flatMap((line) => {
    const product = byId.get(line.productId);
    if (!product || product.stock < line.quantity) return [];
    return [{ product, quantity: line.quantity }];
  });
  if (lines.length !== cart.lines.length) redirect(`/farms/${slug}/cart?error=stock`);

  const amount = lines.reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0);
  const [order] = await db
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
  await db.insert(orderItems).values(
    lines.map((line) => ({
      orderId: order.id,
      productId: line.product.id,
      name: line.product.name,
      quantity: line.quantity,
      price: line.product.price,
    })),
  );
  await writeCart({ slug, lines: [] });

  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) redirect(`/farms/${slug}/shop?pending=${order.id}`);
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
  if (!response.ok) redirect(`/farms/${slug}/shop?pending=${order.id}`);
  const payload = (await response.json()) as { id?: string };
  if (!payload.id) redirect(`/farms/${slug}/shop?pending=${order.id}`);
  await db.update(orders).set({ razorpayOrderId: payload.id }).where(eq(orders.id, order.id));
  redirect(`/farms/${slug}/shop/pay?order=${order.id}`);
}

export async function placeOrder(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.published, "yes")))
    .limit(1);
  const customerName = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  if (!farm || !product || product.farmId !== farm.id || product.stock < 1 || !customerName || !phone || !address) {
    redirect(`/farms/${slug}/shop?error=1`);
  }
  const [order] = await db
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

  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) redirect(`/farms/${slug}/shop?pending=${order.id}`);

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
  if (!response.ok) redirect(`/farms/${slug}/shop?pending=${order.id}`);
  const payload = (await response.json()) as { id?: string };
  if (!payload.id) redirect(`/farms/${slug}/shop?pending=${order.id}`);
  await db.update(orders).set({ razorpayOrderId: payload.id }).where(eq(orders.id, order.id));
  redirect(`/farms/${slug}/shop/pay?order=${order.id}`);
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
  const shop = farm ? `/farms/${farm.slug}/shop` : "/";
  if (!secret || !order || left.length !== right.length || !timingSafeEqual(left, right)) {
    redirect(`${shop}?error=pay`);
  }
  await markOrderPaid(orderId);
  redirect(`${shop}?paid=1`);
}
