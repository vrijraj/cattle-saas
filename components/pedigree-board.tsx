"use client";

import { useState } from "react";
import { updateAnimalPedigree, updateGenerationParents } from "@/app/(farm)/animals/actions";
import { FormSelect } from "@/components/form-select";
import { PedigreeChart } from "@/components/pedigree-chart";
import { RecordDialog } from "@/components/record-dialog";
import { inputClass, Submit } from "@/components/workspace";
import type { AncestorChart } from "@/lib/pedigree-tree";

type Choice = { value: string; label: string };

export function PedigreeBoard({
  chart,
  offspring,
  editable,
  animalName,
  animalCode,
  sireOptions,
  damOptions,
  generationSires,
  generationDams,
  targets,
  defaultSire,
  defaultDam,
  initialEdit,
  pedigreeNotice,
  generationNotice,
}: {
  chart: AncestorChart;
  offspring: { code: string; name: string | null }[];
  editable: boolean;
  animalName: string;
  animalCode: string;
  sireOptions: Choice[];
  damOptions: Choice[];
  generationSires: Choice[];
  generationDams: Choice[];
  targets: Choice[];
  defaultSire: string;
  defaultDam: string;
  initialEdit: string | null;
  pedigreeNotice?: string;
  generationNotice?: string;
}) {
  const [edit, setEdit] = useState<string | null>(initialEdit);
  const ancestor = targets.find((item) => item.value.split("\t")[0] === edit);

  return (
    <>
      <PedigreeChart
        chart={chart}
        offspring={offspring}
        editable={editable}
        onEdit={editable ? setEdit : undefined}
        action={
          editable ? (
            <button type="button" onClick={() => setEdit("self")} className="shrink-0 text-sm font-medium text-primary">
              Edit pedigree
            </button>
          ) : null
        }
      />
      {editable ? (
        <RecordDialog title="Edit pedigree" button="Edit pedigree" hiddenButton open={edit === "self"} onDismiss={() => setEdit(null)} notice={pedigreeNotice}>
          <form action={updateAnimalPedigree} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="code" value={animalCode} />
            <Field label="Sire">
              <FormSelect name="sireCode" className={inputClass} defaultValue={defaultSire} options={sireOptions} />
            </Field>
            <Field label="Dam">
              <FormSelect name="damId" className={inputClass} defaultValue={defaultDam} options={damOptions} />
            </Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">This is the 1st generation for {animalName}.</p>
            <div className="flex justify-end sm:col-span-2">
              <Submit>Save pedigree</Submit>
            </div>
          </form>
        </RecordDialog>
      ) : null}
      {editable && targets.length > 0 ? (
        <RecordDialog title="Set parents" button="Set parents" hiddenButton open={Boolean(ancestor)} onDismiss={() => setEdit(null)} notice={generationNotice}>
          <form key={ancestor?.value ?? "generation"} action={updateGenerationParents} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="code" value={animalCode} />
            <div className="sm:col-span-2">
              <Field label="Animal">
                <FormSelect name="ancestor" className={inputClass} defaultValue={ancestor?.value ?? targets[0]?.value} options={targets} />
              </Field>
            </div>
            <Field label="Sire">
              <FormSelect name="sireCode" className={inputClass} defaultValue="" options={generationSires} />
            </Field>
            <Field label="Dam">
              <FormSelect name="damCode" className={inputClass} defaultValue="" options={generationDams} />
            </Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">Leave unchanged keeps the current parent. These parents become the next generation on the diagram.</p>
            <div className="flex justify-end sm:col-span-2">
              <Submit>Save parents</Submit>
            </div>
          </form>
        </RecordDialog>
      ) : null}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
