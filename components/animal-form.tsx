"use client";

import { useActionState } from "react";
import { createAnimal } from "@/app/(farm)/animals/actions";
import { lactationLabel, lifeStageLabel, reproductionLabel, sexLabel } from "@/lib/labels";
import { FormSelect } from "@/components/form-select";
import { inputClass } from "@/components/workspace";

const field = `mt-1 ${inputClass}`;

export function AnimalForm({
  breeds,
  locations,
}: {
  breeds: { id: string; name: string }[];
  locations: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createAnimal, { error: "" });

  return (
    <form action={action} className="grid max-w-3xl gap-4 rounded-2xl border border-border bg-card p-5 md:grid-cols-2">
      {state.error ? <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger md:col-span-2">{state.error}</p> : null}
      <label className="text-sm">
        Name
        <input name="name" maxLength={80} className={field} />
      </label>
      <label className="text-sm">
        Sex
        <FormSelect name="sex" className={field} defaultValue="female" options={Object.entries(sexLabel).map(([value, label]) => ({ value, label }))} />
      </label>
      <label className="text-sm">
        Breed
        <FormSelect name="breedId" className={field} required defaultValue={breeds[0]?.id} options={breeds.map((breed) => ({ value: breed.id, label: breed.name }))} />
      </label>
      <label className="text-sm">
        Date of birth
        <input name="dob" type="date" className={field} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input name="dobEstimated" type="checkbox" className="size-5" />
        Date of birth is estimated
      </label>
      <label className="text-sm">
        Life stage
        <FormSelect name="lifeStage" className={field} defaultValue="heifer" options={Object.entries(lifeStageLabel).map(([value, label]) => ({ value, label }))} />
      </label>
      <label className="text-sm">
        Reproduction
        <FormSelect name="reproduction" className={field} defaultValue="open" options={Object.entries(reproductionLabel).map(([value, label]) => ({ value, label }))} />
      </label>
      <label className="text-sm">
        Lactation
        <FormSelect name="lactation" className={field} defaultValue="pre_lactation" options={Object.entries(lactationLabel).map(([value, label]) => ({ value, label }))} />
      </label>
      <label className="text-sm">
        Location
        <FormSelect
          name="locationId"
          className={field}
          defaultValue=""
          options={[{ value: "", label: "Unassigned" }, ...locations.map((location) => ({ value: location.id, label: location.name }))]}
        />
      </label>
      <label className="text-sm">
        Ear tag
        <input name="earTag" maxLength={40} className={field} />
      </label>
      <label className="text-sm">
        Colour
        <input name="colour" maxLength={80} className={field} />
      </label>
      <label className="text-sm">
        Identification marks
        <input name="marks" maxLength={200} className={field} />
      </label>
      <label className="text-sm">
        Purchase source
        <input name="purchaseSource" maxLength={120} placeholder="Breeder or market" className={field} />
      </label>
      <label className="text-sm">
        Purchase date
        <input name="purchaseDate" type="date" className={field} />
      </label>
      <label className="text-sm">
        Purchase price (INR)
        <input name="purchasePrice" type="number" min={0} max={100000000} step="0.01" inputMode="decimal" placeholder="0.00" className={field} />
      </label>
      <button disabled={pending} className="h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60 md:col-span-2 md:justify-self-start" type="submit">
        {pending ? "Saving…" : "Save animal"}
      </button>
    </form>
  );
}
