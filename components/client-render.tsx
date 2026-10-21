"use client";

import { useSyncExternalStore, type ReactNode } from "react";

function subscribe() {
  return () => {};
}

export function ClientRender({ children }: { children: ReactNode }) {
  const onClient = useSyncExternalStore(subscribe, () => true, () => false);
  if (!onClient) return <div className="min-h-screen" />;
  return children;
}
