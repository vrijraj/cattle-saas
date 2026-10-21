import { eq } from "drizzle-orm";
import { db } from "@/db";
import { alerts, animals, breeds, bulls, enquiries, locations, products, semenBatches, straws } from "@/db/schema";
import { getFarm } from "@/lib/farm-context";
import { herdMatchField, type HerdMatchRow } from "@/lib/herd-query";

function includes(values: Array<string | null | undefined>, term: string) {
  return values.some((value) => value?.toLowerCase().includes(term));
}

function take<T>(rows: T[], limit: number) {
  return { items: rows.slice(0, limit), count: rows.length };
}

export async function GET(request: Request) {
  const farm = await getFarm();
  if (!farm) return Response.json({ error: "Sign in to search the herd." }, { status: 401 });

  const term = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (!term) {
    return Response.json({
      cattle: [],
      cattleCount: 0,
      straws: [],
      strawCount: 0,
      bulls: [],
      bullCount: 0,
      alerts: [],
      alertCount: 0,
      products: [],
      productCount: 0,
      enquiries: [],
      enquiryCount: 0,
    });
  }

  const [cattleRows, strawRows, bullRows, alertRows, productRows, enquiryRows] = await Promise.all([
    db
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
      .orderBy(animals.code),
    db
      .select({
        code: straws.code,
        tank: straws.tank,
        status: straws.status,
        bullCode: bulls.code,
        bullName: bulls.name,
        batchNumber: semenBatches.batchNumber,
      })
      .from(straws)
      .innerJoin(semenBatches, eq(semenBatches.id, straws.batchId))
      .innerJoin(bulls, eq(bulls.id, semenBatches.bullId))
      .where(eq(straws.farmId, farm.farmId))
      .orderBy(straws.code),
    db
      .select({ code: bulls.code, name: bulls.name, breed: bulls.breed, semenCompany: bulls.semenCompany })
      .from(bulls)
      .where(eq(bulls.farmId, farm.farmId))
      .orderBy(bulls.code),
    db
      .select({ id: alerts.id, title: alerts.title, body: alerts.body, status: alerts.status })
      .from(alerts)
      .where(eq(alerts.farmId, farm.farmId)),
    db
      .select({ id: products.id, name: products.name, category: products.category })
      .from(products)
      .where(eq(products.farmId, farm.farmId))
      .orderBy(products.name),
    db
      .select({ id: enquiries.id, name: enquiries.name, phone: enquiries.phone, animalCode: enquiries.animalCode, message: enquiries.message })
      .from(enquiries)
      .where(eq(enquiries.farmId, farm.farmId)),
  ]);

  const cattle = take(
    cattleRows.flatMap((row) => {
      const match = herdMatchField(row as HerdMatchRow, term);
      return match ? [{ ...row, match }] : [];
    }),
    8,
  );
  const strawMatches = take(
    strawRows.filter((row) => includes([row.code, row.tank, row.bullCode, row.bullName, row.batchNumber], term)),
    5,
  );
  const bullMatches = take(
    bullRows.filter((row) => includes([row.code, row.name, row.breed, row.semenCompany], term)),
    5,
  );
  const alertMatches = take(
    alertRows.filter((row) => row.status === "open" && includes([row.title, row.body], term)),
    5,
  );
  const productMatches = take(
    productRows.filter((row) => includes([row.name, row.category], term)),
    5,
  );
  const enquiryMatches = take(
    enquiryRows.filter((row) => includes([row.name, row.phone, row.animalCode, row.message], term)),
    5,
  );

  return Response.json({
    cattle: cattle.items.map((row) => ({
      code: row.code,
      name: row.name,
      breedName: row.breedName,
      locationName: row.locationName,
      earTag: row.earTag,
      match: row.match,
    })),
    cattleCount: cattle.count,
    straws: strawMatches.items.map((row) => ({ code: row.code, bullName: row.bullName, status: row.status })),
    strawCount: strawMatches.count,
    bulls: bullMatches.items.map((row) => ({ code: row.code, name: row.name, breed: row.breed })),
    bullCount: bullMatches.count,
    alerts: alertMatches.items.map((row) => ({
      id: row.id,
      title: row.title,
      detail: row.title.toLowerCase().includes(term) ? "Alert" : row.body,
    })),
    alertCount: alertMatches.count,
    products: productMatches.items.map((row) => ({ id: row.id, name: row.name, category: row.category })),
    productCount: productMatches.count,
    enquiries: enquiryMatches.items.map((row) => ({ id: row.id, name: row.name, about: row.animalCode || "Catalogue" })),
    enquiryCount: enquiryMatches.count,
  });
}
