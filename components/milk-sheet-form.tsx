"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/workspace";

export type MilkSheetCow = {
  id: string;
  code: string;
  name: string | null;
  locationId: string | null;
  locationName: string | null;
  morningLitres: string;
  eveningLitres: string;
  fatPercent: string;
  snfPercent: string;
  cmtScore: string;
  yesterdayTotal: number | null;
  withdrawalUntil: string | null;
  hasExisting: boolean;
};

export function MilkSheetForm({
  selected,
  selectedLabel,
  cows,
  sheds,
  canSave,
  pricePerLitre,
  action,
  onClearRow,
}: {
  selected: string;
  selectedLabel: string;
  cows: MilkSheetCow[];
  sheds: { id: string; name: string }[];
  canSave: boolean;
  pricePerLitre: number | null;
  action: (formData: FormData) => void | Promise<void>;
  onClearRow: (formData: FormData) => void | Promise<void>;
}) {
  const [shedFilter, setShedFilter] = useState("");
  const [showQuality, setShowQuality] = useState(
    cows.some((c) => Boolean(c.fatPercent || c.snfPercent || c.cmtScore)),
  );
  const [values, setValues] = useState<Record<string, { morning: string; evening: string }>>(() =>
    Object.fromEntries(cows.map((c) => [c.id, { morning: c.morningLitres, evening: c.eveningLitres }])),
  );

  const visibleCows = useMemo(
    () => (shedFilter ? cows.filter((c) => c.locationId === shedFilter) : cows),
    [cows, shedFilter],
  );

  const totals = useMemo(() => {
    let litres = 0;
    let entered = 0;
    for (const cow of cows) {
      const entry = values[cow.id];
      const m = entry?.morning.trim();
      const e = entry?.evening.trim();
      if (m || e) {
        entered += 1;
        litres += (m ? Number(m) || 0 : 0) + (e ? Number(e) || 0 : 0);
      }
    }
    return { litres, entered };
  }, [cows, values]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>, index: number, col: "morning" | "evening") {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const nextCow = visibleCows[index + 1];
    if (!nextCow) return;
    const selector = `input[name="${col}-${nextCow.id}"]`;
    const nextEl = document.querySelector<HTMLInputElement>(selector);
    nextEl?.focus();
    nextEl?.select();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/80 bg-card px-4 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {sheds.length > 0 ? (
            <label className="flex items-center gap-2">
              <span className="font-medium text-muted-foreground">Shed:</span>
              <select
                value={shedFilter}
                onChange={(e) => setShedFilter(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground"
              >
                <option value="">All sheds ({cows.length})</option>
                {sheds.map((shed) => (
                  <option key={shed.id} value={shed.id}>
                    {shed.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => setShowQuality((prev) => !prev)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2.5 font-medium text-foreground transition hover:bg-muted"
          >
            {showQuality ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            Fat% / SNF% / CMT
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 tabular-nums">
          <span className="text-muted-foreground">
            Live sheet: <strong className="text-foreground">{totals.litres.toFixed(1)} L</strong> ({totals.entered}/{cows.length})
          </span>
          {pricePerLitre !== null ? (
            <span className="font-semibold text-emerald-700">
              ≈ ₹{Math.round(totals.litres * pricePerLitre).toLocaleString("en-IN")}
            </span>
          ) : null}
        </div>
      </div>

      <form
        action={action}
        className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border/85 bg-card shadow-[0_1px_3px_rgba(15,35,24,0.04)]"
      >
        <input type="hidden" name="recordedOn" value={selected} />
        {visibleCows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {cows.length === 0 ? "No lactating animals on the farm." : "No lactating cows in this shed."}
          </p>
        ) : null}
        {visibleCows.length > 0 ? (
          <div className="hidden grid-cols-[7.5rem_minmax(0,1fr)_8.5rem_8.5rem_6.5rem] gap-3 border-b border-border/80 bg-muted/60 px-4 py-3 text-xs font-semibold text-muted-foreground lg:grid">
            <span>Cattle ID</span>
            <span>Name &amp; yesterday</span>
            <span>Morning (L)</span>
            <span>Evening (L)</span>
            <span className="text-right">Total</span>
          </div>
        ) : null}
        <ul className="divide-y divide-border/70">
          {visibleCows.map((cow, index) => {
            const entry = values[cow.id] ?? { morning: "", evening: "" };
            const hasInput = Boolean(entry.morning.trim() || entry.evening.trim());
            const sum = (entry.morning.trim() ? Number(entry.morning) || 0 : 0) + (entry.evening.trim() ? Number(entry.evening) || 0 : 0);
            return (
              <li
                key={cow.id}
                className={`space-y-2.5 p-4 transition-colors hover:bg-muted/30 lg:py-3 ${cow.withdrawalUntil ? "bg-danger/[0.03]" : ""}`}
              >
                <div className="grid grid-cols-2 items-end gap-3 lg:grid-cols-[7.5rem_minmax(0,1fr)_8.5rem_8.5rem_6.5rem] lg:items-center">
                  <div className="col-span-2 flex items-center justify-between gap-3 lg:contents">
                    <Link href={`/animals/${cow.code}?tab=milk`} className="min-w-0 hover:underline lg:contents">
                      <span className="hidden font-mono text-xs font-semibold text-muted-foreground lg:block">{cow.code}</span>
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-foreground">{cow.name ?? "Unnamed"}</span>
                        {cow.locationName ? <span className="text-[11px] text-muted-foreground">· {cow.locationName}</span> : null}
                        {cow.yesterdayTotal !== null ? (
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                            Prev {cow.yesterdayTotal.toFixed(1)} L
                          </span>
                        ) : null}
                        {cow.withdrawalUntil ? <Pill tone="warn">Withdrawal until {cow.withdrawalUntil}</Pill> : null}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground lg:hidden">{cow.code}</span>
                    </Link>
                    <div className="flex shrink-0 items-center justify-end gap-1.5 text-right text-sm font-semibold tabular-nums lg:order-1">
                      <span>{hasInput ? `${sum.toFixed(1)} L` : <span className="text-xs font-normal text-muted-foreground">Not entered</span>}</span>
                      {canSave && cow.hasExisting ? (
                        <button
                          type="submit"
                          formAction={onClearRow}
                          name="clearAnimalId"
                          value={cow.id}
                          title="Void this day's milk entry"
                          className="grid size-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-danger/10 hover:text-danger"
                        >
                          <RotateCcw className="size-3.5" />
                          <span className="sr-only">Clear {cow.code}</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                    <span className="lg:sr-only">Morning (L)</span>
                    <input
                      name={`morning-${cow.id}`}
                      type="number"
                      min={0}
                      max={80}
                      step="0.1"
                      inputMode="decimal"
                      placeholder="0.0"
                      value={entry.morning}
                      onChange={(e) => setValues((prev) => ({ ...prev, [cow.id]: { ...entry, morning: e.target.value } }))}
                      onKeyDown={(e) => handleKeyDown(e, index, "morning")}
                      disabled={!canSave}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm tabular-nums text-foreground transition outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 lg:h-10"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                    <span className="lg:sr-only">Evening (L)</span>
                    <input
                      name={`evening-${cow.id}`}
                      type="number"
                      min={0}
                      max={80}
                      step="0.1"
                      inputMode="decimal"
                      placeholder="0.0"
                      value={entry.evening}
                      onChange={(e) => setValues((prev) => ({ ...prev, [cow.id]: { ...entry, evening: e.target.value } }))}
                      onKeyDown={(e) => handleKeyDown(e, index, "evening")}
                      disabled={!canSave}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm tabular-nums text-foreground transition outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 lg:h-10"
                    />
                  </label>
                </div>

                {showQuality ? (
                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-2.5 text-xs lg:ml-[7.5rem]">
                    <label className="grid gap-1 text-muted-foreground">
                      <span>Fat (%)</span>
                      <input
                        name={`fat-${cow.id}`}
                        type="number"
                        min={0}
                        max={15}
                        step="0.1"
                        inputMode="decimal"
                        defaultValue={cow.fatPercent}
                        placeholder="e.g. 4.8"
                        disabled={!canSave}
                        className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                      />
                    </label>
                    <label className="grid gap-1 text-muted-foreground">
                      <span>SNF (%)</span>
                      <input
                        name={`snf-${cow.id}`}
                        type="number"
                        min={0}
                        max={15}
                        step="0.1"
                        inputMode="decimal"
                        defaultValue={cow.snfPercent}
                        placeholder="e.g. 8.7"
                        disabled={!canSave}
                        className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                      />
                    </label>
                    <label className="grid gap-1 text-muted-foreground">
                      <span>CMT mastitis</span>
                      <select
                        name={`cmt-${cow.id}`}
                        defaultValue={cow.cmtScore}
                        disabled={!canSave}
                        className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                      >
                        <option value="">Not tested</option>
                        <option value="negative">Negative</option>
                        <option value="trace">Trace</option>
                        <option value="1+">1+ (Subclinical)</option>
                        <option value="2+">2+ (Moderate)</option>
                        <option value="3+">3+ (Severe)</option>
                      </select>
                    </label>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {canSave && visibleCows.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/80 bg-muted/25 px-4 py-3">
            <span className="text-xs text-muted-foreground">
              Press Enter to move down a column. {totals.entered} of {cows.length} cows entered ({totals.litres.toFixed(1)} L).
            </span>
            <Button type="submit" className="h-10 rounded-full px-5 font-semibold shadow-xs">
              Save {selectedLabel}
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
