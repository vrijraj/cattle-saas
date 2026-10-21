"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals } from "@/db/schema";
import { requireFarm } from "@/lib/farm-context";
import { canWriteAnimals } from "@/lib/permissions";
import { putPrivateObject, storageConfigured } from "@/lib/storage";

const types: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function savePhoto(formData: FormData) {
  const farm = await requireFarm();
  const code = String(formData.get("code") ?? "");
  if (!canWriteAnimals(farm.roles)) redirect(`/animals/${code}`);
  if (!storageConfigured()) redirect(`/animals/${code}?error=storage`);

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0 || file.size > 5 * 1024 * 1024 || !types[file.type]) {
    redirect(`/animals/${code}?error=photo`);
  }

  const [animal] = await db
    .select({ id: animals.id })
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)))
    .limit(1);
  if (!animal) redirect("/animals");

  const key = `farms/${farm.farmId}/animals/${code}/${randomUUID()}.${types[file.type]}`;
  await putPrivateObject(key, Buffer.from(await file.arrayBuffer()), file.type);
  await db
    .update(animals)
    .set({ photoKey: key, updatedAt: new Date() })
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)));
  redirect(`/animals/${code}`);
}
