"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, financeEntries } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { requireFarm } from "@/lib/farm-context";
import { canRecordFinance } from "@/lib/permissions";

export async function confirmSuggestion(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordFinance(farm.roles)) redirect("/finance?error=role");
  const key = String(formData.get("key") ?? "");
  const kind = String(formData.get("kind") ?? "") === "income" ? "income" : "expense";
  const category = String(formData.get("category") ?? "other");
  const amount = Number(formData.get("amount") ?? "");
  const entryOn = String(formData.get("entryOn") ?? "");
  const animalId = String(formData.get("animalId") ?? "");
  if (!key.startsWith("suggested:") || !Number.isFinite(amount) || amount < 0 || !entryOn) redirect("/finance?error=amount");
  const existing = await db.select({ note: financeEntries.note }).from(financeEntries).where(eq(financeEntries.farmId, farm.farmId));
  if (existing.some((row) => row.note?.includes(key))) redirect("/finance");
  let linked: string | null = null;
  if (animalId) {
    const [animal] = await db.select({ id: animals.id }).from(animals).where(and(eq(animals.id, animalId), eq(animals.farmId, farm.farmId))).limit(1);
    linked = animal?.id ?? null;
  }
  const [row] = await db
    .insert(financeEntries)
    .values({
      farmId: farm.farmId,
      kind,
      category,
      amount: amount.toFixed(2),
      entryOn,
      animalId: linked,
      note: key,
      createdBy: farm.userId,
    })
    .returning({ id: financeEntries.id });
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "create",
    entity: "finance",
    entityId: row.id,
    summary: `Confirmed ${category} ₹${amount.toFixed(2)}`,
    after: { key, kind, category },
  });
  redirect("/finance");
}
