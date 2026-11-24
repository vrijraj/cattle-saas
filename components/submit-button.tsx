"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className={`inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-xs transition hover:bg-[#0f5c34] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      type="submit"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
