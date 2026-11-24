"use server";

import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, feedItems, feedMovements, financeEntries, healthEvents, milkYields, semenBatches } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { farmToday } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canRecordFinance } from "@/lib/permissions";

type ResolvedSuggestion = {
  kind: "income" | "expense";
  category: string;
  amount: number;
  entryOn: string;
  animalId: string | null;
  note: string;
};

async function resolveSuggestion(farm: Awaited<ReturnType<typeof requireFarm>>, key: string): Promise<ResolvedSuggestion | null> {
  const parts = key.split(":");
  if (parts[0] !== "suggested" || parts.length < 3) return null;
  const kindKey = parts[1];
  const ref = parts.slice(2).join(":");

  if (kindKey === "milk") {
    if (!/^\d{4}-\d{2}$/.test(ref) || !farm.milkPricePerLitre) return null;
    const price = Number(farm.milkPricePerLitre);
    if (!Number.isFinite(price) || price <= 0) return null;
    const rows = await db
      .select()
      .from(milkYields)
      .where(and(eq(milkYields.farmId, farm.farmId), isNull(milkYields.voidedAt)));
    const litres = rows
      .filter((row) => row.recordedOn.startsWith(ref))
      .reduce((sum, row) => sum + Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0), 0);
    if (litres <= 0) return null;
    return {
      kind: "income",
      category: "milk",
      amount: Math.round(litres * price * 100) / 100,
      entryOn: `${ref}-01`,
      animalId: null,
      note: `Milk · ${ref} · ${litres.toFixed(1)} L × ₹${price.toFixed(2)}`,
    };
  }

  if (kindKey === "medicine") {
    const [event] = await db
      .select()
      .from(healthEvents)
      .where(and(eq(healthEvents.id, ref), eq(healthEvents.farmId, farm.farmId), isNull(healthEvents.voidedAt)))
      .limit(1);
    const cost = event?.cost ? Number(event.cost) : 0;
    if (!event || cost <= 0) return null;
    const [animal] = await db
      .select({ code: animals.code, name: animals.name })
      .from(animals)
      .where(and(eq(animals.id, event.animalId), eq(animals.farmId, farm.farmId)))
      .limit(1);
    return {
      kind: "expense",
      category: "medicine",
      amount: Math.round(cost * 100) / 100,
      entryOn: event.eventOn,
      animalId: event.animalId,
      note: `Medicine · ${event.problem} · ${animal?.name ?? animal?.code ?? "Animal"}`,
    };
  }

  if (kindKey === "semen") {
    const [batch] = await db
      .select()
      .from(semenBatches)
      .where(and(eq(semenBatches.id, ref), eq(semenBatches.farmId, farm.farmId)))
      .limit(1);
    const unit = batch?.pricePerStraw ? Number(batch.pricePerStraw) : 0;
    if (!batch || unit <= 0) return null;
    return {
      kind: "expense",
      category: "semen",
      amount: Math.round(unit * batch.quantityReceived * 100) / 100,
      entryOn: batch.receivedOn ?? farmToday(farm.timezone),
      animalId: null,
      note: `Semen batch ${batch.batchNumber} · ${batch.quantityReceived} straws`,
    };
  }

  if (kindKey === "feed") {
    const [movement] = await db
      .select()
      .from(feedMovements)
      .where(and(eq(feedMovements.id, ref), eq(feedMovements.farmId, farm.farmId), isNull(feedMovements.voidedAt)))
      .limit(1);
    const unit = movement?.unitCost ? Number(movement.unitCost) : 0;
    if (!movement || movement.kind !== "purchase" || unit <= 0) return null;
    const [item] = await db
      .select({ name: feedItems.name, unit: feedItems.unit })
      .from(feedItems)
      .where(and(eq(feedItems.id, movement.itemId), eq(feedItems.farmId, farm.farmId)))
      .limit(1);
    return {
      kind: "expense",
      category: "feed",
      amount: Math.round(Math.abs(Number(movement.quantity)) * unit * 100) / 100,
      entryOn: movement.movedOn,
      animalId: null,
      note: `Feed purchase · ${item?.name ?? "Feed"} · ${movement.quantity} ${item?.unit ?? "kg"}`,
    };
  }

  if (kindKey === "sale") {
    const [animal] = await db
      .select()
      .from(animals)
      .where(and(eq(animals.id, ref), eq(animals.farmId, farm.farmId), eq(animals.presence, "sold")))
      .limit(1);
    const amount = animal?.exitAmount ? Number(animal.exitAmount) : 0;
    if (!animal || amount <= 0) return null;
    return {
      kind: "income",
      category: animal.lifeStage === "calf" ? "calves" : "cattle sales",
      amount: Math.round(amount * 100) / 100,
      entryOn: animal.exitOn ?? farmToday(farm.timezone),
      animalId: animal.id,
      note: `Animal sale · ${animal.name ?? animal.code} · ${animal.code}`,
    };
  }

  return null;
}

export async function confirmSuggestion(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordFinance(farm.roles)) redirect("/finance?error=role");
  const key = String(formData.get("key") ?? "").trim();
  const resolved = await resolveSuggestion(farm, key);
  if (!resolved) redirect("/finance?error=amount");

  try {
    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: financeEntries.id, sourceKey: financeEntries.sourceKey, note: financeEntries.note })
        .from(financeEntries)
        .where(and(eq(financeEntries.farmId, farm.farmId), isNull(financeEntries.voidedAt)));
      if (existing.some((row) => row.sourceKey === key || row.note === key)) return;

      const [row] = await tx
        .insert(financeEntries)
        .values({
          farmId: farm.farmId,
          kind: resolved.kind,
          category: resolved.category,
          amount: resolved.amount.toFixed(2),
          entryOn: resolved.entryOn,
          animalId: resolved.animalId,
          sourceKey: key,
          note: resolved.note,
          createdBy: farm.userId,
        })
        .returning({ id: financeEntries.id });
      await writeAudit(tx, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "create",
        entity: "finance",
        entityId: row.id,
        summary: `Confirmed ${resolved.category} ₹${resolved.amount.toFixed(2)}`,
        after: { key, kind: resolved.kind, category: resolved.category, amount: resolved.amount.toFixed(2) },
      });
    });
  } catch {
    // Duplicate unique source_key from concurrent click — idempotent
    redirect("/finance");
  }
  redirect("/finance?saved=1");
}
