import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  alerts,
  animals,
  calvings,
  cronRuns,
  dewormings,
  farms,
  medicineItems,
  medicineMovements,
  vaccinations,
  vaccineProtocols,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { addDays, farmToday, formatDisplayDate } from "@/lib/dates";
import { escapeHtml, sendMail } from "@/lib/mail";
import { syncMilkDrops } from "@/lib/sync-milk-drops";

export type DailyAutomationSummary = {
  farmId: string;
  farmName: string;
  runDate: string;
  freshTransitioned: number;
  protocolAlertsCreated: number;
  pharmacyAlertsCreated: number;
  digestSent: boolean;
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

export async function runDailyAutomationForFarm(
  farmId: string,
  options?: { actorId?: string | null; sendDigest?: boolean },
): Promise<DailyAutomationSummary | null> {
  const [farm] = await db.select().from(farms).where(eq(farms.id, farmId)).limit(1);
  if (!farm) return null;

  const today = farmToday(farm.timezone);
  const expiryHorizon = addDays(today, 30);

  const [herd, calvingRows, openAlerts, protocols, vaxRows, wormRows, medItems, medMoves] = await Promise.all([
    db.select().from(animals).where(and(eq(animals.farmId, farmId), eq(animals.presence, "on_farm"))),
    db.select().from(calvings).where(and(eq(calvings.farmId, farmId), isNull(calvings.voidedAt))).orderBy(desc(calvings.calvedOn)),
    db.select().from(alerts).where(and(eq(alerts.farmId, farmId), eq(alerts.status, "open"))),
    db.select().from(vaccineProtocols).where(and(eq(vaccineProtocols.farmId, farmId), eq(vaccineProtocols.active, true))),
    db.select().from(vaccinations).where(and(eq(vaccinations.farmId, farmId), isNull(vaccinations.voidedAt))),
    db.select().from(dewormings).where(and(eq(dewormings.farmId, farmId), isNull(dewormings.voidedAt))),
    db.select().from(medicineItems).where(eq(medicineItems.farmId, farmId)),
    db.select().from(medicineMovements).where(and(eq(medicineMovements.farmId, farmId), isNull(medicineMovements.voidedAt))),
  ]);

  const latestCalvingByDam = new Map<string, string>();
  for (const c of calvingRows) {
    if (!latestCalvingByDam.has(c.damId)) latestCalvingByDam.set(c.damId, c.calvedOn);
  }

  let freshTransitioned = 0;
  let protocolAlertsCreated = 0;
  let pharmacyAlertsCreated = 0;

  const openKeys = new Set(openAlerts.map((a) => `${a.animalId ?? "farm"}:${a.type}:${a.title.toLowerCase()}`));

  await db.transaction(async (tx) => {
    // 1. Fresh -> Open transition past Voluntary Waiting Period
    const vwp = farm.voluntaryWaitingDays || 45;
    for (const animal of herd) {
      if (animal.sex !== "female" || animal.reproduction !== "fresh") continue;
      const lastCalving = latestCalvingByDam.get(animal.id);
      if (!lastCalving) continue;
      const openDate = addDays(lastCalving, vwp);
      if (today >= openDate) {
        await tx
          .update(animals)
          .set({ reproduction: "open", updatedAt: new Date() })
          .where(and(eq(animals.id, animal.id), eq(animals.farmId, farmId)));
        await writeAudit(tx, {
          farmId,
          actorId: options?.actorId ?? null,
          action: "update",
          entity: "animal",
          entityId: animal.id,
          summary: `Auto-transitioned ${animal.code} from fresh to open (${vwp}d VWP passed since ${lastCalving})`,
          before: { reproduction: "fresh" },
          after: { reproduction: "open" },
        });
        freshTransitioned += 1;
      }
    }

    // 2. DOB-based vaccination & deworming protocol checks
    for (const protocol of protocols) {
      const protocolToken = protocol.name.split("(")[0].trim().toLowerCase();
      for (const animal of herd) {
        if (!animal.dob) continue;
        if (protocol.species !== "all" && animal.species !== protocol.species) continue;
        if (protocol.name.toLowerCase().includes("female") && animal.sex !== "female") continue;

        const firstDue = addDays(animal.dob, protocol.startAgeDays);
        if (today < firstDue) continue;

        const relevantDates =
          protocol.kind === "vaccine"
            ? vaxRows
                .filter((v) => v.animalId === animal.id && v.vaccine.toLowerCase().includes(protocolToken))
                .map((v) => v.givenOn)
            : wormRows
                .filter((w) => w.animalId === animal.id)
                .map((w) => w.givenOn);

        relevantDates.sort();
        const lastGiven = relevantDates.at(-1) ?? null;

        let dueOn: string | null = null;
        if (!lastGiven) {
          dueOn = firstDue;
        } else if (protocol.repeatEveryDays) {
          const nextDue = addDays(lastGiven, protocol.repeatEveryDays);
          if (nextDue <= addDays(today, 14)) dueOn = nextDue;
        }

        if (!dueOn) continue;

        const alertType = protocol.kind === "vaccine" ? "vaccine_due" : "deworming_due";
        const title = `${protocol.kind === "vaccine" ? "Protocol vaccine" : "Protocol deworming"} · ${protocol.name}`;
        const dedupeKey = `${animal.id}:${alertType}:${title.toLowerCase()}`;
        if (openKeys.has(dedupeKey)) continue;

        await tx.insert(alerts).values({
          farmId,
          animalId: animal.id,
          type: alertType,
          title,
          body: `${animal.code} (${animal.name ?? "Unnamed"}) is due for ${protocol.name} on ${dueOn}.`,
          dueOn,
        });
        openKeys.add(dedupeKey);
        protocolAlertsCreated += 1;
      }
    }

    // 3. Pharmacy low-stock & expiry alerts
    for (const item of medItems) {
      const balance = medicineBalance(medMoves.filter((m) => m.itemId === item.id));
      const isLow = item.minimumQuantity !== null && balance <= Number(item.minimumQuantity);
      if (isLow) {
        const title = `Low pharmacy stock · ${item.name}`;
        const key = `farm:health_followup:${title.toLowerCase()}`;
        if (!openKeys.has(key)) {
          await tx.insert(alerts).values({
            farmId,
            animalId: null,
            type: "health_followup",
            title,
            body: `${item.name} is at ${balance.toFixed(1)} ${item.unit} (minimum ${item.minimumQuantity} ${item.unit}).`,
            dueOn: today,
          });
          openKeys.add(key);
          pharmacyAlertsCreated += 1;
        }
      }
      if (item.expiresOn && item.expiresOn <= expiryHorizon && balance > 0) {
        const expired = item.expiresOn < today;
        const title = `${expired ? "Expired" : "Expiring"} medicine · ${item.name}`;
        const key = `farm:health_followup:${title.toLowerCase()}`;
        if (!openKeys.has(key)) {
          await tx.insert(alerts).values({
            farmId,
            animalId: null,
            type: "health_followup",
            title,
            body: `${item.name} (batch ${item.batchNumber ?? "—"}) ${expired ? "expired" : "expires"} on ${item.expiresOn}.`,
            dueOn: item.expiresOn,
          });
          openKeys.add(key);
          pharmacyAlertsCreated += 1;
        }
      }
    }

    await tx
      .insert(cronRuns)
      .values({
        farmId,
        runDate: today,
        kind: "daily_automation",
        summaryJson: { freshTransitioned, protocolAlertsCreated, pharmacyAlertsCreated },
      })
      .onConflictDoUpdate({
        target: [cronRuns.farmId, cronRuns.runDate, cronRuns.kind],
        set: {
          summaryJson: { freshTransitioned, protocolAlertsCreated, pharmacyAlertsCreated },
          createdAt: new Date(),
        },
      });
  });

  await syncMilkDrops(farmId, today);

  let digestSent = false;
  if (options?.sendDigest && farm.enquiryEmail) {
    const dueNow = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.farmId, farmId), eq(alerts.status, "open")));
    const urgent = dueNow.filter((a) => !a.dueOn || a.dueOn <= addDays(today, 3)).slice(0, 15);
    if (urgent.length > 0) {
      const itemsHtml = urgent
        .map((a) => `<li><strong>${escapeHtml(a.title)}</strong> (${a.dueOn ? formatDisplayDate(a.dueOn) : "today"}): ${escapeHtml(a.body)}</li>`)
        .join("");
      const res = await sendMail({
        to: farm.enquiryEmail,
        subject: `${farm.name} daily farm digest · ${formatDisplayDate(today)} (${urgent.length} due)`,
        html: `<h2>${escapeHtml(farm.name)} — Daily Digest</h2><p>Fresh→open transitions: ${freshTransitioned}. New alerts: ${protocolAlertsCreated + pharmacyAlertsCreated}.</p><ul>${itemsHtml}</ul>`,
      });
      digestSent = res.sent;
    }
  }

  return {
    farmId,
    farmName: farm.name,
    runDate: today,
    freshTransitioned,
    protocolAlertsCreated,
    pharmacyAlertsCreated,
    digestSent,
  };
}
