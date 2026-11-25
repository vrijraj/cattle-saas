"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Building2, Check, Languages, User } from "lucide-react";
import { switchFarm, updateLocale } from "@/app/(farm)/profile/actions";
import { LOCALES } from "@/lib/i18n";

export function AccountMenu({
  farmName,
  currentFarmId,
  locale = "en",
  farms = [],
  userName,
  role,
  initials,
  logout,
}: {
  farmName: string;
  currentFarmId: string;
  locale?: string;
  farms?: { id: string; name: string; slug: string; roles: string[] }[];
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
        <div role="menu" className="absolute top-full right-0 z-30 mt-2 w-60 rounded-2xl border border-border bg-card p-1.5 shadow-xl">
          <div className="border-b border-border/60 px-3 py-2">
            <p className="truncate text-sm font-semibold">{userName}</p>
            <p className="truncate text-xs text-muted-foreground">{farmName}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{role}</p>
          </div>
          {farms.length > 1 ? (
            <div className="border-b border-border/60 py-1.5">
              <p className="px-3 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Switch farm</p>
              {farms.map((item) => {
                const active = item.id === currentFarmId;
                return (
                  <form key={item.id} action={switchFarm}>
                    <input type="hidden" name="farmId" value={item.id} />
                    <button
                      type="submit"
                      role="menuitem"
                      disabled={active}
                      onClick={() => setOpen(false)}
                      className={`flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-medium transition ${
                        active ? "bg-secondary/70 text-secondary-foreground" : "hover:bg-muted"
                      }`}
                    >
                      <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      {active ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
                    </button>
                  </form>
                );
              })}
            </div>
          ) : null}
          <div className="border-b border-border/60 py-1.5">
            <p className="flex items-center gap-1.5 px-3 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              <Languages className="size-3" />
              Language
            </p>
            <div className="grid grid-cols-2 gap-1 px-2">
              {LOCALES.map((item) => {
                const active = locale === item.code;
                return (
                  <form key={item.code} action={updateLocale}>
                    <input type="hidden" name="locale" value={item.code} />
                    <button
                      type="submit"
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className={`h-8 w-full rounded-lg px-2 text-xs font-medium transition ${
                        active ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground hover:bg-muted"
                      }`}
                    >
                      {item.native}
                    </button>
                  </form>
                );
              })}
            </div>
          </div>
          <Link
            role="menuitem"
            href="/profile"
            onClick={() => setOpen(false)}
            className="mt-0.5 flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition hover:bg-muted"
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
