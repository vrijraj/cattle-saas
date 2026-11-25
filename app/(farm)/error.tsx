"use client";

import Link from "next/link";

export default function FarmError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="mx-auto my-10 max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6 shadow-xs">
      <p className="text-xs font-semibold uppercase tracking-wider text-danger">Workspace error</p>
      <h1 className="text-xl font-semibold tracking-tight">This section hit an unexpected error</h1>
      <p className="text-sm text-muted-foreground">{error.message || "Please try again or return to the dashboard."}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Retry
        </button>
        <Link href="/dashboard" className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm font-medium">
          Overview
        </Link>
      </div>
    </section>
  );
}
