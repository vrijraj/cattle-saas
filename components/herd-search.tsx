"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type Hit = {
  code: string;
  name: string | null;
  earTag: string | null;
  breedName: string | null;
  locationName: string | null;
};

export function HerdSearch({ variant = "header" }: { variant?: "header" | "field" }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    const term = value.trim();
    if (!term) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState("loading");
      try {
        const response = await fetch(`/api/herd-search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("search failed");
        const body = (await response.json()) as { results?: Hit[] };
        setResults(body.results ?? []);
        setState("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState("error");
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value]);

  function open() {
    setValue("");
    setResults([]);
    setState("idle");
    dialogRef.current?.showModal();
    inputRef.current?.focus();
  }

  function close() {
    dialogRef.current?.close();
  }

  function openHerd(event: FormEvent) {
    event.preventDefault();
    const term = value.trim();
    close();
    router.push(term ? `/animals?q=${encodeURIComponent(term)}` : "/animals");
  }

  function openAnimal(code: string) {
    close();
    router.push(`/animals/${code}`);
  }

  const term = value.trim();

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={
          variant === "header"
            ? "flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-muted px-3 text-left text-sm text-muted-foreground sm:h-11 sm:px-4 md:mx-auto md:max-w-xl"
            : "flex h-10 items-center gap-2 rounded-full bg-muted px-3 text-left text-sm text-muted-foreground lg:w-80"
        }
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Search cattle</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="mt-[8vh] mb-auto w-[min(32rem,calc(100%-1.5rem))] overflow-visible rounded-2xl border border-border bg-card text-foreground shadow-xl backdrop:bg-[#1c2430]/40"
      >
        <form onSubmit={openHerd} className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="text-lg font-semibold">
              Search cattle
            </h2>
            <button type="button" onClick={close} className="inline-flex h-9 items-center rounded-full px-3 text-sm text-muted-foreground hover:bg-muted">
              Close
            </button>
          </div>
          <label className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-border bg-muted px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                if (!event.target.value.trim()) {
                  setResults([]);
                  setState("idle");
                }
              }}
              placeholder="Name, code, ear tag, shed, or sire"
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </label>
          <div className="mt-3 min-h-24">
            {state === "idle" ? <p className="px-1 py-6 text-center text-sm text-muted-foreground">Type a name or code to search the herd.</p> : null}
            {state === "loading" ? <p className="px-1 py-6 text-center text-sm text-muted-foreground">Searching…</p> : null}
            {state === "error" ? <p className="px-1 py-6 text-center text-sm text-danger">Search is unavailable. Try again.</p> : null}
            {state === "ready" && results.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">No cattle match “{term}”.</p>
            ) : null}
            {state === "ready" && results.length > 0 ? (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                {results.map((animal) => (
                  <li key={animal.code}>
                    <button type="button" onClick={() => openAnimal(animal.code)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-sm font-semibold text-primary">
                        {(animal.name ?? animal.code).slice(0, 1)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{animal.name ?? "Unnamed"}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {[animal.code, animal.breedName, animal.locationName ?? "Unassigned"].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
              {term ? "Show in herd" : "Open herd"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
