"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { FarmNav } from "@/components/farm-nav";

export function FarmDrawer({
  farmName,
  userName,
  role,
  initials,
  showTeam,
  showAudit,
  showHealth,
  showSemen,
  showGenetics,
  signOut,
}: {
  farmName: string;
  userName: string;
  role: string;
  initials: string;
  showTeam: boolean;
  showAudit: boolean;
  showHealth: boolean;
  showSemen: boolean;
  showGenetics: boolean;
  signOut: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    dialogRef.current?.close();
    setOpen(false);
  }, [pathname]);

  function show() {
    dialogRef.current?.showModal();
    setOpen(true);
  }

  function hide() {
    dialogRef.current?.close();
    setOpen(false);
  }

  function onDialogClick(event: React.MouseEvent<HTMLDialogElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (!inside) hide();
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-card transition hover:bg-muted md:hidden"
        aria-expanded={open}
        aria-label="Open menu"
      >
        <Menu className="size-4" />
      </button>
      <dialog ref={dialogRef} className="nav-drawer backdrop:bg-black/50 backdrop:backdrop-blur-[2px]" aria-label="Farm menu" onClick={onDialogClick} onClose={() => setOpen(false)}>
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-xs font-semibold text-white">{initials}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white">{userName}</span>
                <span className="block truncate text-xs text-zinc-400">
                  {farmName} · {role.replaceAll("_", " ")}
                </span>
              </span>
            </div>
            <button type="button" onClick={hide} className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-white/[0.08] hover:text-white" aria-label="Close menu">
              <X className="size-4" />
            </button>
          </div>
          <FarmNav showTeam={showTeam} showAudit={showAudit} showHealth={showHealth} showSemen={showSemen} showGenetics={showGenetics} variant="drawer" />
          <div className="mt-auto border-t border-white/[0.08] px-3 py-3">{signOut}</div>
        </div>
      </dialog>
    </>
  );
}
