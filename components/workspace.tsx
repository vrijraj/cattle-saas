import Link from "next/link";
import type { ReactNode } from "react";

export const inputClass =
  "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-card p-5 shadow-sm ${className}`}>
      {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className={title || description ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {hint ? <p className="mt-1 text-xs text-primary">{hint}</p> : null}
    </article>
  );
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-muted/80 text-xs text-muted-foreground">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}

export function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-8 text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}

export function Submit({ children }: { children: ReactNode }) {
  return (
    <button className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground" type="submit">
      {children}
    </button>
  );
}

export function Notice({ tone = "ok", children }: { tone?: "ok" | "danger"; children: ReactNode }) {
  const toneClass = tone === "danger" ? "bg-danger/10 text-danger" : "bg-secondary text-secondary-foreground";
  return <p className={`rounded-xl px-3 py-2 text-sm ${toneClass}`}>{children}</p>;
}

export function Summary({
  title,
  description,
  action,
  facts,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  facts?: { label: string; value: string }[];
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {facts && facts.length > 0 ? (
        <dl className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2 xl:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <dd className="mt-1 text-sm font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

export function TabBar({ tabs, current, base }: { tabs: { id: string; label: string }[]; current: string; base: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((item) => {
        const href = item.id === tabs[0]?.id ? base : `${base}?tab=${item.id}`;
        const active = current === item.id;
        return (
          <Link
            key={item.id}
            href={href}
            className={`-mb-px inline-flex h-10 shrink-0 items-center border-b-2 px-3 text-sm font-medium ${
              active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function pickTab(requested: string | undefined, tabs: { id: string }[], fallback: string) {
  return tabs.some((tab) => tab.id === requested) ? (requested as string) : fallback;
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" }) {
  const toneClass =
    tone === "good" ? "bg-secondary text-secondary-foreground" : tone === "warn" ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>{children}</span>;
}
