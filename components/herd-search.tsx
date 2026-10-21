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

type Kind = "page" | "animal" | "straw" | "bull" | "alert" | "product" | "enquiry";

type Item = {
  id: string;
  href: string;
  title: string;
  detail: string;
  section: string;
  icon: LucideIcon;
  kind: Kind;
};

type SearchBody = {
  cattle: { code: string; name: string | null; breedName: string | null; locationName: string | null; earTag: string | null; match: string }[];
  cattleCount: number;
  straws: { code: string; bullName: string; status: string }[];
  strawCount: number;
  bulls: { code: string; name: string; breed: string | null }[];
  bullCount: number;
  alerts: { id: string; title: string; detail: string }[];
  alertCount: number;
  products: { id: string; name: string; category: string }[];
  productCount: number;
  enquiries: { id: string; name: string; about: string }[];
  enquiryCount: number;
};

const emptyBody: SearchBody = {
  cattle: [],
  cattleCount: 0,
  straws: [],
  strawCount: 0,
  bulls: [],
  bullCount: 0,
  alerts: [],
  alertCount: 0,
  products: [],
  productCount: 0,
  enquiries: [],
  enquiryCount: 0,
};

const pages: { href: string; label: string; icon: LucideIcon; gate?: "team" | "audit" | "finance" | "reports" | "genetics" | "health" | "semen" }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ai", label: "Assistant", icon: Sparkles },
  { href: "/animals", label: "Cattle", icon: Beef },
  { href: "/locations", label: "Sheds", icon: Warehouse },
  { href: "/breeding", label: "Breeding", icon: HeartPulse },
  { href: "/health", label: "Health", icon: Stethoscope, gate: "health" },
  { href: "/milk", label: "Milk", icon: Milk },
  { href: "/feed", label: "Feed & nutrition", icon: Wheat },
  { href: "/semen", label: "Semen", icon: Droplets, gate: "semen" },
  { href: "/genetics", label: "Genetics", icon: Dna, gate: "genetics" },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/embryos", label: "Embryos", icon: Sprout, gate: "genetics" },
  { href: "/finance", label: "Finance", icon: Wallet, gate: "finance" },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/reports", label: "Reports", icon: FileBarChart, gate: "reports" },
  { href: "/scan", label: "Scan", icon: ScanLine },
  { href: "/shop", label: "Shop", icon: ShoppingBag },
  { href: "/enquiries", label: "Enquiries", icon: Mail },
  { href: "/audit", label: "Audit", icon: ScrollText, gate: "audit" },
  { href: "/team", label: "Team", icon: Users, gate: "team" },
];

const kindIcon: Record<Kind, LucideIcon> = {
  page: LayoutDashboard,
  animal: Beef,
  straw: Droplets,
  bull: Dna,
  alert: Bell,
  product: ShoppingBag,
  enquiry: Mail,
};

function recentKey(farmId: string) {
  return `farm-search-recent:${farmId}`;
}

function pageIcon(href: string) {
  const path = href.split("?")[0] ?? href;
  return pages.find((page) => page.href === path)?.icon ?? LayoutDashboard;
}

function blocked(href: string, gates: Record<"team" | "audit" | "finance" | "reports" | "genetics" | "health" | "semen", boolean>) {
  const path = href.split("?")[0] ?? href;
  const page = pages.find((item) => item.href === path);
  return page?.gate ? !gates[page.gate] : false;
}

function readRecent(farmId: string, gates: Record<"team" | "audit" | "finance" | "reports" | "genetics" | "health" | "semen", boolean>): Item[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentKey(farmId)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const row = entry as { href?: unknown; title?: unknown; detail?: unknown; kind?: unknown };
      if (typeof row.href !== "string" || typeof row.title !== "string" || typeof row.detail !== "string") return [];
      if (blocked(row.href, gates)) return [];
      const kind = (Object.keys(kindIcon) as Kind[]).includes(row.kind as Kind) ? (row.kind as Kind) : "page";
      const icon = kind === "page" ? pageIcon(row.href) : kindIcon[kind];
      return [{ id: `recent:${row.href}`, href: row.href, title: row.title, detail: row.detail, section: "Recent", icon, kind }];
    }).slice(0, 6);
  } catch {
    return [];
  }
}

function remember(farmId: string, item: Item) {
  const stored = readRecent(farmId, { team: true, audit: true, finance: true, reports: true, genetics: true, health: true, semen: true })
    .filter((entry) => entry.href !== item.href)
    .map((entry) => ({ href: entry.href, title: entry.title, detail: entry.detail, kind: entry.kind }));
  localStorage.setItem(
    recentKey(farmId),
    JSON.stringify([{ href: item.href, title: item.title, detail: item.detail, kind: item.kind }, ...stored].slice(0, 6)),
  );
}

function cattleDetail(animal: SearchBody["cattle"][number]) {
  if (animal.match === "Ear tag" && animal.earTag) return `Ear tag ${animal.earTag} · ${animal.code}`;
  if (animal.match === "Sire" || animal.match === "Sire code") return `Sire · ${animal.code}`;
  if (animal.match === "Breed" && animal.breedName) return `Breed ${animal.breedName} · ${animal.code}`;
  if (animal.match === "Shed") return `Shed ${animal.locationName ?? "Unassigned"} · ${animal.code}`;
  return [animal.code, animal.breedName, animal.locationName ?? "Unassigned"].filter(Boolean).join(" · ");
}

export function HerdSearch({
  variant = "header",
  farmId,
  showTeam = false,
  showAudit = false,
  showFinance = false,
  showReports = false,
  showGenetics = false,
  showHealth = false,
  showSemen = false,
}: {
  variant?: "header" | "field";
  farmId: string;
  showTeam?: boolean;
  showAudit?: boolean;
  showFinance?: boolean;
  showReports?: boolean;
  showGenetics?: boolean;
  showHealth?: boolean;
  showSemen?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const router = useRouter();
  const gates = { team: showTeam, audit: showAudit, finance: showFinance, reports: showReports, genetics: showGenetics, health: showHealth, semen: showSemen };
  const [value, setValue] = useState("");
  const [body, setBody] = useState<SearchBody>(emptyBody);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [recent, setRecent] = useState<Item[]>([]);
  const [active, setActive] = useState(0);

  const term = value.trim();
  const query = term.toLowerCase();
  const encoded = encodeURIComponent(term);
  const pageItems: Item[] = pages
    .filter((page) => !page.gate || gates[page.gate])
    .filter((page) => !query || page.label.toLowerCase().includes(query))
    .map((page) => ({ id: page.href, href: page.href, title: page.label, detail: "Page", section: "Pages", icon: page.icon, kind: "page" }));
  const recordItems: Item[] = term
    ? [
        ...body.cattle.map((animal) => ({
          id: `cattle:${animal.code}`,
          href: `/animals/${animal.code}`,
          title: animal.name ?? "Unnamed",
          detail: cattleDetail(animal),
          section: "Cattle",
          icon: Beef,
          kind: "animal" as const,
        })),
        ...(body.cattleCount > 0
          ? [
              {
                id: "cattle-all",
                href: `/animals?q=${encoded}`,
                title: body.cattleCount === 1 ? "1 animal in the herd" : `${body.cattleCount} animals in the herd`,
                detail: "Open the cattle register",
                section: "Cattle",
                icon: Beef,
                kind: "page" as const,
              },
            ]
          : []),
        ...(showSemen
          ? body.straws.map((straw) => ({
              id: `straw:${straw.code}`,
              href: `/scan?code=${encodeURIComponent(straw.code)}`,
              title: straw.code,
              detail: `${straw.bullName} · ${straw.status}`,
              section: "Straws",
              icon: Droplets,
              kind: "straw" as const,
            }))
          : []),
        ...(showSemen && body.strawCount > body.straws.length
          ? [
              {
                id: "straw-all",
                href: `/semen?q=${encoded}`,
                title: `${body.strawCount} straws`,
                detail: "Open the semen register",
                section: "Straws",
                icon: Droplets,
                kind: "page" as const,
              },
            ]
          : []),
        ...(showSemen
          ? body.bulls.map((bull) => ({
              id: `bull:${bull.code}`,
              href: `/semen?q=${encodeURIComponent(bull.code)}`,
              title: bull.name,
              detail: [bull.code, bull.breed].filter(Boolean).join(" · "),
              section: "Bulls",
              icon: Dna,
              kind: "bull" as const,
            }))
          : []),
        ...body.alerts.map((alert) => ({
          id: `alert:${alert.id}`,
          href: `/alerts?q=${encodeURIComponent(alert.title)}`,
          title: alert.title,
          detail: alert.detail,
          section: "Alerts",
          icon: Bell,
          kind: "alert" as const,
        })),
        ...(body.alertCount > body.alerts.length
          ? [
              {
                id: "alert-all",
                href: `/alerts?q=${encoded}`,
                title: `${body.alertCount} alerts`,
                detail: "Open alerts",
                section: "Alerts",
                icon: Bell,
                kind: "page" as const,
              },
            ]
          : []),
        ...body.products.map((product) => ({
          id: `product:${product.id}`,
          href: `/shop?q=${encodeURIComponent(product.name)}`,
          title: product.name,
          detail: product.category,
          section: "Products",
          icon: ShoppingBag,
          kind: "product" as const,
        })),
        ...body.enquiries.map((enquiry) => ({
          id: `enquiry:${enquiry.id}`,
          href: `/enquiries?q=${encodeURIComponent(enquiry.name)}`,
          title: enquiry.name,
          detail: enquiry.about,
          section: "Enquiries",
          icon: Mail,
          kind: "enquiry" as const,
        })),
      ]
    : [];
  const items: Item[] = term ? [...pageItems, ...recordItems] : recent.length > 0 ? recent : pageItems.slice(0, 7);

  useEffect(() => {
    setActive(0);
    setBody(emptyBody);
  }, [term]);

  useEffect(() => {
    setActive((current) => (items.length === 0 ? 0 : Math.min(current, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => {
    if (!term) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState("loading");
      try {
        const response = await fetch(`/api/herd-search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("search failed");
        setBody((await response.json()) as SearchBody);
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
    setBody(emptyBody);
    setState("idle");
    setActive(0);
    setRecent(readRecent(farmId, gates));
    dialogRef.current?.showModal();
    inputRef.current?.focus();
  }

  openRef.current = open;

  function close() {
    dialogRef.current?.close();
  }

  function choose(item: Item) {
    remember(farmId, item);
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
        className="mx-auto mt-[10vh] mb-auto w-[min(36rem,calc(100%-1.5rem))] overflow-hidden rounded-xl border border-white/10 bg-[#1c2430] p-0 text-white backdrop:bg-[#1c2430]/70"
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
                setBody(emptyBody);
                setState("idle");
              }
            }}
            placeholder="Search cattle, straws, alerts, or pages"
            className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-white/40"
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={`${titleId}-results`}
            aria-activedescendant={items[active] ? `search-item-${items[active].id}` : undefined}
          />
          <kbd className="rounded-md border border-white/15 px-1.5 py-0.5 text-[10px] text-white/70">Esc</kbd>
        </label>
        <div id={`${titleId}-results`} ref={listRef} role="listbox" className="max-h-[min(22rem,50vh)] overflow-y-auto p-2">
          {term && state === "loading" && recordItems.length === 0 && pageItems.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-white/55">Searching…</p>
          ) : null}
          {term && state === "error" ? <p className="px-2 py-8 text-center text-sm text-[#fdba74]">Search is unavailable. Try again.</p> : null}
          {term && state === "ready" && items.length === 0 ? <p className="px-2 py-8 text-center text-sm text-white/55">No results for “{term}”.</p> : null}
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
