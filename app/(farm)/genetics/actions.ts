"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, auditLogs, bulls } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { requireFarm } from "@/lib/farm-context";
import { matingFlags, type PedigreeLink } from "@/lib/mating";
import { canUseGenetics, canVoidMatingNote } from "@/lib/permissions";

export async function saveMatingCheck(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles)) redirect("/genetics?error=role");
  const female = String(formData.get("female") ?? "").trim();
  const raw = String(formData.get("bull") ?? "").trim();
  const bull = raw.split("::")[0]?.trim() ?? "";
  const batch = raw.split("::")[1]?.trim() || null;
  const herd = await db.select().from(animals).where(eq(animals.farmId, farm.farmId));
  const bullRows = await db.select().from(bulls).where(eq(bulls.farmId, farm.farmId));
  const femaleRow = herd.find((row) => row.code === female);
  if (!femaleRow || !bull) redirect("/genetics?error=animal");
  const byId = new Map(herd.map((row) => [row.id, row]));
  const links: PedigreeLink[] = [
    ...herd.map((row) => ({
      code: row.code,
      sireCode: row.geneticSireCode,
      damCode: row.geneticDamId ? (byId.get(row.geneticDamId)?.code ?? null) : null,
    })),
    ...bullRows.map((row) => ({ code: row.code, sireCode: row.sireCode, damCode: row.damCode })),
  ];
  const flags = matingFlags(female, bull, links);
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "create",
    entity: "mating_check",
    entityId: femaleRow.id,
    summary: `Mating check ${female} × ${bull}${batch ? ` · batch ${batch}` : ""}`,
    after: { female, bull, batch, flags },
  });
  redirect(`/genetics?female=${encodeURIComponent(female)}&bull=${encodeURIComponent(raw)}&saved=1`);
}

export async function voidMatingNote(formData: FormData) {
  const farm = await requireFarm();
  const id = String(formData.get("id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "");
  const back = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/genetics";
  const [note] = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.id, id), eq(auditLogs.farmId, farm.farmId), eq(auditLogs.entity, "mating_check"), eq(auditLogs.action, "create")))
    .limit(1);
  if (!note || !reason || !canVoidMatingNote(farm.roles, note.actorId, farm.userId)) redirect(back);
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "void",
    entity: "mating_check",
    entityId: note.entityId,
    summary: `Voided mating check: ${reason}`,
    before: { noteId: note.id, summary: note.summary },
    after: { noteId: note.id, voidReason: reason },
  });
  redirect(back);
}
