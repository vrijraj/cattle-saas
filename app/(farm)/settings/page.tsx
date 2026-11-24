import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { breeds } from "@/db/schema";
import { FormSelect } from "@/components/form-select";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Notice, Panel, Pill, Submit, Summary, Table, Td } from "@/components/workspace";
import { requireFarm } from "@/lib/farm-context";
import { canManageSettings } from "@/lib/permissions";
import { saveBreed, saveFarmGeneral, saveFarmRules } from "./actions";

export const metadata = { title: "Farm settings" };

const errorMessages: Record<string, string> = {
  role: "Only owners and admins can change farm settings.",
  farm: "Enter a farm name between 2 and 100 characters.",
  prefix: "Animal code prefix must be 2–6 uppercase letters or digits (for example MIL).",
  email: "Enter a valid enquiry contact email address.",
  timezone: "Enter a valid IANA timezone (for example Asia/Kolkata).",
  rules: "Check the numeric bounds for milk, gestation, PD, dry-off, and mating defaults.",
  breed: "Enter a valid breed name, 2–5 character code, and gestation days between 250 and 350.",
  breed_dup: "A breed with that code already exists on this farm.",
};

const savedMessages: Record<string, string> = {
  farm: "Farm details updated.",
  rules: "Milk, breeding, and alert rules updated.",
  breed: "Breed catalogue updated.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const farm = await requireFarm();
  if (!canManageSettings(farm.roles)) redirect("/dashboard");
  const query = await searchParams;
  const breedRows = await db
    .select()
    .from(breeds)
    .where(eq(breeds.farmId, farm.farmId))
    .orderBy(asc(breeds.species), asc(breeds.name));
  const activeBreeds = breedRows.filter((b) => b.active).length;

  return (
    <div className="space-y-5">
      <Summary
        title="Farm settings"
        description="Configure farm identity, enquiry contact email, milk pricing, reproductive offsets, alert thresholds, and the breed catalogue."
        facts={[
          { label: "Prefix", value: farm.animalPrefix },
          { label: "Milk drop rule", value: `${farm.milkDropPercent}%` },
          { label: "Active breeds", value: `${activeBreeds} / ${breedRows.length}` },
        ]}
      />
      {query.error && errorMessages[query.error] ? <Notice tone="danger">{errorMessages[query.error]}</Notice> : null}
      {query.saved && savedMessages[query.saved] ? <Notice>{savedMessages[query.saved]}</Notice> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Farm profile" description="Identity, timezone, ID prefix, and public enquiry recipient.">
          <form action={saveFarmGeneral} className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Farm name</span>
              <input name="name" required minLength={2} maxLength={100} defaultValue={farm.farmName} className={inputClass} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Animal code prefix</span>
                <input name="animalPrefix" required minLength={2} maxLength={6} defaultValue={farm.animalPrefix} className={inputClass} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Timezone</span>
                <input name="timezone" required defaultValue={farm.timezone} placeholder="Asia/Kolkata" className={inputClass} />
              </label>
            </div>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Public enquiry email (optional)</span>
              <input
                name="enquiryEmail"
                type="email"
                defaultValue={farm.enquiryEmail ?? ""}
                placeholder="Defaults to farm owner email"
                className={inputClass}
              />
            </label>
            <div className="flex justify-end pt-1">
              <Submit>Save farm profile</Submit>
            </div>
          </form>
        </Panel>

        <Panel title="Milk, breeding & alert rules" description="Defaults used for derived due dates, milk drop alerts, and mating checks.">
          <form action={saveFarmRules} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Milk price (₹ / litre)</span>
                <input
                  name="milkPricePerLitre"
                  type="number"
                  min={0}
                  max={1000}
                  step="0.01"
                  defaultValue={farm.milkPricePerLitre ? Number(farm.milkPricePerLitre) : ""}
                  placeholder="Unset"
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Milk drop alert (%)</span>
                <input
                  name="milkDropPercent"
                  type="number"
                  min={5}
                  max={90}
                  step={1}
                  required
                  defaultValue={farm.milkDropPercent}
                  className={inputClass}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="requireBothMilkSessions" defaultChecked={farm.requireBothMilkSessions} />
              <span>Require both morning &amp; evening milk before triggering drop alert</span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">PD due · cattle (days)</span>
                <input name="pdDueDaysCattle" type="number" min={20} max={90} step={1} required defaultValue={farm.pdDueDaysCattle} className={inputClass} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">PD due · buffalo (days)</span>
                <input name="pdDueDaysBuffalo" type="number" min={20} max={90} step={1} required defaultValue={farm.pdDueDaysBuffalo} className={inputClass} />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Dry-off · cattle</span>
                <input name="dryOffLeadCattle" type="number" min={30} max={120} step={1} required defaultValue={farm.dryOffLeadCattle} className={inputClass} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Dry-off · buffalo</span>
                <input name="dryOffLeadBuffalo" type="number" min={30} max={150} step={1} required defaultValue={farm.dryOffLeadBuffalo} className={inputClass} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Mating gens (3–6)</span>
                <input name="matingGenerationWindow" type="number" min={3} max={6} step={1} required defaultValue={farm.matingGenerationWindow} className={inputClass} />
              </label>
            </div>
            <div className="flex justify-end pt-1">
              <Submit>Save rules</Submit>
            </div>
          </form>
        </Panel>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Breed catalogue</h2>
            <p className="text-xs text-muted-foreground">Gestation days determine calculated expected calving dates. Deactivating hides a breed on new animals while keeping historical records.</p>
          </div>
          <RecordDialog title="Add breed" button="Add breed">
            <form action={saveBreed} className="grid gap-3">
              <label className="grid gap-1 text-sm">
                Breed name
                <input name="name" required maxLength={80} placeholder="e.g. Gir, Murrah, Jersey" className={inputClass} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  Code (2–5 chars)
                  <input name="code" required minLength={2} maxLength={5} placeholder="e.g. GIR" className={inputClass} />
                </label>
                <label className="grid gap-1 text-sm">
                  Species
                  <FormSelect
                    name="species"
                    defaultValue="cattle"
                    options={[
                      { value: "cattle", label: "Cattle" },
                      { value: "buffalo", label: "Buffalo" },
                    ]}
                  />
                </label>
              </div>
              <label className="grid gap-1 text-sm">
                Gestation days
                <input name="gestationDays" type="number" min={250} max={350} step={1} required defaultValue={285} className={inputClass} />
              </label>
              <div className="flex justify-end">
                <Submit>Save breed</Submit>
              </div>
            </form>
          </RecordDialog>
        </div>

        <Table headers={["Breed", "Code", "Species", "Gestation", "Status", ""]}>
          {breedRows.length === 0 ? <EmptyRow cols={6}>No breeds configured.</EmptyRow> : null}
          {breedRows.map((breed) => (
            <tr key={breed.id}>
              <Td className="font-medium">{breed.name}</Td>
              <Td>{breed.code}</Td>
              <Td className="capitalize">{breed.species}</Td>
              <Td>{breed.gestationDays} days</Td>
              <Td>
                <Pill tone={breed.active ? "good" : "neutral"}>{breed.active ? "Active" : "Inactive"}</Pill>
              </Td>
              <Td>
                <RecordDialog quiet title={`Edit ${breed.name}`} button="Edit">
                  <form action={saveBreed} className="grid gap-3">
                    <input type="hidden" name="id" value={breed.id} />
                    <input type="hidden" name="code" value={breed.code} />
                    <input type="hidden" name="species" value={breed.species} />
                    <label className="grid gap-1 text-sm">
                      Breed name
                      <input name="name" required maxLength={80} defaultValue={breed.name} className={inputClass} />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Gestation days
                      <input name="gestationDays" type="number" min={250} max={350} step={1} required defaultValue={breed.gestationDays} className={inputClass} />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="active" defaultChecked={breed.active} />
                      <span>Active (available on new animals)</span>
                    </label>
                    <div className="flex justify-end">
                      <Submit>Save changes</Submit>
                    </div>
                  </form>
                </RecordDialog>
              </Td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
