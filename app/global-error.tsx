"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-[#f3f4f6] font-sans text-[#14171a] antialiased">
        <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-16">
          <section className="w-full space-y-4 rounded-2xl border border-[#e2e6ea] bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#dc2626]">Application error</p>
            <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
            <p className="text-sm text-[#5c646d]">{error.message || "An unexpected error occurred."}</p>
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex h-10 items-center rounded-full bg-[#157347] px-5 text-sm font-medium text-white"
            >
              Reload
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
