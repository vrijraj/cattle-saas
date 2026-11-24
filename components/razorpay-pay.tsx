"use client";

import Script from "next/script";
import { useState, useTransition } from "react";
import { verifyPayment } from "@/app/farms/actions";

type RazorpaySuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayCheckout = new (options: {
  key: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; contact: string };
  modal?: { ondismiss?: () => void };
  handler: (response: RazorpaySuccess) => void;
}) => { open: () => void };

export function RazorpayPay({
  keyId,
  orderId,
  amount,
  farmName,
  description,
  customerName,
  phone,
}: {
  keyId: string;
  orderId: string;
  amount: number;
  farmName: string;
  description: string;
  customerName: string;
  phone: string;
}) {
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [verifying, startTransition] = useTransition();

  function openCheckout() {
    const Razorpay = (window as Window & { Razorpay?: RazorpayCheckout }).Razorpay;
    if (!Razorpay) {
      setError("Payment checkout could not load. Refresh and try again.");
      return;
    }
    setError("");
    setPaying(true);
    const checkout = new Razorpay({
      key: keyId,
      amount,
      currency: "INR",
      name: farmName,
      description,
      order_id: orderId,
      prefill: { name: customerName, contact: phone },
      modal: {
        ondismiss: () => setPaying(false),
      },
      handler: (response) => {
        const data = new FormData();
        data.set("razorpay_order_id", response.razorpay_order_id);
        data.set("razorpay_payment_id", response.razorpay_payment_id);
        data.set("razorpay_signature", response.razorpay_signature);
        startTransition(async () => {
          try {
            await verifyPayment(data);
          } catch (err) {
            if (err && typeof err === "object" && "digest" in err && String((err as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) {
              throw err;
            }
            setError("Payment verification failed. Contact the farm if money was debited.");
            setPaying(false);
          }
        });
      },
    });
    checkout.open();
  }

  return (
    <div className="space-y-2">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" onReady={() => setReady(true)} onError={() => setError("Could not reach Razorpay checkout.")} />
      {error ? (
        <p role="alert" className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={!ready || paying || verifying}
        onClick={openCheckout}
        className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {verifying
          ? "Verifying payment…"
          : paying
            ? "Waiting for payment…"
            : ready
              ? `Pay ₹${(amount / 100).toLocaleString("en-IN")}`
              : "Loading checkout…"}
      </button>
    </div>
  );
}
