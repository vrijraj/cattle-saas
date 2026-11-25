import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { breeds, farms } from "@/db/schema";
import { FormSelect } from "@/components/form-select";
import { IotKeyPanel } from "@/components/iot-key-panel";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Notice, Panel, Pill, Submit, Summary, Table, Td } from "@/components/workspace";
import { requireFarm } from "@/lib/farm-context";
import { canManageSettings } from "@/lib/permissions";
import { getFarmUsage, PLANS, planSpec } from "@/lib/plans";
import { saveBreed, saveFarmGeneral, saveFarmRules, updateFarmPlan } from "./actions";

export const metadata = { title: "Farm settings" };

const errorMessages: Record<string, string> = {
  role: "Only owners and admins can change farm settings.",
  farm: "Enter a farm name between 2 and 100 characters.",
  prefix: "Animal code prefix must be 2–6 uppercase letters or digits (for example MIL).",
  email: "Enter a valid enquiry contact email address.",
  timezone: "Enter a valid IANA timezone (for example Asia/Kolkata).",
  rules: "Check the numeric bounds for milk, gestation, PD, dry-off, VWP, and mating defaults.",
  breed: "Enter a valid breed name, 2–5 character code, and gestation days between 250 and 350.",
  breed_dup: "A breed with that code already exists on this farm.",
};

const savedMessages: Record<string, string> = {
  farm: "Farm details updated.",
  rules: "Milk, breeding, and alert rules updated.",
  breed: "Breed catalogue updated.",
  plan: "Subscription plan updated.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const farm = await requireFarm();
  if (!canManageSettings(farm.roles)) redirect("/dashboard");
  const query = await searchParams;
  const [breedRows, usage, [farmMeta]] = await Promise.all([
    db
      .select()
      .from(breeds)
      .where(eq(breeds.farmId, farm.farmId))
      .orderBy(asc(breeds.species), asc(breeds.name)),
    getFarmUsage(farm.farmId),
    db.select({ iotApiKeyHash: farms.iotApiKeyHash }).from(farms).where(eq(farms.id, farm.farmId)).limit(1),
  ]);
  const activeBreeds = breedRows.filter((b) => b.active).length;
  const currentPlan = planSpec(farm.plan);

  return (
    <div className="space-y-5">
      <Summary
        title="Farm settings"
        description="Configure farm identity, WhatsApp, language, reproductive offsets, IoT integration, subscription limits, and the breed catalogue."
        facts={[
          { label: "Plan", value: currentPlan.name },
          { label: "Herd quota", value: `${usage.onFarmAnimals} / ${farm.maxAnimals}` },
          { label: "Staff seats", value: `${usage.members} / ${farm.maxMembers}` },
          { label: "Active breeds", value: `${activeBreeds} / ${breedRows.length}` },
        ]}
      />
      {query.error && errorMessages[query.error] ? <Notice tone="danger">{errorMessages[query.error]}</Notice> : null}
      {query.saved && savedMessages[query.saved] ? <Notice>{savedMessages[query.saved]}</Notice> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Farm profile" description="Identity, timezone, WhatsApp, language, ID prefix, and public enquiry recipient.">
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
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">WhatsApp number (for buyers)</span>
                <input
                  name="whatsappNumber"
                  defaultValue={farm.whatsappNumber ?? ""}
                  placeholder="919876543210"
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Default farm language</span>
                <FormSelect
                  name="locale"
                  defaultValue={farm.farmLocale}
                  options={[
                    { value: "en", label: "English" },
                    { value: "hi", label: "हिन्दी (Hindi)" },
                    { value: "gu", label: "ગુજરાતી (Gujarati)" },
                    { value: "mr", label: "मराठी (Marathi)" },
                  ]}
                />
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

        <Panel title="Milk, breeding & alert rules" description="Defaults used for derived due dates, VWP, milk drop alerts, and mating checks.">
          <form action={saveFarmRules} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Milk price (₹ / L)</span>
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
                <span className="text-muted-foreground">Milk drop (%)</span>
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
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">VWP fresh→open (d)</span>
                <input
                  name="voluntaryWaitingDays"
                  type="number"
                  min={20}
                  max={120}
                  step={1}
                  required
                  defaultValue={farm.voluntaryWaitingDays}
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

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Subscription & quotas" description={`Current plan: ${currentPlan.name} (${farm.subscriptionStatus}).`}>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-muted/60 p-2.5">
                <p className="text-muted-foreground">On-farm animals</p>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {usage.onFarmAnimals} / {farm.maxAnimals}
                </p>
              </div>
              <div className="rounded-xl bg-muted/60 p-2.5">
                <p className="text-muted-foreground">Team members</p>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {usage.members} / {farm.maxMembers}
                </p>
              </div>
              <div className="rounded-xl bg-muted/60 p-2.5">
                <p className="text-muted-foreground">AI sessions (mo)</p>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {usage.aiSessionsThisMonth} / {farm.aiMonthlyLimit}
                </p>
              </div>
            </div>
            <form action={updateFarmPlan} className="grid gap-2.5 sm:grid-cols-3">
              {Object.values(PLANS).map((plan) => {
                const active = farm.plan === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="submit"
                    name="plan"
                    value={plan.id}
                    className={`rounded-xl border p-3 text-left text-xs transition ${
                      active
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-white hover:border-primary/40"
                    }`}
                  >
                    <p className="font-semibold text-foreground">{plan.name}</p>
                    <p className="mt-0.5 font-medium text-primary">₹{plan.priceInrMonthly.toLocaleString("en-IN")}/mo</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {plan.maxAnimals} animals · {plan.maxMembers} staff
                    </p>
                  </button>
                );
              })}
            </form>
          </div>
        </Panel>

        <Panel title="IoT hardware & milking parlour API" description="Authenticate automated milk meters, weighing scales, and RFID readers.">
          <IotKeyPanel farmSlug={farm.farmSlug} hasKey={Boolean(farmMeta?.iotApiKeyHash)} />
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
