"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { User } from "lucide-react";

export function AccountMenu({
  userName,
  role,
  initials,
  logout,
}: {
  userName: string;
  role: string;
  initials: string;
  logout: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-1 pl-1 text-left transition hover:bg-muted sm:pr-3"
      >
        <span className="grid size-10 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{initials}</span>
        <span className="hidden sm:block">
          <span className="block text-sm font-medium leading-tight">{userName}</span>
          <span className="block text-xs text-muted-foreground">{role}</span>
        </span>
      </button>
      {open ? (
        <div role="menu" className="absolute top-full right-0 z-30 mt-2 w-44 rounded-xl border border-border bg-card p-1">
          <Link
            role="menuitem"
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-muted"
          >
            <User className="size-4" />
            Profile
          </Link>
          {logout}
        </div>
      ) : null}
    </div>
  );
}
