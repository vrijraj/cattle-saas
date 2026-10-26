"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { alerts, animals } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { farmToday, parseFarmDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canReadAlert, hasRole } from "@/lib/permissions";

export async function setMilkAlert(formData: FormData) {
  const farm = await requireFarm();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "explained" && status !== "dismissed") redirect("/alerts");
  const [alert] = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.id, id), eq(alerts.farmId, farm.farmId)))
    .limit(1);
  if (!alert || (alert.type !== "milk_drop" && alert.type !== "herd_milk_drop") || !canReadAlert(farm.roles, alert.type)) redirect("/alerts?error=role");
  await db.update(alerts).set({ status }).where(eq(alerts.id, alert.id));
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "update",
    entity: "alert",
    entityId: alert.id,
    summary: `${status === "explained" ? "Explained" : "Dismissed"} ${alert.title}`,
    before: { status: alert.status },
    after: { status },
  });
  redirect("/alerts");
}

export async function dismissAlert(formData: FormData) {
  const farm = await requireFarm();
  const id = String(formData.get("id") ?? "");
  const [alert] = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.id, id), eq(alerts.farmId, farm.farmId), eq(alerts.status, "open")))
    .limit(1);
  if (!alert || !canReadAlert(farm.roles, alert.type) || alert.type === "milk_drop" || alert.type === "herd_milk_drop") redirect("/alerts?error=role");
  await db.update(alerts).set({ status: "dismissed" }).where(eq(alerts.id, alert.id));
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "update",
    entity: "alert",
    entityId: alert.id,
    summary: `Dismissed ${alert.title}`,
    before: { status: "open" },
    after: { status: "dismissed" },
  });
  redirect("/alerts");
}

export async function createCustomAlert(formData: FormData) {
  const farm = await requireFarm();
  if (!hasRole(farm.roles, ["owner", "manager", "admin", "vet", "ai_technician"])) redirect("/alerts?error=role");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim() || "Scheduled farm activity.";
  const dueOn = parseFarmDate(String(formData.get("dueOn") ?? "")) ?? farmToday(farm.timezone);
  const animalIdRaw = String(formData.get("animalId") ?? "").trim();
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
        type: "custom",
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
      summary: `Scheduled task: ${title} (${dueOn})`,
      after: { title, body, dueOn, animalId },
    });
  });

  redirect("/alerts");
}
