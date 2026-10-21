"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, financeEntries } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { requireFarm } from "@/lib/farm-context";
import { canRecordFinance } from "@/lib/permissions";
import { canonicalCategory } from "@/lib/finance-suggestions";

export async function confirmSuggestion(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordFinance(farm.roles)) redirect("/finance?error=role");
  const key = String(formData.get("key") ?? "");
  const kind = String(formData.get("kind") ?? "") === "income" ? "income" : "expense";
  const category = String(formData.get("category") ?? "other");
  const amount = Number(formData.get("amount") ?? "");
  const entryOn = String(formData.get("entryOn") ?? "");
  const animalId = String(formData.get("animalId") ?? "");
  if (!key.startsWith("suggested:") || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(entryOn)) redirect("/finance?error=amount");
  const canonical = canonicalCategory(kind, category);
  if (!canonical) redirect("/finance?error=category");
  const existing = await db.select({ note: financeEntries.note, voidedAt: financeEntries.voidedAt }).from(financeEntries).where(eq(financeEntries.farmId, farm.farmId));
  if (existing.some((row) => !row.voidedAt && row.note?.includes(key))) redirect("/finance");
  let linked: string | null = null;
  if (animalId) {
    const [animal] = await db.select({ id: animals.id }).from(animals).where(and(eq(animals.id, animalId), eq(animals.farmId, farm.farmId))).limit(1);
    linked = animal?.id ?? null;
    if (!linked) redirect("/finance?error=animal");
  }
  const [row] = await db
    .insert(financeEntries)
    .values({
      farmId: farm.farmId,
      kind,
      category: canonical,
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
    summary: `Confirmed ${canonical} ₹${amount.toFixed(2)}`,
    after: { key, kind, category: canonical },
  });
  redirect("/finance?saved=1");
}
