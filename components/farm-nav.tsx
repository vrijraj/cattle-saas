"use client";

import { useState, type ComponentType } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Beef,
  ChevronDown,
  ChevronRight,
  Dna,
  Droplets,
  FileBarChart,
  Globe,
  HeartPulse,
  LayoutGrid,
  Lightbulb,
  Mail,
  Milk,
  ScanLine,
  ScrollText,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  Sprout,
  Stethoscope,
  Users,
  Wallet,
  Warehouse,
  Wheat,
} from "lucide-react";
import { t, type DictionaryKey } from "@/lib/i18n";

type NavItem = {
  href: string;
  labelKey: DictionaryKey;
  icon: ComponentType<{ className?: string }>;
};

type CollapsibleGroup = {
  id: string;
  labelKey: DictionaryKey;
  icon: ComponentType<{ className?: string }>;
  links: NavItem[];
};

const topLinks: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.overview", icon: LayoutGrid },
  { href: "/animals", labelKey: "nav.cattle", icon: Beef },
  { href: "/ai", labelKey: "nav.ai", icon: Sparkles },
  { href: "/reports", labelKey: "nav.reports", icon: FileBarChart },
];

const accordionGroups: CollapsibleGroup[] = [
  {
    id: "herd",
    labelKey: "group.herd",
    icon: Warehouse,
    links: [
      { href: "/locations", labelKey: "nav.sheds", icon: Warehouse },
      { href: "/milk", labelKey: "nav.milk", icon: Milk },
      { href: "/feed", labelKey: "nav.feed", icon: Wheat },
      { href: "/scan", labelKey: "nav.scan", icon: ScanLine },
    ],
  },
  {
    id: "breeding",
    labelKey: "group.breeding",
    icon: Dna,
    links: [
      { href: "/breeding", labelKey: "nav.breeding", icon: HeartPulse },
      { href: "/semen", labelKey: "nav.semen", icon: Droplets },
      { href: "/genetics", labelKey: "nav.genetics", icon: Dna },
      { href: "/insights", labelKey: "nav.insights", icon: Lightbulb },
      { href: "/embryos", labelKey: "nav.embryos", icon: Sprout },
    ],
  },
  {
    id: "health",
    labelKey: "group.health",
    icon: Stethoscope,
    links: [
      { href: "/health", labelKey: "nav.health", icon: Stethoscope },
      { href: "/alerts", labelKey: "nav.alerts", icon: Bell },
    ],
  },
  {
    id: "commerce",
    labelKey: "group.commerce",
    icon: ShoppingBag,
    links: [
      { href: "/listings", labelKey: "nav.listings", icon: Globe },
      { href: "/shop", labelKey: "nav.shop", icon: ShoppingBag },
      { href: "/enquiries", labelKey: "nav.enquiries", icon: Mail },
    ],
  },
];

const footerLinks: NavItem[] = [
  { href: "/finance", labelKey: "nav.finance", icon: Wallet },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
  { href: "/team", labelKey: "nav.team", icon: Users },
  { href: "/audit", labelKey: "nav.audit", icon: ScrollText },
  { href: "/admin", labelKey: "nav.admin", icon: Shield },
];

export function FarmNav({
  showTeam = false,
  showAudit = false,
  showFinance = false,
  showReports = false,
  showHealth = false,
  showSemen = false,
  showGenetics = false,
  showShop = false,
  showListings = false,
  showEnquiries = false,
  showSettings = false,
  showAdmin = false,
  locale = "en",
  variant = "sidebar",
}: {
  showTeam?: boolean;
  showAudit?: boolean;
  showFinance?: boolean;
  showReports?: boolean;
  showHealth?: boolean;
  showSemen?: boolean;
  showGenetics?: boolean;
  showShop?: boolean;
  showListings?: boolean;
  showEnquiries?: boolean;
  showSettings?: boolean;
  showAdmin?: boolean;
  locale?: string;
  variant?: "sidebar" | "drawer";
}) {
  const pathname = usePathname();

  function allowed(href: string) {
    if (href === "/team" && !showTeam) return false;
    if (href === "/audit" && !showAudit) return false;
    if (href === "/finance" && !showFinance) return false;
    if (href === "/reports" && !showReports) return false;
    if (href === "/health" && !showHealth) return false;
    if (href === "/semen" && !showSemen) return false;
    if ((href === "/genetics" || href === "/embryos") && !showGenetics) return false;
    if (href === "/shop" && !showShop) return false;
    if (href === "/listings" && !showListings) return false;
    if (href === "/enquiries" && !showEnquiries) return false;
    if (href === "/settings" && !showSettings) return false;
    if (href === "/admin" && !showAdmin) return false;
    return true;
  }

  function isRouteActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const visibleGroups = accordionGroups
    .map((group) => ({
      ...group,
      links: group.links.filter((link) => allowed(link.href)),
    }))
    .filter((group) => group.links.length > 0);

  const visibleFooter = footerLinks.filter((link) => allowed(link.href));

  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  function isGroupOpen(group: CollapsibleGroup, hasActiveChild: boolean) {
    if (group.id in toggled) return toggled[group.id];
    if (hasActiveChild) return true;
    return group.id === "herd" || group.id === "breeding";
  }

  function toggleGroup(id: string, currentlyOpen: boolean) {
    setToggled((prev) => ({ ...prev, [id]: !currentlyOpen }));
  }

  const stacked = variant === "drawer";

  return (
    <nav
      className={
        stacked
          ? "flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 pb-3"
          : "hidden min-h-0 flex-1 flex-col overflow-y-auto px-2.5 md:flex"
      }
    >
      <div>
        <p className="px-2.5 pt-2 pb-1.5 text-[10px] font-semibold tracking-[0.14em] text-zinc-500 uppercase">Menu</p>
        <div className="space-y-0.5">
          {topLinks.filter((link) => allowed(link.href)).map((link) => {
            const active = isRouteActive(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition ${
                  active
                    ? "bg-white/[0.11] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100"
                }`}
              >
                <NavMark icon={Icon} active={active} />
                <span className="truncate">{t(locale, link.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="my-2.5 border-t border-white/[0.07]" />

      <div className="space-y-1">
        {visibleGroups.map((group) => {
          const GroupIcon = group.icon;
          const hasActiveChild = group.links.some((link) => isRouteActive(link.href));
          const isOpen = isGroupOpen(group, hasActiveChild);
          return (
            <div key={group.id}>
              <button
                type="button"
                onClick={() => toggleGroup(group.id, isOpen)}
                aria-expanded={isOpen}
                className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition ${
                  hasActiveChild ? "font-medium text-zinc-100" : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                }`}
              >
                <GroupIcon className={`size-4 shrink-0 ${hasActiveChild ? "text-emerald-400" : "text-zinc-500"}`} />
                <span className="flex-1 truncate">{t(locale, group.labelKey)}</span>
                <ChevronDown
                  className={`size-3.5 shrink-0 text-zinc-500 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen ? (
                <div className="mt-0.5 ml-4 space-y-0.5 border-l border-white/[0.08] pl-2.5">
                  {group.links.map((link) => {
                    const active = isRouteActive(link.href);
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`flex h-8 items-center gap-2 rounded-lg px-2 text-xs transition ${
                          active
                            ? "bg-white/[0.1] font-medium text-white"
                            : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                        }`}
                      >
                        <NavMark icon={Icon} active={active} small />
                        <span className="truncate">{t(locale, link.labelKey)}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {visibleFooter.length > 0 ? (
        <div className="mt-auto pt-4">
          <div className="mb-2 border-t border-white/[0.07]" />
          <div className="space-y-0.5">
            {visibleFooter.map((link) => {
              const active = isRouteActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex h-8.5 items-center justify-between rounded-lg px-2.5 text-[13px] transition ${
                    active ? "bg-white/[0.1] font-medium text-white" : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100"
                  }`}
                >
                  <span className="truncate">{t(locale, link.labelKey)}</span>
                  <ChevronRight className="size-3.5 shrink-0 text-zinc-500" />
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </nav>
  );
}

function NavMark({
  icon: Icon,
  active = false,
  small = false,
}: {
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  small?: boolean;
}) {
  const { pending } = useLinkStatus();
  const sizeClass = small ? "size-3.5" : "size-4";
  if (pending) return <span className={`loader-spin ${sizeClass} rounded-full border-2 border-emerald-400/30 border-t-emerald-400`} />;
  return <Icon className={`${sizeClass} shrink-0 ${active ? "text-emerald-400" : "text-zinc-500"}`} />;
}
