"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, milkYields } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { farmToday } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canWriteMilk } from "@/lib/permissions";

function parseLitres(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return { litres: null as string | null };
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0 || amount > 80) return { error: true as const };
  return { litres: amount.toFixed(1) };
}

export async function saveMilk(formData: FormData) {
  const farm = await requireFarm();
  if (!canWriteMilk(farm.roles)) redirect("/milk?error=role");

  const today = farmToday(farm.timezone);
  const herd = await db
    .select({ id: animals.id })
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.presence, "on_farm"), eq(animals.lactation, "lactating")));

  const rows: { id: string; morning: string | null; evening: string | null }[] = [];
  for (const animal of herd) {
    const morning = parseLitres(formData.get(`morning-${animal.id}`));
    const evening = parseLitres(formData.get(`evening-${animal.id}`));
    if ("error" in morning || "error" in evening) redirect("/milk?error=range");
    rows.push({ id: animal.id, morning: morning.litres, evening: evening.litres });
  }

  await db.transaction(async (tx) => {
    for (const row of rows) {
      if (row.morning === null && row.evening === null) continue;
      const [saved] = await tx
        .insert(milkYields)
        .values({
          farmId: farm.farmId,
          animalId: row.id,
          recordedOn: today,
          morningLitres: row.morning,
          eveningLitres: row.evening,
          createdBy: farm.userId,
        })
        .onConflictDoUpdate({
          target: [milkYields.animalId, milkYields.recordedOn],
          set: {
            morningLitres: row.morning,
            eveningLitres: row.evening,
            updatedAt: new Date(),
          },
        })
        .returning({ id: milkYields.id });
      await writeAudit(tx, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "update",
        entity: "milk",
        entityId: saved.id,
        summary: `Milk updated for ${today}`,
        after: { recordedOn: today, morning: row.morning, evening: row.evening },
      });
    }
  });

  redirect("/milk?saved=1");
}
