import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-16">
      <section className="w-full space-y-4 rounded-2xl border border-border bg-card p-6 shadow-xs">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm text-muted-foreground">The farm record or page you asked for does not exist or is no longer published.</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link href="/dashboard" className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
            Open dashboard
          </Link>
          <Link href="/" className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-medium">
            Home
          </Link>
        </div>
      </section>
    </main>
  );
}
