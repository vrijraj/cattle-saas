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
  HeartPulse,
  LayoutGrid,
  Lightbulb,
  Mail,
  Milk,
  ScanLine,
  ScrollText,
  ShoppingBag,
  Sparkles,
  Sprout,
  Stethoscope,
  Users,
  Wallet,
  Warehouse,
  Wheat,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

type CollapsibleGroup = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  links: NavItem[];
};

const topLinks: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/animals", label: "Cattle details", icon: Beef },
  { href: "/ai", label: "AI Assistant", icon: Sparkles },
  { href: "/reports", label: "Analytics", icon: FileBarChart },
];

const accordionGroups: CollapsibleGroup[] = [
  {
    id: "herd",
    label: "Herd & sheds",
    icon: Warehouse,
    links: [
      { href: "/animals", label: "Cattle register", icon: Beef },
      { href: "/locations", label: "Sheds & pens", icon: Warehouse },
      { href: "/milk", label: "Milk production", icon: Milk },
      { href: "/feed", label: "Feed & nutrition", icon: Wheat },
      { href: "/scan", label: "Scan QR / Tag", icon: ScanLine },
    ],
  },
  {
    id: "breeding",
    label: "Breeding & genetics",
    icon: Dna,
    links: [
      { href: "/breeding", label: "Reproduction & AI", icon: HeartPulse },
      { href: "/semen", label: "Bulls & semen", icon: Droplets },
      { href: "/genetics", label: "Pedigree & mating", icon: Dna },
      { href: "/insights", label: "Herd insights", icon: Lightbulb },
      { href: "/embryos", label: "Embryos", icon: Sprout },
    ],
  },
  {
    id: "health",
    label: "Health & reminders",
    icon: Stethoscope,
    links: [
      { href: "/health", label: "Veterinary & health", icon: Stethoscope },
      { href: "/alerts", label: "Smart alerts", icon: Bell },
    ],
  },
  {
    id: "commerce",
    label: "Marketplace",
    icon: ShoppingBag,
    links: [
      { href: "/shop", label: "Shop listings", icon: ShoppingBag },
      { href: "/enquiries", label: "Buyer enquiries", icon: Mail },
    ],
  },
];

const footerLinks: NavItem[] = [
  { href: "/finance", label: "Finance", icon: Wallet },
  { href: "/team", label: "Team & roles", icon: Users },
  { href: "/audit", label: "Audit log", icon: ScrollText },
];

export function FarmNav({
  showTeam = false,
  showAudit = false,
  showHealth = false,
  showSemen = false,
  showGenetics = false,
  variant = "sidebar",
}: {
  showTeam?: boolean;
  showAudit?: boolean;
  showHealth?: boolean;
  showSemen?: boolean;
  showGenetics?: boolean;
  variant?: "sidebar" | "drawer";
}) {
  const pathname = usePathname();

  function allowed(href: string) {
    if (href === "/team" && !showTeam) return false;
    if (href === "/audit" && !showAudit) return false;
    if (href === "/health" && !showHealth) return false;
    if (href === "/semen" && !showSemen) return false;
    if (href === "/embryos" && !showGenetics) return false;
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

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of accordionGroups) {
      if (group.links.some((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))) {
        initial[group.id] = true;
      }
    }
    if (Object.keys(initial).length === 0) {
      initial.herd = true;
      initial.breeding = true;
    }
    return initial;
  });

  function toggleGroup(id: string) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
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
                <span className="truncate">{link.label}</span>
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
          const isOpen = Boolean(openGroups[group.id] || hasActiveChild);
          return (
            <div key={group.id}>
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isOpen}
                className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition ${
                  hasActiveChild ? "font-medium text-zinc-100" : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                }`}
              >
                <GroupIcon className={`size-4 shrink-0 ${hasActiveChild ? "text-emerald-400" : "text-zinc-500"}`} />
                <span className="flex-1 truncate">{group.label}</span>
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
                        <span className="truncate">{link.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

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
                <span className="truncate">{link.label}</span>
                <ChevronRight className="size-3.5 shrink-0 text-zinc-500" />
              </Link>
            );
          })}
        </div>
      </div>
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
