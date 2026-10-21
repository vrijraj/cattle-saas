import Link from "next/link";
import { Leaf } from "lucide-react";
import type { ReactNode } from "react";

export function PublicFrame({
  title,
  subtitle,
  href,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  href?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const brand = (
    <span className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
        <Leaf className="size-4" />
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </span>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-5">
          {href ? <Link href={href}>{brand}</Link> : brand}
          {action}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}
