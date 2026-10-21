import Link from "next/link";
import type { HerdNode } from "@/lib/pedigree-tree";

export function HerdTree({ forest }: { forest: HerdNode[] }) {
  if (forest.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">
        No dam lines to show yet.
      </section>
    );
  }

  const lines = forest.filter((node) => node.children.length > 0);
  const singles = forest.filter((node) => node.children.length === 0);

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      {lines.length > 0 ? (
        <>
          <h2 className="text-base font-semibold">Dam lines</h2>
          <p className="mt-1 text-sm text-muted-foreground">Daughters sit to the right of their dam. The sire is on each card.</p>
          <div className="mt-5 space-y-4">
            {lines.map((node) => (
              <div key={node.code} className="overflow-x-auto rounded-xl bg-muted/70 p-4">
                <Branch node={node} root />
              </div>
            ))}
          </div>
        </>
      ) : null}

      {singles.length > 0 ? (
        <div className={lines.length > 0 ? "mt-6 border-t border-border pt-5" : ""}>
          <h2 className="text-sm font-medium">No daughters on this farm</h2>
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
          <span aria-hidden className="h-px w-8 shrink-0 bg-primary/40" />
          <Branch node={children[0]} />
        </>
      ) : null}
      {children.length > 1 ? (
        <>
          <span aria-hidden className="h-px w-6 shrink-0 bg-primary/40" />
          <ul className="flex flex-col">
            {children.map((child, index) => (
              <li key={child.code} className="relative flex items-center py-2">
                <span
                  aria-hidden
                  className={`absolute left-0 w-px bg-primary/40 ${
                    index === 0 ? "top-1/2 bottom-0" : index === children.length - 1 ? "top-0 h-1/2" : "top-0 bottom-0"
                  }`}
                />
                <span aria-hidden className="h-px w-6 shrink-0 bg-primary/40" />
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
      className={`block w-44 shrink-0 rounded-xl border px-3 py-2.5 ${
        root ? "border-primary bg-secondary" : "border-border bg-card"
      } ${sold ? "opacity-70" : ""}`}
    >
      <span className="block truncate text-sm font-semibold">{node.name ?? "Unnamed"}</span>
      <span className="block truncate text-xs text-muted-foreground">{node.code}</span>
      <span className="mt-1 block truncate text-[11px] text-muted-foreground">
        {node.sireCode ? `Sire ${node.sireCode}` : "Sire not linked"}
        {sold ? " · Sold" : ""}
      </span>
    </Link>
  );
}
