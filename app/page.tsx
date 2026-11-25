import Link from "next/link";
import { ArrowRight, Check, Dna, Droplets, HeartPulse, Leaf, QrCode, ShieldCheck, ShoppingBag, Sparkles, Stethoscope, Wheat } from "lucide-react";
import { auth } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { siteConfig } from "@/lib/site-config";

const features = [
  {
    icon: Droplets,
    title: "Milk sheet, Fat/SNF & pricing",
    body: "Fast mobile milking entry with yesterday hints, effective-dated procurement rates, fat/SNF bonuses, and automatic drop alerts.",
  },
  {
    icon: HeartPulse,
    title: "Breeding, AI & semen inventory",
    body: "Track heats, inseminations, PD checks, calvings, LN2 tank straws, and 5-generation pedigree inbreeding warnings.",
  },
  {
    icon: Stethoscope,
    title: "Veterinary pharmacy & protocols",
    body: "Built-in Indian vaccination schedules (FMD, HS, BQ, Brucellosis), milk withdrawal locks, and medicine stock expiry alerts.",
  },
  {
    icon: Wheat,
    title: "Ration groups & feed cost / litre",
    body: "Define milking & dry TMR rations, post daily consumption in one click, and monitor real feed cost per litre produced.",
  },
  {
    icon: QrCode,
    title: "QR ear-tag sheets & offline shed entry",
    body: "Print shed QR labels, scan from any phone, and queue shed readings offline even when barn connectivity drops.",
  },
  {
    icon: ShoppingBag,
    title: "Public catalogue, GST invoices & WhatsApp",
    body: "Publish elite cattle and farm dairy products online with Razorpay checkout, GST PDF invoices, and WhatsApp buyer enquiries.",
  },
];

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-[#f7f8f6] text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[#0f5c34] text-white">
              <Leaf className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold leading-tight tracking-tight">{siteConfig.name}</span>
              <span className="block text-[11px] text-muted-foreground">Dairy &amp; Breeding OS</span>
            </span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/farms/shree-gir"
              className="hidden rounded-full px-3.5 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground sm:inline-flex"
            >
              Live demo farm
            </Link>
            {session?.user ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0f5c34] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0d4d2c]"
              >
                Open farm workspace
                <ArrowRight className="size-3.5" />
              </Link>
            ) : (
              <>
                <Link
                  href="/signin"
                  className="rounded-full border border-border bg-white px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#0f5c34] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0d4d2c]"
                >
                  Start free farm
                  <ArrowRight className="size-3.5" />
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#0f5c34] text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-28 -left-24 size-96 rounded-full bg-white/10" />
          <div className="absolute right-[-10%] -bottom-36 size-[30rem] rounded-full bg-[#157347]" />
        </div>
        <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
              <Sparkles className="size-3.5 text-emerald-300" />
              Built for Indian dairy farms, Gir &amp; Sahiwal breeders, and commercial gaushalas
            </p>
            <h1 className="mt-5 font-display text-4xl leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Every cow, milk drop, straw, and rupee in one clear record.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/80">
              Replace scattered registers and WhatsApp notes with a multi-role farm operating system — complete with pedigree genetics, automated alerts,
              Hindi/Gujarati/Marathi support, and an AI herd assistant.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={session?.user ? "/dashboard" : "/signup"}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#0f5c34] shadow-sm transition hover:bg-emerald-50"
              >
                {session?.user ? "Go to dashboard" : "Create your farm account"}
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/farms/shree-gir"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 text-sm font-medium text-white transition hover:bg-white/20"
              >
                Browse Shree Gir Demo Catalogue
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/75">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-emerald-300" />
                Role-based staff access &amp; audit trail
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Dna className="size-4 text-emerald-300" />
                31 Indian cattle &amp; buffalo breeds preloaded
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Complete farm operations</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Everything from the milking parlour to the storefront</h2>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="rounded-2xl border border-border bg-white p-6 shadow-2xs">
                <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/12 text-emerald-800">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-t border-border/70 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Transparent SaaS plans</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Start small, scale across sheds</h2>
          </div>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {Object.values(PLANS).map((plan) => (
              <div
                key={plan.id}
                className={`flex flex-col rounded-2xl border p-6 ${
                  plan.id === "pro" ? "border-emerald-600 bg-emerald-50/40 shadow-sm" : "border-border bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  {plan.id === "pro" ? (
                    <span className="rounded-full bg-[#0f5c34] px-2.5 py-0.5 text-[11px] font-semibold text-white">Popular</span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{plan.tagline}</p>
                <p className="mt-5 text-3xl font-bold tabular-nums">
                  ₹{plan.priceInrMonthly.toLocaleString("en-IN")}
                  <span className="text-sm font-normal text-muted-foreground"> / month</span>
                </p>
                <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                  {plan.highlights.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={session?.user ? "/settings" : `/signup?plan=${plan.id}`}
                  className={`mt-6 inline-flex h-10 items-center justify-center rounded-xl text-sm font-semibold transition ${
                    plan.id === "pro"
                      ? "bg-[#0f5c34] text-white hover:bg-[#0d4d2c]"
                      : "border border-border bg-white text-foreground hover:bg-muted"
                  }`}
                >
                  {session?.user ? "Manage in Settings" : `Start with ${plan.name}`}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/70 bg-[#141518] text-zinc-400">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-xs sm:px-8">
          <span className="font-medium text-zinc-200">{siteConfig.name} · Dairy &amp; Breeding Management Platform</span>
          <div className="flex items-center gap-4">
            <Link href="/signin" className="hover:text-white">
              Sign in
            </Link>
            <Link href="/signup" className="hover:text-white">
              Create farm
            </Link>
            <Link href="/farms/shree-gir" className="hover:text-white">
              Demo farm
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
