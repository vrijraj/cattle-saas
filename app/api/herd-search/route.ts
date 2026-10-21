import { eq } from "drizzle-orm";
import { db } from "@/db";
import { animals, breeds, locations } from "@/db/schema";
import { getFarm } from "@/lib/farm-context";
import { matchesHerdQuery } from "@/lib/herd-query";

export async function GET(request: Request) {
  const farm = await getFarm();
  if (!farm) return Response.json({ error: "Sign in to search the herd." }, { status: 401 });

  const term = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!term) return Response.json({ results: [] });

  const rows = await db
    .select({
      code: animals.code,
      name: animals.name,
      earTag: animals.earTag,
      breedName: breeds.name,
      locationName: locations.name,
      geneticSireCode: animals.geneticSireCode,
      geneticSireName: animals.geneticSireName,
    })
    .from(animals)
    .innerJoin(breeds, eq(breeds.id, animals.breedId))
    .leftJoin(locations, eq(locations.id, animals.locationId))
    .where(eq(animals.farmId, farm.farmId))
    .orderBy(animals.code);

  const results = rows.filter((row) => matchesHerdQuery(row, term)).slice(0, 8);
  return Response.json({ results });
}
