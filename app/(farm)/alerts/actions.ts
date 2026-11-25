"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { alerts, animals } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { runDailyAutomationForFarm } from "@/lib/daily-automation";
import { farmToday, parseFarmDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canResolveAlert, hasRole } from "@/lib/permissions";
import { syncMilkDrops } from "@/lib/sync-milk-drops";

export async function setMilkAlert(formData: FormData) {
  const farm = await requireFarm();
  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (status !== "explained" && status !== "dismissed") redirect("/alerts");
  const [alert] = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.id, id), eq(alerts.farmId, farm.farmId)))
    .limit(1);
  if (!alert || (alert.type !== "milk_drop" && alert.type !== "herd_milk_drop") || !canResolveAlert(farm.roles, alert.type)) {
    redirect("/alerts?error=role");
  }
  await db.transaction(async (tx) => {
    await tx.update(alerts).set({ status }).where(and(eq(alerts.id, alert.id), eq(alerts.farmId, farm.farmId)));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "alert",
      entityId: alert.id,
      summary: `${status === "explained" ? "Explained" : "Dismissed"} ${alert.title}`,
      before: { status: alert.status },
      after: { status },
    });
  });
  if (status === "explained" && alert.dueOn) {
    await syncMilkDrops(farm.farmId, farmToday(farm.timezone));
  }
  redirect("/alerts");
}

export async function dismissAlert(formData: FormData) {
  const farm = await requireFarm();
  const id = String(formData.get("id") ?? "").trim();
  const next = String(formData.get("status") ?? "dismissed") === "done" ? "done" : "dismissed";
  const [alert] = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.id, id), eq(alerts.farmId, farm.farmId), eq(alerts.status, "open")))
    .limit(1);
  if (!alert || !canResolveAlert(farm.roles, alert.type) || alert.type === "milk_drop" || alert.type === "herd_milk_drop") {
    redirect("/alerts?error=role");
  }
  await db.transaction(async (tx) => {
    await tx.update(alerts).set({ status: next }).where(and(eq(alerts.id, alert.id), eq(alerts.farmId, farm.farmId)));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "alert",
      entityId: alert.id,
      summary: `${next === "done" ? "Completed" : "Dismissed"} ${alert.title}`,
      before: { status: "open" },
      after: { status: next },
    });
  });
  redirect("/alerts");
}

export async function createCustomAlert(formData: FormData) {
  const farm = await requireFarm();
  if (!hasRole(farm.roles, ["owner", "manager", "admin", "vet", "ai_technician", "accountant"])) {
    redirect("/alerts?error=role");
  }
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim() || "Scheduled farm activity.";
  const dueOn = parseFarmDate(String(formData.get("dueOn") ?? "")) ?? farmToday(farm.timezone);
  const animalIdRaw = String(formData.get("animalId") ?? "").trim();
  const requestedType = String(formData.get("type") ?? "custom").trim();
  const type = requestedType === "finance" && hasRole(farm.roles, ["owner", "manager", "accountant", "admin"]) ? "finance" : "custom";
  if (!title) redirect("/alerts?error=task");

  let animalId: string | null = null;
  if (animalIdRaw) {
    const [found] = await db
      .select({ id: animals.id })
      .from(animals)
      .where(and(eq(animals.id, animalIdRaw), eq(animals.farmId, farm.farmId)))
      .limit(1);
    if (found) animalId = found.id;
  }

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(alerts)
      .values({
        farmId: farm.farmId,
        animalId,
        type,
        title,
        body,
        dueOn,
      })
      .returning();
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "alert",
      entityId: row.id,
      summary: `Scheduled ${type === "finance" ? "finance " : ""}task: ${title} (${dueOn})`,
      after: { type, title, body, dueOn, animalId },
    });
  });

  redirect("/alerts");
}

export async function runDailyCheckNow() {
  const farm = await requireFarm();
  if (!hasRole(farm.roles, ["owner", "manager", "admin"])) {
    redirect("/alerts?error=role");
  }
  await runDailyAutomationForFarm(farm.farmId, { actorId: farm.userId, sendDigest: false });
  redirect("/alerts?checked=1");
}
