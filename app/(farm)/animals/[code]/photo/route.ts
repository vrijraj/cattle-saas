import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { animals, bulls } from "@/db/schema";
import { requireFarm } from "@/lib/farm-context";
import { readPrivateObject, storageConfigured } from "@/lib/storage";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const farm = await requireFarm();
  const { code } = await context.params;
  const [animal] = await db
    .select({ photoKey: animals.photoKey })
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)))
    .limit(1);
  let photoKey = animal?.photoKey ?? null;
  if (!photoKey) {
    const [bull] = await db
      .select({ photoKey: bulls.photoKey })
      .from(bulls)
      .where(and(eq(bulls.farmId, farm.farmId), eq(bulls.code, code)))
      .limit(1);
    photoKey = bull?.photoKey ?? null;
  }
  if (!photoKey || !storageConfigured()) return new Response("Not found", { status: 404 });

  const object = await readPrivateObject(photoKey);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(object.bytes), {
    headers: {
      "Content-Type": object.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
