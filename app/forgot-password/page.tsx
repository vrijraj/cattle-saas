import Link from "next/link";
import { Leaf } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f7f8f6] px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-7 shadow-xs">
        <Link href="/" className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Leaf className="size-4" />
          </span>
          <span>{siteConfig.name}</span>
        </Link>
        <h1 className="mt-5 text-2xl font-semibold">Reset your password</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Enter your farm account email and we will send a 1-hour reset link.</p>
        <div className="mt-6">
          <ForgotPasswordForm />
        </div>
      </div>
    </main>
  );
}
