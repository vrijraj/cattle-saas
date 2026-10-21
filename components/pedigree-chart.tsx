"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import Link from "next/link";
import { PEDIGREE_GENERATIONS, type AncestorChart, type PedigreeNode } from "@/lib/pedigree-tree";

type Slot = {
  node: PedigreeNode;
  role: string;
  next: Slot[];
  editTarget?: string;
  editLabel?: string;
};

export function PedigreeChart({
  chart,
  offspring,
  action,
  editable = false,
  onEdit,
}: {
  chart: AncestorChart;
  offspring: { code: string; name: string | null }[];
  action?: ReactNode;
  editable?: boolean;
  onEdit?: (target: string) => void;
}) {
  const ancestors = buildLevel(chart.generations[0] ?? [], ["Sire", "Dam"], chart.generations.slice(1), 1, "self", editable);

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Pedigree</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">Offspring on the left. Each column to the right is the next generation, through the {PEDIGREE_GENERATIONS}th. Set parents on a card to fill the column after it.</p>
        </div>
        {action}
      </div>
      <PedigreeViewport>
        <Offspring nodes={offspring} />
        <AnimalCard node={chart.self} role="This animal" emphasis editTarget={editable ? "self" : undefined} editLabel="Set 1st generation" onEdit={onEdit} />
        <AncestorList slots={ancestors} onEdit={onEdit} />
      </PedigreeViewport>
      {offspring.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No offspring linked yet.</p> : null}
    </section>
  );
}

function clampScale(value: number) {
  return Math.min(2.5, Math.max(0.4, Math.round(value * 100) / 100));
}

function PedigreeViewport({ children }: { children: ReactNode }) {
  const shell = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      zoomAround(event.deltaY < 0 ? 0.1 : -0.1, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === shell.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function zoomAround(delta: number, point?: { x: number; y: number }) {
    const frameEl = frame.current;
    setScale((current) => {
      const next = clampScale(current + delta);
      if (!frameEl || next === current) return next;
      const rect = frameEl.getBoundingClientRect();
      const px = point?.x ?? rect.width / 2;
      const py = point?.y ?? rect.height / 2;
      setOffset((place) => {
        const contentX = (px - place.x) / current;
        const contentY = (py - place.y) / current;
        return { x: px - contentX * next, y: py - contentY * next };
      });
      return next;
    });
  }

  function reset() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  async function toggleFullscreen() {
    const node = shell.current;
    if (!node) return;
    if (document.fullscreenElement === node) {
      await document.exitFullscreen();
      return;
    }
    await node.requestFullscreen();
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("a, button")) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that cannot be captured still drags from the move events.
    }
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    setDragging(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + event.clientX - drag.current.x,
      y: drag.current.oy + event.clientY - drag.current.y,
    });
  }

  function onPointerUp() {
    drag.current = null;
    setDragging(false);
  }

  return (
    <div ref={shell} className={fullscreen ? "flex h-screen w-screen flex-col bg-background p-4" : "mt-5"}>
      <div className="mb-2 flex items-center justify-end gap-2">
        <button type="button" onClick={() => zoomAround(-0.15)} className="grid size-9 place-items-center rounded-full border border-border bg-card text-sm" aria-label="Zoom out">
          −
        </button>
        <span className="w-12 text-center text-xs text-muted-foreground">{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => zoomAround(0.15)} className="grid size-9 place-items-center rounded-full border border-border bg-card text-sm" aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={reset} className="h-9 rounded-full border border-border bg-card px-3 text-xs font-medium">
          Reset
        </button>
        <button type="button" onClick={() => void toggleFullscreen()} className="grid size-9 place-items-center rounded-full border border-border bg-card" aria-label={fullscreen ? "Exit full screen" : "Full screen"}>
          {fullscreen ? <ExitFullScreenIcon /> : <FullScreenIcon />}
        </button>
      </div>
      <div
        ref={frame}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`overflow-hidden rounded-xl bg-muted/70 touch-none ${fullscreen ? "min-h-0 flex-1" : "h-[min(32rem,70vh)]"} ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <div
          className={`inline-flex items-center p-4 ${dragging ? "transition-none" : "motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"}`}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: "0 0" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function FullScreenIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
      <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExitFullScreenIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
      <path d="M6 2v4H2M10 2v4h4M14 10h-4v4M2 10h4v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function generationName(depth: number) {
  const mod100 = depth % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${depth}th`;
  const mod10 = depth % 10;
  if (mod10 === 1) return `${depth}st`;
  if (mod10 === 2) return `${depth}nd`;
  if (mod10 === 3) return `${depth}rd`;
  return `${depth}th`;
}

function buildLevel(nodes: PedigreeNode[], roles: string[], below: PedigreeNode[][], depth: number, parentEdit: string, editable: boolean): Slot[] {
  const [nextGen, ...rest] = below;
  return nodes.flatMap((node, index) => {
    const known = Boolean(node.code);
    const start = index * 2;
    const pair = nextGen ? nextGen.slice(start, start + 2) : [];
    const scopedRest = rest.map((row, step) => {
      const span = 2 ** (step + 2);
      return row.slice(index * span, index * span + span);
    });
    const next = known && depth < PEDIGREE_GENERATIONS ? buildLevel(pair, ["Sire", "Dam"], scopedRest, depth + 1, node.code ?? parentEdit, editable) : [];
    const editTarget = !editable || depth >= PEDIGREE_GENERATIONS ? undefined : known ? node.code ?? undefined : depth === 1 ? "self" : parentEdit;
    const editLabel = !editTarget ? undefined : known ? `Add ${generationName(depth + 1)}` : `Set ${generationName(depth)}`;
    return [{ node, role: `${generationName(depth)} · ${roles[index] ?? "Ancestor"}`, next, editTarget, editLabel }];
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

function AncestorList({ slots, onEdit }: { slots: Slot[]; onEdit?: (target: string) => void }) {
  if (slots.length === 0) return null;
  if (slots.length === 1) {
    return (
      <>
        <span aria-hidden className="h-px w-8 shrink-0 bg-primary/40" />
        <Branch slot={slots[0]} onEdit={onEdit} />
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
            <Branch slot={slot} onEdit={onEdit} />
          </li>
        ))}
      </ul>
    </>
  );
}

function Branch({ slot, onEdit }: { slot: Slot; onEdit?: (target: string) => void }) {
  return (
    <div className="flex items-center">
      <AnimalCard node={slot.node} role={slot.role} editTarget={slot.editTarget} editLabel={slot.editLabel} onEdit={onEdit} />
      <AncestorList slots={slot.next} onEdit={onEdit} />
    </div>
  );
}

function AnimalCard({
  node,
  role,
  emphasis = false,
  editTarget,
  editLabel,
  onEdit,
}: {
  node: PedigreeNode;
  role: string;
  emphasis?: boolean;
  editTarget?: string;
  editLabel?: string;
  onEdit?: (target: string) => void;
}) {
  const known = Boolean(node.code);
  const title = known ? (node.name ?? node.code) : "Not linked";
  const showCode = Boolean(node.code && node.name && node.name !== node.code);
  const className = `block w-44 shrink-0 rounded-xl border px-3 py-2.5 ${
    emphasis ? "border-primary bg-secondary" : known ? "border-border bg-card" : "border-dashed border-border bg-card"
  }`;
  const body = (
    <>
      <span className="block text-[11px] text-muted-foreground">{role}</span>
      {node.href ? (
        <Link href={node.href} className={`mt-0.5 block truncate text-sm font-semibold ${known ? "" : "text-muted-foreground"}`}>
          {title}
        </Link>
      ) : (
        <span className={`mt-0.5 block truncate text-sm font-semibold ${known ? "" : "text-muted-foreground"}`}>{title}</span>
      )}
      {showCode ? <span className="block truncate text-xs text-muted-foreground">{node.code}</span> : null}
      {editTarget && onEdit ? (
        <button type="button" onClick={() => onEdit(editTarget)} className="mt-2 text-xs font-medium text-primary">
          {editLabel ?? "Set parents"}
        </button>
      ) : null}
    </>
  );
  return <div className={className}>{body}</div>;
}
