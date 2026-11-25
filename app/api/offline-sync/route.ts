import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { animals, heats, milkYields, weights } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { farmToday, parseFarmDate } from "@/lib/dates";
import { getFarm } from "@/lib/farm-context";
import { canRecordHeat, canRecordWeight, canWriteMilk } from "@/lib/permissions";
import { syncMilkDrops } from "@/lib/sync-milk-drops";

export const runtime = "nodejs";

const itemSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().min(1),
    kind: z.literal("milk"),
    animalCode: z.string().trim().min(1),
    recordedOn: z.string().trim(),
    morningLitres: z.number().min(0).max(80).optional(),
    eveningLitres: z.number().min(0).max(80).optional(),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("weight"),
    animalCode: z.string().trim().min(1),
    weighedOn: z.string().trim(),
    kilograms: z.number().positive().max(1200),
    note: z.string().trim().max(160).optional(),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("heat"),
    animalCode: z.string().trim().min(1),
    observedOn: z.string().trim(),
    signs: z.string().trim().max(80).optional(),
    note: z.string().trim().max(200).optional(),
  }),
]);

const bodySchema = z.object({
  items: z.array(itemSchema).max(200),
});

export async function POST(request: Request) {
  const farm = await getFarm();
  if (!farm) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid sync payload" }, { status: 400 });

  const today = farmToday(farm.timezone);
  const herd = await db.select().from(animals).where(eq(animals.farmId, farm.farmId));
  const byCode = new Map(herd.map((a) => [a.code.toLowerCase(), a]));

  const syncedIds: string[] = [];
  const errors: string[] = [];
  let latestMilkDate = "";

  await db.transaction(async (tx) => {
    for (const item of parsed.data.items) {
      const animal = byCode.get(item.animalCode.toLowerCase());
      if (!animal) {
        errors.push(`Unknown animal "${item.animalCode}"`);
        continue;
      }

      if (item.kind === "milk") {
        if (!canWriteMilk(farm.roles)) {
          errors.push("Role cannot sync milk records");
          continue;
        }
        const date = parseFarmDate(item.recordedOn);
        if (!date || date > today) {
          errors.push(`Invalid milk date ${item.recordedOn}`);
          continue;
        }
        const [prev] = await tx
          .select()
          .from(milkYields)
          .where(and(eq(milkYields.farmId, farm.farmId), eq(milkYields.animalId, animal.id), eq(milkYields.recordedOn, date)))
          .limit(1);
        const morning = item.morningLitres !== undefined ? item.morningLitres.toFixed(1) : (prev?.morningLitres ?? null);
        const evening = item.eveningLitres !== undefined ? item.eveningLitres.toFixed(1) : (prev?.eveningLitres ?? null);
        const [saved] = await tx
          .insert(milkYields)
          .values({
            farmId: farm.farmId,
            animalId: animal.id,
            recordedOn: date,
            morningLitres: morning,
            eveningLitres: evening,
            createdBy: farm.userId,
          })
          .onConflictDoUpdate({
            target: [milkYields.animalId, milkYields.recordedOn],
            set: { morningLitres: morning, eveningLitres: evening, voidedAt: null, updatedAt: new Date() },
          })
          .returning({ id: milkYields.id });
        await writeAudit(tx, {
          farmId: farm.farmId,
          actorId: farm.userId,
          action: prev ? "update" : "create",
          entity: "milk",
          entityId: saved.id,
          summary: `Offline sync milk for ${animal.code} (${date})`,
          after: { morning, evening, offlineSync: true },
        });
        syncedIds.push(item.id);
        if (date > latestMilkDate) latestMilkDate = date;
      } else if (item.kind === "weight") {
        if (!canRecordWeight(farm.roles)) {
          errors.push("Role cannot sync weights");
          continue;
        }
        const date = parseFarmDate(item.weighedOn);
        if (!date || date > today) {
          errors.push(`Invalid weight date ${item.weighedOn}`);
          continue;
        }
        const [saved] = await tx
          .insert(weights)
          .values({
            farmId: farm.farmId,
            animalId: animal.id,
            weighedOn: date,
            kilograms: item.kilograms.toFixed(1),
            note: item.note || "Offline shed entry",
            createdBy: farm.userId,
          })
          .returning({ id: weights.id });
        await writeAudit(tx, {
          farmId: farm.farmId,
          actorId: farm.userId,
          action: "create",
          entity: "weight",
          entityId: saved.id,
          summary: `Offline sync weight for ${animal.code}: ${item.kilograms.toFixed(1)} kg`,
        });
        syncedIds.push(item.id);
      } else if (item.kind === "heat") {
        if (!canRecordHeat(farm.roles) || animal.sex === "male") {
          errors.push(`Cannot record heat for ${animal.code}`);
          continue;
        }
        const date = parseFarmDate(item.observedOn);
        if (!date || date > today) {
          errors.push(`Invalid heat date ${item.observedOn}`);
          continue;
        }
        const [saved] = await tx
          .insert(heats)
          .values({
            farmId: farm.farmId,
            animalId: animal.id,
            observedOn: date,
            signs: item.signs || "standing",
            note: item.note || "Offline shed entry",
            createdBy: farm.userId,
          })
          .returning({ id: heats.id });
        await writeAudit(tx, {
          farmId: farm.farmId,
          actorId: farm.userId,
          action: "create",
          entity: "heat",
          entityId: saved.id,
          summary: `Offline sync heat for ${animal.code}`,
        });
        syncedIds.push(item.id);
      }
    }
  });

  if (latestMilkDate) await syncMilkDrops(farm.farmId, latestMilkDate);
  return NextResponse.json({ ok: true, syncedIds, errors });
}
