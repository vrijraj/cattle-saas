"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { requireFarm } from "@/lib/farm-context";

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
  if (!alert || (alert.type !== "milk_drop" && alert.type !== "herd_milk_drop")) redirect("/alerts");
  await db.update(alerts).set({ status }).where(eq(alerts.id, alert.id));
  redirect("/alerts");
}
