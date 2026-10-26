"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground print:hidden"
    >
      Print label
    </button>
  );
}
