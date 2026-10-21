"use client";

import type { ComponentType } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Beef,
  Dna,
  Droplets,
  FileBarChart,
  HeartPulse,
  LayoutDashboard,
  Lightbulb,
  Mail,
  ScrollText,
  Sparkles,
  Milk,
  ShoppingBag,
  Sprout,
  Users,
  Stethoscope,
  Wallet,
  Warehouse,
  Wheat,
} from "lucide-react";

const groups = [
  {
    label: "Today",
    links: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/ai", label: "Assistant", icon: Sparkles },
      { href: "/alerts", label: "Alerts", icon: Bell },
    ],
  },
  {
    label: "Herd",
    links: [
      { href: "/animals", label: "Cattle", icon: Beef },
      { href: "/locations", label: "Sheds", icon: Warehouse },
      { href: "/milk", label: "Milk", icon: Milk },
      { href: "/feed", label: "Feed & nutrition", icon: Wheat },
    ],
  },
  {
    label: "Breeding",
    links: [
      { href: "/breeding", label: "Breeding", icon: HeartPulse },
      { href: "/health", label: "Health", icon: Stethoscope },
      { href: "/semen", label: "Semen", icon: Droplets },
      { href: "/genetics", label: "Genetics", icon: Dna },
      { href: "/insights", label: "Insights", icon: Lightbulb },
      { href: "/embryos", label: "Embryos", icon: Sprout },
    ],
  },
  {
    label: "Business",
    links: [
      { href: "/finance", label: "Finance", icon: Wallet },
      { href: "/reports", label: "Reports", icon: FileBarChart },
      { href: "/shop", label: "Shop", icon: ShoppingBag },
      { href: "/enquiries", label: "Enquiries", icon: Mail },
      { href: "/audit", label: "Audit", icon: ScrollText },
      { href: "/team", label: "Team", icon: Users },
    ],
  },
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
  const visible = groups
    .map((group) => ({
      ...group,
      links: group.links.filter(
        (link) =>
          (link.href !== "/team" || showTeam) &&
          (link.href !== "/audit" || showAudit) &&
          (link.href !== "/health" || showHealth) &&
          (link.href !== "/semen" || showSemen) &&
          (link.href !== "/embryos" || showGenetics),
      ),
    }))
    .filter((group) => group.links.length > 0);
  const stacked = variant === "drawer";
  return (
    <nav className={stacked ? "flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3" : "hidden min-h-0 flex-1 overflow-y-auto px-3 md:block"}>
      {visible.map((group) => (
        <div key={group.label} className="pt-4 first:pt-0">
          <p className="px-3 pb-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{group.label}</p>
          <div className="space-y-0.5">
            {group.links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${
                    active ? "bg-card text-foreground ring-1 ring-border" : "text-foreground/75 hover:bg-card/70"
                  }`}
                >
                  <NavMark icon={Icon} />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function NavMark({ icon: Icon }: { icon: ComponentType<{ className?: string }> }) {
  const { pending } = useLinkStatus();
  if (pending) return <span className="loader-spin size-4 rounded-full border-2 border-primary/25 border-t-primary" />;
  return <Icon className="size-4" />;
}
