"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerFarm, type SignupState } from "./actions";

const initial: SignupState = { error: "" };

export function SignupForm({ defaultPlan = "starter" }: { defaultPlan?: string }) {
  const [state, action, pending] = useActionState(registerFarm, initial);

  return (
    <form action={action} className="space-y-4">
      {state.error ? (
        <p role="alert" className="flex gap-2 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ownerName">Your full name</Label>
          <Input id="ownerName" name="ownerName" required minLength={2} maxLength={80} placeholder="e.g. Rajesh Patel" className="h-11 bg-card" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone / WhatsApp (optional)</Label>
          <Input id="phone" name="phone" type="tel" maxLength={24} placeholder="+91 98765 43210" className="h-11 bg-card" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" placeholder="owner@yourdairy.in" className="h-11 bg-card" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password (min 8 chars)</Label>
          <Input id="password" name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="h-11 bg-card" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="farmName">Dairy farm name</Label>
          <Input id="farmName" name="farmName" required minLength={2} maxLength={100} placeholder="e.g. Gokul Gir Dairy Farm" className="h-11 bg-card" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="animalPrefix">Tag prefix</Label>
          <Input id="animalPrefix" name="animalPrefix" required minLength={2} maxLength={6} defaultValue="GOK" placeholder="GOK" className="h-11 bg-card uppercase" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="plan">Plan</Label>
          <select
            id="plan"
            name="plan"
            defaultValue={defaultPlan === "pro" || defaultPlan === "enterprise" ? defaultPlan : "starter"}
            className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
          >
            <option value="starter">Starter Dairy (up to 50 animals)</option>
            <option value="pro">Commercial Pro (up to 250 animals)</option>
            <option value="enterprise">Enterprise Co-op (up to 5,000 animals)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="locale">Language</Label>
          <select id="locale" name="locale" defaultValue="en" className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm">
            <option value="en">English</option>
            <option value="hi">हिन्दी (Hindi)</option>
            <option value="gu">ગુજરાતી (Gujarati)</option>
            <option value="mr">मराठी (Marathi)</option>
          </select>
        </div>
      </div>

      <Button type="submit" disabled={pending} className="h-11 w-full rounded-xl text-sm">
        {pending ? "Creating your farm…" : "Create farm & open workspace"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link href="/signin" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
