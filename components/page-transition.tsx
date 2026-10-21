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

function TransitionFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();

  return (
    <ViewTransition key={`${pathname}?${search.toString()}`} name="page-content" enter="page" exit="page" share="page" default="none">
      {children}
    </ViewTransition>
  );
}
