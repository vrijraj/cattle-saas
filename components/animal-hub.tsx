import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  animals,
  bulls,
  calvings,
  dewormings,
  healthEvents,
  heats,
  inseminations,
  listings,
  milkYields,
  pregnancyChecks,
  vaccinations,
  weights,
} from "@/db/schema";
import { recordAi, recordCalving, recordDeworming, recordHealth, recordHeat, recordPd, recordVaccine, recordWeight, saveListing } from "@/app/(farm)/herd/actions";
import { formatDisplayDate } from "@/lib/dates";
import { PedigreeChart } from "@/components/pedigree-chart";
import { WeightChart } from "@/components/weight-chart";
import { RecordDialog } from "@/components/record-dialog";
import { VoidRecord } from "@/components/void-record";
import { FormSelect } from "@/components/form-select";
import { EmptyRow, inputClass, Panel, Submit, Table, Td } from "@/components/workspace";
import { lifeStageLabel, sexLabel } from "@/lib/labels";
import { ancestorChart } from "@/lib/pedigree-tree";

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
  canBreed,
  canHealth,
  canList,
}: {
  animal: AnimalRow;
  breedName: string;
  locationName: string | null;
  damLabel: string;
  sireLabel: string;
  tab: ProfileTab;
  breedingError?: string;
  canBreed: boolean;
  canHealth: boolean;
  canList: boolean;
}) {
  const herd = await db.select().from(animals).where(eq(animals.farmId, animal.farmId));
  const bullRows = await db.select().from(bulls).where(eq(bulls.farmId, animal.farmId));
  const offspring = herd.filter((row) => row.geneticDamId === animal.id || row.geneticSireCode === animal.code);
  const chart = ancestorChart(animal, herd, bullRows);
  const heatRows = await db.select().from(heats).where(eq(heats.animalId, animal.id));
  const aiRows = await db.select().from(inseminations).where(eq(inseminations.animalId, animal.id));
  const pdRows = await db.select().from(pregnancyChecks).where(eq(pregnancyChecks.animalId, animal.id));
  const calvingRows = await db.select().from(calvings).where(eq(calvings.damId, animal.id));
  const healthRows = await db.select().from(healthEvents).where(eq(healthEvents.animalId, animal.id));
  const vaccineRows = await db.select().from(vaccinations).where(eq(vaccinations.animalId, animal.id));
  const dewormRows = await db.select().from(dewormings).where(eq(dewormings.animalId, animal.id));
  const weightRows = await db.select().from(weights).where(and(eq(weights.animalId, animal.id)));
  const milkRows = await db
    .select()
    .from(milkYields)
    .where(eq(milkYields.animalId, animal.id))
    .orderBy(desc(milkYields.recordedOn));

  const timeline = [
    ...heatRows.map((row) => ({ when: row.observedOn, label: `Heat · ${row.signs}`, group: "breeding" })),
    ...aiRows.map((row) => ({ when: row.performedOn, label: `AI · ${row.bullCode}${row.strawCode ? ` · ${row.strawCode}` : ""}`, group: "breeding" })),
    ...pdRows.map((row) => ({ when: row.checkedOn, label: `Pregnancy check · ${row.result.replaceAll("_", " ")}`, group: "breeding" })),
    ...calvingRows.map((row) => ({ when: row.calvedOn, label: `Calving · ${row.outcome}`, group: "breeding" })),
    ...healthRows.map((row) => ({ when: row.eventOn, label: `Treatment · ${row.problem}`, group: "health" })),
    ...vaccineRows.map((row) => ({ when: row.givenOn, label: `Vaccine · ${row.vaccine}`, group: "health" })),
    ...dewormRows.map((row) => ({ when: row.givenOn, label: `Deworming · ${row.product}`, group: "health" })),
    ...weightRows.map((row) => ({ when: row.weighedOn, label: `Weight · ${row.kilograms} kg`, group: "overview" })),
  ].sort((a, b) => b.when.localeCompare(a.when));

  if (tab === "parentage") {
    return (
      <PedigreeChart
        chart={chart}
        offspring={offspring.map((row) => ({ code: row.code, name: row.name }))}
      />
    );
  }

  if (tab === "breeding") {
    const recordable = canBreed && animal.sex !== "male";
    const breedingNotice = breedingMessages[breedingError ?? ""];
    const heats = [...heatRows].sort((a, b) => b.observedOn.localeCompare(a.observedOn));
    const ais = [...aiRows].sort((a, b) => b.performedOn.localeCompare(a.performedOn));
    const checks = [...pdRows].sort((a, b) => b.checkedOn.localeCompare(a.checkedOn));
    const births = [...calvingRows].sort((a, b) => b.calvedOn.localeCompare(a.calvedOn));
    const aiById = new Map(aiRows.map((row) => [row.id, row]));
    const herdById = new Map(herd.map((row) => [row.id, row]));

    function bullLabel(row: { bullCode: string; bullName: string | null }) {
      return row.bullName && row.bullName !== row.bullCode ? `${row.bullName} · ${row.bullCode}` : row.bullCode;
    }

    return (
      <div className="space-y-8">
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
                  <div className="flex justify-end pt-1">
                    <Submit>Save heat</Submit>
                  </div>
                </form>
              </RecordDialog>
            ) : null}
          </div>
          <Table headers={["Observed", "Signs"]}>
            {heats.length === 0 ? <EmptyRow cols={2}>No heat recorded.</EmptyRow> : null}
            {heats.map((row) => (
              <tr key={row.id}>
                <Td>{formatDisplayDate(row.observedOn)}</Td>
                <Td>{row.signs}</Td>
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
                  </div>
                  <div className="flex justify-end pt-1">
                    <Submit>Save insemination</Submit>
                  </div>
                </form>
              </RecordDialog>
            ) : null}
          </div>
          <Table headers={["Date", "Bull", "Batch", "Straw", "Technician", ""]}>
            {ais.length === 0 ? <EmptyRow cols={6}>No insemination recorded.</EmptyRow> : null}
            {ais.map((row) => (
              <tr key={row.id} className={row.voidedAt ? "text-muted-foreground" : ""}>
                <Td>{formatDisplayDate(row.performedOn)}</Td>
                <Td className="font-medium">{bullLabel(row)}</Td>
                <Td>{row.batchNumber ?? "—"}</Td>
                <Td>{row.strawCode ?? "—"}</Td>
                <Td>{row.technicianName}</Td>
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
          <Table headers={["Checked", "Result", "Insemination"]}>
            {checks.length === 0 ? <EmptyRow cols={3}>No pregnancy check recorded.</EmptyRow> : null}
            {checks.map((row) => {
              const ai = row.inseminationId ? aiById.get(row.inseminationId) : undefined;
              return (
                <tr key={row.id}>
                  <Td>{formatDisplayDate(row.checkedOn)}</Td>
                  <Td className="font-medium">{pregnancyResult(row.result)}</Td>
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
                  </div>
                  <div className="flex justify-end pt-1">
                    <Submit>Save calving</Submit>
                  </div>
                </form>
              </RecordDialog>
            ) : null}
          </div>
          <Table headers={["Calved", "Outcome", "Calf", "Insemination"]}>
            {births.length === 0 ? <EmptyRow cols={4}>No calving recorded.</EmptyRow> : null}
            {births.map((row) => {
              const calf = row.calfId ? herdById.get(row.calfId) : undefined;
              const ai = row.inseminationId ? aiById.get(row.inseminationId) : undefined;
              return (
                <tr key={row.id}>
                  <Td>{formatDisplayDate(row.calvedOn)}</Td>
                  <Td className="font-medium">{row.outcome === "live" ? "Live calf" : "Dead calf"}</Td>
                  <Td>{calf ? (calf.name && calf.name !== calf.code ? `${calf.name} · ${calf.code}` : calf.code) : "—"}</Td>
                  <Td>{ai ? `${formatDisplayDate(ai.performedOn)} · ${bullLabel(ai)}` : "—"}</Td>
                </tr>
              );
            })}
          </Table>
        </section>
      </div>
    );
  }

  if (tab === "health") {
    const treatments = [...healthRows].sort((a, b) => b.eventOn.localeCompare(a.eventOn));
    const doses = [...vaccineRows].sort((a, b) => b.givenOn.localeCompare(a.givenOn));
    const worms = [...dewormRows].sort((a, b) => b.givenOn.localeCompare(a.givenOn));

    return (
      <div className="space-y-8">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Treatments</h2>
            {canHealth ? (
              <RecordDialog title="Record treatment" button="Record treatment">
                <form action={recordHealth} className="space-y-3">
                  <input type="hidden" name="animalId" value={animal.id} />
                  <Field label="Problem">
                    <input name="problem" required className={inputClass} />
                  </Field>
                  <Field label="Medicine">
                    <input name="medicine" className={inputClass} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Dose">
                      <input name="dose" className={inputClass} />
                    </Field>
                    <Field label="Follow up">
                      <input name="followUpOn" type="date" className={inputClass} />
                    </Field>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Submit>Save treatment</Submit>
                  </div>
                </form>
              </RecordDialog>
            ) : null}
          </div>
          <Table headers={["Date", "Problem", "Medicine", "Dose", "Follow up", ""]}>
            {treatments.length === 0 ? <EmptyRow cols={6}>No treatment recorded.</EmptyRow> : null}
            {treatments.map((row) => (
              <tr key={row.id} className={row.voidedAt ? "text-muted-foreground" : ""}>
                <Td>{formatDisplayDate(row.eventOn)}</Td>
                <Td className="font-medium">{row.problem}</Td>
                <Td>{row.medicine ?? "—"}</Td>
                <Td>{row.dose ?? "—"}</Td>
                <Td>{row.followUpOn ? formatDisplayDate(row.followUpOn) : "—"}</Td>
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
      </div>
    );
  }

  if (tab === "milk") {
    return (
      <Table headers={["Date", "Morning", "Evening", "Total"]}>
        {milkRows.length === 0 ? (
          <tr>
            <td colSpan={4} className="px-4 py-8 text-sm text-muted-foreground">
              No milk recorded for this animal.
            </td>
          </tr>
        ) : null}
        {milkRows.map((row) => {
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

  const identity = [
    ["Sex", sexLabel[animal.sex]],
    ["Life stage", lifeStageLabel[animal.lifeStage]],
    ["Location", locationName ?? "Unassigned"],
    ["Ear tag", animal.earTag ?? "—"],
    ["Colour", animal.colour ?? "—"],
    ["Marks", animal.marks ?? "—"],
    ["Dam", damLabel],
    ["Sire", sireLabel],
  ];

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <div className="min-w-0 space-y-4">
        <Panel title="Basic information">
          <dl className="grid gap-4 sm:grid-cols-2">
            {identity.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Weight">
          <WeightChart
            points={weightRows
              .sort((a, b) => a.weighedOn.localeCompare(b.weighedOn))
              .map((row) => ({ date: row.weighedOn, kg: Number(row.kilograms) }))}
          />
          <div className="mt-4 flex justify-end">
            <RecordDialog title="Record weight" button="Record weight">
              <form action={recordWeight} className="space-y-3">
                <input type="hidden" name="animalId" value={animal.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Kilograms">
                    <input name="kilograms" inputMode="decimal" className={inputClass} />
                  </Field>
                  <Field label="Date">
                    <input name="weighedOn" type="date" className={inputClass} />
                  </Field>
                </div>
                <div className="flex justify-end pt-1">
                  <Submit>Save weight</Submit>
                </div>
              </form>
            </RecordDialog>
          </div>
          <div className="mt-4">
            <Table headers={["Date", "Kilograms"]}>
              {weightRows.length === 0 ? <EmptyRow cols={2}>No weight recorded.</EmptyRow> : null}
              {[...weightRows]
                .sort((a, b) => b.weighedOn.localeCompare(a.weighedOn))
                .map((row) => (
                  <tr key={row.id}>
                    <Td>{formatDisplayDate(row.weighedOn)}</Td>
                    <Td className="font-medium">{row.kilograms} kg</Td>
                  </tr>
                ))}
            </Table>
          </div>
        </Panel>
      </div>
      <ActivityList title="Recent activity" events={timeline.slice(0, 8)} />
    </div>
  );
}

function ActivityList({ title, events }: { title: string; events: { when: string; label: string }[] }) {
  return (
    <Panel title={title}>
      <ul className="divide-y divide-border">
        {events.length === 0 ? <li className="py-2 text-sm text-muted-foreground">Nothing recorded yet.</li> : null}
        {events.map((event) => (
          <li key={`${event.when}-${event.label}`} className="flex gap-3 py-3 text-sm">
            <span className="w-24 shrink-0 text-muted-foreground">{formatDisplayDate(event.when)}</span>
            <span className="min-w-0">{event.label}</span>
          </li>
        ))}
      </ul>
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

function pregnancyResult(result: string) {
  if (result === "pregnant") return "Pregnant";
  if (result === "not_pregnant") return "Not pregnant";
  if (result === "doubtful") return "Doubtful";
  return result;
}
