import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { animals, farms, listings, products } from "@/db/schema";
import { readPrivateObject } from "@/lib/storage";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string; kind: string; id: string }> },
) {
  const { slug, kind, id } = await context.params;
  const [farm] = await db.select({ id: farms.id }).from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm) return new NextResponse("Not found", { status: 404 });

  let objectKey: string | null = null;
  if (kind === "animal") {
    const [row] = await db
      .select({ photoKey: animals.photoKey })
      .from(listings)
      .innerJoin(animals, eq(animals.id, listings.animalId))
      .where(and(eq(listings.farmId, farm.id), eq(listings.published, "yes"), eq(animals.code, id)))
      .limit(1);
    objectKey = row?.photoKey ?? null;
  } else if (kind === "product") {
    const [row] = await db
      .select({ photoKey: products.photoKey })
      .from(products)
      .where(and(eq(products.farmId, farm.id), eq(products.id, id), eq(products.published, "yes")))
      .limit(1);
    objectKey = row?.photoKey ?? null;
  } else {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!objectKey) return new NextResponse("Not found", { status: 404 });
  const file = await readPrivateObject(objectKey);
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=300",
    },
  });
}
