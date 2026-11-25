import Link from "next/link";
import { Check, Leaf } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { siteConfig } from "@/lib/site-config";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Create your farm" };

const included = [
  "31 Indian cattle & buffalo breeds with gestation days preloaded",
  "Starter milking, dry/heifer, calf, and quarantine sheds",
  "Indian FMD, HS, BQ, Brucellosis & Deworming vaccination schedule",
  "Public farm catalogue URL, QR ear tags, and AI herd assistant",
];

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const { plan } = await searchParams;

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(24rem,1.05fr)]">
      <section className="relative hidden overflow-hidden bg-[#0f5c34] text-white lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-10">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-20 size-80 rounded-full bg-white/10" />
          <div className="absolute right-[-12%] -bottom-36 size-[28rem] rounded-full bg-[#157347]" />
        </div>
        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-white/15 text-white">
              <Leaf className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">{siteConfig.name}</span>
              <span className="block text-xs text-white/70">Dairy &amp; Breeding OS</span>
            </span>
          </Link>
        </div>
        <div className="relative max-w-md">
          <h2 className="font-display text-4xl leading-[1.12] tracking-tight">Launch your farm workspace in 60 seconds.</h2>
          <p className="mt-4 text-sm leading-6 text-white/75">Everything pre-configured for Indian dairy herds so you can start logging milk and cattle right away.</p>
          <ul className="mt-8 space-y-3 text-sm text-white/85">
            {included.map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">Multi-tenant isolation · Full audit trail · Zero lock-in</p>
      </section>

      <section className="flex min-h-screen flex-col px-5 py-8 sm:px-8">
        <div className="flex items-center justify-between lg:hidden">
          <Link href="/" className="inline-flex items-center gap-2.5 font-semibold">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Leaf className="size-4" />
            </span>
            <span>{siteConfig.name}</span>
          </Link>
          <Link href="/signin" className="text-xs font-medium text-primary hover:underline">
            Sign in
          </Link>
        </div>
        <div className="flex flex-1 items-center py-8">
          <div className="mx-auto w-full max-w-lg">
            <p className="text-sm font-medium text-primary">New farm workspace</p>
            <h1 className="mt-1 text-3xl">Create your farm</h1>
            <p className="mt-2 text-sm text-muted-foreground">Set up your owner login, animal code prefix, and plan.</p>
            <div className="mt-6">
              <SignupForm defaultPlan={plan} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
