"use client";

import { useActionState } from "react";
import { createAnimal } from "@/app/(farm)/animals/actions";
import { lactationLabel, lifeStageLabel, reproductionLabel, sexLabel } from "@/lib/labels";
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
    <form action={action} className="grid max-w-3xl gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm md:grid-cols-2">
      {state.error ? <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger md:col-span-2">{state.error}</p> : null}
      <label className="text-sm">
        Name
        <input name="name" className={field} />
      </label>
      <label className="text-sm">
        Sex
        <select name="sex" className={field} defaultValue="female">
          {Object.entries(sexLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Breed
        <select name="breedId" className={field} required defaultValue={breeds[0]?.id}>
          {breeds.map((breed) => (
            <option key={breed.id} value={breed.id}>
              {breed.name}
            </option>
          ))}
        </select>
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
        <select name="lifeStage" className={field} defaultValue="heifer">
          {Object.entries(lifeStageLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Reproduction
        <select name="reproduction" className={field} defaultValue="open">
          {Object.entries(reproductionLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Lactation
        <select name="lactation" className={field} defaultValue="pre_lactation">
          {Object.entries(lactationLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Location
        <select name="locationId" className={field} defaultValue="">
          <option value="">Unassigned</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Ear tag
        <input name="earTag" className={field} />
      </label>
      <label className="text-sm">
        Colour
        <input name="colour" className={field} />
      </label>
      <label className="text-sm">
        Identification marks
        <input name="marks" className={field} />
      </label>
      <button disabled={pending} className="h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60 md:col-span-2 md:justify-self-start" type="submit">
        {pending ? "Saving…" : "Save animal"}
      </button>
    </form>
  );
}
