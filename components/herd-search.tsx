"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Beef,
  CornerDownLeft,
  Dna,
  Droplets,
  FileBarChart,
  HeartPulse,
  LayoutDashboard,
  Lightbulb,
  Mail,
  Milk,
  ScanLine,
  ScrollText,
  Search,
  ShoppingBag,
  Sparkles,
  Sprout,
  Stethoscope,
  Users,
  Wallet,
  Warehouse,
  Wheat,
  type LucideIcon,
} from "lucide-react";

type Hit = {
  code: string;
  name: string | null;
  breedName: string | null;
  locationName: string | null;
};

type Kind = "page" | "animal";

type Item = {
  id: string;
  href: string;
  title: string;
  detail: string;
  section: string;
  icon: LucideIcon;
  kind: Kind;
};

const RECENT_KEY = "farm-search-recent";

const pages: { href: string; label: string; icon: LucideIcon; gate?: "team" | "audit" }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ai", label: "Assistant", icon: Sparkles },
  { href: "/animals", label: "Cattle", icon: Beef },
  { href: "/locations", label: "Sheds", icon: Warehouse },
  { href: "/breeding", label: "Breeding", icon: HeartPulse },
  { href: "/health", label: "Health", icon: Stethoscope },
  { href: "/milk", label: "Milk", icon: Milk },
  { href: "/feed", label: "Feed & nutrition", icon: Wheat },
  { href: "/semen", label: "Semen", icon: Droplets },
  { href: "/genetics", label: "Genetics", icon: Dna },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/embryos", label: "Embryos", icon: Sprout },
  { href: "/finance", label: "Finance", icon: Wallet },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/scan", label: "Scan", icon: ScanLine },
  { href: "/shop", label: "Shop", icon: ShoppingBag },
  { href: "/enquiries", label: "Enquiries", icon: Mail },
  { href: "/audit", label: "Audit", icon: ScrollText, gate: "audit" },
  { href: "/team", label: "Team", icon: Users, gate: "team" },
];

function pageIcon(href: string) {
  return pages.find((page) => page.href === href)?.icon ?? LayoutDashboard;
}

function readRecent(): Item[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const row = entry as { href?: unknown; title?: unknown; detail?: unknown; kind?: unknown };
      if (typeof row.href !== "string" || typeof row.title !== "string" || typeof row.detail !== "string") return [];
      const kind: Kind = row.kind === "animal" ? "animal" : "page";
      return [{ id: `recent:${row.href}`, href: row.href, title: row.title, detail: row.detail, section: "Recent", icon: kind === "animal" ? Beef : pageIcon(row.href), kind }];
    }).slice(0, 6);
  } catch {
    return [];
  }
}

function remember(item: Item) {
  const stored = readRecent()
    .filter((entry) => entry.href !== item.href)
    .map((entry) => ({ href: entry.href, title: entry.title, detail: entry.detail, kind: entry.kind }));
  localStorage.setItem(RECENT_KEY, JSON.stringify([{ href: item.href, title: item.title, detail: item.detail, kind: item.kind }, ...stored].slice(0, 6)));
}

export function HerdSearch({
  variant = "header",
  showTeam = false,
  showAudit = false,
}: {
  variant?: "header" | "field";
  showTeam?: boolean;
  showAudit?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [recent, setRecent] = useState<Item[]>([]);
  const [active, setActive] = useState(0);

  const term = value.trim();
  const query = term.toLowerCase();
  const visiblePages = pages.filter((page) => (page.gate === "team" ? showTeam : page.gate === "audit" ? showAudit : true));
  const pageItems: Item[] = visiblePages
    .filter((page) => !query || page.label.toLowerCase().includes(query))
    .map((page) => ({ id: page.href, href: page.href, title: page.label, detail: "Page", section: "Pages", icon: page.icon, kind: "page" }));
  const cattleItems: Item[] = results.map((animal) => ({
    id: animal.code,
    href: `/animals/${animal.code}`,
    title: animal.name ?? "Unnamed",
    detail: [animal.code, animal.breedName, animal.locationName ?? "Unassigned"].filter(Boolean).join(" · "),
    section: "Cattle",
    icon: Beef,
    kind: "animal" as const,
  }));
  const items: Item[] = term ? [...pageItems, ...cattleItems] : recent.length > 0 ? recent : pageItems.slice(0, 7);
  const listKey = items.map((item) => item.id).join("|");

  useEffect(() => {
    setActive(0);
  }, [listKey]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ block: "nearest" });
  }, [active, listKey]);

  useEffect(() => {
    if (!term) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState("loading");
      try {
        const response = await fetch(`/api/herd-search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("search failed");
        const body = (await response.json()) as { results?: Hit[] };
        setResults(body.results ?? []);
        setState("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState("error");
      }
    }, 160);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [term]);

  const openRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (variant !== "header") return;
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant]);

  function open() {
    setValue("");
    setResults([]);
    setState("idle");
    setActive(0);
    setRecent(readRecent());
    dialogRef.current?.showModal();
    inputRef.current?.focus();
  }

  openRef.current = open;

  function close() {
    dialogRef.current?.close();
  }

  function choose(item: Item) {
    remember(item);
    close();
    router.push(item.href);
  }

  function onKeyDown(event: ReactKeyboardEvent) {
    if (!items.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => Math.min(items.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter" && items[active]) {
      event.preventDefault();
      choose(items[active]);
    }
  }

  let section = "";

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={
          variant === "header"
            ? "flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-muted px-3 text-left text-sm text-muted-foreground sm:h-11 sm:px-4 md:mx-auto md:max-w-xl"
            : "flex h-10 items-center gap-2 rounded-full bg-muted px-3 text-left text-sm text-muted-foreground lg:w-80"
        }
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Search</span>
        {variant === "header" ? <kbd className="ml-auto hidden rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium sm:inline">Ctrl K</kbd> : null}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="mx-auto mt-[10vh] mb-auto w-[min(36rem,calc(100%-1.5rem))] overflow-hidden rounded-xl border border-white/10 bg-[#1c2430] p-0 text-white shadow-2xl backdrop:bg-[#1c2430]/70"
      >
        <h2 id={titleId} className="sr-only">
          Search
        </h2>
        <label className="flex h-12 items-center gap-2 border-b border-white/10 px-3">
          <Search className="size-4 shrink-0 text-white/55" />
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => {
              const next = event.target.value;
              setValue(next);
              if (!next.trim()) {
                setResults([]);
                setState("idle");
              }
            }}
            placeholder="Search cattle, pages, or codes"
            className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-white/40"
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={items[active] ? `search-item-${items[active].id}` : undefined}
          />
          <kbd className="rounded-md border border-white/15 px-1.5 py-0.5 text-[10px] text-white/70">Esc</kbd>
        </label>
        <div id="search-results" ref={listRef} role="listbox" className="max-h-[min(22rem,50vh)] overflow-y-auto p-2">
          {term && state === "loading" && items.length === 0 ? <p className="px-2 py-8 text-center text-sm text-white/55">Searching…</p> : null}
          {term && state === "error" ? <p className="px-2 py-8 text-center text-sm text-[#fdba74]">Search is unavailable. Try again.</p> : null}
          {term && state !== "loading" && state !== "error" && items.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-white/55">No results for “{term}”.</p>
          ) : null}
          {items.map((item, index) => {
            const showSection = item.section !== section;
            section = item.section;
            const selected = index === active;
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {showSection ? <p className="px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide text-white/45">{item.section.toUpperCase()}</p> : null}
                <button
                  id={`search-item-${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-active={selected ? "true" : "false"}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(item)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left ${selected ? "bg-primary text-white" : "text-white/90"}`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className={`block truncate text-xs ${selected ? "text-white/75" : "text-white/45"}`}>{item.detail}</span>
                  </span>
                  {selected ? <CornerDownLeft className="size-3.5 shrink-0 text-white/80" /> : null}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 px-3 py-2 text-[11px] text-white/55">
          <span className="inline-flex items-center gap-1">
            <Key>↑</Key>
            <Key>↓</Key>
            Navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <Key>↵</Key>
            Open
          </span>
          <span className="inline-flex items-center gap-1">
            <Key>Esc</Key>
            Close
          </span>
        </div>
      </dialog>
    </>
  );
}

function Key({ children }: { children: string }) {
  return <kbd className="rounded border border-white/15 px-1 py-0.5 font-sans text-[10px] text-white/70">{children}</kbd>;
}
