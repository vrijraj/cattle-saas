import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { alerts, animals, healthEvents, locations, milkPriceHistory, milkYields } from "@/db/schema";
import { addDays, farmToday, formatDisplayDate, parseFarmDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { t } from "@/lib/i18n";
import { milkPriceOnDate, milkRevenueForRows } from "@/lib/milk-pricing";
import { milkDaySummary } from "@/lib/milk-sheet";
import { canManageSettings, canViewFinance, canWriteMilk } from "@/lib/permissions";
import { MilkDatePicker } from "@/components/milk-date-picker";
import { MilkSheetForm, type MilkSheetCow } from "@/components/milk-sheet-form";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Notice, Panel, Submit, Summary, Table, Td } from "@/components/workspace";
import { clearMilkRow, saveMilk, saveMilkPriceRule, saveMilkSettings } from "./actions";

const messages: Record<string, string> = {
  range: "Each session must be 0–80 L, and Fat/SNF must be 0–15%.",
  role: "Your role cannot record milk.",
  date: "Choose today or an earlier date.",
  settings: "Enter valid milk price (₹0–₹1000/L), bonus, and drop threshold (5%–90%).",
};

export const metadata = { title: "Milk records" };

export default async function MilkPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; settings?: string; date?: string }>;
}) {
  const farm = await requireFarm();
  const query = await searchParams;
  const today = farmToday(farm.timezone);
  const requested = parseFarmDate(query.date);
  const selected = requested && requested <= today ? requested : today;
  const yesterday = addDays(selected, -1);
  const recentStart = addDays(today, -7);

  const [herd, shedRows, existing, drops, withdrawalRows, priceHistory] = await Promise.all([
    db
      .select({
        id: animals.id,
        code: animals.code,
        name: animals.name,
        locationId: animals.locationId,
      })
      .from(animals)
      .where(and(eq(animals.farmId, farm.farmId), eq(animals.presence, "on_farm"), eq(animals.lactation, "lactating")))
      .orderBy(animals.code),
    db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(and(eq(locations.farmId, farm.farmId), eq(locations.active, true)))
      .orderBy(locations.name),
    db
      .select()
      .from(milkYields)
      .where(
        and(
          eq(milkYields.farmId, farm.farmId),
          or(gte(milkYields.recordedOn, recentStart), eq(milkYields.recordedOn, selected), eq(milkYields.recordedOn, yesterday)),
        ),
      ),
    db
      .select()
      .from(alerts)
      .where(
        and(
          eq(alerts.farmId, farm.farmId),
          eq(alerts.status, "open"),
          or(eq(alerts.type, "milk_drop"), eq(alerts.type, "herd_milk_drop")),
        ),
      ),
    db
      .select({
        animalId: healthEvents.animalId,
        problem: healthEvents.problem,
        medicine: healthEvents.medicine,
        withdrawalUntil: healthEvents.withdrawalUntil,
      })
      .from(healthEvents)
      .where(and(eq(healthEvents.farmId, farm.farmId), isNull(healthEvents.voidedAt), gte(healthEvents.withdrawalUntil, selected))),
    db
      .select()
      .from(milkPriceHistory)
      .where(eq(milkPriceHistory.farmId, farm.farmId))
      .orderBy(desc(milkPriceHistory.effectiveFrom)),
  ]);

  const selectedRows = existing.filter((row) => row.recordedOn === selected);
  const yesterdayRows = existing.filter((row) => row.recordedOn === yesterday && !row.voidedAt);
  const yesterdayByAnimal = new Map(
    yesterdayRows.map((row) => [row.animalId, Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0)]),
  );
  const summary = milkDaySummary(
    herd.map((animal) => animal.id),
    selectedRows,
  );
  const canSave = canWriteMilk(farm.roles);
  const canConfigure = canManageSettings(farm.roles);
  const effectiveBasePrice = milkPriceOnDate(selected, priceHistory, farm.milkPricePerLitre);
  const showValue = effectiveBasePrice !== null && canViewFinance(farm.roles);
  const dayValue = showValue ? milkRevenueForRows(selectedRows, priceHistory, farm.milkPricePerLitre) : null;

  const byCode = new Map(herd.map((animal) => [animal.id, animal]));
  const shedById = new Map(shedRows.map((s) => [s.id, s.name]));
  const withdrawalByAnimal = new Map<string, { until: string; label: string }>();
  for (const row of withdrawalRows) {
    if (!row.withdrawalUntil) continue;
    const prev = withdrawalByAnimal.get(row.animalId);
    if (!prev || row.withdrawalUntil > prev.until) {
      withdrawalByAnimal.set(row.animalId, {
        until: row.withdrawalUntil,
        label: row.medicine ? `${row.medicine} (${row.problem})` : row.problem,
      });
    }
  }
  const activeWithdrawals = herd
    .filter((animal) => withdrawalByAnimal.has(animal.id))
    .map((animal) => ({ animal, ...withdrawalByAnimal.get(animal.id)! }));

  const herdDays = new Map<string, number>();
  for (const row of existing) {
    if (row.voidedAt) continue;
    const litres = Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0);
    herdDays.set(row.recordedOn, (herdDays.get(row.recordedOn) ?? 0) + litres);
  }
  const recent = [...herdDays.entries()].filter(([date]) => date >= recentStart).sort(([left], [right]) => left.localeCompare(right));

  // Average Fat% and SNF% on selected day
  const activeSelected = selectedRows.filter((r) => !r.voidedAt);
  const fatValues = activeSelected.map((r) => (r.fatPercent ? Number(r.fatPercent) : null)).filter((v): v is number => v !== null);
  const snfValues = activeSelected.map((r) => (r.snfPercent ? Number(r.snfPercent) : null)).filter((v): v is number => v !== null);
  const avgFat = fatValues.length > 0 ? fatValues.reduce((s, n) => s + n, 0) / fatValues.length : null;
  const avgSnf = snfValues.length > 0 ? snfValues.reduce((s, n) => s + n, 0) / snfValues.length : null;

  const sheetCows: MilkSheetCow[] = herd.map((animal) => {
    const row = summary.active.get(animal.id);
    const withdrawal = withdrawalByAnimal.get(animal.id);
    return {
      id: animal.id,
      code: animal.code,
      name: animal.name,
      locationId: animal.locationId,
      locationName: animal.locationId ? (shedById.get(animal.locationId) ?? null) : null,
      morningLitres: row?.morningLitres ?? "",
      eveningLitres: row?.eveningLitres ?? "",
      fatPercent: row?.fatPercent ?? "",
      snfPercent: row?.snfPercent ?? "",
      cmtScore: row?.cmtScore ?? "",
      yesterdayTotal: yesterdayByAnimal.get(animal.id) ?? null,
      withdrawalUntil: withdrawal ? formatDisplayDate(withdrawal.until) : null,
      hasExisting: Boolean(row),
    };
  });

  const notEntered = Math.max(0, herd.length - summary.entered);
  const stats = [
    [summary.total.toFixed(1) + " L", selected === today ? t(farm.locale, "milk.totalToday") : t(farm.locale, "milk.totalDay")],
    showValue && dayValue !== null
      ? [`₹${Math.round(dayValue).toLocaleString("en-IN")}`, `Est. value (base ₹${effectiveBasePrice!.toFixed(2)}/L)`]
      : [String(notEntered), t(farm.locale, "milk.notEntered")],
    [`${summary.entered} / ${herd.length}`, t(farm.locale, "milk.cowsEntered")],
    avgFat !== null || avgSnf !== null
      ? [`${avgFat !== null ? `${avgFat.toFixed(1)}%` : "—"} / ${avgSnf !== null ? `${avgSnf.toFixed(1)}%` : "—"}`, "Avg Fat / SNF"]
      : [summary.average.toFixed(1) + " L", t(farm.locale, "milk.avgEntered")],
  ];

  return (
    <div className="space-y-5">
      <Summary
        title={t(farm.locale, "milk.title")}
        description={`Daily yield & quality for each cow in milk · ${formatDisplayDate(selected)}. Filter by shed, press Enter to jump rows, or open Fat%/SNF%/CMT quality columns.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <MilkDatePicker key={selected} date={selected} today={today} />
            {canConfigure ? (
              <RecordDialog title="Milk price & alert settings" button={t(farm.locale, "milk.settings")} quiet>
                <form action={saveMilkSettings} className="space-y-3">
                  <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                    Fallback milk price per litre (INR, used if no dated rate exists)
                    <input
                      name="milkPricePerLitre"
                      type="number"
                      min={0}
                      max={1000}
                      step="0.01"
                      inputMode="decimal"
                      defaultValue={farm.milkPricePerLitre ? Number(farm.milkPricePerLitre).toFixed(2) : ""}
                      placeholder="e.g. 60.00"
                      className={inputClass}
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                    Production drop alert threshold (%)
                    <input
                      name="milkDropPercent"
                      type="number"
                      min={5}
                      max={90}
                      required
                      defaultValue={farm.milkDropPercent}
                      className={inputClass}
                    />
                  </label>
                  <label className="flex items-start gap-2.5 text-xs text-foreground">
                    <input
                      name="requireBothMilkSessions"
                      type="checkbox"
                      defaultChecked={farm.requireBothMilkSessions}
                      className="mt-0.5 size-4"
                    />
                    <span>Wait until both morning and evening sessions are entered before firing a milk drop alert</span>
                  </label>
                  <div className="flex justify-end pt-1">
                    <Submit>Save settings</Submit>
                  </div>
                </form>
              </RecordDialog>
            ) : null}
          </div>
        }
        facts={stats.map(([value, label]) => ({ label, value }))}
      />
      {query.error && messages[query.error] ? <Notice tone="danger">{messages[query.error]}</Notice> : null}
      {requested && requested > today && query.error !== "date" ? <Notice tone="danger">{messages.date}</Notice> : null}
      {query.saved ? <Notice>Milk for {formatDisplayDate(selected)} is saved.</Notice> : null}
      {query.settings ? <Notice>Milk pricing &amp; alert settings updated.</Notice> : null}

      {activeWithdrawals.length > 0 ? (
        <section role="alert" className="space-y-2 rounded-2xl border border-danger/30 bg-danger/5 p-4">
          <h2 className="text-sm font-semibold text-danger">Milk withdrawal active on {formatDisplayDate(selected)}</h2>
          <p className="text-xs text-muted-foreground">Keep milk from these cows out of saleable bulk supply until the withdrawal date passes.</p>
          <ul className="space-y-1.5 text-sm">
            {activeWithdrawals.map(({ animal, until, label }) => (
              <li key={animal.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/animals/${animal.code}?tab=health`} className="font-medium text-foreground hover:underline">
                  {animal.name ?? animal.code} · {animal.code}
                </Link>
                <span className="text-xs font-medium text-danger">
                  {label} — discard through {formatDisplayDate(until)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {drops.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold">Milk drop alerts</h2>
          <ul className="space-y-2">
            {drops.map((alert) => {
              const animal = alert.animalId ? byCode.get(alert.animalId) : undefined;
              return (
                <li key={alert.id}>
                  {animal ? (
                    <Link href={`/animals/${animal.code}?tab=milk`} className="text-sm font-medium hover:underline">
                      {alert.title}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium">{alert.title}</p>
                  )}
                  <p className="text-sm text-muted-foreground">{alert.body}</p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold">Herd total (last 7 days)</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map(([date, litres]) => (
              <li key={date}>
                <Link
                  href={date === today ? "/milk" : `/milk?date=${date}`}
                  className={`block rounded-xl px-3 py-2 ${date === selected ? "bg-primary/10 ring-1 ring-primary" : "bg-muted hover:bg-muted/70"}`}
                >
                  <p className="text-xs text-muted-foreground">{formatDisplayDate(date)}</p>
                  <p className="font-medium tabular-nums">{litres.toFixed(1)} L</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <MilkSheetForm
        key={selected}
        selected={selected}
        selectedLabel={formatDisplayDate(selected)}
        cows={sheetCows}
        sheds={shedRows}
        canSave={canSave}
        pricePerLitre={showValue ? effectiveBasePrice : null}
        locale={farm.locale}
        action={saveMilk}
        onClearRow={clearMilkRow}
      />

      {canViewFinance(farm.roles) ? (
        <Panel
          title="Effective-dated milk procurement rates"
          description="Historical milk prices & Fat/SNF bonus adjustments (relative to 4.0% Fat / 8.5% SNF) used for daily revenue."
          action={
            canConfigure ? (
              <RecordDialog quiet title="Add milk price rule" button="Add price rule">
                <form action={saveMilkPriceRule} className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      Effective from
                      <input name="effectiveFrom" type="date" required defaultValue={today} className={inputClass} />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Base rate (₹ / L)
                      <input name="pricePerLitre" type="number" min={0} max={1000} step="0.01" required placeholder="58.00" className={inputClass} />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      Fat bonus (₹ per +1% over 4.0%)
                      <input name="fatBonusPerPoint" type="number" min={-100} max={100} step="0.05" placeholder="1.75" className={inputClass} />
                    </label>
                    <label className="grid gap-1 text-sm">
                      SNF bonus (₹ per +1% over 8.5%)
                      <input name="snfBonusPerPoint" type="number" min={-100} max={100} step="0.05" placeholder="1.00" className={inputClass} />
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm">
                    Note (dairy union / season)
                    <input name="note" maxLength={160} placeholder="e.g. Amul winter procurement rate" className={inputClass} />
                  </label>
                  <div className="flex justify-end">
                    <Submit>Save price rule</Submit>
                  </div>
                </form>
              </RecordDialog>
            ) : null
          }
        >
          <Table headers={["Effective from", "Base ₹/L", "Fat bonus", "SNF bonus", "Note"]}>
            {priceHistory.length === 0 ? <EmptyRow cols={5}>No dated price history yet — using fallback rate from Farm settings.</EmptyRow> : null}
            {priceHistory.map((rule) => (
              <tr key={rule.id}>
                <Td className="font-medium">{formatDisplayDate(rule.effectiveFrom)}</Td>
                <Td className="tabular-nums">₹{Number(rule.pricePerLitre).toFixed(2)}</Td>
                <Td className="tabular-nums">{rule.fatBonusPerPoint ? `₹${Number(rule.fatBonusPerPoint).toFixed(2)} / %` : "—"}</Td>
                <Td className="tabular-nums">{rule.snfBonusPerPoint ? `₹${Number(rule.snfBonusPerPoint).toFixed(2)} / %` : "—"}</Td>
                <Td className="text-muted-foreground">{rule.note ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        </Panel>
      ) : null}
    </div>
  );
}
