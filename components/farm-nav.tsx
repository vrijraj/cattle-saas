"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Beef,
  Dna,
  Droplets,
  FileBarChart,
  HeartPulse,
  LayoutDashboard,
  ScrollText,
  Milk,
  ShoppingBag,
  Sprout,
  Users,
  Stethoscope,
  Wallet,
  Wheat,
} from "lucide-react";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/animals", label: "Cattle", icon: Beef },
  { href: "/breeding", label: "Breeding", icon: HeartPulse },
  { href: "/health", label: "Health", icon: Stethoscope },
  { href: "/milk", label: "Milk", icon: Milk },
  { href: "/feed", label: "Feed & nutrition", icon: Wheat },
  { href: "/semen", label: "Semen", icon: Droplets },
  { href: "/genetics", label: "Genetics", icon: Dna },
  { href: "/embryos", label: "Embryos", icon: Sprout },
  { href: "/finance", label: "Finance", icon: Wallet },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/audit", label: "Audit", icon: ScrollText },
  { href: "/shop", label: "Shop", icon: ShoppingBag },
  { href: "/team", label: "Team", icon: Users },
];

export function FarmNav({ showTeam = false, showAudit = false }: { showTeam?: boolean; showAudit?: boolean }) {
  const pathname = usePathname();
  const items = links.filter((link) => (link.href !== "/team" || showTeam) && (link.href !== "/audit" || showAudit));
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:min-h-0 md:flex-1 md:space-y-1 md:overflow-y-auto md:px-3">
      {items.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`inline-flex h-10 shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-medium md:flex ${
              active ? "bg-secondary text-secondary-foreground" : "text-foreground/70 hover:bg-muted"
            }`}
          >
            <Icon className="size-4" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
