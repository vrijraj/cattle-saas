import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { animals } from "@/db/schema";
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
  if (!animal?.photoKey || !storageConfigured()) return new Response("Not found", { status: 404 });

  const object = await readPrivateObject(animal.photoKey);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(object.bytes), {
    headers: {
      "Content-Type": object.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
