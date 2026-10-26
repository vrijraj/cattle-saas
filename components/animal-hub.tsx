import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { updateAnimalDetails } from "@/app/(farm)/animals/actions";
import {
  animals,
  auditLogs,
  breeds,
  bulls,
  calvings,
  dewormings,
  dryOffs,
  feedItems,
  feedMovements,
  healthEvents,
  heats,
  inseminations,
  listings,
  locationMoves,
  locations,
  milkYields,
  pregnancyChecks,
  vaccinations,
  weights,
} from "@/db/schema";
import { recordAi, recordAnimalMilk, recordCalving, recordDeworming, recordDryOff, recordHealth, recordHeat, recordPd, recordVaccine, recordWeight, saveFeed, saveListing } from "@/app/(farm)/herd/actions";
import { voidMatingNote } from "@/app/(farm)/genetics/actions";
import { clearIsolation, moveAnimal, setIsolation } from "@/app/(farm)/locations/actions";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { healthOutcome } from "@/lib/health-register";
import { lactationHistory, lactationSummary } from "@/lib/lactation";
import { PedigreeBoard } from "@/components/pedigree-board";
import { MilkChart } from "@/components/milk-chart";
import { WeightChart } from "@/components/weight-chart";
import { RecordDialog } from "@/components/record-dialog";
import { VoidRecord } from "@/components/void-record";
import { FormSelect } from "@/components/form-select";
import { EmptyRow, inputClass, Panel, Submit, Table, Td } from "@/components/workspace";
import { lifeStageLabel, sexLabel } from "@/lib/labels";
import { canVoidMatingNote } from "@/lib/permissions";
import { ancestorChart, type AncestorChart } from "@/lib/pedigree-tree";

type AnimalRow = typeof animals.$inferSelect;

export const profileTabs = [
  { id: "overview", label: "Overview" },
  { id: "parentage", label: "Parentage" },
  { id: "breeding", label: "Breeding" },
  { id: "health", label: "Health" },
  { id: "milk", label: "Milk" },
  { id: "listing", label: "Listing" },
] as const;

export type ProfileTab = (typeof profileTabs)[number]["id"];

export async function AnimalHub({
  animal,
  breedName,
  locationName,
  damLabel,
  sireLabel,
  tab,
  breedingError,
  pedigreeEdit,
  canBreed,
  canHealth,
  canMilk = false,
  canFeed = false,
  canList,
  canEdit,
  canViewGenetics,
  canSeeClinical,
  roles,
  userId,
  timezone,
}: {
  animal: AnimalRow;
  breedName: string;
  locationName: string | null;
  damLabel: string;
  sireLabel: string;
  tab: ProfileTab;
  breedingError?: string;
  pedigreeEdit?: string;
  canBreed: boolean;
  canHealth: boolean;
  canMilk?: boolean;
  canFeed?: boolean;
  canList: boolean;
  canEdit: boolean;
  canViewGenetics: boolean;
  canSeeClinical: boolean;
  roles: string[];
  userId: string;
  timezone: string;
}) {
  const herd = await db.select().from(animals).where(eq(animals.farmId, animal.farmId));
  const bullRows = await db.select().from(bulls).where(eq(bulls.farmId, animal.farmId));
  const offspring = herd.filter((row) => row.geneticDamId === animal.id || row.geneticSireCode === animal.code);
  const chart = ancestorChart(animal, herd, bullRows);
  const heatRows = await db.select().from(heats).where(eq(heats.animalId, animal.id));
  const aiRows = await db.select().from(inseminations).where(eq(inseminations.animalId, animal.id));
  const pdRows = await db.select().from(pregnancyChecks).where(eq(pregnancyChecks.animalId, animal.id));
  const calvingRows = await db.select().from(calvings).where(eq(calvings.damId, animal.id));
  const dryRows = await db.select().from(dryOffs).where(eq(dryOffs.animalId, animal.id));
  const moveRows = await db.select().from(locationMoves).where(eq(locationMoves.animalId, animal.id));
  const shedRows = await db.select().from(locations).where(eq(locations.farmId, animal.farmId));
  const healthRows = await db.select().from(healthEvents).where(eq(healthEvents.animalId, animal.id));
  const vaccineRows = await db.select().from(vaccinations).where(eq(vaccinations.animalId, animal.id));
  const dewormRows = await db.select().from(dewormings).where(eq(dewormings.animalId, animal.id));
  const weightRows = await db.select().from(weights).where(and(eq(weights.animalId, animal.id)));
  const milkRows = await db
    .select()
    .from(milkYields)
    .where(eq(milkYields.animalId, animal.id))
    .orderBy(desc(milkYields.recordedOn));
  const [feedItemRows, feedMoveRows, animalAudits] = await Promise.all([
    db.select().from(feedItems).where(eq(feedItems.farmId, animal.farmId)),
    db.select().from(feedMovements).where(eq(feedMovements.farmId, animal.farmId)),
    db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.farmId, animal.farmId), eq(auditLogs.entity, "animal"), eq(auditLogs.entityId, animal.id)))
      .orderBy(desc(auditLogs.createdAt)),
  ]);
  const feedNameById = new Map(feedItemRows.map((item) => [item.id, item]));
  const shedName = new Map(shedRows.map((row) => [row.id, row.name]));
  const animalFeedRows = feedMoveRows.filter(
    (move) => move.note === `${animal.name ?? animal.code} · ${animal.code}` || move.note?.endsWith(`· ${animal.code}`),
  );
  const canWeight = canMilk || canEdit;
  const recordable = canBreed && animal.sex !== "male";
  const resetDates = [
    ...calvingRows.filter((row) => !row.voidedAt).map((row) => row.calvedOn),
    ...pdRows.filter((row) => !row.voidedAt && row.result === "not_pregnant").map((row) => row.checkedOn),
  ].sort();
  const latestReset = resetDates.at(-1) ?? "";
  const nextAttempt = aiRows.filter((row) => !row.voidedAt && (!latestReset || row.performedOn > latestReset)).length + 1;

  const timeline = [
    ...heatRows.filter((row) => !row.voidedAt).map((row) => ({ when: row.observedOn, label: `Heat · ${row.signs}${row.note ? ` (${row.note})` : ""}`, group: "breeding" })),
    ...aiRows.filter((row) => !row.voidedAt).map((row) => ({ when: row.performedOn, label: `AI #${row.attemptNumber} · ${row.bullCode}${row.strawCode ? ` · ${row.strawCode}` : ""}`, group: "breeding" })),
    ...pdRows.filter((row) => !row.voidedAt).map((row) => ({ when: row.checkedOn, label: `Pregnancy check · ${row.result.replaceAll("_", " ")}${row.method ? ` (${row.method})` : ""}`, group: "breeding" })),
    ...calvingRows.filter((row) => !row.voidedAt).map((row) => ({ when: row.calvedOn, label: `Calving · ${row.outcome}${row.ease ? ` · ${row.ease}` : ""}`, group: "breeding" })),
    ...dryRows.filter((row) => !row.voidedAt).map((row) => ({ when: row.driedOn, label: `Dry-off${row.note ? ` · ${row.note}` : ""}`, group: "breeding" })),
    ...(canSeeClinical
      ? healthRows
          .filter((row) => !row.voidedAt)
          .map((row) => ({
            when: row.eventOn,
            label: `Treatment · ${row.problem}${row.diagnosis ? ` (${row.diagnosis})` : ""}${row.medicine ? ` · ${row.medicine}` : ""}`,
            group: "health",
          }))
      : []),
    ...vaccineRows.filter((row) => !row.voidedAt).map((row) => ({ when: row.givenOn, label: `Vaccine · ${row.vaccine}`, group: "health" })),
    ...dewormRows.filter((row) => !row.voidedAt).map((row) => ({ when: row.givenOn, label: `Deworming · ${row.product}`, group: "health" })),
    ...weightRows.map((row) => ({ when: row.weighedOn, label: `Weight · ${row.kilograms} kg`, group: "overview" })),
    ...moveRows.map((row) => ({
      when: row.movedOn,
      label: `Moved to ${row.locationId ? (shedName.get(row.locationId) ?? "Shed") : "Unassigned"}${row.note ? ` · ${row.note}` : ""}`,
      group: "overview",
    })),
    ...animalFeedRows.map((row) => {
      const item = feedNameById.get(row.itemId);
      return {
        when: row.movedOn,
        label: `Feed · ${item?.name ?? "Ration"} (${row.quantity} ${item?.unit ?? "kg"})`,
        group: "feed",
      };
    }),
    ...milkRows
      .filter((row) => !row.voidedAt)
      .slice(0, 14)
      .map((row) => ({
        when: row.recordedOn,
        label: `Milk · ${(Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0)).toFixed(1)} L`,
        group: "milk",
      })),
    ...animalAudits.map((row) => ({
      when: row.createdAt.toISOString().slice(0, 10),
      label: row.summary,
      group: "status",
    })),
  ].sort((a, b) => b.when.localeCompare(a.when));

  const quickBar =
    recordable || canHealth || (canMilk && animal.sex !== "male") || canWeight || canFeed ? (
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/20 bg-gradient-to-r from-secondary/50 via-card to-card p-3 shadow-[0_1px_3px_rgba(15,35,24,0.04)] sm:px-4">
        <span className="mr-1.5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
          <span className="size-1.5 rounded-full bg-primary" />
          Quick entry
        </span>
        {recordable ? (
          <>
            <RecordDialog title="Record heat" button="+ Heat" quiet>
              <form action={recordHeat} className="space-y-3">
                <input type="hidden" name="animalId" value={animal.id} />
                <Field label="Observed date">
                  <input name="observedOn" type="date" className={inputClass} />
                </Field>
                <Field label="Observed signs">
                  <input name="signs" placeholder="Standing, mucus discharge, mounting" className={inputClass} />
                </Field>
                <Field label="Observations & follow-up">
                  <input name="note" placeholder="Notes or follow-up plan" className={inputClass} />
                </Field>
                <div className="flex justify-end pt-1">
                  <Submit>Save heat</Submit>
                </div>
              </form>
            </RecordDialog>
            <RecordDialog title="Record insemination (AI)" button="+ AI" quiet>
              <form action={recordAi} className="space-y-3">
                <input type="hidden" name="animalId" value={animal.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="AI date">
                    <input name="performedOn" type="date" className={inputClass} />
                  </Field>
                  <Field label="Technician">
                    <input name="technician" className={inputClass} />
                  </Field>
                  <Field label="Bull code">
                    <input name="bullCode" placeholder="BULL-GIR-014" required className={inputClass} />
                  </Field>
                  <Field label="Bull name">
                    <input name="bullName" className={inputClass} />
                  </Field>
                  <Field label="Batch number">
                    <input name="batchNumber" className={inputClass} />
                  </Field>
                  <Field label="Straw code">
                    <input name="strawCode" className={inputClass} />
                  </Field>
                  <Field label="Attempt number">
                    <input name="attempt" type="number" min={1} defaultValue={nextAttempt} className={inputClass} />
                  </Field>
                  <Field label="Notes">
                    <input name="note" className={inputClass} />
                  </Field>
                </div>
                <div className="flex justify-end pt-1">
                  <Submit>Save insemination</Submit>
                </div>
              </form>
            </RecordDialog>
            <RecordDialog title="Record pregnancy check (PD)" button="+ PD" quiet>
              <form action={recordPd} className="space-y-3">
                <input type="hidden" name="animalId" value={animal.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Checked date">
                    <input name="checkedOn" type="date" className={inputClass} />
                  </Field>
                  <Field label="Result">
                    <FormSelect
                      name="result"
                      defaultValue="pregnant"
                      options={[
                        { value: "pregnant", label: "Pregnant" },
                        { value: "not_pregnant", label: "Not pregnant" },
                        { value: "doubtful", label: "Doubtful" },
                      ]}
                    />
                  </Field>
                </div>
                <Field label="Insemination">
                  <FormSelect
                    name="inseminationId"
                    defaultValue={aiRows[0]?.id ?? ""}
                    options={[
                      { value: "", label: "Select the insemination" },
                      ...aiRows.map((row) => ({ value: row.id, label: `${formatDisplayDate(row.performedOn)} · ${row.bullCode}` })),
                    ]}
                  />
                </Field>
                <Field label="Method & follow-up notes">
                  <input name="method" placeholder="Ultrasound / rectal palpation" className={inputClass} />
                </Field>
                <div className="flex justify-end pt-1">
                  <Submit>Save pregnancy check</Submit>
                </div>
              </form>
            </RecordDialog>
            <RecordDialog title="Record calving" button="+ Calving" quiet>
              <form action={recordCalving} className="space-y-3">
                <input type="hidden" name="animalId" value={animal.id} />
                <Field label="Insemination">
                  <FormSelect
                    name="inseminationId"
                    required
                    defaultValue={aiRows[0]?.id ?? ""}
                    options={[
                      { value: "", label: "Select the insemination" },
                      ...aiRows.map((row) => ({ value: row.id, label: `${formatDisplayDate(row.performedOn)} · ${row.bullCode}` })),
                    ]}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Calved date">
                    <input name="calvedOn" type="date" className={inputClass} />
                  </Field>
                  <Field label="Outcome">
                    <FormSelect
                      name="outcome"
                      defaultValue="live"
                      options={[
                        { value: "live", label: "Live calf" },
                        { value: "dead", label: "Dead calf" },
                      ]}
                    />
                  </Field>
                  <Field label="Calf sex">
                    <FormSelect
                      name="calfSex"
                      defaultValue="female"
                      options={[
                        { value: "female", label: "Female" },
                        { value: "male", label: "Male" },
                      ]}
                    />
                  </Field>
                  <Field label="Calf name">
                    <input name="calfName" className={inputClass} />
                  </Field>
                  <Field label="Calving ease">
                    <FormSelect
                      name="ease"
                      defaultValue="unassisted"
                      options={[
                        { value: "unassisted", label: "Unassisted" },
                        { value: "assisted", label: "Assisted" },
                        { value: "difficult", label: "Difficult / veterinary" },
                      ]}
                    />
                  </Field>
                  <Field label="Observations">
                    <input name="note" placeholder="Colostrum given, placenta expelled" className={inputClass} />
                  </Field>
                </div>
                <div className="flex justify-end pt-1">
                  <Submit>Save calving</Submit>
                </div>
              </form>
            </RecordDialog>
          </>
        ) : null}
        {canHealth ? (
          <>
            <RecordDialog title="Record vaccine" button="+ Vaccine" quiet>
              <form action={recordVaccine} className="space-y-3">
                <input type="hidden" name="animalId" value={animal.id} />
                <Field label="Vaccine">
                  <input name="vaccine" required className={inputClass} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Given date">
                    <input name="givenOn" type="date" className={inputClass} />
                  </Field>
                  <Field label="Batch">
                    <input name="batch" className={inputClass} />
                  </Field>
                </div>
                <Field label="Next due">
                  <input name="nextDueOn" type="date" className={inputClass} />
                </Field>
                <div className="flex justify-end pt-1">
                  <Submit>Save vaccine</Submit>
                </div>
              </form>
            </RecordDialog>
            {canSeeClinical ? (
              <RecordDialog title="Record treatment" button="+ Treatment" quiet>
                <form action={recordHealth} className="space-y-3">
                  <input type="hidden" name="animalId" value={animal.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Problem / Disease">
                      <input name="problem" required placeholder="Mastitis, fever, lameness" className={inputClass} />
                    </Field>
                    <Field label="Date">
                      <input name="eventOn" type="date" className={inputClass} />
                    </Field>
                    <Field label="Clinical signs">
                      <input name="signs" placeholder="Swelling, reduced appetite" className={inputClass} />
                    </Field>
                    <Field label="Diagnosis">
                      <input name="diagnosis" className={inputClass} />
                    </Field>
                    <Field label="Medicine">
                      <input name="medicine" className={inputClass} />
                    </Field>
                    <Field label="Dose">
                      <input name="dose" placeholder="15 ml" className={inputClass} />
                    </Field>
                    <Field label="Route">
                      <input name="route" placeholder="IM / IV / Oral / Intramammary" className={inputClass} />
                    </Field>
                    <Field label="Duration">
                      <input name="duration" placeholder="5 days" className={inputClass} />
                    </Field>
                    <Field label="Veterinarian">
                      <input name="veterinarian" className={inputClass} />
                    </Field>
                    <Field label="Follow-up date">
                      <input name="followUpOn" type="date" className={inputClass} />
                    </Field>
                    <Field label="Outcome">
                      <FormSelect
                        name="outcome"
                        defaultValue="ongoing"
                        options={[
                          { value: "ongoing", label: "Ongoing" },
                          { value: "resolved", label: "Resolved" },
                          { value: "referred", label: "Referred" },
                          { value: "died", label: "Died" },
                        ]}
                      />
                    </Field>
                    <Field label="Treatment & visit notes">
                      <input name="treatment" className={inputClass} />
                    </Field>
                  </div>
                  <Field label="Prescription, document, or photo">
                    <input name="attachment" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={`${inputClass} h-auto py-2`} />
                  </Field>
                  <div className="flex justify-end pt-1">
                    <Submit>Save treatment</Submit>
                  </div>
                </form>
              </RecordDialog>
            ) : null}
          </>
        ) : null}
        {canMilk && animal.sex !== "male" ? (
          <RecordDialog title="Record milk production" button="+ Milk" quiet>
            <form action={recordAnimalMilk} className="space-y-3">
              <input type="hidden" name="animalId" value={animal.id} />
              <Field label="Date">
                <input name="recordedOn" type="date" className={inputClass} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Morning (L)">
                  <input name="morningLitres" inputMode="decimal" placeholder="0.0" className={inputClass} />
                </Field>
                <Field label="Evening (L)">
                  <input name="eveningLitres" inputMode="decimal" placeholder="0.0" className={inputClass} />
                </Field>
              </div>
              <div className="flex justify-end pt-1">
                <Submit>Save milk</Submit>
              </div>
            </form>
          </RecordDialog>
        ) : null}
        {canWeight ? (
          <RecordDialog title="Record weight" button="+ Weight" quiet>
            <form action={recordWeight} className="space-y-3">
              <input type="hidden" name="animalId" value={animal.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Kilograms">
                  <input name="kilograms" required inputMode="decimal" className={inputClass} />
                </Field>
                <Field label="Date">
                  <input name="weighedOn" type="date" className={inputClass} />
                </Field>
              </div>
              <Field label="Note">
                <input name="note" className={inputClass} />
              </Field>
              <div className="flex justify-end pt-1">
                <Submit>Save weight</Submit>
              </div>
            </form>
          </RecordDialog>
        ) : null}
        {canFeed ? (
          <RecordDialog title="Record feed allocation" button="+ Feed" quiet>
            <form action={saveFeed} className="space-y-3">
              <input type="hidden" name="kind" value="consumption" />
              <input type="hidden" name="allocation" value={`animal:${animal.code}`} />
              <input type="hidden" name="returnTo" value={`/animals/${animal.code}`} />
              {feedItemRows.length > 0 ? (
                <Field label="Feed item">
                  <FormSelect
                    name="itemId"
                    defaultValue={feedItemRows[0]?.id ?? ""}
                    options={feedItemRows.map((item) => ({ value: item.id, label: `${item.name} (${item.unit})` }))}
                  />
                </Field>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="New feed item">
                    <input name="name" required placeholder="Green fodder" className={inputClass} />
                  </Field>
                  <Field label="Category">
                    <FormSelect
                      name="category"
                      defaultValue="green"
                      options={[
                        { value: "green", label: "Green fodder" },
                        { value: "dry", label: "Dry fodder" },
                        { value: "silage", label: "Silage" },
                        { value: "concentrate", label: "Concentrate" },
                        { value: "mineral", label: "Mineral / supplement" },
                        { value: "other", label: "Other" },
                      ]}
                    />
                  </Field>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Quantity (kg)">
                  <input name="quantity" required inputMode="decimal" className={inputClass} />
                </Field>
                <Field label="Date">
                  <input name="movedOn" type="date" className={inputClass} />
                </Field>
              </div>
              <div className="flex justify-end pt-1">
                <Submit>Save feed</Submit>
              </div>
            </form>
          </RecordDialog>
        ) : null}
      </section>
    ) : null;

  if (tab === "parentage") {
    const pedigreeError = breedingError && pedigreeMessages[breedingError] ? pedigreeMessages[breedingError] : undefined;
    const dams = herd
      .filter((row) => row.id !== animal.id && (row.sex === "female" || row.id === animal.geneticDamId))
      .sort((left, right) => (left.name ?? left.code).localeCompare(right.name ?? right.code));
    const targets = generationTargets(chart);
    const generationError = breedingError ? generationMessages[breedingError] : undefined;
    const sireOptions = parentOptions(
      [
        ...(animal.geneticSireCode ? [{ code: animal.geneticSireCode, name: animal.geneticSireName }] : []),
        ...bullRows.map((bull) => ({ code: bull.code, name: bull.name })),
        ...herd.filter((row) => row.sex === "male").map((row) => ({ code: row.code, name: row.name })),
      ],
      "Not linked",
    );
    const generationSires = parentOptions(
      [
        ...bullRows.map((bull) => ({ code: bull.code, name: bull.name })),
        ...herd.filter((row) => row.sex === "male").map((row) => ({ code: row.code, name: row.name })),
      ],
      "Leave unchanged",
    );
    const damOptions = parentOptions(
      herd.filter((row) => row.sex === "female").map((row) => ({ code: row.code, name: row.name })),
      "Leave unchanged",
    );
    const generationEdit = pedigreeEdit && pedigreeEdit !== "self" ? targets.find((item) => item.value.split("\t")[0] === pedigreeEdit) : undefined;
    const damChoices = [{ value: "", label: "Not linked" }, ...dams.map((row) => ({ value: row.id, label: row.name && row.name !== row.code ? `${row.name} · ${row.code}` : row.code }))];
    return (
      <div className="space-y-4">
        {quickBar}
        <PedigreeBoard
          chart={chart}
          offspring={offspring.map((row) => ({ code: row.code, name: row.name }))}
          editable={canEdit}
          animalName={animal.name ?? animal.code}
          animalCode={animal.code}
          sireOptions={sireOptions}
          damOptions={damChoices}
          generationSires={generationSires}
          generationDams={damOptions}
          targets={targets}
          defaultSire={animal.geneticSireCode ?? ""}
          defaultDam={animal.geneticDamId ?? ""}
          initialEdit={pedigreeError ? "self" : generationError ? (generationEdit?.value.split("\t")[0] ?? targets[0]?.value.split("\t")[0] ?? null) : null}
          pedigreeNotice={pedigreeError}
          generationNotice={generationError}
        />
      </div>
    );
  }

  if (tab === "breeding") {
    const breedingNotice = breedingMessages[breedingError ?? ""];
    const heats = [...heatRows].sort((a, b) => b.observedOn.localeCompare(a.observedOn));
    const ais = [...aiRows].sort((a, b) => b.performedOn.localeCompare(a.performedOn));
    const checks = [...pdRows].sort((a, b) => b.checkedOn.localeCompare(a.checkedOn));
    const births = [...calvingRows].sort((a, b) => b.calvedOn.localeCompare(a.calvedOn));
    const aiById = new Map(aiRows.map((row) => [row.id, row]));
    const herdById = new Map(herd.map((row) => [row.id, row]));
    const matingNotes = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.farmId, animal.farmId), eq(auditLogs.entity, "mating_check"), eq(auditLogs.entityId, animal.id)))
      .orderBy(desc(auditLogs.createdAt));
    const voidedNotes = new Set(
      matingNotes
        .filter((note) => note.action === "void")
        .map((note) => {
          const after = note.afterState as { noteId?: string } | null;
          return after?.noteId ?? "";
        })
        .filter(Boolean),
    );
    const savedChecks = matingNotes.filter((note) => note.action === "create" && !voidedNotes.has(note.id));

    function bullLabel(row: { bullCode: string; bullName: string | null }) {
      return row.bullName && row.bullName !== row.bullCode ? `${row.bullName} · ${row.bullCode}` : row.bullCode;
    }

    const breedingTimeline = timeline.filter((event) => event.group === "breeding");

    return (
      <div className="space-y-8">
        {quickBar}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Mating checks</h2>
            {canViewGenetics && animal.sex === "female" ? (
              <Link href={`/genetics?female=${encodeURIComponent(animal.code)}`} className="text-sm font-medium text-primary">
                Check a mating
              </Link>
            ) : null}
          </div>
          {savedChecks.length === 0 ? <p className="text-sm text-muted-foreground">No mating check saved on this animal.</p> : null}
          {savedChecks.map((note) => {
            const after = note.afterState as { female?: string; bull?: string; batch?: string | null } | null;
            const bullValue = after?.bull ? (after.batch ? `${after.bull}::${after.batch}` : after.bull) : "";
            const href = after?.female && bullValue ? `/genetics?female=${encodeURIComponent(after.female)}&bull=${encodeURIComponent(bullValue)}` : "";
            return (
              <div key={note.id} className="rounded-xl bg-muted px-3 py-3 text-sm">
                <span className="text-muted-foreground">{formatDisplayDate(note.createdAt.toISOString().slice(0, 10))}</span>
                {canViewGenetics && href ? (
                  <Link href={href} className="mt-1 block font-medium text-primary">
                    {note.summary}
                  </Link>
                ) : (
                  <span className="mt-1 block font-medium">{note.summary}</span>
                )}
                {canVoidMatingNote(roles, note.actorId, userId) ? (
                  <form action={voidMatingNote} className="mt-2 flex flex-wrap items-center justify-end gap-2">
                    <input type="hidden" name="id" value={note.id} />
                    <input type="hidden" name="returnTo" value={`/animals/${animal.code}?tab=breeding`} />
                    <input name="reason" required placeholder="Reason" className="h-8 w-36 rounded-lg border border-border bg-background px-2 text-xs" />
                    <button type="submit" className="text-xs font-medium text-danger">
                      Void
                    </button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </section>
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Heat</h2>
            {recordable ? (
              <RecordDialog title="Record heat" button="Record heat">
                <form action={recordHeat} className="space-y-3">
                  <input type="hidden" name="animalId" value={animal.id} />
                  <Field label="Observed">
                    <input name="observedOn" type="date" className={inputClass} />
                  </Field>
                  <Field label="Signs">
                    <input name="signs" placeholder="Standing, discharge" className={inputClass} />
                  </Field>
                  <Field label="Observations & follow-up">
                    <input name="note" placeholder="Follow-up details or notes" className={inputClass} />
                  </Field>
                  <div className="flex justify-end pt-1">
                    <Submit>Save heat</Submit>
                  </div>
                </form>
              </RecordDialog>
            ) : null}
          </div>
          <Table headers={["Observed", "Signs", "Observations / Follow-up"]}>
            {heats.length === 0 ? <EmptyRow cols={3}>No heat recorded.</EmptyRow> : null}
            {heats.map((row) => (
              <tr key={row.id}>
                <Td>{formatDisplayDate(row.observedOn)}</Td>
                <Td>{row.signs}</Td>
                <Td>{row.note ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Inseminations</h2>
            {recordable ? (
              <RecordDialog title="Record insemination" button="Record insemination" notice={breedingError === "bull" || breedingError === "straw" ? breedingNotice : undefined} open={breedingError === "bull" || breedingError === "straw"}>
                <form action={recordAi} className="space-y-3">
                  <input type="hidden" name="animalId" value={animal.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Date">
                      <input name="performedOn" type="date" className={inputClass} />
                    </Field>
                    <Field label="Technician">
                      <input name="technician" className={inputClass} />
                    </Field>
                    <Field label="Bull code">
                      <input name="bullCode" placeholder="BULL-GIR-014" required className={inputClass} />
                    </Field>
                    <Field label="Bull name">
                      <input name="bullName" className={inputClass} />
                    </Field>
                    <Field label="Batch">
                      <input name="batchNumber" className={inputClass} />
                    </Field>
                    <Field label="Straw">
                      <input name="strawCode" className={inputClass} />
                    </Field>
                    <Field label="Attempt number">
                      <input name="attempt" type="number" min={1} defaultValue={nextAttempt} className={inputClass} />
                    </Field>
                    <Field label="Notes">
                      <input name="note" className={inputClass} />
                    </Field>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Submit>Save insemination</Submit>
                  </div>
                </form>
              </RecordDialog>
            ) : null}
          </div>
          <Table headers={["Date", "Attempt", "Bull", "Batch", "Straw", "Technician", "Notes", ""]}>
            {ais.length === 0 ? <EmptyRow cols={8}>No insemination recorded.</EmptyRow> : null}
            {ais.map((row) => (
              <tr key={row.id} className={row.voidedAt ? "text-muted-foreground" : ""}>
                <Td>{formatDisplayDate(row.performedOn)}</Td>
                <Td>#{row.attemptNumber}</Td>
                <Td className="font-medium">{bullLabel(row)}</Td>
                <Td>{row.batchNumber ?? "—"}</Td>
                <Td>{row.strawCode ?? "—"}</Td>
                <Td>{row.technicianName}</Td>
                <Td>{row.note ?? "—"}</Td>
                <Td>
                  {row.voidedAt ? (
                    "Voided"
                  ) : recordable ? (
                    <VoidRecord entity="insemination" id={row.id} returnTo={`/animals/${animal.code}?tab=breeding`} restoreStraw={Boolean(row.strawCode)} />
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Pregnancy checks</h2>
            {recordable ? (
              <RecordDialog title="Record pregnancy check" button="Record pregnancy check">
                <form action={recordPd} className="space-y-3">
                  <input type="hidden" name="animalId" value={animal.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Checked">
                      <input name="checkedOn" type="date" className={inputClass} />
                    </Field>
                    <Field label="Result">
                      <FormSelect
                        name="result"
                        defaultValue="pregnant"
                        options={[
                          { value: "pregnant", label: "Pregnant" },
                          { value: "not_pregnant", label: "Not pregnant" },
                          { value: "doubtful", label: "Doubtful" },
                        ]}
                      />
                    </Field>
                  </div>
                  <Field label="Method & follow-up notes">
                    <input name="method" placeholder="Rectal palpation / ultrasound / recheck notes" className={inputClass} />
                  </Field>
                  <Field label="Insemination">
                    <FormSelect
                      name="inseminationId"
                      defaultValue=""
                      options={[
                        { value: "", label: "Select the insemination" },
                        ...ais.map((row) => ({ value: row.id, label: `${formatDisplayDate(row.performedOn)} · ${bullLabel(row)}` })),
                      ]}
                    />
                  </Field>
                  <div className="flex justify-end pt-1">
                    <Submit>Save pregnancy check</Submit>
                  </div>
                </form>
              </RecordDialog>
            ) : null}
          </div>
          <Table headers={["Checked", "Result", "Method / Follow-up", "Insemination"]}>
            {checks.length === 0 ? <EmptyRow cols={4}>No pregnancy check recorded.</EmptyRow> : null}
            {checks.map((row) => {
              const ai = row.inseminationId ? aiById.get(row.inseminationId) : undefined;
              return (
                <tr key={row.id}>
                  <Td>{formatDisplayDate(row.checkedOn)}</Td>
                  <Td className="font-medium">{pregnancyResult(row.result)}</Td>
                  <Td>{row.method ?? "—"}</Td>
                  <Td>{ai ? `${formatDisplayDate(ai.performedOn)} · ${bullLabel(ai)}` : "—"}</Td>
                </tr>
              );
            })}
          </Table>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Calvings</h2>
            {recordable ? (
              <RecordDialog title="Record calving" button="Record calving" notice={breedingError === "conception" ? breedingNotice : undefined} open={breedingError === "conception"}>
                <form action={recordCalving} className="space-y-3">
                  <input type="hidden" name="animalId" value={animal.id} />
                  <Field label="Insemination">
                    <FormSelect
                      name="inseminationId"
                      required
                      defaultValue=""
                      options={[
                        { value: "", label: "Select the insemination" },
                        ...ais.map((row) => ({ value: row.id, label: `${formatDisplayDate(row.performedOn)} · ${bullLabel(row)}` })),
                      ]}
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Calved">
                      <input name="calvedOn" type="date" className={inputClass} />
                    </Field>
                    <Field label="Outcome">
                      <FormSelect
                        name="outcome"
                        defaultValue="live"
                        options={[
                          { value: "live", label: "Live calf" },
                          { value: "dead", label: "Dead calf" },
                        ]}
                      />
                    </Field>
                    <Field label="Calf sex">
                      <FormSelect
                        name="calfSex"
                        defaultValue="female"
                        options={[
                          { value: "female", label: "Female" },
                          { value: "male", label: "Male" },
                        ]}
                      />
                    </Field>
                    <Field label="Calf name">
                      <input name="calfName" className={inputClass} />
                    </Field>
                    <Field label="Calving ease">
                      <FormSelect
                        name="ease"
                        defaultValue="normal"
                        options={[
                          { value: "normal", label: "Normal / unassisted" },
                          { value: "assisted", label: "Assisted" },
                          { value: "difficult", label: "Difficult (dystocia)" },
                        ]}
                      />
                    </Field>
                    <Field label="Observations">
                      <input name="note" placeholder="Birth weight, placenta, observations" className={inputClass} />
                    </Field>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Submit>Save calving</Submit>
                  </div>
                </form>
              </RecordDialog>
            ) : null}
          </div>
          <Table headers={["Calved", "Outcome", "Ease", "Calf", "Insemination", "Observations"]}>
            {births.length === 0 ? <EmptyRow cols={6}>No calving recorded.</EmptyRow> : null}
            {births.map((row) => {
              const calf = row.calfId ? herdById.get(row.calfId) : undefined;
              const ai = row.inseminationId ? aiById.get(row.inseminationId) : undefined;
              return (
                <tr key={row.id}>
                  <Td>{formatDisplayDate(row.calvedOn)}</Td>
                  <Td className="font-medium">{row.outcome === "live" ? "Live calf" : "Dead calf"}</Td>
                  <Td className="capitalize">{row.ease ?? "normal"}</Td>
                  <Td>{calf ? (calf.name && calf.name !== calf.code ? `${calf.name} · ${calf.code}` : calf.code) : "—"}</Td>
                  <Td>{ai ? `${formatDisplayDate(ai.performedOn)} · ${bullLabel(ai)}` : "—"}</Td>
                  <Td>{row.note ?? "—"}</Td>
                </tr>
              );
            })}
          </Table>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Dry-off</h2>
            {recordable && animal.lactation === "lactating" ? (
              <RecordDialog title="Record dry-off" button="Record dry-off">
                <form action={recordDryOff} className="space-y-3">
                  <input type="hidden" name="animalId" value={animal.id} />
                  <Field label="Dried off">
                    <input name="driedOn" type="date" className={inputClass} />
                  </Field>
                  <Field label="Note">
                    <input name="note" className={inputClass} />
                  </Field>
                  <div className="flex justify-end pt-1">
                    <Submit>Save dry-off</Submit>
                  </div>
                </form>
              </RecordDialog>
            ) : null}
          </div>
          <Table headers={["Date", "Note"]}>
            {dryRows.filter((row) => !row.voidedAt).length === 0 ? <EmptyRow cols={2}>No dry-off recorded.</EmptyRow> : null}
            {dryRows
              .filter((row) => !row.voidedAt)
              .sort((a, b) => b.driedOn.localeCompare(a.driedOn))
              .map((row) => (
                <tr key={row.id}>
                  <Td>{formatDisplayDate(row.driedOn)}</Td>
                  <Td>{row.note ?? "—"}</Td>
                </tr>
              ))}
          </Table>
        </section>

        <ActivityList title="Reproductive timeline" events={breedingTimeline} />
      </div>
    );
  }

  if (tab === "health") {
    const treatments = canSeeClinical ? [...healthRows].filter((row) => !row.voidedAt).sort((a, b) => b.eventOn.localeCompare(a.eventOn)) : [];
    const doses = [...vaccineRows].sort((a, b) => b.givenOn.localeCompare(a.givenOn));
    const worms = [...dewormRows].sort((a, b) => b.givenOn.localeCompare(a.givenOn));
    const healthTimeline = timeline.filter((event) => event.group === "health");

    return (
      <div className="space-y-8">
        {quickBar}
        {canSeeClinical ? (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Treatments & Veterinary visits</h2>
              {canHealth ? (
                <RecordDialog title="Record treatment" button="Record treatment">
                  <form action={recordHealth} className="space-y-3">
                    <input type="hidden" name="animalId" value={animal.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Date">
                        <input name="eventOn" type="date" className={inputClass} />
                      </Field>
                      <Field label="Problem / disease">
                        <input name="problem" required placeholder="Mastitis, fever, lameness" className={inputClass} />
                      </Field>
                      <Field label="Clinical signs & observations">
                        <input name="signs" placeholder="Swelling, reduced appetite" className={inputClass} />
                      </Field>
                      <Field label="Diagnosis">
                        <input name="diagnosis" className={inputClass} />
                      </Field>
                      <Field label="Treatment details">
                        <input name="treatment" placeholder="Supportive care, udder infusion" className={inputClass} />
                      </Field>
                      <Field label="Medicine">
                        <input name="medicine" className={inputClass} />
                      </Field>
                      <Field label="Dose">
                        <input name="dose" placeholder="10 ml" className={inputClass} />
                      </Field>
                      <Field label="Route">
                        <input name="route" placeholder="IM / IV / Oral / Intramammary" className={inputClass} />
                      </Field>
                      <Field label="Duration">
                        <input name="duration" placeholder="3 days" className={inputClass} />
                      </Field>
                      <Field label="Veterinarian">
                        <input name="veterinarian" placeholder="Dr. Sharma" className={inputClass} />
                      </Field>
                      <Field label="Follow-up date">
                        <input name="followUpOn" type="date" className={inputClass} />
                      </Field>
                      <Field label="Outcome">
                        <input name="outcome" placeholder="Recovering / Resolved / Ongoing" className={inputClass} />
                      </Field>
                    </div>
                    <Field label="Prescription, document, or photo">
                      <input
                        name="attachment"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
                      />
                    </Field>
                    <div className="flex justify-end pt-1">
                      <Submit>Save treatment</Submit>
                    </div>
                  </form>
                </RecordDialog>
              ) : null}
            </div>
            <Table headers={["Date", "Problem & Diagnosis", "Medicine & Regimen", "Vet & Outcome", "Follow up", "Attachment", ""]}>
              {treatments.length === 0 ? <EmptyRow cols={7}>No treatment recorded.</EmptyRow> : null}
              {treatments.map((row) => (
                <tr key={row.id} className={row.voidedAt ? "text-muted-foreground" : ""}>
                  <Td>{formatDisplayDate(row.eventOn)}</Td>
                  <Td>
                    <div className="font-medium">{row.problem}</div>
                    {row.diagnosis ? <div className="text-xs text-muted-foreground">Dx: {row.diagnosis}</div> : null}
                    {row.signs ? <div className="text-xs text-muted-foreground">Signs: {row.signs}</div> : null}
                  </Td>
                  <Td>
                    <div>{row.medicine ?? "—"}</div>
                    {row.dose || row.route || row.duration ? (
                      <div className="text-xs text-muted-foreground">{[row.dose, row.route, row.duration].filter(Boolean).join(" · ")}</div>
                    ) : null}
                    {row.treatment ? <div className="text-xs text-muted-foreground">{row.treatment}</div> : null}
                  </Td>
                  <Td>
                    <div>{row.veterinarian ?? "—"}</div>
                    {row.outcome ? <div className="text-xs text-muted-foreground">{row.outcome}</div> : null}
                  </Td>
                  <Td>{row.followUpOn ? formatDisplayDate(row.followUpOn) : "—"}</Td>
                  <Td>
                    {row.attachmentKey ? (
                      <a
                        href={`/animals/${encodeURIComponent(animal.code)}/health/${encodeURIComponent(row.id)}/attachment`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-primary underline underline-offset-4"
                      >
                        {row.attachmentName ?? "View file"}
                      </a>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    {row.voidedAt ? (
                      "Voided"
                    ) : canHealth ? (
                      <VoidRecord entity="health" id={row.id} returnTo={`/animals/${animal.code}?tab=health`} />
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Vaccines</h2>
            {canHealth ? (
              <RecordDialog title="Record vaccine" button="Record vaccine">
                <form action={recordVaccine} className="space-y-3">
                  <input type="hidden" name="animalId" value={animal.id} />
                  <Field label="Vaccine">
                    <input name="vaccine" required className={inputClass} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Given">
                      <input name="givenOn" type="date" className={inputClass} />
                    </Field>
                    <Field label="Batch">
                      <input name="batch" className={inputClass} />
                    </Field>
                  </div>
                  <Field label="Next due">
                    <input name="nextDueOn" type="date" className={inputClass} />
                  </Field>
                  <div className="flex justify-end pt-1">
                    <Submit>Save vaccine</Submit>
                  </div>
                </form>
              </RecordDialog>
            ) : null}
          </div>
          <Table headers={["Given", "Vaccine", "Batch", "Next due"]}>
            {doses.length === 0 ? <EmptyRow cols={4}>No vaccine recorded.</EmptyRow> : null}
            {doses.map((row) => (
              <tr key={row.id}>
                <Td>{formatDisplayDate(row.givenOn)}</Td>
                <Td className="font-medium">{row.vaccine}</Td>
                <Td>{row.batch ?? "—"}</Td>
                <Td>{row.nextDueOn ? formatDisplayDate(row.nextDueOn) : "—"}</Td>
              </tr>
            ))}
          </Table>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Deworming</h2>
            {canHealth ? (
              <RecordDialog title="Record deworming" button="Record deworming">
                <form action={recordDeworming} className="space-y-3">
                  <input type="hidden" name="animalId" value={animal.id} />
                  <Field label="Product">
                    <input name="product" required className={inputClass} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Given">
                      <input name="givenOn" type="date" className={inputClass} />
                    </Field>
                    <Field label="Next due">
                      <input name="nextDueOn" type="date" className={inputClass} />
                    </Field>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Submit>Save deworming</Submit>
                  </div>
                </form>
              </RecordDialog>
            ) : null}
          </div>
          <Table headers={["Given", "Product", "Next due"]}>
            {worms.length === 0 ? <EmptyRow cols={3}>No deworming recorded.</EmptyRow> : null}
            {worms.map((row) => (
              <tr key={row.id}>
                <Td>{formatDisplayDate(row.givenOn)}</Td>
                <Td className="font-medium">{row.product}</Td>
                <Td>{row.nextDueOn ? formatDisplayDate(row.nextDueOn) : "—"}</Td>
              </tr>
            ))}
          </Table>
        </section>

        <ActivityList title="Centralized health timeline" events={healthTimeline} />
      </div>
    );
  }

  if (tab === "milk") {
    const recorded = milkRows.filter((row) => !row.voidedAt);
    const lactationStart = calvingRows
      .filter((row) => !row.voidedAt)
      .map((row) => row.calvedOn)
      .sort()
      .at(-1);
    const lactation = lactationStart ? recorded.filter((row) => row.recordedOn >= lactationStart) : recorded;
    const points = [...lactation]
      .sort((left, right) => left.recordedOn.localeCompare(right.recordedOn))
      .map((row) => ({
        date: row.recordedOn,
        litres: Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0),
      }));
    const history = lactationHistory({
      calvedOn: calvingRows.filter((row) => !row.voidedAt).map((row) => row.calvedOn),
      driedOn: dryRows.filter((row) => !row.voidedAt).map((row) => row.driedOn),
      yields: recorded,
      state: animal.lactation,
      today: farmToday(timezone),
    });
    return (
      <div className="space-y-6">
        {quickBar}
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">This lactation</h2>
            {canMilk && animal.sex !== "male" ? (
              <RecordDialog title="Record milk yield" button="Record milk">
                <form action={recordAnimalMilk} className="space-y-3">
                  <input type="hidden" name="animalId" value={animal.id} />
                  <Field label="Date">
                    <input name="recordedOn" type="date" className={inputClass} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Morning (L)">
                      <input name="morningLitres" inputMode="decimal" className={inputClass} />
                    </Field>
                    <Field label="Evening (L)">
                      <input name="eveningLitres" inputMode="decimal" className={inputClass} />
                    </Field>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Submit>Save milk</Submit>
                  </div>
                </form>
              </RecordDialog>
            ) : null}
          </div>
          {points.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No milk recorded for this lactation.</p> : <MilkChart points={points} />}
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Historical lactation performance</h2>
          <Table headers={["Lactation", "Calved", "Status / Dried off", "Days in milk", "Recorded days", "Total yield", "Peak daily", "Daily avg"]}>
            {history.length === 0 ? <EmptyRow cols={8}>No lactation cycles recorded yet.</EmptyRow> : null}
            {history.map((cycle) => (
              <tr key={cycle.number}>
                <Td className="font-medium">Lactation {cycle.number}</Td>
                <Td>{formatDisplayDate(cycle.calvedOn)}</Td>
                <Td>{cycle.active ? "Active" : cycle.endedOn ? `Dried ${formatDisplayDate(cycle.endedOn)}` : "Completed"}</Td>
                <Td>{cycle.daysInMilk === null ? "—" : `${cycle.daysInMilk} d`}</Td>
                <Td>{cycle.recordedDays}</Td>
                <Td className="font-medium">{cycle.totalLitres.toFixed(1)} L</Td>
                <Td>{cycle.peakLitres.toFixed(1)} L</Td>
                <Td>{cycle.averageLitres.toFixed(1)} L</Td>
              </tr>
            ))}
          </Table>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Daily milk log</h2>
          <Table headers={["Date", "Morning", "Evening", "Total"]}>
            {recorded.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-sm text-muted-foreground">
                  No milk recorded for this animal.
                </td>
              </tr>
            ) : null}
            {recorded.map((row) => {
              const total = Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0);
              return (
                <tr key={row.id}>
                  <Td>{formatDisplayDate(row.recordedOn)}</Td>
                  <Td>{row.morningLitres ?? "—"}</Td>
                  <Td>{row.eveningLitres ?? "—"}</Td>
                  <Td className="font-medium">{total.toFixed(1)} L</Td>
                </tr>
              );
            })}
          </Table>
        </section>
      </div>
    );
  }

  if (tab === "listing" && canList) {
    const listingRows = await db.select().from(listings).where(and(eq(listings.animalId, animal.id), eq(listings.farmId, animal.farmId)));
    return (
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Public listings</h2>
          <RecordDialog title="Add listing" button="Add listing">
            <form action={saveListing} className="space-y-3">
              <input type="hidden" name="animalId" value={animal.id} />
              <Field label="Category">
                <input name="category" defaultValue={animal.sex === "male" ? "bulls" : "cows"} className={inputClass} />
              </Field>
              <Field label="Price, INR">
                <input name="price" className={inputClass} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input name="published" type="checkbox" /> Publish on the catalogue
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input name="showPedigree" type="checkbox" /> Show sire and dam
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input name="showPregnancy" type="checkbox" /> Show pregnancy status
              </label>
              <Field label="Public note">
                <input name="publicNote" className={inputClass} />
              </Field>
              <p className="text-xs text-muted-foreground">Breed {breedName}. Purchase price and clinical notes stay private.</p>
              <div className="flex justify-end pt-1">
                <Submit>Save listing</Submit>
              </div>
            </form>
          </RecordDialog>
        </div>
        <Table headers={["Category", "Price", "Catalogue", "Note"]}>
          {listingRows.length === 0 ? <EmptyRow cols={4}>No listing yet.</EmptyRow> : null}
          {listingRows.map((row) => (
            <tr key={row.id}>
              <Td className="font-medium capitalize">{row.category}</Td>
              <Td>{row.price ? `₹${Number(row.price).toLocaleString("en-IN")}` : "—"}</Td>
              <Td>{row.published === "yes" ? "Published" : "Draft"}</Td>
              <Td>{row.publicNote ?? "—"}</Td>
            </tr>
          ))}
        </Table>
      </section>
    );
  }

  const today = farmToday(timezone);
  const breedRows = await db.select({ id: breeds.id, name: breeds.name }).from(breeds).where(eq(breeds.farmId, animal.farmId));
  const detailError = detailMessages[breedingError ?? ""];
  const dams = herd
    .filter((row) => row.id !== animal.id && (row.sex === "female" || row.id === animal.geneticDamId))
    .sort((left, right) => (left.name ?? left.code).localeCompare(right.name ?? right.code));
  const milkFacts = lactationSummary({
    calvedOn: calvingRows.filter((row) => !row.voidedAt).map((row) => row.calvedOn),
    driedOn: dryRows.filter((row) => !row.voidedAt).map((row) => row.driedOn).sort().at(-1) ?? null,
    state: animal.lactation,
    today,
  });
  const identity = [
    ["Sex", sexLabel[animal.sex]],
    ["Life stage", lifeStageLabel[animal.lifeStage]],
    ["Lactation", milkFacts.number > 0 ? `Lactation ${milkFacts.number}` : "No calving yet"],
    ["Days in milk", milkFacts.daysInMilk === null ? "—" : String(milkFacts.daysInMilk)],
    ["Location", locationName ?? "Unassigned"],
    ["Ear tag", animal.earTag ?? "—"],
    ["Colour", animal.colour ?? "—"],
    ["Marks", animal.marks ?? "—"],
    ["Dam", damLabel],
    ["Sire", sireLabel],
    ["Purchase source", animal.purchaseSource ?? "—"],
    ["Purchase date", animal.purchaseDate ? formatDisplayDate(animal.purchaseDate) : "—"],
    ["Purchase price", animal.purchasePrice ? `₹${Number(animal.purchasePrice).toLocaleString("en-IN")}` : "—"],
  ];

  return (
    <div className="space-y-4">
      {quickBar}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0 space-y-4">
          <Panel
            title="Basic information"
            action={
              canEdit ? (
                <RecordDialog title="Basic information" button="Edit details" quiet open={Boolean(detailError)} notice={detailError}>
                  <form action={updateAnimalDetails} className="grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="code" value={animal.code} />
                    <Field label="Name">
                      <input name="name" defaultValue={animal.name ?? ""} className={inputClass} />
                    </Field>
                    <Field label="Sex">
                      <FormSelect name="sex" className={inputClass} defaultValue={animal.sex} options={Object.entries(sexLabel).map(([value, label]) => ({ value, label }))} />
                    </Field>
                    <Field label="Breed">
                      <FormSelect name="breedId" className={inputClass} defaultValue={animal.breedId} options={breedRows.map((breed) => ({ value: breed.id, label: breed.name }))} />
                    </Field>
                    <Field label="Date of birth">
                      <input name="dob" type="date" defaultValue={animal.dob ?? ""} className={inputClass} />
                    </Field>
                    <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
                      <input name="dobEstimated" type="checkbox" defaultChecked={animal.dobEstimated} className="size-5" />
                      Date of birth is estimated
                    </label>
                    <Field label="Ear tag">
                      <input name="earTag" defaultValue={animal.earTag ?? ""} className={inputClass} />
                    </Field>
                    <Field label="Colour">
                      <input name="colour" defaultValue={animal.colour ?? ""} className={inputClass} />
                    </Field>
                    <Field label="Marks">
                      <input name="marks" defaultValue={animal.marks ?? ""} className={inputClass} />
                    </Field>
                    <Field label="Dam">
                      <FormSelect
                        name="damId"
                        className={inputClass}
                        defaultValue={animal.geneticDamId ?? ""}
                        options={[{ value: "", label: "Not linked" }, ...dams.map((row) => ({ value: row.id, label: row.name && row.name !== row.code ? `${row.name} · ${row.code}` : row.code }))]}
                      />
                    </Field>
                    <Field label="Sire code">
                      <input name="sireCode" defaultValue={animal.geneticSireCode ?? ""} className={inputClass} />
                    </Field>
                    <Field label="Sire name">
                      <input name="sireName" defaultValue={animal.geneticSireName ?? ""} className={inputClass} />
                    </Field>
                    <Field label="Purchase source">
                      <input name="purchaseSource" defaultValue={animal.purchaseSource ?? ""} className={inputClass} />
                    </Field>
                    <Field label="Purchase date">
                      <input name="purchaseDate" type="date" defaultValue={animal.purchaseDate ?? ""} className={inputClass} />
                    </Field>
                    <Field label="Purchase price (INR)">
                      <input name="purchasePrice" inputMode="decimal" defaultValue={animal.purchasePrice ?? ""} className={inputClass} />
                    </Field>
                    <p className="text-xs text-muted-foreground sm:col-span-2">Lactation number and days in milk follow calving and dry-off. The shed is changed with Move.</p>
                    <div className="flex justify-end sm:col-span-2">
                      <Submit>Save details</Submit>
                    </div>
                  </form>
                </RecordDialog>
              ) : null
            }
          >
            <dl className="grid gap-2.5 sm:grid-cols-2">
              {identity.map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border/60 bg-muted/25 px-3 py-2">
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel title="Shed history">
            {canEdit ? (
              <form action={moveAnimal} className="mb-4 grid gap-3">
                <input type="hidden" name="animalId" value={animal.id} />
                <FormSelect
                  name="locationId"
                  required
                  placeholder="Shed"
                  options={shedRows.filter((row) => row.active).map((row) => ({ value: row.id, label: row.name }))}
                />
                <input name="note" placeholder="Reason for the move" className={inputClass} />
                <div className="flex justify-end">
                  <Submit>Move</Submit>
                </div>
              </form>
            ) : null}
            <Table headers={["Date", "Shed", "Note"]}>
              {moveRows.length === 0 ? <EmptyRow cols={3}>No move recorded yet.</EmptyRow> : null}
              {[...moveRows]
                .sort((a, b) => b.movedOn.localeCompare(a.movedOn))
                .map((row) => (
                  <tr key={row.id}>
                    <Td>{formatDisplayDate(row.movedOn)}</Td>
                    <Td>{row.locationId ? (shedName.get(row.locationId) ?? "Shed") : "—"}</Td>
                    <Td>{row.note ?? "—"}</Td>
                  </tr>
                ))}
            </Table>
          </Panel>
          <Panel title="Isolation">
            {animal.isolationReason ? (
              <div className="space-y-3">
                <p className="text-sm">
                  {animal.isolationReason}
                  {animal.isolatedOn ? ` · since ${formatDisplayDate(animal.isolatedOn)}` : ""}
                </p>
                {canEdit ? (
                  <form action={clearIsolation} className="grid gap-3">
                    <input type="hidden" name="animalId" value={animal.id} />
                    <input name="note" required placeholder="Why isolation ended" className={inputClass} />
                    <div className="flex justify-end">
                      <Submit>Clear isolation</Submit>
                    </div>
                  </form>
                ) : null}
              </div>
            ) : canEdit ? (
              <form action={setIsolation} className="grid gap-3">
                <input type="hidden" name="animalId" value={animal.id} />
                <input name="reason" required placeholder="Reason" className={inputClass} />
                <div className="flex justify-end">
                  <Submit>Isolate</Submit>
                </div>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">Not isolated.</p>
            )}
          </Panel>
          <Panel title="Weight">
            <WeightChart
              points={weightRows
                .sort((a, b) => a.weighedOn.localeCompare(b.weighedOn))
                .map((row) => ({ date: row.weighedOn, kg: Number(row.kilograms) }))}
            />
            {canWeight ? (
              <div className="mt-4 flex justify-end">
                <RecordDialog title="Record weight" button="Record weight">
                  <form action={recordWeight} className="space-y-3">
                    <input type="hidden" name="animalId" value={animal.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Kilograms">
                        <input name="kilograms" required inputMode="decimal" className={inputClass} />
                      </Field>
                      <Field label="Date">
                        <input name="weighedOn" type="date" className={inputClass} />
                      </Field>
                    </div>
                    <Field label="Note">
                      <input name="note" className={inputClass} />
                    </Field>
                    <div className="flex justify-end pt-1">
                      <Submit>Save weight</Submit>
                    </div>
                  </form>
                </RecordDialog>
              </div>
            ) : null}
            <div className="mt-4">
              <Table headers={["Date", "Kilograms", "Note"]}>
                {weightRows.length === 0 ? <EmptyRow cols={3}>No weight recorded.</EmptyRow> : null}
                {[...weightRows]
                  .sort((a, b) => b.weighedOn.localeCompare(a.weighedOn))
                  .map((row) => (
                    <tr key={row.id}>
                      <Td>{formatDisplayDate(row.weighedOn)}</Td>
                      <Td className="font-medium">{row.kilograms} kg</Td>
                      <Td>{row.note ?? "—"}</Td>
                    </tr>
                  ))}
              </Table>
            </div>
          </Panel>
        </div>
        <ActivityList title="Lifetime history" events={timeline} />
      </div>
    </div>
  );
}

function ActivityList({ title, events }: { title: string; events: { when: string; label: string; group?: string }[] }) {
  function dotColor(group?: string) {
    if (group === "breeding") return "bg-amber-500";
    if (group === "health") return "bg-rose-500";
    if (group === "milk") return "bg-emerald-500";
    if (group === "feed") return "bg-sky-500";
    if (group === "status") return "bg-violet-500";
    return "bg-primary";
  }

  return (
    <Panel
      title={title}
      action={
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
          {events.length} {events.length === 1 ? "entry" : "entries"}
        </span>
      }
    >
      {events.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <ol className="relative ml-2 space-y-3 border-l border-border/80 pl-4">
          {events.map((event, index) => (
            <li key={`${event.when}-${event.label}-${index}`} className="relative text-sm">
              <span className={`absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-4 ring-card ${dotColor(event.group)}`} />
              <span className="block text-[11px] font-medium tabular-nums text-muted-foreground">{formatDisplayDate(event.when)}</span>
              <span className="mt-0.5 block font-medium text-foreground">{event.label}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
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

const breedingMessages: Record<string, string> = {
  bull: "Enter the bull code.",
  straw: "That straw is not available.",
  conception: "Choose the insemination for this calving.",
};

function parentOptions(rows: { code: string; name: string | null }[], emptyLabel: string) {
  const seen = new Set<string>();
  const options = rows
    .filter((row) => {
      if (seen.has(row.code)) return false;
      seen.add(row.code);
      return true;
    })
    .map((row) => ({
      value: row.code,
      label: row.name && row.name !== row.code ? `${row.name} · ${row.code}` : row.code,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return [{ value: "", label: emptyLabel }, ...options];
}

function ordinal(generation: number) {
  const mod100 = generation % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${generation}th`;
  const mod10 = generation % 10;
  if (mod10 === 1) return `${generation}st`;
  if (mod10 === 2) return `${generation}nd`;
  if (mod10 === 3) return `${generation}rd`;
  return `${generation}th`;
}

function generationTargets(chart: AncestorChart) {
  const levels = chart.generations.slice(0, -1).map((nodes, index) => [index + 1, nodes] as const);
  const seen = new Set<string>();
  const options: { value: string; label: string }[] = [];
  for (const [generation, nodes] of levels) {
    nodes.forEach((node, index) => {
      if (!node.code || seen.has(node.code)) return;
      seen.add(node.code);
      const role = index % 2 === 0 ? "sire" : "dam";
      const who = node.name && node.name !== node.code ? `${node.name} · ${node.code}` : node.code;
      options.push({
        value: `${node.code}\t${node.name ?? ""}`,
        label: `${ordinal(generation + 1)} generation under ${ordinal(generation)} ${role} ${who}`,
      });
    });
  }
  return options;
}

const generationMessages: Record<string, string> = {
  generation: "Choose who you are adding parents for, and enter a sire or a dam.",
  gendam: "That dam needs to be a cow already on this farm. Use her animal code.",
  gensire: "The sire code cannot be the same animal.",
};

const pedigreeMessages: Record<string, string> = {
  pedigree: "Check the sire and dam, then try again.",
  dam: "Choose a dam from this farm. She cannot be this animal or one of her descendants.",
  sire: "The sire code cannot be this animal.",
};

const detailMessages: Record<string, string> = {
  details: "Check these details and try again.",
  date: "Date of birth is not valid.",
  eartag: "That ear tag is already used on this farm.",
  dam: "Choose a dam from this farm. She cannot be this animal or one of her descendants.",
  sire: "The sire code cannot be this animal.",
};

function pregnancyResult(result: string) {
  if (result === "pregnant") return "Pregnant";
  if (result === "not_pregnant") return "Not pregnant";
  if (result === "doubtful") return "Doubtful";
  return result;
}
