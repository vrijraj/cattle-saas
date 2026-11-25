"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, type ForgotState } from "./actions";

const initial: ForgotState = { done: false };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (state.done) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-900">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-700" />
          <div>
            <p className="font-medium">Check your inbox</p>
            <p className="mt-1 text-xs text-emerald-800/80">
              If an active account exists for that email, we sent a password reset link that expires in 1 hour.
            </p>
          </div>
        </div>
        {state.devLink ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-950">
            <p className="font-semibold">Development preview (email not configured)</p>
            <Link href={state.devLink} className="mt-1 block break-all font-mono underline">
              {state.devLink}
            </Link>
          </div>
        ) : null}
        <Link href="/signin" className="inline-flex text-sm font-medium text-primary hover:underline">
          ← Return to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error ? (
        <p role="alert" className="flex gap-2 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="email">Account email</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="email" name="email" type="email" required autoFocus placeholder="you@farm.test" className="h-11 bg-card pl-10" />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="h-11 w-full rounded-xl text-sm">
        {pending ? "Sending reset link…" : "Send reset link"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Remembered it?{" "}
        <Link href="/signin" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
