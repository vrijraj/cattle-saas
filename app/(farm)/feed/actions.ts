"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { feedItems, feedMovements, rationGroupItems, rationGroups } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { farmToday, parseFarmDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { feedAverageUnitCost } from "@/lib/feed-stock";
import { canRecordFeed } from "@/lib/permissions";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveRationGroup(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordFeed(farm.roles)) redirect("/feed?error=role");

  const name = text(formData, "name").slice(0, 100);
  const stageRaw = text(formData, "targetStage");
  const targetStage = ["lactating", "dry", "heifer", "calf", "bull", "all"].includes(stageRaw) ? stageRaw : "lactating";
  const note = text(formData, "note").slice(0, 200) || null;
  if (!name) redirect("/feed?error=item");

  await db.transaction(async (tx) => {
    const [group] = await tx
      .insert(rationGroups)
      .values({ farmId: farm.farmId, name, targetStage, active: true, note })
      .returning({ id: rationGroups.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "ration_group",
      entityId: group.id,
      summary: `Created ration group ${name} (${targetStage})`,
      after: { name, targetStage },
    });
  });

  redirect("/feed?saved=1");
}

export async function addRationItem(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordFeed(farm.roles)) redirect("/feed?error=role");

  const groupId = text(formData, "groupId");
  const feedItemId = text(formData, "feedItemId");
  const kgPerHead = Number(text(formData, "kgPerHeadPerDay"));
  if (!groupId || !feedItemId || !Number.isFinite(kgPerHead) || kgPerHead <= 0 || kgPerHead > 200) {
    redirect("/feed?error=quantity");
  }

  const [[group], [item]] = await Promise.all([
    db.select({ id: rationGroups.id, name: rationGroups.name }).from(rationGroups).where(and(eq(rationGroups.id, groupId), eq(rationGroups.farmId, farm.farmId))).limit(1),
    db.select({ id: feedItems.id, name: feedItems.name }).from(feedItems).where(and(eq(feedItems.id, feedItemId), eq(feedItems.farmId, farm.farmId))).limit(1),
  ]);
  if (!group || !item) redirect("/feed?error=item");

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(rationGroupItems)
      .values({
        farmId: farm.farmId,
        groupId: group.id,
        feedItemId: item.id,
        kgPerHeadPerDay: kgPerHead.toFixed(2),
      })
      .returning({ id: rationGroupItems.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "ration_group_item",
      entityId: row.id,
      summary: `Added ${kgPerHead.toFixed(2)} kg/head ${item.name} to ${group.name}`,
    });
  });

  redirect("/feed?saved=1");
}

export async function deleteRationItem(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordFeed(farm.roles)) redirect("/feed?error=role");
  const id = text(formData, "id");
  if (!id) redirect("/feed");
  await db.delete(rationGroupItems).where(and(eq(rationGroupItems.id, id), eq(rationGroupItems.farmId, farm.farmId)));
  redirect("/feed?saved=1");
}

export async function applyRationGroup(formData: FormData) {
  const farm = await requireFarm();
  if (!canRecordFeed(farm.roles)) redirect("/feed?error=role");

  const groupId = text(formData, "groupId");
  const headCount = Number(text(formData, "headCount"));
  const movedOn = parseFarmDate(text(formData, "movedOn") || farmToday(farm.timezone));
  if (!groupId || !Number.isInteger(headCount) || headCount < 1 || headCount > 5000 || !movedOn) {
    redirect("/feed?error=quantity");
  }

  const [[group], items, existingMovements] = await Promise.all([
    db.select().from(rationGroups).where(and(eq(rationGroups.id, groupId), eq(rationGroups.farmId, farm.farmId))).limit(1),
    db.select().from(rationGroupItems).where(and(eq(rationGroupItems.groupId, groupId), eq(rationGroupItems.farmId, farm.farmId))),
    db.select().from(feedMovements).where(eq(feedMovements.farmId, farm.farmId)),
  ]);
  if (!group || items.length === 0) redirect("/feed?error=item");

  await db.transaction(async (tx) => {
    for (const ingredient of items) {
      const totalKg = Math.round(Number(ingredient.kgPerHeadPerDay) * headCount * 10) / 10;
      if (totalKg <= 0) continue;
      const avgCost = feedAverageUnitCost(existingMovements.filter((m) => m.itemId === ingredient.feedItemId && !m.voidedAt));
      const [mv] = await tx
        .insert(feedMovements)
        .values({
          farmId: farm.farmId,
          itemId: ingredient.feedItemId,
          kind: "consumption",
          quantity: totalKg.toFixed(1),
          unitCost: avgCost !== null ? avgCost.toFixed(2) : null,
          movedOn,
          note: `Ration · ${group.name} (${headCount} head)`,
          createdBy: farm.userId,
        })
        .returning({ id: feedMovements.id });
      await writeAudit(tx, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "create",
        entity: "feed",
        entityId: mv.id,
        summary: `Applied ration ${group.name} (${headCount} head): ${totalKg.toFixed(1)} kg`,
        after: { groupId: group.id, feedItemId: ingredient.feedItemId, totalKg, headCount, movedOn },
      });
    }
  });

  redirect("/feed?saved=1");
}
