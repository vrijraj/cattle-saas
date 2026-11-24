"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { sendChannel } from "@/lib/channels";
import { requireFarm } from "@/lib/farm-context";
import { canReadAlert } from "@/lib/permissions";

export async function sendReminders() {
  const farm = await requireFarm();
  if (!farm.roles.some((role) => role === "owner" || role === "manager" || role === "admin")) redirect("/alerts?error=role");
  const open = (await db.select().from(alerts).where(and(eq(alerts.farmId, farm.farmId), eq(alerts.status, "open")))).filter((alert) =>
    canReadAlert(farm.roles, alert.type),
  );
  let sentCount = 0;
  let unconfiguredCount = 0;
  for (const alert of open) {
    for (const channel of ["whatsapp", "sms"] as const) {
      const result = await sendChannel(channel, `${alert.title}. ${alert.body}`);
      if (result.status === "sent") sentCount += 1;
      if (result.status === "not_configured") unconfiguredCount += 1;
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
  const flag = sentCount > 0 ? "1" : unconfiguredCount > 0 ? "unconfigured" : "none";
  redirect(`/alerts?sent=${flag}`);
}
