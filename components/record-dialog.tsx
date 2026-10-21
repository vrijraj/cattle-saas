"use client";

import { useEffect, useId, useRef } from "react";
import { DialogPortalContext } from "@/components/dialog-portal";
import { Notice } from "@/components/workspace";

export function RecordDialog({
  title,
  button,
  notice,
  open = false,
  children,
}: {
  title: string;
  button: string;
  notice?: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) dialogRef.current?.showModal();
  }, [open]);

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        {button}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-auto w-[min(36rem,calc(100%-2rem))] overflow-visible rounded-2xl border border-border bg-card text-foreground shadow-xl backdrop:bg-[#1c2430]/40"
      >
        <DialogPortalContext.Provider value={dialogRef}>
          <div className="max-h-[min(40rem,calc(100dvh-2rem))] overflow-y-auto p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              <button type="button" onClick={close} className="inline-flex h-9 items-center rounded-full px-3 text-sm text-muted-foreground hover:bg-muted">
                Close
              </button>
            </div>
            {notice ? (
              <div className="mt-4">
                <Notice tone="danger">{notice}</Notice>
              </div>
            ) : null}
            <div className="mt-5">{children}</div>
          </div>
        </DialogPortalContext.Provider>
      </dialog>
    </>
  );
}
