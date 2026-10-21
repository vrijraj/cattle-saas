"use client";

import { Suspense } from "react";
import { ViewTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={children}>
      <TransitionFrame>{children}</TransitionFrame>
    </Suspense>
  );
}

export function ScreenTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition name="screen" share="screen" enter="screen" exit="screen" default="none" update="none">
      <div className="min-h-dvh">{children}</div>
    </ViewTransition>
  );
}

function TransitionFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();

  return (
    <ViewTransition key={`${pathname}?${search.toString()}`} name="page-content" enter="none" exit="none" share="page" default="none" update="none">
      <div className="flex min-h-[calc(100dvh-6.5rem)] min-w-0 flex-col sm:min-h-[calc(100dvh-7rem)] md:min-h-[calc(100dvh-7.5rem)]">{children}</div>
    </ViewTransition>
  );
}
