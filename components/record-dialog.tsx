"use client";

import { useEffect, useId, useRef } from "react";
import { DialogPortalContext } from "@/components/dialog-portal";
import { Notice } from "@/components/workspace";

export function RecordDialog({
  title,
  button,
  notice,
  open = false,
  quiet = false,
  hiddenButton = false,
  onDismiss,
  children,
}: {
  title: string;
  button: string;
  notice?: string;
  open?: boolean;
  quiet?: boolean;
  hiddenButton?: boolean;
  onDismiss?: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  function show() {
    const top = window.scrollY;
    dialogRef.current?.showModal();
    window.scrollTo({ top });
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      const top = window.scrollY;
      dialog.showModal();
      window.scrollTo({ top });
    } else if (dialog.open) dialog.close();
  }, [open]);

  function close() {
    dialogRef.current?.close();
    onDismiss?.();
  }

  return (
    <>
      {hiddenButton ? null : (
        <button
          type="button"
          onClick={show}
          className={
            quiet
              ? "inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/20 bg-secondary/75 px-3 text-xs font-semibold text-primary transition hover:border-primary/35 hover:bg-secondary active:scale-[0.98]"
              : "inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs transition hover:bg-[#0f5c34] active:scale-[0.99]"
          }
        >
          {button}
        </button>
      )}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-auto w-[min(36rem,calc(100%-2rem))] overflow-visible rounded-2xl border border-border bg-card text-foreground shadow-2xl backdrop:bg-[#0f1f17]/45 backdrop:backdrop-blur-[2px]"
      >
        <DialogPortalContext.Provider value={dialogRef}>
          <div className="max-h-[min(42rem,calc(100dvh-2rem))] overflow-y-auto overscroll-contain">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/75 bg-card/95 px-5 py-4 backdrop-blur-sm">
              <h2 id={titleId} className="text-base font-semibold tracking-tight sm:text-lg">
                {title}
              </h2>
              <button
                type="button"
                onClick={close}
                className="inline-flex h-8 items-center rounded-full border border-border/80 bg-muted/60 px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="p-5">
              {notice ? (
                <div className="mb-4">
                  <Notice tone="danger">{notice}</Notice>
                </div>
              ) : null}
              {children}
            </div>
          </div>
        </DialogPortalContext.Provider>
      </dialog>
    </>
  );
}
