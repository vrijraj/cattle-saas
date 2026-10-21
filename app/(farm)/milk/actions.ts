"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, milkYields } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { farmToday, formatDisplayDate, parseFarmDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canWriteMilk } from "@/lib/permissions";
import { syncMilkDrops } from "@/lib/sync-milk-drops";

function parseLitres(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return { litres: null as string | null };
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0 || amount > 80) return { error: true as const };
  return { litres: amount.toFixed(1) };
}

function milkPath(recordedOn: string, today: string, extra: Record<string, string>) {
  const params = new URLSearchParams(extra);
  if (recordedOn !== today) params.set("date", recordedOn);
  const query = params.toString();
  return query ? `/milk?${query}` : "/milk";
}

export async function saveMilk(formData: FormData) {
  const farm = await requireFarm();
  if (!canWriteMilk(farm.roles)) redirect("/milk?error=role");

  const today = farmToday(farm.timezone);
  const recordedOn = parseFarmDate(String(formData.get("recordedOn") ?? ""));
  if (!recordedOn || recordedOn > today) redirect("/milk?error=date");
  const herd = await db
    .select({ id: animals.id, code: animals.code })
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.presence, "on_farm"), eq(animals.lactation, "lactating")));

  const rows: { id: string; code: string; morning: string | null; evening: string | null }[] = [];
  for (const animal of herd) {
    const morning = parseLitres(formData.get(`morning-${animal.id}`));
    const evening = parseLitres(formData.get(`evening-${animal.id}`));
    if ("error" in morning || "error" in evening) redirect(milkPath(recordedOn, today, { error: "range" }));
    rows.push({ id: animal.id, code: animal.code, morning: morning.litres, evening: evening.litres });
  }

  await db.transaction(async (tx) => {
    for (const row of rows) {
      if (row.morning === null && row.evening === null) continue;
      const [saved] = await tx
        .insert(milkYields)
        .values({
          farmId: farm.farmId,
          animalId: row.id,
          recordedOn,
          morningLitres: row.morning,
          eveningLitres: row.evening,
          createdBy: farm.userId,
        })
        .onConflictDoUpdate({
          target: [milkYields.animalId, milkYields.recordedOn],
          set: {
            morningLitres: row.morning,
            eveningLitres: row.evening,
            voidedAt: null,
            voidReason: null,
            voidedBy: null,
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
        summary: `Milk for ${row.code} on ${formatDisplayDate(recordedOn)}: ${[row.morning ? `${row.morning} L morning` : "", row.evening ? `${row.evening} L evening` : ""].filter(Boolean).join(", ") || "no litres entered"}`,
        after: { recordedOn, morning: row.morning, evening: row.evening },
      });
    }
  });

  await syncMilkDrops(farm.farmId, recordedOn);
  redirect(milkPath(recordedOn, today, { saved: "1" }));
}
