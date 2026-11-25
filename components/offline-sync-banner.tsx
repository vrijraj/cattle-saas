"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CloudOff, RefreshCw, Wifi } from "lucide-react";
import { enqueueOfflineRecord, flushOfflineQueue, readOfflineQueue, type OfflineRecord } from "@/lib/offline-queue";

export function OfflineSyncBanner() {
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<OfflineRecord[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [showQuickForm, setShowQuickForm] = useState(false);

  const runSync = useCallback(async () => {
    const current = readOfflineQueue();
    if (current.length === 0) return;
    setSyncing(true);
    try {
      const result = await flushOfflineQueue();
      setQueue(readOfflineQueue());
      if (result.synced > 0) {
        setStatus(`Synced ${result.synced} offline record${result.synced === 1 ? "" : "s"} to farm database.`);
      } else if (result.errors.length > 0) {
        setStatus(result.errors[0]);
      }
    } catch {
      setStatus("Could not reach server to sync yet.");
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine);
      setQueue(readOfflineQueue());
    };
    const handleOnline = () => {
      refresh();
      void runSync();
    };
    refresh();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", refresh);
    window.addEventListener("farm-offline-queue-change", refresh);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("farm-offline-queue-change", refresh);
    };
  }, [runSync]);

  function onQueueSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const kind = String(fd.get("kind") ?? "milk");
    const animalCode = String(fd.get("animalCode") ?? "").trim();
    const today = new Date().toISOString().slice(0, 10);
    if (!animalCode) return;

    if (kind === "milk") {
      const m = Number(fd.get("morningLitres") || 0);
      const ev = Number(fd.get("eveningLitres") || 0);
      if (m <= 0 && ev <= 0) return;
      enqueueOfflineRecord({
        id: crypto.randomUUID(),
        kind: "milk",
        animalCode,
        recordedOn: today,
        morningLitres: m > 0 ? m : undefined,
        eveningLitres: ev > 0 ? ev : undefined,
        queuedAt: new Date().toISOString(),
      });
    } else if (kind === "weight") {
      const kg = Number(fd.get("kilograms") || 0);
      if (kg <= 0) return;
      enqueueOfflineRecord({
        id: crypto.randomUUID(),
        kind: "weight",
        animalCode,
        weighedOn: today,
        kilograms: kg,
        queuedAt: new Date().toISOString(),
      });
    } else {
      enqueueOfflineRecord({
        id: crypto.randomUUID(),
        kind: "heat",
        animalCode,
        observedOn: today,
        signs: "standing",
        queuedAt: new Date().toISOString(),
      });
    }
    e.currentTarget.reset();
    setQueue(readOfflineQueue());
    setStatus("Saved locally on this device — will auto-sync once back online.");
  }

  if (online && queue.length === 0 && !status) return null;

  return (
    <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-950 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          {online ? <Wifi className="size-3.5 text-emerald-700" /> : <CloudOff className="size-3.5 text-amber-700" />}
          <span>
            {!online
              ? `Offline shed mode · ${queue.length} queued`
              : queue.length > 0
                ? `${queue.length} offline shed record${queue.length === 1 ? "" : "s"} waiting to sync`
                : status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!online ? (
            <button
              type="button"
              onClick={() => setShowQuickForm((v) => !v)}
              className="rounded-full border border-amber-600/30 bg-white px-3 py-1 font-semibold hover:bg-amber-50"
            >
              {showQuickForm ? "Hide quick entry" : "+ Queue shed entry"}
            </button>
          ) : null}
          {online && queue.length > 0 ? (
            <button
              type="button"
              disabled={syncing}
              onClick={() => void runSync()}
              className="inline-flex items-center gap-1 rounded-full bg-amber-900 px-3 py-1 font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
            >
              <RefreshCw className={`size-3 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          ) : null}
          {online && queue.length === 0 && status ? (
            <button type="button" onClick={() => setStatus(null)} className="text-amber-800 hover:underline">
              Dismiss
            </button>
          ) : null}
        </div>
      </div>

      {showQuickForm && !online ? (
        <form onSubmit={onQueueSubmit} className="mt-3 grid gap-2 border-t border-amber-500/20 pt-3 sm:grid-cols-5">
          <select name="kind" defaultValue="milk" className="h-8 rounded-lg border border-amber-500/30 bg-white px-2">
            <option value="milk">Milk yield</option>
            <option value="weight">Weight (kg)</option>
            <option value="heat">Heat observed</option>
          </select>
          <input name="animalCode" required placeholder="Animal code (e.g. SGD-GIR-0001)" className="h-8 rounded-lg border border-amber-500/30 bg-white px-2" />
          <input name="morningLitres" type="number" step="0.1" placeholder="AM L / Weight kg" className="h-8 rounded-lg border border-amber-500/30 bg-white px-2" />
          <input name="eveningLitres" type="number" step="0.1" placeholder="PM L (optional)" className="h-8 rounded-lg border border-amber-500/30 bg-white px-2" />
          <button type="submit" className="h-8 rounded-lg bg-amber-900 font-semibold text-white">
            Save offline
          </button>
        </form>
      ) : null}
    </div>
  );
}
