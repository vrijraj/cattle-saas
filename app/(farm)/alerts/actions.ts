"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { requireFarm } from "@/lib/farm-context";
import { canReadAlert } from "@/lib/permissions";

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
