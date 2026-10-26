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
        className="grid size-8 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary ring-1 ring-primary/20 transition hover:bg-primary/25"
      >
        {initials}
      </button>
      {open ? (
        <div role="menu" className="absolute top-full right-0 z-30 mt-2 w-52 rounded-2xl border border-border bg-card p-1.5 shadow-xl">
          <div className="border-b border-border/60 px-3 py-2">
            <p className="truncate text-sm font-semibold">{userName}</p>
            <p className="text-xs capitalize text-muted-foreground">{role.replaceAll("_", " ")}</p>
          </div>
          <Link
            role="menuitem"
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition hover:bg-muted"
          >
            <User className="size-4 text-muted-foreground" />
            Profile
          </Link>
          {logout}
        </div>
      ) : null}
    </div>
  );
}
