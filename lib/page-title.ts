import type { Metadata } from "next";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { farms } from "@/db/schema";

export const siteName = "Farm portal";

export const publicFarm = cache(async (slug: string) => {
  const [farm] = await db.select({ id: farms.id, name: farms.name }).from(farms).where(eq(farms.slug, slug)).limit(1);
  return farm ?? null;
});

export function publicTitle(title: string, description: string): Metadata {
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, siteName },
  };
}
