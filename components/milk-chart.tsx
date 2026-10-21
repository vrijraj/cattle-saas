"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { formatDisplayDate } from "@/lib/dates";

type Point = { date: string; litres: number };

const plotHeight = 96;

export function MilkChart({ points }: { points: Point[] }) {
  const plot = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(0);

  useLayoutEffect(() => {
    const node = plot.current;
    if (!node) return;
    const measure = () => setPlotWidth(Math.max(160, Math.round(node.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (points.length === 0) return null;
  const ordered = [...points].sort((left, right) => left.date.localeCompare(right.date));
  const peak = Math.max(...ordered.map((point) => point.litres));
  const low = Math.min(...ordered.map((point) => point.litres));
  const ceiling = axisCeiling(peak);
  const ticks = axisTicks(ceiling);
  const width = plotWidth || 160;
  const xAt = (index: number) => xFor(ordered, index, width);
  const yAt = (litres: number) => plotHeight - (litres / ceiling) * plotHeight;
  const values = spacedIndexes(ordered.length, xAt, 52);
  const dates = spacedIndexes(ordered.length, xAt, 58);
  const summary =
    ordered.length === 1
      ? `${ordered[0].litres.toFixed(1)} litres on ${formatLabel(ordered[0].date)}.`
      : `Daily milk from ${formatLabel(ordered[0].date)} to ${formatLabel(ordered[ordered.length - 1].date)}, between ${low.toFixed(1)} and ${peak.toFixed(1)} litres.`;

  return (
    <div className="mt-3 flex gap-2">
      <div className="flex w-11 shrink-0 flex-col">
        <div className="h-5" />
        <div className="relative text-[11px] leading-none text-muted-foreground" style={{ height: plotHeight }}>
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: yAt(tick) }}>
              {tick === ceiling ? `${tick} L` : tick}
            </span>
          ))}
        </div>
      </div>
      <div ref={plot} className="min-w-0 flex-1">
        <div className="relative h-5">
          {plotWidth > 0
            ? values.map((index) => (
                <span
                  key={`value-${ordered[index].date}-${index}`}
                  className="absolute top-0 whitespace-nowrap text-xs font-semibold leading-none text-foreground"
                  style={labelStyle(xAt(index), width, index, ordered.length)}
                >
                  {ordered[index].litres.toFixed(1)} L
                </span>
              ))
            : null}
        </div>
        <svg viewBox={`0 0 ${width} ${plotHeight}`} className="block w-full" style={{ height: plotHeight }} role="img" aria-label={summary}>
          {ticks.map((tick) => (
            <line key={tick} x1={0} x2={width} y1={yAt(tick)} y2={yAt(tick)} stroke="var(--border)" strokeWidth={tick === 0 ? 1.5 : 1} />
          ))}
          <polygon points={areaPoints(ordered, xAt, yAt)} fill="var(--primary)" opacity="0.12" />
          <polyline points={linePoints(ordered, xAt, yAt)} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {ordered.map((point, index) => {
            const gap = index === 0 ? width : xAt(index) - xAt(index - 1);
            if (gap < 10 && index !== ordered.length - 1) return null;
            return <circle key={`${point.date}-${index}`} cx={xAt(index)} cy={yAt(point.litres)} r="3" fill="var(--card)" stroke="var(--primary)" strokeWidth="2" />;
          })}
        </svg>
        <div className="relative mt-2 h-4">
          {plotWidth > 0
            ? dates.map((index) => (
                <span
                  key={`date-${ordered[index].date}-${index}`}
                  className="absolute top-0 whitespace-nowrap text-xs leading-none text-muted-foreground"
                  style={labelStyle(xAt(index), width, index, ordered.length)}
                >
                  {axisDate(ordered[index].date)}
                </span>
              ))
            : null}
        </div>
      </div>
    </div>
  );
}

function labelStyle(x: number, width: number, index: number, count: number) {
  const atStart = index === 0 || x < 36;
  const atEnd = index === count - 1 || x > width - 36;
  if (atStart && !atEnd) return { left: 0 };
  if (atEnd && !atStart) return { right: 0 };
  return { left: x, transform: "translateX(-50%)" };
}

function xFor(points: Point[], index: number, width: number) {
  if (points.length === 1) return width / 2;
  const start = dayValue(points[0].date);
  const end = dayValue(points[points.length - 1].date);
  const here = dayValue(points[index].date);
  if (start === null || end === null || here === null || end === start) return (index / (points.length - 1)) * width;
  return ((here - start) / (end - start)) * width;
}

function linePoints(points: Point[], xAt: (index: number) => number, yAt: (litres: number) => number) {
  return points.map((point, index) => `${xAt(index)},${yAt(point.litres)}`).join(" ");
}

function areaPoints(points: Point[], xAt: (index: number) => number, yAt: (litres: number) => number) {
  const last = points.length - 1;
  return [`${xAt(0)},${yAt(0)}`, ...points.map((point, index) => `${xAt(index)},${yAt(point.litres)}`), `${xAt(last)},${yAt(0)}`].join(" ");
}

function axisCeiling(peak: number) {
  const padded = Math.max(peak * 1.15, 4);
  const step = padded <= 8 ? 2 : padded <= 20 ? 5 : padded <= 50 ? 10 : 20;
  return Math.ceil(padded / step) * step;
}

function axisTicks(ceiling: number) {
  const step = ceiling <= 8 ? 2 : ceiling <= 20 ? 5 : ceiling <= 50 ? 10 : 20;
  const ticks = [];
  for (let tick = 0; tick <= ceiling; tick += step) ticks.push(tick);
  return ticks;
}

function dayValue(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function formatLabel(date: string) {
  return dayValue(date) === null ? date : formatDisplayDate(date);
}

function axisDate(date: string) {
  const label = formatLabel(date);
  const parts = label.split(" ");
  if (parts.length >= 3 && /^\d{4}$/.test(parts[2])) return `${parts[0]} ${parts[1]}`;
  return label;
}

function spacedIndexes(count: number, xAt: (index: number) => number, minGap: number) {
  if (count <= 1) return [0];
  const chosen: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const last = chosen.at(-1);
    const isEnd = index === count - 1;
    if (last === undefined) {
      chosen.push(index);
      continue;
    }
    if (xAt(index) - xAt(last) < minGap) {
      if (isEnd) chosen[chosen.length - 1] = index;
      continue;
    }
    if (!isEnd && xAt(count - 1) - xAt(index) < minGap) continue;
    chosen.push(index);
  }
  return chosen;
}
