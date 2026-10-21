"use client";

import { useState } from "react";

export function CopyLink({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex min-w-56 items-center gap-2">
      <input
        readOnly
        value={href}
        onFocus={(event) => event.currentTarget.select()}
        className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs"
      />
      <button
        type="button"
        className="text-sm font-medium text-primary"
        onClick={async () => {
          await navigator.clipboard.writeText(href);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
