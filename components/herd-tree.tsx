import Link from "next/link";
import type { HerdNode } from "@/lib/pedigree-tree";

export function HerdTree({ forest }: { forest: HerdNode[] }) {
  if (forest.length === 0) {
    return (
      <section className="rounded-2xl border border-border/85 bg-card px-5 py-12 text-center text-sm text-muted-foreground shadow-[0_1px_3px_rgba(15,35,24,0.04)]">
        No dam lines to show yet.
      </section>
    );
  }

  const lines = forest.filter((node) => node.children.length > 0);
  const singles = forest.filter((node) => node.children.length === 0);

  return (
    <section className="rounded-2xl border border-border/85 bg-card p-5 shadow-[0_1px_3px_rgba(15,35,24,0.04)]">
      {lines.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">Dam lines</h2>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-primary ring-1 ring-primary/15">
              {lines.length} {lines.length === 1 ? "matriarch line" : "matriarch lines"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Daughters sit to the right of their dam. The recorded sire appears on each card.</p>
          <div className="mt-4 space-y-4">
            {lines.map((node) => (
              <div
                key={node.code}
                style={{
                  backgroundImage: "radial-gradient(#cbd5d1 1px, transparent 1px)",
                  backgroundSize: "18px 18px",
                }}
                className="overflow-x-auto rounded-2xl border border-border/85 bg-[#f8faf9] p-5 shadow-inner"
              >
                <Branch node={node} root />
              </div>
            ))}
          </div>
        </>
      ) : null}

      {singles.length > 0 ? (
        <div className={lines.length > 0 ? "mt-6 border-t border-border/75 pt-5" : ""}>
          <h2 className="text-sm font-semibold">Foundation & unbranched cattle ({singles.length})</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {singles.map((node) => (
              <AnimalCard key={node.code} node={node} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Branch({ node, root = false }: { node: HerdNode; root?: boolean }) {
  const children = node.children;
  return (
    <div className="flex items-center">
      <AnimalCard node={node} root={root} />
      {children.length === 1 ? (
        <>
          <span aria-hidden className="relative h-0.5 w-9 shrink-0 bg-slate-300">
            <span className="absolute top-1/2 right-0 size-1.5 -translate-y-1/2 rounded-full bg-primary" />
          </span>
          <Branch node={children[0]} />
        </>
      ) : null}
      {children.length > 1 ? (
        <>
          <span aria-hidden className="h-0.5 w-7 shrink-0 bg-slate-300" />
          <ul className="flex flex-col">
            {children.map((child, index) => (
              <li key={child.code} className="relative flex items-center py-2.5">
                <span
                  aria-hidden
                  className={`absolute left-0 w-0.5 bg-slate-300 ${
                    index === 0 ? "top-1/2 bottom-0" : index === children.length - 1 ? "top-0 h-1/2" : "top-0 bottom-0"
                  }`}
                />
                <span aria-hidden className="relative h-0.5 w-7 shrink-0 bg-slate-300">
                  <span className="absolute top-1/2 right-0 size-1.5 -translate-y-1/2 rounded-full bg-primary" />
                </span>
                <Branch node={child} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function AnimalCard({ node, root = false }: { node: HerdNode; root?: boolean }) {
  const sold = node.presence === "sold";
  return (
    <Link
      href={`/animals/${node.code}`}
      className={`block w-48 shrink-0 rounded-2xl border p-3 transition hover:shadow-md ${
        root
          ? "border-2 border-primary bg-gradient-to-br from-secondary/90 via-white to-secondary/45 shadow-xs"
          : "border-border/90 bg-white shadow-[0_2px_6px_rgba(15,23,42,0.04)] hover:border-primary/40"
      } ${sold ? "opacity-70" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
            root ? "bg-primary text-primary-foreground" : "bg-rose-500/12 text-rose-800 ring-1 ring-rose-500/20"
          }`}
        >
          {root ? "Foundation dam" : "Daughter"}
        </span>
        {sold ? <span className="text-[10px] font-medium text-muted-foreground">Sold</span> : null}
      </div>
      <span className="mt-2 block truncate text-sm font-semibold text-foreground">{node.name ?? "Unnamed"}</span>
      <span className="block truncate font-mono text-[11px] text-muted-foreground">{node.code}</span>
      <span className="mt-1.5 block truncate border-t border-border/60 pt-1.5 text-[11px] text-muted-foreground">
        {node.sireCode ? `♂ Sire · ${node.sireCode}` : "Sire not linked"}
      </span>
    </Link>
  );
}
