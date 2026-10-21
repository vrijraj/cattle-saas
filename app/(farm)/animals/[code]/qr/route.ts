import QRCode from "qrcode";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { animals } from "@/db/schema";
import { requireFarm } from "@/lib/farm-context";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const farm = await requireFarm();
  const { code } = await context.params;
  const [animal] = await db
    .select({ token: animals.qrToken })
    .from(animals)
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)))
    .limit(1);
  if (!animal) return new Response("Not found", { status: 404 });

  const origin = process.env.AUTH_URL ?? "http://localhost:3000";
  const png = await QRCode.toBuffer(`${origin}/q/${animal.token}`, { width: 512, margin: 1 });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" },
  });
}
