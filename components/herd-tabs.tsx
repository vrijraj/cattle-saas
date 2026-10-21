"use client";

import { useState, useTransition, type ReactNode } from "react";
import { PageLoader } from "@/components/page-loader";

const tabs = [
  { id: "herd", label: "Herd" },
  { id: "tree", label: "Family tree" },
] as const;

type HerdTab = (typeof tabs)[number]["id"];

export function HerdTabs({ initialTab, herd, tree }: { initialTab: string; herd: ReactNode; tree: ReactNode }) {
  const [tab, setTab] = useState<HerdTab>(initialTab === "tree" ? "tree" : "herd");
  const [pending, startTransition] = useTransition();

  function select(next: HerdTab) {
    if (next === tab) return;
    const params = new URLSearchParams(window.location.search);
    if (next === "herd") params.delete("tab");
    else params.set("tab", next);
    const value = params.toString();
    const href = value ? `${window.location.pathname}?${value}` : window.location.pathname;
    // Update the address bar without a Next.js navigation, so the cattle page stays mounted.
    History.prototype.replaceState.call(window.history, window.history.state, "", href);
    startTransition(() => setTab(next));
  }

  return (
    <>
      <nav className="flex gap-1 overflow-x-auto rounded-2xl bg-muted p-1">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => select(item.id)}
              className={`inline-flex h-9 shrink-0 items-center rounded-xl px-3 text-sm font-medium ${
                active ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
      {pending ? <PageLoader /> : tab === "tree" ? tree : herd}
    </>
  );
}
