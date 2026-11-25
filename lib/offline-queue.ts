export type OfflineRecord =
  | {
      id: string;
      kind: "milk";
      animalCode: string;
      recordedOn: string;
      morningLitres?: number;
      eveningLitres?: number;
      queuedAt: string;
    }
  | {
      id: string;
      kind: "weight";
      animalCode: string;
      weighedOn: string;
      kilograms: number;
      note?: string;
      queuedAt: string;
    }
  | {
      id: string;
      kind: "heat";
      animalCode: string;
      observedOn: string;
      signs?: string;
      note?: string;
      queuedAt: string;
    };

const STORAGE_KEY = "farm-offline-queue-v1";

export function readOfflineQueue(): OfflineRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineRecord[]) : [];
  } catch {
    return [];
  }
}

export function writeOfflineQueue(items: OfflineRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event("farm-offline-queue-change"));
  } catch {
    // ignore quota error
  }
}

export function enqueueOfflineRecord(record: OfflineRecord) {
  const next = [...readOfflineQueue(), record];
  writeOfflineQueue(next);
  return next;
}

export async function flushOfflineQueue(): Promise<{ synced: number; remaining: number; errors: string[] }> {
  const items = readOfflineQueue();
  if (items.length === 0) return { synced: 0, remaining: 0, errors: [] };

  const res = await fetch("/api/offline-sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    return { synced: 0, remaining: items.length, errors: [`Sync HTTP ${res.status}`] };
  }
  const data = (await res.json()) as { syncedIds?: string[]; errors?: string[] };
  const done = new Set(data.syncedIds ?? []);
  const remaining = items.filter((item) => !done.has(item.id));
  writeOfflineQueue(remaining);
  return { synced: done.size, remaining: remaining.length, errors: data.errors ?? [] };
}
