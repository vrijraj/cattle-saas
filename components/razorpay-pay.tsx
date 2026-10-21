"use client";

import Script from "next/script";
import { useState } from "react";
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

  function openCheckout() {
    const Razorpay = (window as Window & { Razorpay?: RazorpayCheckout }).Razorpay;
    if (!Razorpay) return;
    setPaying(true);
    const checkout = new Razorpay({
      key: keyId,
      amount,
      currency: "INR",
      name: farmName,
      description,
      order_id: orderId,
      prefill: { name: customerName, contact: phone },
      handler: (response) => {
        const data = new FormData();
        data.set("razorpay_order_id", response.razorpay_order_id);
        data.set("razorpay_payment_id", response.razorpay_payment_id);
        data.set("razorpay_signature", response.razorpay_signature);
        void verifyPayment(data);
      },
    });
    checkout.open();
    setPaying(false);
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" onLoad={() => setReady(true)} />
      <button
        type="button"
        disabled={!ready || paying}
        onClick={openCheckout}
        className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {ready ? `Pay ₹${(amount / 100).toLocaleString("en-IN")}` : "Loading checkout"}
      </button>
    </>
  );
}
