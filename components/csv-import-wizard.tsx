"use client";

import { useActionState, useMemo, useState, type ChangeEvent } from "react";
import { Download, Upload } from "lucide-react";
import { validateAnimalImportCsv, validateMilkImportCsv } from "@/lib/csv-import";
import { importAnimalsCsv, importMilkCsv, type CsvImportResult } from "@/app/(farm)/animals/bulk/actions";
import { Button } from "@/components/ui/button";

const ANIMAL_TEMPLATE = `name,breedCode,sex,dob,earTag,rfid,shed,lifeStage,lactation,reproduction,purchasePrice
Ganga,GIR,female,2022-04-15,ET-101,,Milking Shed 1,cow,lactating,open,85000
Nandi,GIR,male,2024-01-10,ET-102,,Calf Pen,calf,not_applicable,not_applicable,`;

const MILK_TEMPLATE = `animalCode,recordedOn,morningLitres,eveningLitres,fatPercent,snfPercent
SGD-GIR-0001,2026-11-24,7.5,6.8,4.9,8.7`;

const initial: CsvImportResult = {};

export function CsvImportWizard({
  canImportAnimals,
  canImportMilk,
}: {
  canImportAnimals: boolean;
  canImportMilk: boolean;
}) {
  const [mode, setMode] = useState<"animals" | "milk">(canImportAnimals ? "animals" : "milk");
  const [csvText, setCsvText] = useState("");
  const [animalState, animalAction, animalPending] = useActionState(importAnimalsCsv, initial);
  const [milkState, milkAction, milkPending] = useActionState(importMilkCsv, initial);

  const preview = useMemo(() => {
    if (!csvText.trim()) return { total: 0, valid: 0, invalid: 0, sampleErrors: [] as string[] };
    if (mode === "animals") {
      const rows = validateAnimalImportCsv(csvText);
      const invalidRows = rows.filter((r) => r.errors.length > 0);
      return {
        total: rows.length,
        valid: rows.length - invalidRows.length,
        invalid: invalidRows.length,
        sampleErrors: invalidRows.slice(0, 6).map((r) => `Line ${r.line}: ${r.errors.join(", ")}`),
      };
    }
    const rows = validateMilkImportCsv(csvText);
    const invalidRows = rows.filter((r) => r.errors.length > 0);
    return {
      total: rows.length,
      valid: rows.length - invalidRows.length,
      invalid: invalidRows.length,
      sampleErrors: invalidRows.slice(0, 6).map((r) => `Line ${r.line}: ${r.errors.join(", ")}`),
    };
  }, [csvText, mode]);

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const content = mode === "animals" ? ANIMAL_TEMPLATE : MILK_TEMPLATE;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = mode === "animals" ? "herd-import-template.csv" : "milk-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const activeState = mode === "animals" ? animalState : milkState;
  const activePending = mode === "animals" ? animalPending : milkPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1 text-xs font-medium">
          {canImportAnimals ? (
            <button
              type="button"
              onClick={() => {
                setMode("animals");
                setCsvText("");
              }}
              className={`rounded-lg px-3 py-1.5 transition ${mode === "animals" ? "bg-white text-foreground shadow-2xs" : "text-muted-foreground"}`}
            >
              Cattle register CSV
            </button>
          ) : null}
          {canImportMilk ? (
            <button
              type="button"
              onClick={() => {
                setMode("milk");
                setCsvText("");
              }}
              className={`rounded-lg px-3 py-1.5 transition ${mode === "milk" ? "bg-white text-foreground shadow-2xs" : "text-muted-foreground"}`}
            >
              Milk yields CSV
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-xs font-medium text-foreground transition hover:bg-muted"
        >
          <Download className="size-3.5" />
          Download {mode === "animals" ? "cattle" : "milk"} template
        </button>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-3.5 py-2 text-xs font-medium hover:bg-muted/60">
            <Upload className="size-3.5" />
            <span>Choose .csv file</span>
            <input type="file" accept=".csv,text/csv" onChange={onFileChange} className="sr-only" />
          </label>
          <span className="text-xs text-muted-foreground">Or paste CSV rows directly below (max 500 cattle / 1,000 milk rows)</span>
        </div>

        <form action={mode === "animals" ? animalAction : milkAction} className="space-y-3">
          <textarea
            name="csv"
            rows={8}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={mode === "animals" ? ANIMAL_TEMPLATE : MILK_TEMPLATE}
            className="w-full rounded-xl border border-border bg-background p-3 font-mono text-xs outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
          />

          {preview.total > 0 ? (
            <div className="rounded-xl border border-border/80 bg-muted/30 p-3 text-xs">
              <p className="font-medium">
                Dry-run preview: <span className="text-emerald-700">{preview.valid} valid</span> ·{" "}
                <span className={preview.invalid > 0 ? "text-danger" : "text-muted-foreground"}>{preview.invalid} with format warnings</span> (of {preview.total} rows)
              </p>
              {preview.sampleErrors.length > 0 ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-danger">
                  {preview.sampleErrors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {activeState.ok ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-950">
              <p className="font-semibold">
                Import complete: {activeState.imported} imported, {activeState.skipped} skipped.
              </p>
              {activeState.errors && activeState.errors.length > 0 ? (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-amber-900">
                  {activeState.errors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : activeState.errors && activeState.errors.length > 0 ? (
            <div role="alert" className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-xs text-danger">
              {activeState.errors.map((err) => (
                <p key={err}>{err}</p>
              ))}
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={activePending || preview.valid === 0} className="rounded-full px-5">
              {activePending ? "Importing…" : `Import ${preview.valid} valid ${mode === "animals" ? "animals" : "milk rows"}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
