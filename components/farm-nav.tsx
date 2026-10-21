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

const links = [
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
  { href: "/embryos", label: "Embryos", icon: Sprout },
  { href: "/finance", label: "Finance", icon: Wallet },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/audit", label: "Audit", icon: ScrollText },
  { href: "/shop", label: "Shop", icon: ShoppingBag },
  { href: "/team", label: "Team", icon: Users },
];

export function FarmNav({
  showTeam = false,
  showAudit = false,
  variant = "sidebar",
}: {
  showTeam?: boolean;
  showAudit?: boolean;
  variant?: "sidebar" | "drawer";
}) {
  const pathname = usePathname();
  const items = links.filter((link) => (link.href !== "/team" || showTeam) && (link.href !== "/audit" || showAudit));
  const stacked = variant === "drawer";
  return (
    <nav className={stacked ? "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3" : "hidden min-h-0 flex-1 space-y-1 overflow-y-auto px-3 md:block"}>
      {items.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium ${
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
