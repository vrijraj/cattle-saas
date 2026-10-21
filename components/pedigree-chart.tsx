import Link from "next/link";
import type { AncestorChart, PedigreeNode } from "@/lib/pedigree-tree";

type Slot = {
  node: PedigreeNode;
  role: string;
  next: Slot[];
};

export function PedigreeChart({
  chart,
  offspring,
}: {
  chart: AncestorChart;
  offspring: { code: string; name: string | null }[];
}) {
  const ancestors = buildLevel(chart.parents, ["Sire", "Dam"], [chart.grandparents, chart.greatGrandparents], 1);

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold">Pedigree</h2>
      <p className="mt-1 text-sm text-muted-foreground">Daughters and sons on the left. The sire sits above the dam on the right. A line stops where a parent is not linked.</p>
      <div className="mt-5 overflow-x-auto rounded-xl bg-muted/70 p-4">
        <div className="flex items-center">
          <Offspring nodes={offspring} />
          <AnimalCard node={chart.self} role="This animal" emphasis />
          <AncestorList slots={ancestors} />
        </div>
      </div>
      {offspring.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No offspring linked yet.</p> : null}
    </section>
  );
}

function buildLevel(nodes: PedigreeNode[], roles: string[], below: PedigreeNode[][], depth: number): Slot[] {
  const [nextGen, ...rest] = below;
  return nodes.flatMap((node, index) => {
    const known = Boolean(node.code);
    if (!known && depth > 1) return [];
    const start = index * 2;
    const pair = nextGen ? nextGen.slice(start, start + 2) : [];
    const scopedRest = rest.map((row, step) => {
      const span = 2 ** (step + 2);
      return row.slice(index * span, index * span + span);
    });
    const next = known && depth < 3 && pair.some((item) => item.code) ? buildLevel(pair, ["Sire", "Dam"], scopedRest, depth + 1) : [];
    return [{ node, role: roles[index] ?? "Ancestor", next }];
  });
}

function Offspring({ nodes }: { nodes: { code: string; name: string | null }[] }) {
  if (nodes.length === 0) return null;
  if (nodes.length === 1) {
    return (
      <>
        <AnimalCard node={{ code: nodes[0].code, name: nodes[0].name, href: `/animals/${nodes[0].code}` }} role="Offspring" />
        <span aria-hidden className="h-px w-8 shrink-0 bg-primary/40" />
      </>
    );
  }
  return (
    <>
      <ul className="flex flex-col">
        {nodes.map((node, index) => (
          <li key={node.code} className="relative flex items-center py-2">
            <AnimalCard node={{ code: node.code, name: node.name, href: `/animals/${node.code}` }} role="Offspring" />
            <span aria-hidden className="h-px w-6 shrink-0 bg-primary/40" />
            <span
              aria-hidden
              className={`absolute right-0 w-px bg-primary/40 ${
                index === 0 ? "top-1/2 bottom-0" : index === nodes.length - 1 ? "top-0 h-1/2" : "top-0 bottom-0"
              }`}
            />
          </li>
        ))}
      </ul>
      <span aria-hidden className="h-px w-6 shrink-0 bg-primary/40" />
    </>
  );
}

function AncestorList({ slots }: { slots: Slot[] }) {
  if (slots.length === 0) return null;
  if (slots.length === 1) {
    return (
      <>
        <span aria-hidden className="h-px w-8 shrink-0 bg-primary/40" />
        <Branch slot={slots[0]} />
      </>
    );
  }
  return (
    <>
      <span aria-hidden className="h-px w-6 shrink-0 bg-primary/40" />
      <ul className="flex flex-col">
        {slots.map((slot, index) => (
          <li key={`${slot.role}-${slot.node.code ?? index}`} className="relative flex items-center py-2">
            <span
              aria-hidden
              className={`absolute left-0 w-px bg-primary/40 ${
                index === 0 ? "top-1/2 bottom-0" : index === slots.length - 1 ? "top-0 h-1/2" : "top-0 bottom-0"
              }`}
            />
            <span aria-hidden className="h-px w-6 shrink-0 bg-primary/40" />
            <Branch slot={slot} />
          </li>
        ))}
      </ul>
    </>
  );
}

function Branch({ slot }: { slot: Slot }) {
  return (
    <div className="flex items-center">
      <AnimalCard node={slot.node} role={slot.role} />
      <AncestorList slots={slot.next} />
    </div>
  );
}

function AnimalCard({ node, role, emphasis = false }: { node: PedigreeNode; role: string; emphasis?: boolean }) {
  const known = Boolean(node.code);
  const title = known ? (node.name ?? node.code) : "Not linked";
  const showCode = Boolean(node.code && node.name && node.name !== node.code);
  const className = `block w-44 shrink-0 rounded-xl border px-3 py-2.5 ${
    emphasis ? "border-primary bg-secondary" : known ? "border-border bg-card" : "border-dashed border-border bg-card"
  }`;
  const body = (
    <>
      <span className="block text-[11px] text-muted-foreground">{role}</span>
      <span className={`mt-0.5 block truncate text-sm font-semibold ${known ? "" : "text-muted-foreground"}`}>{title}</span>
      {showCode ? <span className="block truncate text-xs text-muted-foreground">{node.code}</span> : null}
    </>
  );
  if (node.href) {
    return (
      <Link href={node.href} className={className}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}
