"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { voidRecord } from "@/app/(farm)/herd/actions";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-8 items-center rounded-lg bg-danger px-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Voiding…" : "Confirm void"}
    </button>
  );
}

export function VoidRecord({
  entity,
  id,
  returnTo,
  restoreStraw = false,
}: {
  entity: string;
  id: string;
  returnTo: string;
  restoreStraw?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex h-8 items-center rounded-lg border border-danger/25 bg-danger/5 px-2.5 text-xs font-medium text-danger transition hover:bg-danger/10"
        >
          Void
        </button>
      </div>
    );
  }

  return (
    <form action={voidRecord} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {restoreStraw ? (
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" name="restoreStraw" />
          Straw unused
        </label>
      ) : null}
      <input
        name="reason"
        required
        autoFocus
        placeholder="Reason to void"
        className="h-8 w-36 rounded-lg border border-border bg-background px-2 text-xs"
      />
      <ConfirmButton />
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="inline-flex h-8 items-center rounded-lg border border-border px-2 text-xs font-medium text-muted-foreground hover:bg-muted"
      >
        Cancel
      </button>
    </form>
  );
}
