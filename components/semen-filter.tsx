"use client";

import type { ReactNode } from "react";
import { Submit } from "@/components/workspace";

export function SemenFilter({ clear, children }: { clear: boolean; children: ReactNode }) {
  return (
    <form
      action="/semen"
      method="get"
      className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(event) => {
        const form = event.currentTarget;
        const tab = new URLSearchParams(window.location.search).get("tab");
        const existing = form.querySelector<HTMLInputElement>('input[name="tab"]');
        if (tab && tab !== "batches") {
          const input = existing ?? document.createElement("input");
          input.type = "hidden";
          input.name = "tab";
          input.value = tab;
          if (!existing) form.append(input);
        } else {
          existing?.remove();
        }
      }}
    >
      {children}
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
        <Submit>Filter</Submit>
        {clear ? (
          <button
            type="button"
            className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-medium"
            onClick={() => {
              const params = new URLSearchParams(window.location.search);
              for (const key of ["q", "type", "tank", "stock"]) params.delete(key);
              const value = params.toString();
              window.location.assign(value ? `/semen?${value}` : "/semen");
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
    </form>
  );
}
