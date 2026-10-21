"use client";

import { useState, useTransition, type ReactNode } from "react";
import { PageLoader } from "@/components/page-loader";

export function PanelTabs({
  tabs,
  initialTab,
  panels,
}: {
  tabs: { id: string; label: string; count?: number }[];
  initialTab: string;
  panels: Record<string, ReactNode>;
}) {
  const first = tabs[0]?.id ?? "";
  const [tab, setTab] = useState(tabs.some((item) => item.id === initialTab) ? initialTab : first);
  const [pending, startTransition] = useTransition();

  function select(next: string) {
    if (next === tab) return;
    const params = new URLSearchParams(window.location.search);
    if (next === first) params.delete("tab");
    else params.set("tab", next);
    const value = params.toString();
    const href = value ? `${window.location.pathname}?${value}` : window.location.pathname;
    // Update the address bar without a Next.js navigation, so the page stays mounted.
    History.prototype.replaceState.call(window.history, window.history.state, "", href);
    startTransition(() => setTab(next));
  }

  return (
    <div className="space-y-4">
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
              {item.count !== undefined ? <span className={`ml-1.5 text-xs ${active ? "text-muted-foreground" : ""}`}>{item.count}</span> : null}
            </button>
          );
        })}
      </nav>
      {pending ? <PageLoader /> : panels[tab]}
    </div>
  );
}
