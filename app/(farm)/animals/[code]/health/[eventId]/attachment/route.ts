import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { animals, healthEvents } from "@/db/schema";
import { requireFarm } from "@/lib/farm-context";
import { canSeeClinical } from "@/lib/permissions";
import { readPrivateObject, storageConfigured } from "@/lib/storage";

export async function GET(request: Request, context: { params: Promise<{ code: string; eventId: string }> }) {
  const farm = await requireFarm();
  if (!canSeeClinical(farm.roles)) return new Response("Forbidden", { status: 403 });
  const { code, eventId } = await context.params;

  const [animal] = await db
    .select({ id: animals.id })
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)))
    .limit(1);
  if (!animal) return new Response("Not found", { status: 404 });

  const [event] = await db
    .select({ attachmentKey: healthEvents.attachmentKey, attachmentName: healthEvents.attachmentName })
    .from(healthEvents)
    .where(and(eq(healthEvents.id, eventId), eq(healthEvents.animalId, animal.id), eq(healthEvents.farmId, farm.farmId)))
    .limit(1);
  if (!event?.attachmentKey || !storageConfigured()) return new Response("Not found", { status: 404 });

  const object = await readPrivateObject(event.attachmentKey);
  if (!object) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";
  const fileName = (event.attachmentName ?? `attachment-${eventId}`).replace(/[^a-zA-Z0-9._-]/g, "_");
  return new Response(new Uint8Array(object.bytes), {
    headers: {
      "Content-Type": object.contentType,
      "Cache-Control": "private, max-age=3600",
      ...(download ? { "Content-Disposition": `attachment; filename="${fileName}"` } : {}),
    },
  });
}
