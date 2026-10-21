"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { sendChannel } from "@/lib/channels";
import { requireFarm } from "@/lib/farm-context";

export async function sendReminders() {
  const farm = await requireFarm();
  if (!farm.roles.some((role) => role === "owner" || role === "manager" || role === "admin")) redirect("/alerts?error=role");
  const open = await db.select().from(alerts).where(and(eq(alerts.farmId, farm.farmId), eq(alerts.status, "open")));
  for (const alert of open) {
    for (const channel of ["whatsapp", "sms"] as const) {
      const result = await sendChannel(channel, `${alert.title}. ${alert.body}`);
      await writeAudit(db, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "create",
        entity: "notification",
        entityId: alert.id,
        summary: `${channel} for ${alert.title}: ${result.detail}`,
        after: result,
      });
    }
  }
  redirect("/alerts?sent=1");
}
