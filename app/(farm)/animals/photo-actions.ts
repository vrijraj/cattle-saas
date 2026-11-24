"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { requireFarm } from "@/lib/farm-context";
import { canWriteAnimals } from "@/lib/permissions";
import { detectAllowedFileType, putPrivateObject, storageConfigured } from "@/lib/storage";

const types: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const allowedMimes = new Set(Object.keys(types));

export async function savePhoto(formData: FormData) {
  const farm = await requireFarm();
  const code = String(formData.get("code") ?? "").trim();
  const [animal] = await db
    .select({ id: animals.id, code: animals.code, photoKey: animals.photoKey })
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)))
    .limit(1);
  if (!animal) redirect("/animals");

  const safeCode = encodeURIComponent(animal.code);
  if (!canWriteAnimals(farm.roles)) redirect(`/animals/${safeCode}?error=role`);
  if (!storageConfigured()) redirect(`/animals/${safeCode}?error=storage`);

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0 || file.size > 5 * 1024 * 1024) {
    redirect(`/animals/${safeCode}?error=photo`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectAllowedFileType(buffer, allowedMimes);
  if (!detected) {
    redirect(`/animals/${safeCode}?error=photo`);
  }

  const key = `farms/${farm.farmId}/animals/${animal.code}/${randomUUID()}.${types[detected]}`;
  await putPrivateObject(key, buffer, detected);
  await db.transaction(async (tx) => {
    await tx
      .update(animals)
      .set({ photoKey: key, updatedAt: new Date() })
      .where(and(eq(animals.farmId, farm.farmId), eq(animals.id, animal.id)));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "animal",
      entityId: animal.id,
      summary: `Updated photo for ${animal.code}`,
      before: { photoKey: animal.photoKey },
      after: { photoKey: key },
    });
  });
  redirect(`/animals/${safeCode}?saved=1`);
}
