"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Beef,
  CornerDownLeft,
  Dna,
  Droplets,
  FileBarChart,
  Globe,
  HeartPulse,
  LayoutDashboard,
  Lightbulb,
  Mail,
  Milk,
  ScanLine,
  ScrollText,
  Search,
  Settings,
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

type GateKey =
  | "team"
  | "audit"
  | "finance"
  | "reports"
  | "genetics"
  | "health"
  | "semen"
  | "shop"
  | "listings"
  | "enquiries"
  | "settings";

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
  cattle: {
    code: string;
    name: string | null;
    breedName: string | null;
    locationName: string | null;
    earTag: string | null;
    rfid?: string | null;
    match: string;
  }[];
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

const pages: { href: string; label: string; icon: LucideIcon; gate?: GateKey }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ai", label: "Assistant", icon: Sparkles },
  { href: "/animals", label: "Cattle register", icon: Beef },
  { href: "/locations", label: "Sheds & pens", icon: Warehouse },
  { href: "/breeding", label: "Breeding & AI", icon: HeartPulse },
  { href: "/health", label: "Health", icon: Stethoscope, gate: "health" },
  { href: "/milk", label: "Milk", icon: Milk },
  { href: "/feed", label: "Feed & nutrition", icon: Wheat },
  { href: "/semen", label: "Bulls & semen", icon: Droplets, gate: "semen" },
  { href: "/genetics", label: "Pedigree & mating", icon: Dna, gate: "genetics" },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/embryos", label: "Embryos", icon: Sprout, gate: "genetics" },
  { href: "/finance", label: "Finance", icon: Wallet, gate: "finance" },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/reports", label: "Reports", icon: FileBarChart, gate: "reports" },
  { href: "/scan", label: "Scan QR / Tag", icon: ScanLine },
  { href: "/listings", label: "Public listings", icon: Globe, gate: "listings" },
  { href: "/shop", label: "Shop & orders", icon: ShoppingBag, gate: "shop" },
  { href: "/enquiries", label: "Enquiries", icon: Mail, gate: "enquiries" },
  { href: "/settings", label: "Farm settings", icon: Settings, gate: "settings" },
  { href: "/audit", label: "Audit log", icon: ScrollText, gate: "audit" },
  { href: "/team", label: "Team & roles", icon: Users, gate: "team" },
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

function recentKey(farmId: string, userId: string) {
  return `farm-search-recent:${farmId}:${userId}`;
}

function pageIcon(href: string) {
  const path = href.split("?")[0] ?? href;
  return pages.find((page) => page.href === path)?.icon ?? LayoutDashboard;
}

function blocked(href: string, gates: Record<GateKey, boolean>) {
  const path = href.split("?")[0] ?? href;
  const page = pages.find((item) => item.href === path);
  return page?.gate ? !gates[page.gate] : false;
}

function readRecent(farmId: string, userId: string, gates: Record<GateKey, boolean>): Item[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentKey(farmId, userId)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const row = entry as { href?: unknown; title?: unknown; detail?: unknown; kind?: unknown };
        if (typeof row.href !== "string" || typeof row.title !== "string" || typeof row.detail !== "string") return [];
        if (blocked(row.href, gates)) return [];
        const kind = (Object.keys(kindIcon) as Kind[]).includes(row.kind as Kind) ? (row.kind as Kind) : "page";
        const icon = kind === "page" ? pageIcon(row.href) : kindIcon[kind];
        return [{ id: `recent:${row.href}`, href: row.href, title: row.title, detail: row.detail, section: "Recent", icon, kind }];
      })
      .slice(0, 6);
  } catch {
    return [];
  }
}

const ALL_GATES: Record<GateKey, boolean> = {
  team: true,
  audit: true,
  finance: true,
  reports: true,
  genetics: true,
  health: true,
  semen: true,
  shop: true,
  listings: true,
  enquiries: true,
  settings: true,
};

function remember(farmId: string, userId: string, item: Item) {
  try {
    const stored = readRecent(farmId, userId, ALL_GATES)
      .filter((entry) => entry.href !== item.href)
      .map((entry) => ({ href: entry.href, title: entry.title, detail: entry.detail, kind: entry.kind }));
    localStorage.setItem(
      recentKey(farmId, userId),
      JSON.stringify([{ href: item.href, title: item.title, detail: item.detail, kind: item.kind }, ...stored].slice(0, 6)),
    );
  } catch {
    // Ignore storage quota or private browsing errors.
  }
}

function cattleDetail(animal: SearchBody["cattle"][number]) {
  if (animal.match === "Ear tag" && animal.earTag) return `Ear tag ${animal.earTag} · ${animal.code}`;
  if (animal.match === "RFID" && animal.rfid) return `RFID ${animal.rfid} · ${animal.code}`;
  if (animal.match === "Sire" || animal.match === "Sire code") return `Sire · ${animal.code}`;
  if (animal.match === "Breed" && animal.breedName) return `Breed ${animal.breedName} · ${animal.code}`;
  if (animal.match === "Shed") return `Shed ${animal.locationName ?? "Unassigned"} · ${animal.code}`;
  return [animal.code, animal.breedName, animal.locationName ?? "Unassigned"].filter(Boolean).join(" · ");
}

export function HerdSearch({
  variant = "header",
  farmId,
  userId,
  showTeam = false,
  showAudit = false,
  showFinance = false,
  showReports = false,
  showGenetics = false,
  showHealth = false,
  showSemen = false,
  showShop = false,
  showListings = false,
  showEnquiries = false,
  showSettings = false,
}: {
  variant?: "header" | "field" | "sidebar";
  farmId: string;
  userId: string;
  showTeam?: boolean;
  showAudit?: boolean;
  showFinance?: boolean;
  showReports?: boolean;
  showGenetics?: boolean;
  showHealth?: boolean;
  showSemen?: boolean;
  showShop?: boolean;
  showListings?: boolean;
  showEnquiries?: boolean;
  showSettings?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const router = useRouter();
  const gates = useMemo<Record<GateKey, boolean>>(
    () => ({
      team: showTeam,
      audit: showAudit,
      finance: showFinance,
      reports: showReports,
      genetics: showGenetics,
      health: showHealth,
      semen: showSemen,
      shop: showShop,
      listings: showListings,
      enquiries: showEnquiries,
      settings: showSettings,
    }),
    [showTeam, showAudit, showFinance, showReports, showGenetics, showHealth, showSemen, showShop, showListings, showEnquiries, showSettings],
  );
  const [isOpen, setIsOpen] = useState(false);
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
                href: `/semen?tab=straws&q=${encoded}`,
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
              href: `/semen?tab=bulls&q=${encodeURIComponent(bull.code)}`,
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
        ...(showShop
          ? body.products.map((product) => ({
              id: `product:${product.id}`,
              href: `/shop?q=${encodeURIComponent(product.name)}`,
              title: product.name,
              detail: product.category,
              section: "Products",
              icon: ShoppingBag,
              kind: "product" as const,
            }))
          : []),
        ...(showEnquiries
          ? body.enquiries.map((enquiry) => ({
              id: `enquiry:${enquiry.id}`,
              href: `/enquiries?q=${encodeURIComponent(enquiry.name)}`,
              title: enquiry.name,
              detail: enquiry.about,
              section: "Enquiries",
              icon: Mail,
              kind: "enquiry" as const,
            }))
          : []),
      ]
    : [];
  const items: Item[] = term ? [...pageItems, ...recordItems] : recent.length > 0 ? recent : pageItems.slice(0, 7);
  const safeActive = items.length === 0 ? 0 : Math.min(active, items.length - 1);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ block: "nearest" });
  }, [safeActive]);

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
    if (variant !== "header" && variant !== "sidebar") return;
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (triggerRef.current && triggerRef.current.offsetParent === null) return;
        event.preventDefault();
        openRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant]);

  function open() {
    if (dialogRef.current?.open) {
      inputRef.current?.focus();
      return;
    }
    setValue("");
    setBody(emptyBody);
    setState("idle");
    setActive(0);
    setRecent(readRecent(farmId, userId, gates));
    dialogRef.current?.showModal();
    setIsOpen(true);
    inputRef.current?.focus();
  }

  useEffect(() => {
    openRef.current = open;
  });

  function close() {
    dialogRef.current?.close();
    setIsOpen(false);
  }

  function choose(item: Item) {
    remember(farmId, userId, item);
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
    } else if (event.key === "Enter" && items[safeActive]) {
      event.preventDefault();
      choose(items[safeActive]);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        className={
          variant === "sidebar"
            ? "flex h-9 w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-left text-xs text-zinc-400 transition hover:border-white/[0.16] hover:bg-white/[0.08] hover:text-zinc-200"
            : variant === "header"
              ? "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-white px-3 text-left text-xs text-muted-foreground shadow-2xs sm:max-w-xs"
              : "flex h-10 items-center gap-2 rounded-full border border-border/80 bg-muted/65 px-3.5 text-left text-sm text-muted-foreground transition hover:bg-muted lg:w-80"
        }
      >
        <Search className="size-3.5 shrink-0 opacity-75" />
        <span className="truncate">{variant === "sidebar" ? "Search herd & pages" : "Search"}</span>
        {variant === "sidebar" ? (
          <kbd className="ml-auto rounded border border-white/[0.12] bg-white/[0.06] px-1.5 py-0.5 font-sans text-[10px] font-medium text-zinc-400">
            ⌘K
          </kbd>
        ) : variant === "header" ? (
          <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline">⌘K</kbd>
        ) : null}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onClose={() => setIsOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="search-palette mx-auto mt-[10vh] mb-auto w-[min(36rem,calc(100%-1.5rem))] overflow-hidden rounded-xl border border-white/10 bg-[#1c2430] p-0 text-white backdrop:bg-[#1c2430]/70"
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
              setActive(0);
              setBody(emptyBody);
              if (!next.trim()) {
                setState("idle");
              }
            }}
            placeholder="Search cattle, ear tags, RFID, straws, alerts, or pages"
            className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-white/40"
            autoFocus
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={`${titleId}-results`}
            aria-activedescendant={items[safeActive] ? `search-item-${items[safeActive].id}` : undefined}
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
            const showSection = index === 0 || items[index - 1]?.section !== item.section;
            const selected = index === safeActive;
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
