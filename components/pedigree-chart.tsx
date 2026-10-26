"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import Link from "next/link";
import { PEDIGREE_GENERATIONS, type AncestorChart, type PedigreeNode } from "@/lib/pedigree-tree";

type Slot = {
  node: PedigreeNode;
  role: string;
  kind: "sire" | "dam";
  depth: number;
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
  let knownAncestors = 0;
  let deepestGen = 0;
  chart.generations.forEach((level, index) => {
    const count = level.filter((node) => Boolean(node.code)).length;
    if (count > 0) {
      knownAncestors += count;
      deepestGen = index + 1;
    }
  });

  return (
    <section className="rounded-2xl border border-border/85 bg-card p-5 shadow-[0_1px_3px_rgba(15,35,24,0.04)]">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight text-foreground">Pedigree & Lineage Tree</h2>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-primary ring-1 ring-primary/15">
              {knownAncestors} {knownAncestors === 1 ? "ancestor" : "ancestors"}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {deepestGen > 0 ? `${deepestGen} ${deepestGen === 1 ? "generation" : "generations"} recorded` : "No ancestors linked yet"}
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Offspring appear on the left, this animal in the center, and ancestors branch to the right through the {PEDIGREE_GENERATIONS}th generation.
          </p>
        </div>
        {action}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-primary" />
          Subject animal
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-sky-500" />
          Sire line (♂)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-rose-500" />
          Dam line (♀)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-violet-500" />
          Offspring ({offspring.length})
        </span>
      </div>

      <PedigreeViewport>
        <Offspring nodes={offspring} />
        <AnimalCard
          node={chart.self}
          role="Subject animal"
          kind="self"
          emphasis
          editTarget={editable ? "self" : undefined}
          editLabel="Set 1st generation"
          onEdit={onEdit}
        />
        <AncestorList slots={ancestors} onEdit={onEdit} />
      </PedigreeViewport>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-muted-foreground">Recorded offspring:</span>
          {offspring.length === 0 ? (
            <span className="text-xs text-muted-foreground">No offspring linked to this animal yet.</span>
          ) : (
            offspring.map((calf) => (
              <Link
                key={calf.code}
                href={`/animals/${calf.code}`}
                className="inline-flex items-center gap-1 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-0.5 text-xs font-semibold text-violet-800 transition hover:bg-violet-500/20"
              >
                <span>{calf.name ?? calf.code}</span>
                {calf.name && calf.name !== calf.code ? <span className="opacity-70">· {calf.code}</span> : null}
              </Link>
            ))
          )}
        </div>
      </div>
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
    <div ref={shell} className={fullscreen ? "flex h-screen w-screen flex-col bg-background p-4" : "mt-4"}>
      <div
        ref={frame}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          backgroundImage: "radial-gradient(#cbd5d1 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
        className={`relative flex items-center justify-center overflow-hidden rounded-2xl border border-border/90 bg-[#f8faf9] shadow-inner touch-none ${
          fullscreen ? "min-h-0 flex-1" : "h-[min(34rem,72vh)]"
        } ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <div className="
          absolute top-3 right-3 z-10 flex items-center gap-0.5 rounded-full border border-border/90 bg-white/92 p-1 shadow-sm backdrop-blur-md
        ">
          <button
            type="button"
            onClick={() => zoom(-0.15)}
            className="grid size-7 place-items-center rounded-full text-sm font-medium text-foreground transition hover:bg-muted"
            aria-label="Zoom out"
          >
            −
          </button>
          <span ref={labelRef} className="w-11 text-center text-[11px] font-semibold tabular-nums text-muted-foreground">
            100%
          </span>
          <button
            type="button"
            onClick={() => zoom(0.15)}
            className="grid size-7 place-items-center rounded-full text-sm font-medium text-foreground transition hover:bg-muted"
            aria-label="Zoom in"
          >
            +
          </button>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <button
            type="button"
            onClick={reset}
            className="h-7 rounded-full px-2.5 text-[11px] font-semibold text-foreground transition hover:bg-muted"
          >
            Center
          </button>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="grid size-7 place-items-center rounded-full text-foreground transition hover:bg-muted"
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
          >
            {fullscreen ? <ExitFullScreenIcon /> : <FullScreenIcon />}
          </button>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden rounded-full border border-border/80 bg-white/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur-xs sm:block">
          Drag to pan · Scroll to zoom
        </div>

        <div ref={surfaceRef} className="inline-flex items-center p-6" style={{ transformOrigin: "center center", willChange: "transform" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function FullScreenIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
      <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExitFullScreenIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
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
    const editLabel = !editTarget ? undefined : known ? `+ Add ${generationName(depth + 1)} gen` : `+ Set ${generationName(depth)} gen`;
    const isSire = (roles[index] ?? "Sire") === "Sire";
    return [
      {
        node,
        role: `${generationName(depth)} · ${isSire ? "♂ Sire" : "♀ Dam"}`,
        kind: isSire ? "sire" : "dam",
        depth,
        next,
        editTarget,
        editLabel,
      },
    ];
  });
}

function Offspring({ nodes }: { nodes: { code: string; name: string | null }[] }) {
  if (nodes.length === 0) return null;
  if (nodes.length === 1) {
    return (
      <>
        <AnimalCard node={{ code: nodes[0].code, name: nodes[0].name, href: `/animals/${nodes[0].code}` }} role="Offspring" kind="offspring" />
        <span aria-hidden className="relative h-0.5 w-9 shrink-0 bg-slate-300">
          <span className="absolute top-1/2 right-0 size-1.5 -translate-y-1/2 rounded-full bg-primary" />
        </span>
      </>
    );
  }
  return (
    <>
      <ul className="flex flex-col">
        {nodes.map((node, index) => (
          <li key={node.code} className="relative flex items-center py-2.5">
            <AnimalCard node={{ code: node.code, name: node.name, href: `/animals/${node.code}` }} role="Offspring" kind="offspring" />
            <span aria-hidden className="h-0.5 w-7 shrink-0 bg-slate-300" />
            <span
              aria-hidden
              className={`absolute right-0 w-0.5 bg-slate-300 ${
                index === 0 ? "top-1/2 bottom-0" : index === nodes.length - 1 ? "top-0 h-1/2" : "top-0 bottom-0"
              }`}
            />
          </li>
        ))}
      </ul>
      <span aria-hidden className="relative h-0.5 w-7 shrink-0 bg-slate-300">
        <span className="absolute top-1/2 right-0 size-1.5 -translate-y-1/2 rounded-full bg-primary" />
      </span>
    </>
  );
}

function AncestorList({ slots, onEdit }: { slots: Slot[]; onEdit?: (target: string) => void }) {
  if (slots.length === 0) return null;
  if (slots.length === 1) {
    return (
      <>
        <span aria-hidden className="h-0.5 w-9 shrink-0 bg-slate-300" />
        <Branch slot={slots[0]} onEdit={onEdit} />
      </>
    );
  }
  return (
    <>
      <span aria-hidden className="h-0.5 w-7 shrink-0 bg-slate-300" />
      <ul className="flex flex-col">
        {slots.map((slot, index) => (
          <li key={`${slot.role}-${slot.node.code ?? index}`} className="relative flex items-center py-2.5">
            <span
              aria-hidden
              className={`absolute left-0 w-0.5 bg-slate-300 ${
                index === 0 ? "top-1/2 bottom-0" : index === slots.length - 1 ? "top-0 h-1/2" : "top-0 bottom-0"
              }`}
            />
            <span aria-hidden className="relative h-0.5 w-7 shrink-0 bg-slate-300">
              <span
                className={`absolute top-1/2 right-0 size-1.5 -translate-y-1/2 rounded-full ${
                  slot.kind === "sire" ? "bg-sky-500" : "bg-rose-500"
                }`}
              />
            </span>
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
      <AnimalCard
        node={slot.node}
        role={slot.role}
        kind={slot.kind}
        editTarget={slot.editTarget}
        editLabel={slot.editLabel}
        onEdit={onEdit}
      />
      <AncestorList slots={slot.next} onEdit={onEdit} />
    </div>
  );
}

function AnimalCard({
  node,
  role,
  kind = "sire",
  emphasis = false,
  editTarget,
  editLabel,
  onEdit,
}: {
  node: PedigreeNode;
  role: string;
  kind?: "self" | "sire" | "dam" | "offspring";
  emphasis?: boolean;
  editTarget?: string;
  editLabel?: string;
  onEdit?: (target: string) => void;
}) {
  const known = Boolean(node.code);
  const title = known ? (node.name ?? node.code) : "Not linked";
  const showCode = Boolean(node.code && node.name && node.name !== node.code);

  const badgeTone = emphasis
    ? "bg-primary text-primary-foreground"
    : kind === "offspring"
      ? "bg-violet-500/12 text-violet-800 ring-1 ring-violet-500/20"
      : kind === "sire"
        ? "bg-sky-500/12 text-sky-800 ring-1 ring-sky-500/20"
        : "bg-rose-500/12 text-rose-800 ring-1 ring-rose-500/20";

  const cardSurface = emphasis
    ? "w-54 border-2 border-primary bg-gradient-to-br from-secondary/90 via-white to-secondary/45 shadow-[0_6px_18px_rgba(21,115,71,0.14)]"
    : !known
      ? "w-50 border border-dashed border-slate-300 bg-white/75 backdrop-blur-[1px]"
      : kind === "sire"
        ? "w-50 border border-sky-500/25 bg-white shadow-[0_2px_6px_rgba(15,23,42,0.04)] hover:border-sky-500/50 hover:shadow-md"
        : kind === "dam"
          ? "w-50 border border-rose-500/25 bg-white shadow-[0_2px_6px_rgba(15,23,42,0.04)] hover:border-rose-500/50 hover:shadow-md"
          : "w-48 border border-violet-500/25 bg-white shadow-[0_2px_6px_rgba(15,23,42,0.04)] hover:border-violet-500/50 hover:shadow-md";

  return (
    <div className={`shrink-0 rounded-2xl p-3 transition-shadow ${cardSurface}`} data-pedigree={emphasis ? "self" : undefined}>
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${badgeTone}`}>
          {role}
        </span>
        {node.href ? (
          <Link
            href={node.href}
            className="text-[11px] font-semibold text-primary hover:underline"
            title={`Open ${title}`}
          >
            Profile →
          </Link>
        ) : null}
      </div>

      <div className="mt-2 min-w-0">
        {node.href ? (
          <Link href={node.href} className="block truncate text-sm font-semibold text-foreground hover:text-primary">
            {title}
          </Link>
        ) : (
          <span className={`block truncate text-sm font-semibold ${known ? "text-foreground" : "text-muted-foreground/75 italic"}`}>
            {title}
          </span>
        )}
        {showCode ? (
          <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">{node.code}</span>
        ) : known && node.code ? (
          <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">ID · {node.code}</span>
        ) : (
          <span className="mt-0.5 block text-[11px] text-muted-foreground/70">Parent not recorded</span>
        )}
      </div>

      {node.repeat ? (
        <span className="mt-2 inline-flex items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
          Repeat ancestor in line
        </span>
      ) : null}

      {editTarget && onEdit ? (
        <div className="mt-2.5 border-t border-border/60 pt-2">
          <button
            type="button"
            onClick={() => onEdit(editTarget)}
            className="inline-flex h-6 items-center rounded-md bg-secondary/85 px-2 text-[11px] font-semibold text-primary transition hover:bg-secondary"
          >
            {editLabel ?? "Set parents"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
