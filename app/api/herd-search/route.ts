import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { alerts, animals, breeds, bulls, enquiries, locations, products, semenBatches, straws } from "@/db/schema";
import { getFarm } from "@/lib/farm-context";
import { herdMatchField, type HerdMatchRow } from "@/lib/herd-query";
import { canReadAlert, canViewEnquiries, canViewSemen, canViewShopAdmin } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const farm = await getFarm();
  if (!farm) return Response.json({ error: "Sign in to search the herd." }, { status: 401 });

  const rl = checkRateLimit(`search:${farm.farmId}:${farm.userId}`, { limit: 60, windowMs: 60 * 1000 });
  if (!rl.allowed) {
    return Response.json({ error: "Too many search requests." }, { status: 429 });
  }

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

  const like = `%${term.replace(/[%_\\]/g, "\\$&")}%`;
  const seeSemen = canViewSemen(farm.roles);
  const seeShop = canViewShopAdmin(farm.roles);
  const seeEnquiries = canViewEnquiries(farm.roles);

  const [cattleRows, strawRows, bullRows, alertRows, productRows, enquiryRows] = await Promise.all([
    db
      .select({
        code: animals.code,
        name: animals.name,
        earTag: animals.earTag,
        rfid: animals.rfid,
        breedName: breeds.name,
        locationName: locations.name,
        geneticSireCode: animals.geneticSireCode,
        geneticSireName: animals.geneticSireName,
      })
      .from(animals)
      .innerJoin(breeds, eq(breeds.id, animals.breedId))
      .leftJoin(locations, eq(locations.id, animals.locationId))
      .where(
        and(
          eq(animals.farmId, farm.farmId),
          or(
            ilike(animals.code, like),
            ilike(animals.name, like),
            ilike(animals.earTag, like),
            ilike(animals.rfid, like),
            ilike(animals.geneticSireCode, like),
            ilike(animals.geneticSireName, like),
            ilike(breeds.name, like),
            ilike(locations.name, like),
          ),
        ),
      )
      .orderBy(animals.code)
      .limit(25),
    seeSemen
      ? db
          .select({
            code: straws.code,
            tank: straws.tank,
            status: straws.status,
            bullCode: bulls.code,
            bullName: bulls.name,
            batchNumber: semenBatches.batchNumber,
            semenType: semenBatches.semenType,
            semenCompany: bulls.semenCompany,
          })
          .from(straws)
          .innerJoin(semenBatches, eq(semenBatches.id, straws.batchId))
          .innerJoin(bulls, eq(bulls.id, semenBatches.bullId))
          .where(
            and(
              eq(straws.farmId, farm.farmId),
              or(
                ilike(straws.code, like),
                ilike(straws.tank, like),
                ilike(bulls.code, like),
                ilike(bulls.name, like),
                ilike(semenBatches.batchNumber, like),
                ilike(bulls.semenCompany, like),
              ),
            ),
          )
          .orderBy(straws.code)
          .limit(15)
      : Promise.resolve([]),
    seeSemen
      ? db
          .select({ code: bulls.code, name: bulls.name, breed: bulls.breed, semenCompany: bulls.semenCompany })
          .from(bulls)
          .where(
            and(
              eq(bulls.farmId, farm.farmId),
              or(ilike(bulls.code, like), ilike(bulls.name, like), ilike(bulls.breed, like), ilike(bulls.semenCompany, like)),
            ),
          )
          .orderBy(bulls.code)
          .limit(15)
      : Promise.resolve([]),
    db
      .select({ id: alerts.id, title: alerts.title, body: alerts.body, status: alerts.status, type: alerts.type })
      .from(alerts)
      .where(and(eq(alerts.farmId, farm.farmId), eq(alerts.status, "open"), or(ilike(alerts.title, like), ilike(alerts.body, like))))
      .limit(20),
    seeShop
      ? db
          .select({ id: products.id, name: products.name, category: products.category })
          .from(products)
          .where(and(eq(products.farmId, farm.farmId), or(ilike(products.name, like), ilike(products.category, like))))
          .orderBy(products.name)
          .limit(15)
      : Promise.resolve([]),
    seeEnquiries
      ? db
          .select({ id: enquiries.id, name: enquiries.name, phone: enquiries.phone, animalCode: enquiries.animalCode, message: enquiries.message })
          .from(enquiries)
          .where(
            and(
              eq(enquiries.farmId, farm.farmId),
              or(ilike(enquiries.name, like), ilike(enquiries.phone, like), ilike(enquiries.animalCode, like), ilike(enquiries.message, like)),
            ),
          )
          .limit(15)
      : Promise.resolve([]),
  ]);

  const cattle = cattleRows.map((row) => ({
    ...row,
    match: herdMatchField(row as HerdMatchRow, term) ?? "Cattle",
  }));
  const visibleAlerts = alertRows.filter((row) => canReadAlert(farm.roles, row.type));

  return Response.json({
    cattle: cattle.slice(0, 8).map((row) => ({
      code: row.code,
      name: row.name,
      breedName: row.breedName,
      locationName: row.locationName,
      earTag: row.earTag,
      rfid: row.rfid,
      match: row.match,
    })),
    cattleCount: cattle.length,
    straws: strawRows.slice(0, 5).map((row) => ({ code: row.code, bullName: row.bullName, status: row.status })),
    strawCount: strawRows.length,
    bulls: bullRows.slice(0, 5).map((row) => ({ code: row.code, name: row.name, breed: row.breed })),
    bullCount: bullRows.length,
    alerts: visibleAlerts.slice(0, 5).map((row) => ({
      id: row.id,
      title: row.title,
      detail: row.title.toLowerCase().includes(term) ? "Alert" : row.body,
    })),
    alertCount: visibleAlerts.length,
    products: productRows.slice(0, 5).map((row) => ({ id: row.id, name: row.name, category: row.category })),
    productCount: productRows.length,
    enquiries: enquiryRows.slice(0, 5).map((row) => ({ id: row.id, name: row.name, about: row.animalCode || "Catalogue" })),
    enquiryCount: enquiryRows.length,
  });
}
