"use client";

import { useActionState, useState } from "react";
import { createAnimal } from "@/app/(farm)/animals/actions";
import { lactationLabel, lifeStageLabel, reproductionLabel, sexLabel } from "@/lib/labels";
import { FormSelect } from "@/components/form-select";
import { inputClass } from "@/components/workspace";

const field = `mt-1 ${inputClass}`;

export function AnimalForm({
  breeds,
  locations,
  today,
}: {
  breeds: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  today?: string;
}) {
  const [state, action, pending] = useActionState(createAnimal, { error: "" });
  const [name, setName] = useState("");
  const [sex, setSex] = useState("female");
  const [breedId, setBreedId] = useState(breeds[0]?.id ?? "");
  const [dob, setDob] = useState("");
  const [dobEstimated, setDobEstimated] = useState(false);
  const [lifeStage, setLifeStage] = useState("heifer");
  const [reproduction, setReproduction] = useState("open");
  const [lactation, setLactation] = useState("pre_lactation");
  const [locationId, setLocationId] = useState("");
  const [earTag, setEarTag] = useState("");
  const [rfid, setRfid] = useState("");
  const [colour, setColour] = useState("");
  const [marks, setMarks] = useState("");
  const [purchaseSource, setPurchaseSource] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");

  function handleSexChange(nextSex: string) {
    setSex(nextSex);
    if (nextSex === "male") {
      if (lifeStage === "heifer" || lifeStage === "cow") setLifeStage("bull");
      setReproduction("not_applicable");
      setLactation("not_applicable");
    } else if (nextSex === "female") {
      if (lifeStage === "bull" || lifeStage === "steer") setLifeStage("heifer");
      if (reproduction === "not_applicable") setReproduction("open");
      if (lactation === "not_applicable") setLactation("pre_lactation");
    }
  }

  return (
    <form action={action} className="grid max-w-3xl gap-4 rounded-2xl border border-border bg-card p-5 md:grid-cols-2">
      {state.error ? (
        <p role="alert" className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm font-medium text-danger md:col-span-2">
          {state.error}
        </p>
      ) : null}
      <label className="text-sm">
        Name
        <input name="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={field} />
      </label>
      <label className="text-sm">
        Sex
        <FormSelect
          name="sex"
          className={field}
          value={sex}
          onValueChange={handleSexChange}
          options={Object.entries(sexLabel).map(([value, label]) => ({ value, label }))}
        />
      </label>
      <label className="text-sm">
        Breed
        <FormSelect
          name="breedId"
          className={field}
          required
          value={breedId}
          onValueChange={setBreedId}
          options={breeds.map((breed) => ({ value: breed.id, label: breed.name }))}
        />
      </label>
      <label className="text-sm">
        Date of birth
        <input name="dob" type="date" max={today} value={dob} onChange={(e) => setDob(e.target.value)} className={field} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input name="dobEstimated" type="checkbox" checked={dobEstimated} onChange={(e) => setDobEstimated(e.target.checked)} className="size-5" />
        Date of birth is estimated
      </label>
      <label className="text-sm">
        Life stage
        <FormSelect
          name="lifeStage"
          className={field}
          value={lifeStage}
          onValueChange={setLifeStage}
          options={Object.entries(lifeStageLabel).map(([value, label]) => ({ value, label }))}
        />
      </label>
      <label className="text-sm">
        Reproduction
        <FormSelect
          name="reproduction"
          className={field}
          value={reproduction}
          onValueChange={setReproduction}
          options={Object.entries(reproductionLabel).map(([value, label]) => ({ value, label }))}
        />
      </label>
      <label className="text-sm">
        Lactation
        <FormSelect
          name="lactation"
          className={field}
          value={lactation}
          onValueChange={setLactation}
          options={Object.entries(lactationLabel).map(([value, label]) => ({ value, label }))}
        />
      </label>
      <label className="text-sm">
        Location
        <FormSelect
          name="locationId"
          className={field}
          value={locationId}
          onValueChange={setLocationId}
          options={[{ value: "", label: "Unassigned" }, ...locations.map((location) => ({ value: location.id, label: location.name }))]}
        />
      </label>
      <label className="text-sm">
        Ear tag
        <input name="earTag" maxLength={40} value={earTag} onChange={(e) => setEarTag(e.target.value)} className={field} />
      </label>
      <label className="text-sm">
        RFID tag
        <input name="rfid" maxLength={64} placeholder="Optional electronic tag" value={rfid} onChange={(e) => setRfid(e.target.value)} className={field} />
      </label>
      <label className="text-sm">
        Colour
        <input name="colour" maxLength={80} value={colour} onChange={(e) => setColour(e.target.value)} className={field} />
      </label>
      <label className="text-sm">
        Identification marks
        <input name="marks" maxLength={200} value={marks} onChange={(e) => setMarks(e.target.value)} className={field} />
      </label>
      <label className="text-sm">
        Purchase source
        <input name="purchaseSource" maxLength={120} placeholder="Breeder or market" value={purchaseSource} onChange={(e) => setPurchaseSource(e.target.value)} className={field} />
      </label>
      <label className="text-sm">
        Purchase date
        <input name="purchaseDate" type="date" max={today} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={field} />
      </label>
      <label className="text-sm">
        Purchase price (INR)
        <input
          name="purchasePrice"
          type="number"
          min={0}
          max={100000000}
          step="0.01"
          inputMode="decimal"
          placeholder="0.00"
          value={purchasePrice}
          onChange={(e) => setPurchasePrice(e.target.value)}
          className={field}
        />
      </label>
      <button disabled={pending} className="h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60 md:col-span-2 md:justify-self-start" type="submit">
        {pending ? "Saving…" : "Save animal"}
      </button>
    </form>
  );
}
