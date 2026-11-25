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

export function ScreenTransition({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ViewTransition name="screen" share="screen" enter="screen" exit="screen" default="none" update="none">
      <div className={`min-h-dvh print:h-auto print:min-h-0 ${className}`}>{children}</div>
    </ViewTransition>
  );
}

function contentKey(pathname: string, search: URLSearchParams) {
  const params = new URLSearchParams(search);
  params.delete("tab");
  const value = params.toString();
  return value ? `${pathname}?${value}` : pathname;
}

function TransitionFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();

  return (
    <ViewTransition key={contentKey(pathname, search)} name="page-content" enter="none" exit="none" share="page" default="none" update="none">
      <div className="flex flex-1 min-w-0 flex-col">{children}</div>
    </ViewTransition>
  );
}
