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
  signOut,
}: {
  farmName: string;
  userName: string;
  role: string;
  initials: string;
  showTeam: boolean;
  showAudit: boolean;
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
        className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-card md:hidden"
        aria-expanded={open}
        aria-label="Open menu"
      >
        <Menu className="size-4" />
      </button>
      <dialog ref={dialogRef} className="nav-drawer" aria-label="Farm menu" onClick={onDialogClick} onClose={() => setOpen(false)}>
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{initials}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{userName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {farmName} · {role}
                </span>
              </span>
            </div>
            <button type="button" onClick={hide} className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-muted" aria-label="Close menu">
              <X className="size-4" />
            </button>
          </div>
          <FarmNav showTeam={showTeam} showAudit={showAudit} variant="drawer" />
          <div className="mt-auto border-t border-border px-3 py-3">{signOut}</div>
        </div>
      </dialog>
    </>
  );
}
