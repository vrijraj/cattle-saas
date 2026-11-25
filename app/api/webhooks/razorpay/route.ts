import { createHmac, timingSafeEqual } from "node:crypto";
import { markOrderPaid } from "@/lib/payments";
import { applySubscriptionWebhookEvent, type RazorpaySubscriptionEntity } from "@/lib/subscriptions";

export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const body = await request.text();
  if (!secret || !signature) return new Response("Unauthorized", { status: 401 });

  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let event: {
    event?: string;
    payload?: {
      payment?: { entity?: { id?: string; order_id?: string; amount?: number } };
      order?: { entity?: { id?: string; amount?: number } };
      subscription?: { entity?: RazorpaySubscriptionEntity };
    };
  };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const eventName = event.event ?? "";

  if (eventName.startsWith("subscription.")) {
    await applySubscriptionWebhookEvent(eventName, event.payload?.subscription?.entity);
    return new Response("ok");
  }

  if (eventName !== "payment.captured" && eventName !== "order.paid") {
    return new Response("ok");
  }

  const razorpayOrderId = event.payload?.payment?.entity?.order_id ?? event.payload?.order?.entity?.id;
  const razorpayPaymentId = event.payload?.payment?.entity?.id;
  const paidAmountPaise = event.payload?.payment?.entity?.amount ?? event.payload?.order?.entity?.amount;
  if (!razorpayOrderId) return new Response("ok");
  await markOrderPaid(razorpayOrderId, razorpayPaymentId, typeof paidAmountPaise === "number" ? paidAmountPaise : undefined);
  return new Response("ok");
}
