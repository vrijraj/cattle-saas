import { CircleAlert, Droplets, Heart, Leaf, Mail, Wheat } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PasswordField, SignInSubmit } from "@/components/sign-in-controls";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "cn";

function safeNext(value: FormDataEntryValue | null) {
  const next = String(value ?? "");
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

async function authenticate(formData: FormData) {
  "use server";
  const redirectTo = safeNext(formData.get("callbackUrl"));
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const back = redirectTo === "/dashboard" ? "" : `&callbackUrl=${encodeURIComponent(redirectTo)}`;
      redirect(`/signin?error=1${back}`);
    }
    throw error;
  }
}

const highlights = [
  { icon: Droplets, title: "Milk on the day", text: "Sessions, yields, and animals still due." },
  { icon: Heart, title: "Breeding in view", text: "Heats, services, and expected calvings." },
  { icon: Wheat, title: "Feed and health", text: "The work that is due, next to the herd." },
];

function BrandMark({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <span
        className={cn(
          "grid size-10 place-items-center rounded-2xl",
          inverted ? "bg-white/15 text-white" : "bg-primary text-primary-foreground",
        )}
      >
        <Leaf className="size-5" />
      </span>
      <span className="min-w-0">
        <span className={cn("block truncate text-sm font-semibold leading-tight", inverted && "text-white")}>{siteConfig.name}</span>
        <span className={cn("block text-xs", inverted ? "text-white/70" : "text-muted-foreground")}>Farm portal</span>
      </span>
    </span>
  );
}

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string; email?: string }>;
}) {
  const { error, callbackUrl, email } = await searchParams;
  const next = callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/dashboard";
  const invalid = Boolean(error);

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
      <section className="relative hidden overflow-hidden bg-[#0f5c34] text-white lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-10">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-20 size-80 rounded-full bg-white/10" />
          <div className="absolute right-[-12%] -bottom-36 size-[28rem] rounded-full bg-[#157347]" />
          <div className="absolute bottom-28 left-16 size-36 rounded-full bg-white/5" />
        </div>
        <div className="relative">
          <BrandMark inverted />
        </div>
        <div className="relative max-w-md">
          <h2 className="font-display text-4xl leading-[1.12] tracking-tight xl:text-5xl">A healthier herd starts with one record.</h2>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/75">Cattle, milk, breeding, and the work that is due today.</p>
          <ul className="mt-10 space-y-4">
            {highlights.map((item) => (
              <li key={item.title} className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10">
                  <item.icon className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="mt-0.5 block text-sm text-white/70">{item.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex min-h-screen flex-col px-5 py-8 sm:px-8">
        <div className="lg:hidden">
          <BrandMark />
        </div>
        <div className="flex flex-1 items-center py-8">
          <form action={authenticate} className="sign-in-form mx-auto w-full max-w-[26rem] [&_:focus-visible]:ring-0 [&_input:focus-visible]:border-border">
            <p className="text-sm font-medium text-primary">Welcome back</p>
            <h1 className="mt-1 text-3xl">Sign in</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Use the email on your farm account.</p>
            <input type="hidden" name="callbackUrl" value={next} />
            <div className="mt-6 space-y-4">
              {invalid ? (
                <p role="alert" className="flex gap-2 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-sm text-danger">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  That email and password did not match.
                </p>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    autoFocus
                    defaultValue={email ?? ""}
                    aria-invalid={invalid || undefined}
                    placeholder="you@farm.test"
                    className="h-11 bg-card pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <PasswordField invalid={invalid} />
              </div>
              <SignInSubmit />
            </div>
            {process.env.NODE_ENV === "development" ? (
              <div className="mt-5 rounded-xl bg-muted px-3.5 py-3 text-sm text-muted-foreground">
                <p className="text-xs font-medium tracking-wide text-foreground">Sample farm</p>
                <p className="mt-1 font-medium text-foreground">asha@shreegir.test</p>
                <p>demo-farm-2026</p>
              </div>
            ) : null}
          </form>
        </div>
      </section>
    </main>
  );
}
