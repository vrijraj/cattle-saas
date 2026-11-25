"use client";

import Link from "next/link";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-16">
      <section className="w-full space-y-4 rounded-2xl border border-border bg-card p-6 shadow-xs">
        <p className="text-xs font-semibold uppercase tracking-wider text-danger">Something went wrong</p>
        <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t load this page</h1>
        <p className="text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred while processing your request."}
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <Link href="/dashboard" className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-medium">
            Back to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
