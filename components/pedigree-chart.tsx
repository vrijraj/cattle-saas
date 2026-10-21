"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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
  const surfaceRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const homeRef = useRef({ x: 0, y: 0 });
  const goalRef = useRef(1);
  const focusRef = useRef({ x: 0, y: 0, localX: 0, localY: 0 });
  const motionRef = useRef<"zoom" | "home" | null>(null);
  const zoomRaf = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  function place(nextScale: number, nextOffset: { x: number; y: number }) {
    scaleRef.current = nextScale;
    offsetRef.current = nextOffset;
    if (surfaceRef.current) surfaceRef.current.style.transform = `translate(${nextOffset.x}px, ${nextOffset.y}px) scale(${nextScale})`;
    if (labelRef.current) labelRef.current.textContent = `${Math.round(nextScale * 100)}%`;
  }

  function focusOn(point: { x: number; y: number } | null) {
    const node = frame.current;
    if (!node) return;
    const px = point?.x ?? node.clientWidth / 2;
    const py = point?.y ?? node.clientHeight / 2;
    const originX = node.clientWidth / 2;
    const originY = node.clientHeight / 2;
    focusRef.current = {
      x: px,
      y: py,
      localX: (px - originX - offsetRef.current.x) / scaleRef.current,
      localY: (py - originY - offsetRef.current.y) / scaleRef.current,
    };
  }

  function startMotion() {
    if (zoomRaf.current) return;
    let last = performance.now();
    const tick = (now: number) => {
      if (!motionRef.current) {
        zoomRaf.current = 0;
        return;
      }
      const blend = 1 - Math.exp(-Math.min(40, now - last) / 180);
      last = now;
      if (motionRef.current === "home") {
        const home = homeRef.current;
        const scale = scaleRef.current + (1 - scaleRef.current) * blend;
        const offset = {
          x: offsetRef.current.x + (home.x - offsetRef.current.x) * blend,
          y: offsetRef.current.y + (home.y - offsetRef.current.y) * blend,
        };
        const done = Math.abs(scale - 1) < 0.001 && Math.abs(offset.x - home.x) < 0.4 && Math.abs(offset.y - home.y) < 0.4;
        place(done ? 1 : scale, done ? home : offset);
        if (done) {
          motionRef.current = null;
          zoomRaf.current = 0;
          return;
        }
      } else {
        const target = goalRef.current;
        const scale = scaleRef.current + (target - scaleRef.current) * blend;
        const done = Math.abs(target - scale) < 0.001;
        const nextScale = done ? target : scale;
        const node = frame.current;
        const originX = (node?.clientWidth ?? 0) / 2;
        const originY = (node?.clientHeight ?? 0) / 2;
        const focus = focusRef.current;
        place(nextScale, { x: focus.x - originX - focus.localX * nextScale, y: focus.y - originY - focus.localY * nextScale });
        if (done) {
          motionRef.current = null;
          zoomRaf.current = 0;
          return;
        }
      }
      zoomRaf.current = requestAnimationFrame(tick);
    };
    zoomRaf.current = requestAnimationFrame(tick);
  }

  function zoomToward(delta: number, point: { x: number; y: number } | null) {
    goalRef.current = clampScale(goalRef.current + delta);
    focusOn(point);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const node = frame.current;
      const focus = focusRef.current;
      const originX = (node?.clientWidth ?? 0) / 2;
      const originY = (node?.clientHeight ?? 0) / 2;
      place(goalRef.current, { x: focus.x - originX - focus.localX * goalRef.current, y: focus.y - originY - focus.localY * goalRef.current });
      return;
    }
    motionRef.current = "zoom";
    startMotion();
  }

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1;
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      zoomToward(Math.max(-0.18, Math.min(0.18, -(event.deltaY * unit) / 700)), point);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === shell.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      cancelAnimationFrame(zoomRaf.current);
    };
  }, []);

  useLayoutEffect(() => {
    const node = frame.current;
    const surface = node?.firstElementChild as HTMLElement | null;
    const card = surface?.querySelector<HTMLElement>("[data-pedigree='self']");
    if (!node || !surface || !card) return;
    const view = node.getBoundingClientRect();
    const box = card.getBoundingClientRect();
    const current = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(surface.style.transform);
    const home = {
      x: Number(current?.[1] ?? 0) + (view.left + view.width / 2) - (box.left + box.width / 2),
      y: Number(current?.[2] ?? 0) + (view.top + view.height / 2) - (box.top + box.height / 2),
    };
    homeRef.current = home;
    place(1, home);
  }, []);

  function zoom(delta: number) {
    zoomToward(delta, null);
  }

  function reset() {
    goalRef.current = 1;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      motionRef.current = null;
      cancelAnimationFrame(zoomRaf.current);
      zoomRaf.current = 0;
      place(1, homeRef.current);
      return;
    }
    motionRef.current = "home";
    startMotion();
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
    motionRef.current = null;
    cancelAnimationFrame(zoomRaf.current);
    zoomRaf.current = 0;
    goalRef.current = clampScale(scaleRef.current);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that cannot be captured still drags from the move events.
    }
    drag.current = { x: event.clientX, y: event.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y };
    setDragging(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    place(scaleRef.current, {
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
        <button type="button" onClick={() => zoom(-0.15)} className="grid size-9 place-items-center rounded-full border border-border bg-card text-sm" aria-label="Zoom out">
          −
        </button>
        <span ref={labelRef} className="w-12 text-center text-xs text-muted-foreground">100%</span>
        <button type="button" onClick={() => zoom(0.15)} className="grid size-9 place-items-center rounded-full border border-border bg-card text-sm" aria-label="Zoom in">
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
        className={`flex items-center justify-center overflow-hidden rounded-xl bg-muted/70 touch-none ${fullscreen ? "min-h-0 flex-1" : "h-[min(32rem,70vh)]"} ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <div ref={surfaceRef} className="inline-flex items-center p-4" style={{ transformOrigin: "center center", willChange: "transform" }}>
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
    const next = known && !node.repeat && depth < PEDIGREE_GENERATIONS ? buildLevel(pair, ["Sire", "Dam"], scopedRest, depth + 1, node.code ?? parentEdit, editable) : [];
    const editTarget = !editable || node.repeat || depth >= PEDIGREE_GENERATIONS ? undefined : known ? node.code ?? undefined : depth === 1 ? "self" : parentEdit;
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
      {node.repeat ? <span className="mt-1 block text-xs text-muted-foreground">Already in this line</span> : null}
      {editTarget && onEdit ? (
        <button type="button" onClick={() => onEdit(editTarget)} className="mt-2 text-xs font-medium text-primary">
          {editLabel ?? "Set parents"}
        </button>
      ) : null}
    </>
  );
  return (
    <div className={className} data-pedigree={emphasis ? "self" : undefined}>
      {body}
    </div>
  );
}
