"use client";

import { inputClass, Submit } from "@/components/workspace";

export function EmbryoSearch({ query }: { query: string }) {
  return (
    <form
      action="/embryos"
      method="get"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4"
      onSubmit={(event) => {
        const form = event.currentTarget;
        const tab = new URLSearchParams(window.location.search).get("tab");
        const existing = form.querySelector<HTMLInputElement>('input[name="tab"]');
        if (tab && tab !== "collections") {
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
      <input name="q" defaultValue={query} placeholder="Code, donor, sire, grade, location" className={`${inputClass} min-w-0 flex-1`} />
      <Submit>Search</Submit>
      {query ? (
        <button
          type="button"
          className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-medium"
          onClick={() => {
            const params = new URLSearchParams(window.location.search);
            params.delete("q");
            const value = params.toString();
            window.location.assign(value ? `/embryos?${value}` : "/embryos");
          }}
        >
          Clear
        </button>
      ) : null}
    </form>
  );
}
