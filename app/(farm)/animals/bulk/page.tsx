import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { animals, locations } from "@/db/schema";
import { CsvImportWizard } from "@/components/csv-import-wizard";
import { FormSelect } from "@/components/form-select";
import { PanelTabs } from "@/components/panel-tabs";
import { inputClass, Notice, Panel, pickTab, Submit, Summary } from "@/components/workspace";
import { farmToday } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canRecordVaccine, canWriteAnimals, canWriteMilk } from "@/lib/permissions";
import { bulkMoveShed, bulkVaccinateOrDeworm } from "./actions";

export const metadata = { title: "Bulk actions & CSV import" };

const errorMessages: Record<string, string> = {
  role: "Your role does not have permission for this bulk operation.",
  form: "Check required fields and date values and try again.",
  empty: "Select at least one animal or choose a shed that has on-farm animals.",
};

export default async function BulkAnimalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string; error?: string }>;
}) {
  const farm = await requireFarm();
  const query = await searchParams;
  const today = farmToday(farm.timezone);

  const [herd, shedRows] = await Promise.all([
    db
      .select({ id: animals.id, code: animals.code, name: animals.name, locationId: animals.locationId })
      .from(animals)
      .where(and(eq(animals.farmId, farm.farmId), eq(animals.presence, "on_farm")))
      .orderBy(asc(animals.code)),
    db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(and(eq(locations.farmId, farm.farmId), eq(locations.active, true)))
      .orderBy(asc(locations.name)),
  ]);

  const shedById = new Map(shedRows.map((s) => [s.id, s.name]));
  const canVax = canRecordVaccine(farm.roles, farm.canRecordVaccines);
  const canMove = canWriteAnimals(farm.roles);
  const canImportMilk = canWriteMilk(farm.roles);

  const tabs = [
    { id: "vaccinate", label: "Bulk vaccinate / deworm" },
    { id: "move", label: "Bulk move shed" },
    { id: "import", label: "CSV import wizard" },
  ];
  const tab = pickTab(query.tab, tabs, "vaccinate");

  return (
    <div className="space-y-5">
      <Summary
        title="Bulk actions & CSV import"
        description="Vaccinate or deworm a whole shed at once, move batches of animals between pens, or import historical cattle and milk spreadsheets."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/animals/labels"
              className="inline-flex h-9 items-center rounded-full border border-border bg-white px-3.5 text-xs font-semibold text-foreground transition hover:bg-muted"
            >
              Print QR label sheet
            </Link>
            <Link
              href="/animals"
              className="inline-flex h-9 items-center rounded-full border border-border bg-white px-3.5 text-xs font-semibold text-foreground transition hover:bg-muted"
            >
              ← Cattle register
            </Link>
          </div>
        }
        facts={[
          { label: "On-farm herd", value: String(herd.length) },
          { label: "Active sheds", value: String(shedRows.length) },
        ]}
      />
      {query.error && errorMessages[query.error] ? <Notice tone="danger">{errorMessages[query.error]}</Notice> : null}
      {query.saved ? <Notice>Bulk operation completed for {query.saved} animals.</Notice> : null}

      <PanelTabs
        initialTab={tab}
        tabs={tabs}
        panels={{
          vaccinate: canVax ? (
            <Panel title="Bulk vaccination or deworming" description="Target an entire shed or pick individual animals. Optional next due date creates reminders automatically.">
              <form action={bulkVaccinateOrDeworm} className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-sm">
                    Event type
                    <FormSelect
                      name="kind"
                      defaultValue="vaccine"
                      options={[
                        { value: "vaccine", label: "Vaccination" },
                        { value: "deworming", label: "Deworming" },
                      ]}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Vaccine / dewormer name
                    <input name="productName" required maxLength={120} placeholder="e.g. FMD Raksha Ovac" className={inputClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Batch # (optional)
                    <input name="batch" maxLength={60} placeholder="Batch number" className={inputClass} />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-sm">
                    Date given
                    <input name="givenOn" type="date" max={today} defaultValue={today} className={inputClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Next due date (optional)
                    <input name="nextDueOn" type="date" className={inputClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Whole shed target (optional)
                    <FormSelect
                      name="shedId"
                      defaultValue=""
                      options={[{ value: "", label: "Or pick animals below…" }, ...shedRows.map((s) => ({ value: s.id, label: s.name }))]}
                    />
                  </label>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Or select individual animals ({herd.length} on farm)</p>
                  <div className="grid max-h-60 gap-1.5 overflow-y-auto rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-3">
                    {herd.map((animal) => (
                      <label key={animal.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs">
                        <input type="checkbox" name="animalIds" value={animal.id} />
                        <span className="truncate font-medium">{animal.name ?? animal.code}</span>
                        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{animal.code}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end">
                  <Submit>Record for selected animals</Submit>
                </div>
              </form>
            </Panel>
          ) : (
            <Notice tone="danger">Your role does not have permission to record vaccinations or deworming.</Notice>
          ),
          move: canMove ? (
            <Panel title="Bulk shed transfer" description="Move an entire shed or selected animals to a destination shed with full movement history.">
              <form action={bulkMoveShed} className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-sm">
                    Move all from shed (optional)
                    <FormSelect
                      name="fromShedId"
                      defaultValue=""
                      options={[{ value: "", label: "Or pick animals below…" }, ...shedRows.map((s) => ({ value: s.id, label: s.name }))]}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Destination shed
                    <FormSelect
                      name="toLocationId"
                      required
                      defaultValue={shedRows[0]?.id ?? ""}
                      options={shedRows.map((s) => ({ value: s.id, label: s.name }))}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Move date
                    <input name="movedOn" type="date" max={today} defaultValue={today} className={inputClass} />
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  Note
                  <input name="note" maxLength={160} placeholder="e.g. Dry-off group shift" className={inputClass} />
                </label>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Or select individual animals</p>
                  <div className="grid max-h-60 gap-1.5 overflow-y-auto rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-3">
                    {herd.map((animal) => (
                      <label key={animal.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs">
                        <input type="checkbox" name="animalIds" value={animal.id} />
                        <span className="truncate font-medium">{animal.name ?? animal.code}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {animal.locationId ? shedById.get(animal.locationId) : "Unassigned"}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end">
                  <Submit>Move selected animals</Submit>
                </div>
              </form>
            </Panel>
          ) : (
            <Notice tone="danger">Your role does not have permission to move animals.</Notice>
          ),
          import: canMove || canImportMilk ? (
            <CsvImportWizard canImportAnimals={canMove} canImportMilk={canImportMilk} />
          ) : (
            <Notice tone="danger">Your role does not have permission to import cattle or milk data.</Notice>
          ),
        }}
      />
    </div>
  );
}
