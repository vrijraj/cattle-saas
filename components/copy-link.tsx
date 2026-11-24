"use client";

import { useEffect, useRef, useState } from "react";

export function CopyLink({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(href);
      } else {
        throw new Error("no clipboard");
      }
    } catch {
      inputRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex min-w-56 items-center gap-2">
      <input
        ref={inputRef}
        readOnly
        value={href}
        onFocus={(event) => event.currentTarget.select()}
        className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs"
      />
      <button type="button" className="text-sm font-medium text-primary" onClick={() => void copy()}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
