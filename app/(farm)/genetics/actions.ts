"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, bulls } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { requireFarm } from "@/lib/farm-context";
import { matingFlags, type PedigreeLink } from "@/lib/mating";
import { canUseGenetics } from "@/lib/permissions";

export async function saveMatingCheck(formData: FormData) {
  const farm = await requireFarm();
  if (!canUseGenetics(farm.roles)) redirect("/genetics?error=role");
  const female = String(formData.get("female") ?? "").trim();
  const bull = String(formData.get("bull") ?? "").trim();
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
    summary: `Mating check ${female} × ${bull}`,
    after: { female, bull, flags },
  });
  redirect(`/genetics?female=${encodeURIComponent(female)}&bull=${encodeURIComponent(bull)}&saved=1`);
}
