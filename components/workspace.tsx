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
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const heading = title || description || action;
  return (
    <section className={`min-w-0 max-w-full rounded-2xl border border-border bg-card p-4 sm:p-5 ${className}`}>
      {heading ? (
        <div className="flex items-start justify-between gap-3">
          <div>
            {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={heading ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <p className="font-display text-2xl tracking-tight">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {hint ? <p className="mt-1 text-xs text-primary">{hint}</p> : null}
    </article>
  );
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-card">
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-muted/70 text-[11px] tracking-wide text-muted-foreground uppercase">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 font-semibold">
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
    <button className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-[#0f5c34]" type="submit">
      {children}
    </button>
  );
}

export function Notice({ tone = "ok", children }: { tone?: "ok" | "danger"; children: ReactNode }) {
  const toneClass = tone === "danger" ? "bg-danger/10 text-danger" : "bg-secondary text-secondary-foreground";
  return <p className={`rounded-xl border border-current/10 px-3 py-2 text-sm ${toneClass}`}>{children}</p>;
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
    <section className="min-w-0 max-w-full rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {facts && facts.length > 0 ? (
        <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="rounded-xl bg-muted/70 px-3 py-2.5">
              <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{fact.label}</dt>
              <dd className="mt-1 font-display text-lg tracking-tight sm:text-xl">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

export function TabBar({ tabs, current, base }: { tabs: { id: string; label: string }[]; current: string; base: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-2xl bg-muted p-1">
      {tabs.map((item) => {
        const href = item.id === tabs[0]?.id ? base : `${base}?tab=${item.id}`;
        const active = current === item.id;
        return (
          <Link
            key={item.id}
            href={href}
            className={`inline-flex h-9 shrink-0 items-center rounded-xl px-3 text-sm font-medium ${
              active ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
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
