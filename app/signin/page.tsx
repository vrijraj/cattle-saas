import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string; email?: string }>;
}) {
  const { error, callbackUrl, email } = await searchParams;
  const next = callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/dashboard";
  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <section className="flex flex-col justify-between bg-[#e7f6ee] px-8 py-10">
        <p className="text-sm font-semibold text-primary">Farm portal</p>
        <div>
          <h2 className="max-w-sm text-4xl font-semibold tracking-tight">A healthier herd starts with one record.</h2>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            Cattle, milk, breeding, and the work that is due today.
          </p>
        </div>
      </section>
      <section className="flex items-center px-6 py-12">
        <form action={authenticate} className="mx-auto w-full max-w-sm space-y-4">
          <h1 className="font-display text-3xl">Sign in</h1>
          <input type="hidden" name="callbackUrl" value={next} />
          {error ? (
            <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              That email and password did not match.
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required defaultValue={email ?? ""} className="h-12 bg-card" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-12 bg-card" />
          </div>
          <Button type="submit" className="h-12 w-full rounded-full">
            Sign in
          </Button>
          {process.env.NODE_ENV === "development" ? (
            <p className="text-sm text-muted-foreground">
              Sample farm: asha@shreegir.test / demo-farm-2026
            </p>
          ) : null}
        </form>
      </section>
    </main>
  );
}
