"use client";

import { useActionState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { generateIotApiKey, type IotKeyState } from "@/app/(farm)/settings/actions";

const initial: IotKeyState = {};

export function IotKeyPanel({
  farmSlug,
  hasKey,
}: {
  farmSlug: string;
  hasKey: boolean;
}) {
  const [state, action, pending] = useActionState(generateIotApiKey, initial);

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Connect automated milking parlours, digital weighing scales, or UHF RFID readers to{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">POST /api/iot/ingest</code> using headers{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">X-Farm-Slug: {farmSlug}</code> and{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">X-API-Key</code>.
      </p>

      {state.error ? (
        <p role="alert" className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">
          {state.error}
        </p>
      ) : null}

      {state.apiKey ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-950">
          <p className="font-semibold">Copy your new IoT API key now — it is shown only once:</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-white px-2.5 py-2 font-mono text-[11px]">{state.apiKey}</code>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(state.apiKey ?? "")}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-emerald-600/30 bg-white px-2.5 text-xs font-medium text-emerald-900 hover:bg-emerald-50"
            >
              <Copy className="size-3.5" />
              Copy
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Status: <span className="font-medium text-foreground">{hasKey ? "Active key configured (SHA-256 stored)" : "Not generated yet"}</span>
        </p>
      )}

      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-white px-4 text-xs font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
        >
          <KeyRound className="size-3.5" />
          {pending ? "Generating…" : hasKey ? "Rotate IoT API key" : "Generate IoT API key"}
        </button>
      </form>
    </div>
  );
}
