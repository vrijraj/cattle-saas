import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { alerts, animals, dewormings, healthEvents, medicineItems, medicineMovements, vaccinations, vaccineProtocols } from "@/db/schema";
import { healthOutcome, healthRegister } from "@/lib/health-register";
import { addDays, farmToday, formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canRecordHealth, canSeeClinical, canViewHealth } from "@/lib/permissions";
import { FormSelect } from "@/components/form-select";
import { PanelTabs } from "@/components/panel-tabs";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Notice, pickTab, Pill, Submit, Summary, Table, Td } from "@/components/workspace";
import { recordMedicineMovement, saveMedicineItem, saveProtocol, seedDefaultProtocols, toggleProtocol } from "./actions";

const errors: Record<string, string> = {
  role: "Your role cannot record or modify this health record.",
  animal: "Choose an animal on this farm.",
  form: "Check the form fields (name, dates, quantities) and try again.",
};

function medicineBalance(rows: { kind: string; quantity: string; voidedAt: Date | null }[]) {
  let total = 0;
  for (const row of rows) {
    if (row.voidedAt) continue;
    const qty = Number(row.quantity);
    if (row.kind === "opening" || row.kind === "purchase") total += Math.abs(qty);
    else if (row.kind === "use" || row.kind === "wastage") total -= Math.abs(qty);
    else total += qty;
  }
  return Math.round(total * 10) / 10;
}

export const metadata = { title: "Health records" };

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; tab?: string }>;
}) {
  const farm = await requireFarm();
  if (!canViewHealth(farm.roles)) redirect("/dashboard");
  const query = await searchParams;
  const clinical = canSeeClinical(farm.roles);
  const canEditHealth = canRecordHealth(farm.roles);
  const today = farmToday(farm.timezone);
  const expiryCutoff = addDays(today, 30);

  const [herd, events, doses, worms, openAlerts, protocols, medItems, medMoves] = await Promise.all([
    db.select().from(animals).where(eq(animals.farmId, farm.farmId)),
    db.select().from(healthEvents).where(eq(healthEvents.farmId, farm.farmId)),
    db.select().from(vaccinations).where(eq(vaccinations.farmId, farm.farmId)),
    db.select().from(dewormings).where(eq(dewormings.farmId, farm.farmId)),
    db.select().from(alerts).where(eq(alerts.farmId, farm.farmId)),
    db.select().from(vaccineProtocols).where(eq(vaccineProtocols.farmId, farm.farmId)).orderBy(asc(vaccineProtocols.name)),
    db.select().from(medicineItems).where(eq(medicineItems.farmId, farm.farmId)).orderBy(asc(medicineItems.name)),
    db.select().from(medicineMovements).where(eq(medicineMovements.farmId, farm.farmId)),
  ]);

  const byId = new Map(herd.map((animal) => [animal.id, animal]));
  const onFarm = herd.filter((a) => a.presence === "on_farm");
  const register = healthRegister({ herd, events, doses, dewormings: worms, alerts: openAlerts, clinical });
  const notice = query.error ? errors[query.error] : undefined;

  const medSummaries = medItems.map((item) => {
    const balance = medicineBalance(medMoves.filter((m) => m.itemId === item.id));
    const low = item.minimumQuantity !== null && balance <= Number(item.minimumQuantity);
    const expiring = Boolean(item.expiresOn && item.expiresOn <= expiryCutoff);
    const expired = Boolean(item.expiresOn && item.expiresOn < today);
    return { item, balance, low, expiring, expired };
  });
  const medAlertCount = medSummaries.filter((m) => m.low || m.expiring).length;

  const tabs = [
    { id: "due", label: "Due", count: register.due.length },
    ...(clinical ? [{ id: "treatments", label: "Treatments", count: register.events.length }] : []),
    { id: "vaccines", label: "Vaccines", count: register.doses.length },
    { id: "deworming", label: "Deworming", count: register.dewormings.length },
    { id: "protocols", label: "Protocols", count: protocols.length },
    { id: "pharmacy", label: "Pharmacy", count: medItems.length },
  ];
  const tab = pickTab(query.tab, tabs, "due");

  function animalLink(animalId: string) {
    const animal = byId.get(animalId);
    if (!animal) return "—";
    return (
      <Link href={`/animals/${animal.code}?tab=health`} className="font-medium text-primary">
        {animal.name ?? animal.code}
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{animal.code}</span>
      </Link>
    );
  }

  return (
    <div className="space-y-5">
      <Summary
        title="Health & pharmacy"
        description="Treatments, vaccines, deworming, standard Indian vaccination protocols, and veterinary pharmacy stock."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/animals/bulk"
              className="inline-flex h-9 items-center rounded-full border border-border bg-white px-3.5 text-xs font-semibold text-foreground shadow-2xs transition hover:border-primary/35 hover:text-primary"
            >
              Bulk vaccinate / deworm
            </Link>
            <Link
              href="/scan"
              className="inline-flex h-9 items-center rounded-full border border-border bg-white px-3.5 text-xs font-semibold text-foreground shadow-2xs transition hover:border-primary/35 hover:text-primary"
            >
              Scan QR / Tag
            </Link>
            <Link
              href="/animals?view=active"
              className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90"
            >
              + Record on animal
            </Link>
          </div>
        }
        facts={[
          { label: "Due", value: String(register.due.length) },
          { label: "Isolated", value: String(register.isolated.length) },
          { label: "Protocols", value: String(protocols.filter((p) => p.active).length) },
          { label: "Pharmacy alerts", value: String(medAlertCount) },
        ]}
      />
      {notice ? <Notice tone="danger">{notice}</Notice> : null}
      {query.saved === "1" ? <Notice>Health &amp; pharmacy records updated.</Notice> : null}

      <PanelTabs
        initialTab={tab}
        tabs={tabs}
        panels={{
          due: (
            <Table headers={["Animal", "Follow-up", "Date"]}>
              {register.due.length === 0 ? <EmptyRow cols={3}>Nothing is due.</EmptyRow> : null}
              {register.due.map((row) => (
                <tr key={row.id}>
                  <Td>{animalLink(row.animalId)}</Td>
                  <Td>{row.kind}</Td>
                  <Td>{row.dueOn ? formatDisplayDate(row.dueOn) : "—"}</Td>
                </tr>
              ))}
            </Table>
          ),
          ...(clinical
            ? {
                treatments: (
                  <Table headers={["Date", "Animal", "Problem & Diagnosis", "Medicine & Regimen", "Veterinarian", "Follow-up", "Outcome", "Attachment"]}>
                    {register.events.length === 0 ? <EmptyRow cols={8}>No treatments yet.</EmptyRow> : null}
                    {register.events.map((event) => {
                      const animal = byId.get(event.animalId);
                      return (
                        <tr key={event.id}>
                          <Td>{formatDisplayDate(event.eventOn)}</Td>
                          <Td>{animalLink(event.animalId)}</Td>
                          <Td>
                            <div className="font-medium">{event.problem}</div>
                            {event.diagnosis ? <div className="text-xs text-muted-foreground">Dx: {event.diagnosis}</div> : null}
                            {event.signs ? <div className="text-xs text-muted-foreground">Signs: {event.signs}</div> : null}
                            {event.quarters ? <div className="text-xs text-muted-foreground">Quarters: {event.quarters}</div> : null}
                          </Td>
                          <Td>
                            <div>{event.medicine ?? "—"}</div>
                            {event.dose || event.route || event.duration ? (
                              <div className="text-xs text-muted-foreground">{[event.dose, event.route, event.duration].filter(Boolean).join(" · ")}</div>
                            ) : null}
                            {event.withdrawalUntil ? (
                              <div className="text-xs font-medium text-danger">Milk withdrawal until {formatDisplayDate(event.withdrawalUntil)}</div>
                            ) : null}
                            {event.treatment ? <div className="text-xs text-muted-foreground">{event.treatment}</div> : null}
                          </Td>
                          <Td>{event.veterinarian ?? "—"}</Td>
                          <Td>{event.followUpOn ? formatDisplayDate(event.followUpOn) : "—"}</Td>
                          <Td>{healthOutcome(event.outcome)}</Td>
                          <Td>
                            {event.attachmentKey && animal ? (
                              <a
                                href={`/animals/${encodeURIComponent(animal.code)}/health/${encodeURIComponent(event.id)}/attachment`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium text-primary underline underline-offset-4"
                              >
                                {event.attachmentName ?? "View file"}
                              </a>
                            ) : (
                              "—"
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </Table>
                ),
              }
            : {}),
          vaccines: (
            <Table headers={["Animal", "Vaccine", "Batch", "Given", "Next due"]}>
              {register.doses.length === 0 ? <EmptyRow cols={5}>No doses yet.</EmptyRow> : null}
              {register.doses.map((dose) => (
                <tr key={dose.id}>
                  <Td>{animalLink(dose.animalId)}</Td>
                  <Td>{dose.vaccine}</Td>
                  <Td>{dose.batch ?? "—"}</Td>
                  <Td>{formatDisplayDate(dose.givenOn)}</Td>
                  <Td className="text-muted-foreground">{dose.nextDueOn ? formatDisplayDate(dose.nextDueOn) : "—"}</Td>
                </tr>
              ))}
            </Table>
          ),
          deworming: (
            <Table headers={["Animal", "Product", "Given", "Next due"]}>
              {register.dewormings.length === 0 ? <EmptyRow cols={4}>No deworming yet.</EmptyRow> : null}
              {register.dewormings.map((row) => (
                <tr key={row.id}>
                  <Td>{animalLink(row.animalId)}</Td>
                  <Td>{row.product}</Td>
                  <Td>{formatDisplayDate(row.givenOn)}</Td>
                  <Td className="text-muted-foreground">{row.nextDueOn ? formatDisplayDate(row.nextDueOn) : "—"}</Td>
                </tr>
              ))}
            </Table>
          ),
          protocols: (
            <div className="space-y-3">
              {canEditHealth ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <form action={seedDefaultProtocols}>
                    <button
                      type="submit"
                      className="inline-flex h-9 items-center rounded-full border border-border bg-white px-3.5 text-xs font-semibold text-foreground transition hover:bg-muted"
                    >
                      Seed Indian dairy schedule
                    </button>
                  </form>
                  <RecordDialog title="Add vaccination protocol" button="Add protocol">
                    <form action={saveProtocol} className="grid gap-3">
                      <label className="grid gap-1 text-sm">
                        Protocol name
                        <input name="name" required maxLength={120} placeholder="e.g. FMD biannual booster" className={inputClass} />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          Type
                          <FormSelect
                            name="kind"
                            defaultValue="vaccine"
                            options={[
                              { value: "vaccine", label: "Vaccine" },
                              { value: "deworming", label: "Deworming" },
                            ]}
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          Species
                          <FormSelect
                            name="species"
                            defaultValue="all"
                            options={[
                              { value: "all", label: "All (cattle & buffalo)" },
                              { value: "cattle", label: "Cattle only" },
                              { value: "buffalo", label: "Buffalo only" },
                            ]}
                          />
                        </label>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          First dose age (days from DOB)
                          <input name="startAgeDays" type="number" min={0} max={3650} required defaultValue={120} className={inputClass} />
                        </label>
                        <label className="grid gap-1 text-sm">
                          Repeat interval (days, blank = once)
                          <input name="repeatEveryDays" type="number" min={7} max={1825} placeholder="180" className={inputClass} />
                        </label>
                      </div>
                      <label className="grid gap-1 text-sm">
                        Notes
                        <input name="note" maxLength={240} placeholder="Dose guidance or season" className={inputClass} />
                      </label>
                      <div className="flex justify-end">
                        <Submit>Save protocol</Submit>
                      </div>
                    </form>
                  </RecordDialog>
                </div>
              ) : null}
              <Table headers={["Protocol", "Type", "Species", "Schedule", "Status", ...(canEditHealth ? [""] : [])]}>
                {protocols.length === 0 ? <EmptyRow cols={canEditHealth ? 6 : 5}>No protocols configured yet.</EmptyRow> : null}
                {protocols.map((p) => (
                  <tr key={p.id}>
                    <Td>
                      <p className="font-medium">{p.name}</p>
                      {p.note ? <p className="text-xs text-muted-foreground">{p.note}</p> : null}
                    </Td>
                    <Td className="capitalize">{p.kind}</Td>
                    <Td className="capitalize">{p.species}</Td>
                    <Td className="text-xs text-muted-foreground">
                      Start day {p.startAgeDays}
                      {p.repeatEveryDays ? ` · Repeat every ${p.repeatEveryDays}d` : " · One-time"}
                    </Td>
                    <Td>
                      <Pill tone={p.active ? "good" : "neutral"}>{p.active ? "Active" : "Paused"}</Pill>
                    </Td>
                    {canEditHealth ? (
                      <Td className="text-right">
                        <form action={toggleProtocol}>
                          <input type="hidden" name="id" value={p.id} />
                          <button type="submit" className="text-xs font-medium text-primary hover:underline">
                            {p.active ? "Pause" : "Activate"}
                          </button>
                        </form>
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </Table>
            </div>
          ),
          pharmacy: (
            <div className="space-y-3">
              {canEditHealth ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <RecordDialog title="Add medicine to pharmacy" button="Add medicine">
                    <form action={saveMedicineItem} className="grid gap-3">
                      <label className="grid gap-1 text-sm">
                        Medicine / vaccine name
                        <input name="name" required maxLength={120} placeholder="e.g. Oxytetracycline LA 20%" className={inputClass} />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          Category
                          <FormSelect
                            name="category"
                            defaultValue="antibiotic"
                            options={[
                              { value: "antibiotic", label: "Antibiotic" },
                              { value: "vaccine", label: "Vaccine" },
                              { value: "dewormer", label: "Dewormer" },
                              { value: "anti_inflammatory", label: "Anti-inflammatory" },
                              { value: "supplement", label: "Mineral / Supplement" },
                              { value: "antiseptic", label: "Antiseptic" },
                              { value: "other", label: "Other" },
                            ]}
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          Unit
                          <input name="unit" required maxLength={20} defaultValue="ml" placeholder="ml, dose, bolus" className={inputClass} />
                        </label>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          Batch number
                          <input name="batchNumber" maxLength={60} placeholder="Batch #" className={inputClass} />
                        </label>
                        <label className="grid gap-1 text-sm">
                          Expiry date
                          <input name="expiresOn" type="date" className={inputClass} />
                        </label>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="grid gap-1 text-sm">
                          Opening stock
                          <input name="openingQuantity" type="number" min={0} max={1000000} step="0.1" defaultValue="0" className={inputClass} />
                        </label>
                        <label className="grid gap-1 text-sm">
                          Min alert qty
                          <input name="minimumQuantity" type="number" min={0} max={1000000} step="0.1" placeholder="50" className={inputClass} />
                        </label>
                        <label className="grid gap-1 text-sm">
                          Cost / unit (₹)
                          <input name="unitCost" type="number" min={0} max={1000000} step="0.01" placeholder="2.50" className={inputClass} />
                        </label>
                      </div>
                      <div className="flex justify-end">
                        <Submit>Save medicine</Submit>
                      </div>
                    </form>
                  </RecordDialog>

                  {medItems.length > 0 ? (
                    <RecordDialog quiet title="Record stock movement" button="Record stock move">
                      <form action={recordMedicineMovement} className="grid gap-3">
                        <label className="grid gap-1 text-sm">
                          Medicine
                          <FormSelect
                            name="itemId"
                            required
                            defaultValue={medItems[0]?.id ?? ""}
                            options={medItems.map((m) => ({ value: m.id, label: `${m.name} (${m.unit})` }))}
                          />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="grid gap-1 text-sm">
                            Movement type
                            <FormSelect
                              name="kind"
                              defaultValue="purchase"
                              options={[
                                { value: "purchase", label: "Purchase (+)" },
                                { value: "use", label: "Used in treatment (−)" },
                                { value: "wastage", label: "Expired / wasted (−)" },
                                { value: "adjustment", label: "Stock adjustment (+/−)" },
                              ]}
                            />
                          </label>
                          <label className="grid gap-1 text-sm">
                            Quantity
                            <input name="quantity" type="number" step="0.1" required placeholder="e.g. 100" className={inputClass} />
                          </label>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="grid gap-1 text-sm">
                            Date
                            <input name="movedOn" type="date" defaultValue={today} className={inputClass} />
                          </label>
                          <label className="grid gap-1 text-sm">
                            Animal (optional)
                            <FormSelect
                              name="animalId"
                              defaultValue=""
                              options={[
                                { value: "", label: "Herd / general" },
                                ...onFarm.map((a) => ({ value: a.id, label: `${a.name ?? a.code} · ${a.code}` })),
                              ]}
                            />
                          </label>
                        </div>
                        <label className="grid gap-1 text-sm">
                          Note / supplier
                          <input name="note" maxLength={200} placeholder="Supplier or usage note" className={inputClass} />
                        </label>
                        <div className="flex justify-end">
                          <Submit>Save movement</Submit>
                        </div>
                      </form>
                    </RecordDialog>
                  ) : null}
                </div>
              ) : null}
              <Table headers={["Medicine", "Category", "Batch & expiry", "On hand", "Unit cost", "Status"]}>
                {medSummaries.length === 0 ? <EmptyRow cols={6}>No medicines tracked in pharmacy yet.</EmptyRow> : null}
                {medSummaries.map(({ item, balance, low, expiring, expired }) => (
                  <tr key={item.id}>
                    <Td className="font-medium">{item.name}</Td>
                    <Td className="capitalize">{item.category.replaceAll("_", " ")}</Td>
                    <Td className="text-xs text-muted-foreground">
                      <div>{item.batchNumber ?? "—"}</div>
                      {item.expiresOn ? (
                        <div className={expired ? "font-semibold text-danger" : expiring ? "font-medium text-amber-700" : ""}>
                          Exp {formatDisplayDate(item.expiresOn)}
                        </div>
                      ) : null}
                    </Td>
                    <Td className="tabular-nums font-medium">
                      {balance.toFixed(1)} {item.unit}
                      {item.minimumQuantity ? <span className="block text-[11px] font-normal text-muted-foreground">Min {item.minimumQuantity}</span> : null}
                    </Td>
                    <Td className="tabular-nums">{item.unitCost ? `₹${Number(item.unitCost).toFixed(2)}` : "—"}</Td>
                    <Td>
                      {expired ? (
                        <Pill tone="warn">Expired</Pill>
                      ) : expiring ? (
                        <Pill tone="warn">Expiring soon</Pill>
                      ) : low ? (
                        <Pill tone="warn">Low stock</Pill>
                      ) : (
                        <Pill tone="good">In stock</Pill>
                      )}
                    </Td>
                  </tr>
                ))}
              </Table>
            </div>
          ),
        }}
      />
    </div>
  );
}
