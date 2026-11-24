import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { FunctionTool } from "@google/adk";
import { z } from "zod";
import { db } from "@/db";
import {
  alerts,
  animals,
  auditLogs,
  breeds,
  bulls,
  calvings,
  dewormings,
  embryoTransfers,
  embryos,
  farmMembers,
  feedItems,
  feedMovements,
  financeEntries,
  healthEvents,
  heats,
  inseminations,
  invites,
  listings,
  locations,
  milkYields,
  orders,
  pregnancyChecks,
  products,
  semenBatches,
  straws,
  users,
  vaccinations,
  weights,
} from "@/db/schema";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { herdCounts } from "@/lib/herd-stats";
import { lactationLabel, lifeStageLabel, presenceLabel, reproductionLabel, sexLabel } from "@/lib/labels";
import { matingFlags, type PedigreeLink } from "@/lib/mating";
import { feedBalance, feedIsLow } from "@/lib/feed-stock";
import { writeTools } from "@/lib/ai/write-tools";
import {
  canExportReport,
  canManageTeam,
  canPublish,
  canReadAlert,
  canSeeClinical,
  canViewAudit,
  canViewFinance,
  canViewGenetics,
  canViewHealth,
  canViewPurchasePrice,
  canViewReports,
  canViewSemen,
  canViewSemenCost,
  canViewShopAdmin,
} from "@/lib/permissions";

export type FarmScope = {
  userId: string;
  farmId: string;
  farmName: string;
  farmSlug: string;
  timezone: string;
  roles: string[];
  canRecordVaccines: boolean;
  matingGenerationWindow: number;
  userName: string;
};

function day(value: string | null | undefined) {
  return value ? formatDisplayDate(value) : null;
}

function money(value: string | null | undefined) {
  if (!value) return null;
  return `₹${Number(value).toLocaleString("en-IN")}`;
}

function denied(register: string) {
  return { allowed: false, register, reason: `This role cannot open ${register}.` };
}

async function loadHerd(farmId: string) {
  return db
    .select({ animal: animals, breedName: breeds.name, locationName: locations.name })
    .from(animals)
    .innerJoin(breeds, eq(breeds.id, animals.breedId))
    .leftJoin(locations, eq(locations.id, animals.locationId))
    .where(eq(animals.farmId, farmId));
}

function card(row: Awaited<ReturnType<typeof loadHerd>>[number]) {
  const animal = row.animal;
  return {
    code: animal.code,
    name: animal.name,
    breed: row.breedName,
    sex: sexLabel[animal.sex],
    lifeStage: lifeStageLabel[animal.lifeStage],
    presence: presenceLabel[animal.presence],
    reproduction: reproductionLabel[animal.reproduction],
    lactation: lactationLabel[animal.lactation],
    dob: day(animal.dob),
    location: row.locationName,
    expectedCalving: day(animal.expectedCalving),
    href: `/animals/${animal.code}`,
  };
}

export function farmTools(scope: FarmScope) {
  const herdOverview = new FunctionTool({
    name: "herd_overview",
    description: "Dashboard counts for this farm: cattle on farm, lactating, dry, pregnant, calves, breed mix, upcoming calvings, and open alerts.",
    execute: async () => {
      const rows = await loadHerd(scope.farmId);
      const today = farmToday(scope.timezone);
      const herd = rows.map((row) => row.animal);
      const damIds = new Set(herd.map((animal) => animal.geneticDamId).filter((id): id is string => Boolean(id)));
      const counts = herdCounts(
        herd.map((animal) => ({
          id: animal.id,
          presence: animal.presence,
          lactation: animal.lactation,
          reproduction: animal.reproduction,
          dob: animal.dob,
          isDam: damIds.has(animal.id),
        })),
        today,
      );
      const breedsOnFarm = new Map<string, number>();
      for (const row of rows) {
        if (row.animal.presence !== "on_farm") continue;
        breedsOnFarm.set(row.breedName, (breedsOnFarm.get(row.breedName) ?? 0) + 1);
      }
      const open = await db
        .select()
        .from(alerts)
        .where(and(eq(alerts.farmId, scope.farmId), eq(alerts.status, "open")));
      const visibleOpen = open.filter((alert) => canReadAlert(scope.roles, alert.type));
      const upcoming = rows
        .filter((row) => row.animal.presence === "on_farm" && row.animal.reproduction === "pregnant")
        .sort((a, b) => (a.animal.expectedCalving ?? "9999").localeCompare(b.animal.expectedCalving ?? "9999"))
        .slice(0, 8)
        .map((row) => ({
          code: row.animal.code,
          name: row.animal.name,
          expectedCalving: day(row.animal.expectedCalving),
          href: `/animals/${row.animal.code}`,
        }));
      return {
        farm: scope.farmName,
        today: day(today),
        href: "/dashboard",
        counts,
        dry: herd.filter((animal) => animal.presence === "on_farm" && animal.lactation === "dry").length,
        breeds: [...breedsOnFarm.entries()].map(([name, count]) => ({ name, count })),
        upcomingCalvings: upcoming,
        openAlerts: visibleOpen.length,
      };
    },
  });

  const searchCattle = new FunctionTool({
    name: "search_cattle",
    description: "Find cattle on this farm by name, code, ear tag, RFID, or breed, with optional status filters.",
    parameters: z.object({
      query: z.string().optional().describe("Name, code, ear tag, RFID, or breed. Omit to list the herd."),
      presence: z.enum(["on_farm", "sold", "dead", "transferred", "any"]).optional(),
      lactation: z.enum(["lactating", "dry", "pre_lactation", "not_applicable", "any"]).optional(),
      reproduction: z.enum(["open", "bred", "pregnant", "fresh", "not_applicable", "any"]).optional(),
    }),
    execute: async ({ query, presence, lactation, reproduction }) => {
      const rows = await loadHerd(scope.farmId);
      const needle = query?.trim().toLowerCase();
      const matches = rows.filter((row) => {
        const animal = row.animal;
        if (presence && presence !== "any" && animal.presence !== presence) return false;
        if (lactation && lactation !== "any" && animal.lactation !== lactation) return false;
        if (reproduction && reproduction !== "any" && animal.reproduction !== reproduction) return false;
        if (!needle) return true;
        const hay = [animal.code, animal.name, animal.earTag, animal.rfid, row.breedName, animal.geneticSireCode]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      });
      return {
        href: "/animals",
        total: matches.length,
        cattle: matches.slice(0, 25).map(card),
      };
    },
  });

  const animalProfile = new FunctionTool({
    name: "animal_profile",
    description: "One animal: identity, parentage, offspring, recent breeding, health (role-scoped), milk, weight, and listing.",
    parameters: z.object({
      code: z.string().describe("Animal code such as MIL-GIR-001."),
    }),
    execute: async ({ code }) => {
      const rows = await loadHerd(scope.farmId);
      const row = rows.find((item) => item.animal.code.toLowerCase() === code.trim().toLowerCase());
      if (!row) return { found: false, code };
      const animal = row.animal;
      const byId = new Map(rows.map((item) => [item.animal.id, item.animal]));
      const dam = animal.geneticDamId ? byId.get(animal.geneticDamId) : undefined;
      const offspring = rows
        .filter((item) => item.animal.geneticDamId === animal.id || item.animal.geneticSireCode === animal.code)
        .map((item) => ({ code: item.animal.code, name: item.animal.name, href: `/animals/${item.animal.code}` }));

      const clinical = canSeeClinical(scope.roles);
      const viewHealth = canViewHealth(scope.roles);
      const showListing = canPublish(scope.roles);

      const [heat, ai, checks, births, illness, doses, worms, milkRows, mass, listing] = await Promise.all([
        db.select().from(heats).where(and(eq(heats.farmId, scope.farmId), eq(heats.animalId, animal.id), isNull(heats.voidedAt))).orderBy(desc(heats.observedOn)).limit(6),
        db.select().from(inseminations).where(and(eq(inseminations.farmId, scope.farmId), eq(inseminations.animalId, animal.id), isNull(inseminations.voidedAt))).orderBy(desc(inseminations.performedOn)).limit(6),
        db.select().from(pregnancyChecks).where(and(eq(pregnancyChecks.farmId, scope.farmId), eq(pregnancyChecks.animalId, animal.id), isNull(pregnancyChecks.voidedAt))).orderBy(desc(pregnancyChecks.checkedOn)).limit(6),
        db.select().from(calvings).where(and(eq(calvings.farmId, scope.farmId), eq(calvings.damId, animal.id), isNull(calvings.voidedAt))).orderBy(desc(calvings.calvedOn)).limit(4),
        clinical
          ? db.select().from(healthEvents).where(and(eq(healthEvents.farmId, scope.farmId), eq(healthEvents.animalId, animal.id), isNull(healthEvents.voidedAt))).orderBy(desc(healthEvents.eventOn)).limit(6)
          : Promise.resolve([]),
        viewHealth
          ? db.select().from(vaccinations).where(and(eq(vaccinations.farmId, scope.farmId), eq(vaccinations.animalId, animal.id), isNull(vaccinations.voidedAt))).orderBy(desc(vaccinations.givenOn)).limit(6)
          : Promise.resolve([]),
        viewHealth
          ? db.select().from(dewormings).where(and(eq(dewormings.farmId, scope.farmId), eq(dewormings.animalId, animal.id), isNull(dewormings.voidedAt))).orderBy(desc(dewormings.givenOn)).limit(4)
          : Promise.resolve([]),
        db.select().from(milkYields).where(and(eq(milkYields.farmId, scope.farmId), eq(milkYields.animalId, animal.id), isNull(milkYields.voidedAt))).orderBy(desc(milkYields.recordedOn)).limit(7),
        db.select().from(weights).where(and(eq(weights.farmId, scope.farmId), eq(weights.animalId, animal.id), isNull(weights.voidedAt))).orderBy(desc(weights.weighedOn)).limit(4),
        showListing
          ? db.select().from(listings).where(and(eq(listings.farmId, scope.farmId), eq(listings.animalId, animal.id))).orderBy(desc(listings.createdAt)).limit(2)
          : Promise.resolve([]),
      ]);

      return {
        found: true,
        ...card(row),
        colour: animal.colour,
        earTag: animal.earTag,
        rfid: animal.rfid,
        ...(canViewPurchasePrice(scope.roles) ? { purchasePrice: money(animal.purchasePrice) } : {}),
        ...(clinical && animal.isolationReason ? { isolation: { reason: animal.isolationReason, since: day(animal.isolatedOn) } } : {}),
        sire: animal.geneticSireCode ? { code: animal.geneticSireCode, name: animal.geneticSireName } : null,
        dam: dam ? { code: dam.code, name: dam.name, href: `/animals/${dam.code}` } : null,
        conceptionOn: day(animal.conceptionOn),
        offspring,
        heats: heat.map((item) => ({ date: day(item.observedOn), signs: item.signs })),
        inseminations: ai.map((item) => ({
          date: day(item.performedOn),
          bull: item.bullCode,
          straw: item.strawCode,
          technician: item.technicianName,
        })),
        pregnancyChecks: checks.map((item) => ({ date: day(item.checkedOn), result: item.result })),
        calvings: births.map((item) => ({ date: day(item.calvedOn), outcome: item.outcome })),
        ...(clinical
          ? {
              health: illness.map((item) => ({
                date: day(item.eventOn),
                problem: item.problem,
                treatment: item.treatment,
                outcome: item.outcome,
              })),
            }
          : {}),
        ...(viewHealth
          ? {
              vaccines: doses.map((item) => ({ vaccine: item.vaccine, given: day(item.givenOn), nextDue: day(item.nextDueOn) })),
              deworming: worms.map((item) => ({ product: item.product, given: day(item.givenOn), nextDue: day(item.nextDueOn) })),
            }
          : {}),
        milk: milkRows.map((item) => ({
          date: day(item.recordedOn),
          morning: item.morningLitres ? Number(item.morningLitres) : null,
          evening: item.eveningLitres ? Number(item.eveningLitres) : null,
        })),
        weights: mass.map((item) => ({ date: day(item.weighedOn), kilograms: Number(item.kilograms) })),
        ...(showListing
          ? {
              listing: listing.map((item) => ({ category: item.category, price: money(item.price), published: item.published === "yes" })),
            }
          : {}),
        tabs: {
          overview: `/animals/${animal.code}`,
          parentage: `/animals/${animal.code}?tab=parentage`,
          breeding: `/animals/${animal.code}?tab=breeding`,
          health: `/animals/${animal.code}?tab=health`,
          milk: `/animals/${animal.code}?tab=milk`,
        },
      };
    },
  });

  const breedingRecords = new FunctionTool({
    name: "breeding_records",
    description: "Recent heats, inseminations, pregnancy checks, and calvings for the farm or one animal.",
    parameters: z.object({
      code: z.string().optional().describe("Limit to this animal code. Omit for the whole farm."),
    }),
    execute: async ({ code }) => {
      const rows = await loadHerd(scope.farmId);
      const wanted = code?.trim().toLowerCase();
      const animal = wanted ? rows.find((row) => row.animal.code.toLowerCase() === wanted)?.animal : undefined;
      if (wanted && !animal) return { found: false, code };
      const id = animal?.id;
      const [heat, ai, checks, births] = await Promise.all([
        db.select().from(heats).where(and(eq(heats.farmId, scope.farmId), isNull(heats.voidedAt), ...(id ? [eq(heats.animalId, id)] : []))).orderBy(desc(heats.observedOn)).limit(12),
        db.select().from(inseminations).where(and(eq(inseminations.farmId, scope.farmId), isNull(inseminations.voidedAt), ...(id ? [eq(inseminations.animalId, id)] : []))).orderBy(desc(inseminations.performedOn)).limit(12),
        db.select().from(pregnancyChecks).where(and(eq(pregnancyChecks.farmId, scope.farmId), isNull(pregnancyChecks.voidedAt), ...(id ? [eq(pregnancyChecks.animalId, id)] : []))).orderBy(desc(pregnancyChecks.checkedOn)).limit(12),
        db.select().from(calvings).where(and(eq(calvings.farmId, scope.farmId), isNull(calvings.voidedAt), ...(id ? [eq(calvings.damId, id)] : []))).orderBy(desc(calvings.calvedOn)).limit(12),
      ]);
      const nameOf = (animalId: string) => {
        const match = rows.find((row) => row.animal.id === animalId)?.animal;
        return match ? { code: match.code, name: match.name } : { code: animalId, name: null };
      };
      return {
        href: "/breeding",
        animal: animal ? { code: animal.code, name: animal.name } : null,
        heats: heat.map((item) => ({ ...nameOf(item.animalId), date: day(item.observedOn), signs: item.signs })),
        inseminations: ai.map((item) => ({
          ...nameOf(item.animalId),
          date: day(item.performedOn),
          bull: item.bullCode,
          straw: item.strawCode,
        })),
        pregnancyChecks: checks.map((item) => ({
          ...nameOf(item.animalId),
          date: day(item.checkedOn),
          result: item.result,
        })),
        calvings: births.map((item) => ({
          ...nameOf(item.damId),
          date: day(item.calvedOn),
          outcome: item.outcome,
        })),
      };
    },
  });

  const healthRecords = new FunctionTool({
    name: "health_records",
    description: "Treatments (clinical roles only), vaccinations, and deworming, including what is due.",
    parameters: z.object({
      code: z.string().optional().describe("Limit to this animal code. Omit for the whole farm."),
    }),
    execute: async ({ code }) => {
      if (!canViewHealth(scope.roles)) return denied("health records");
      const clinical = canSeeClinical(scope.roles);
      const rows = await loadHerd(scope.farmId);
      const wanted = code?.trim().toLowerCase();
      const animal = wanted ? rows.find((row) => row.animal.code.toLowerCase() === wanted)?.animal : undefined;
      if (wanted && !animal) return { found: false, code };
      const id = animal?.id;
      const today = farmToday(scope.timezone);
      const [illness, doses, worms] = await Promise.all([
        clinical
          ? db.select().from(healthEvents).where(and(eq(healthEvents.farmId, scope.farmId), isNull(healthEvents.voidedAt), ...(id ? [eq(healthEvents.animalId, id)] : []))).orderBy(desc(healthEvents.eventOn)).limit(12)
          : Promise.resolve([]),
        db.select().from(vaccinations).where(and(eq(vaccinations.farmId, scope.farmId), isNull(vaccinations.voidedAt), ...(id ? [eq(vaccinations.animalId, id)] : []))).orderBy(desc(vaccinations.givenOn)),
        db.select().from(dewormings).where(and(eq(dewormings.farmId, scope.farmId), isNull(dewormings.voidedAt), ...(id ? [eq(dewormings.animalId, id)] : []))).orderBy(desc(dewormings.givenOn)),
      ]);
      const nameOf = (animalId: string) => rows.find((row) => row.animal.id === animalId)?.animal.code ?? animalId;
      return {
        href: "/health",
        ...(clinical
          ? {
              treatments: illness.map((item) => ({
                code: nameOf(item.animalId),
                date: day(item.eventOn),
                problem: item.problem,
                treatment: item.treatment,
                outcome: item.outcome,
                followUp: day(item.followUpOn),
              })),
            }
          : { clinicalNote: "Clinical treatment notes are restricted for this role." }),
        vaccinesDue: doses
          .filter((item) => item.nextDueOn && item.nextDueOn <= today)
          .slice(0, 15)
          .map((item) => ({ code: nameOf(item.animalId), vaccine: item.vaccine, due: day(item.nextDueOn) })),
        dewormingDue: worms
          .filter((item) => item.nextDueOn && item.nextDueOn <= today)
          .slice(0, 15)
          .map((item) => ({ code: nameOf(item.animalId), product: item.product, due: day(item.nextDueOn) })),
      };
    },
  });

  const milkRecords = new FunctionTool({
    name: "milk_records",
    description: "Recent milk yields in litres, for one animal or the lactating herd.",
    parameters: z.object({
      code: z.string().optional().describe("Limit to this animal code."),
    }),
    execute: async ({ code }) => {
      const rows = await loadHerd(scope.farmId);
      const wanted = code?.trim().toLowerCase();
      const animal = wanted ? rows.find((row) => row.animal.code.toLowerCase() === wanted)?.animal : undefined;
      if (wanted && !animal) return { found: false, code };
      const yields = await db
        .select()
        .from(milkYields)
        .where(and(eq(milkYields.farmId, scope.farmId), isNull(milkYields.voidedAt), ...(animal ? [eq(milkYields.animalId, animal.id)] : [])))
        .orderBy(desc(milkYields.recordedOn))
        .limit(400);
      const byDay = new Map<string, number>();
      for (const item of yields) {
        const total = Number(item.morningLitres ?? 0) + Number(item.eveningLitres ?? 0);
        byDay.set(item.recordedOn, (byDay.get(item.recordedOn) ?? 0) + total);
      }
      const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
      const latest = days.at(-1)?.[0];
      const latestRows = latest ? yields.filter((item) => item.recordedOn === latest) : [];
      return {
        href: "/milk",
        animal: animal ? { code: animal.code, name: animal.name } : null,
        recentDays: days.map(([date, litres]) => ({ date: day(date), litres: Math.round(litres * 10) / 10 })),
        latestSession: latestRows.map((item) => {
          const match = rows.find((row) => row.animal.id === item.animalId)?.animal;
          return {
            code: match?.code,
            name: match?.name,
            morning: item.morningLitres ? Number(item.morningLitres) : null,
            evening: item.eveningLitres ? Number(item.eveningLitres) : null,
          };
        }),
      };
    },
  });

  const feedStock = new FunctionTool({
    name: "feed_stock",
    description: "Feed items, current balance, and whether stock is at or under the minimum.",
    execute: async () => {
      const [items, movements] = await Promise.all([
        db.select().from(feedItems).where(eq(feedItems.farmId, scope.farmId)),
        db.select().from(feedMovements).where(and(eq(feedMovements.farmId, scope.farmId), isNull(feedMovements.voidedAt))),
      ]);
      return {
        href: "/feed",
        items: items.map((item) => {
          const balance = feedBalance(movements.filter((movement) => movement.itemId === item.id));
          const minimum = item.minimumQuantity ? Number(item.minimumQuantity) : null;
          return {
            name: item.name,
            category: item.category,
            balance: Math.round(balance * 10) / 10,
            unit: item.unit,
            minimum,
            low: feedIsLow(balance, item.minimumQuantity),
          };
        }),
      };
    },
  });

  const semenInventory = new FunctionTool({
    name: "semen_inventory",
    description: "Bulls, semen batches, available straws, and offspring counts.",
    execute: async () => {
      if (!canViewSemen(scope.roles)) return denied("semen inventory");
      const showCost = canViewSemenCost(scope.roles);
      const [bullRows, batches, strawRows, herd] = await Promise.all([
        db.select().from(bulls).where(eq(bulls.farmId, scope.farmId)),
        db.select().from(semenBatches).where(eq(semenBatches.farmId, scope.farmId)),
        db.select().from(straws).where(eq(straws.farmId, scope.farmId)),
        db.select().from(animals).where(eq(animals.farmId, scope.farmId)),
      ]);
      return {
        href: "/semen",
        bulls: bullRows.map((bull) => {
          const bullBatches = batches.filter((batch) => batch.bullId === bull.id);
          const batchIds = new Set(bullBatches.map((batch) => batch.id));
          const available = strawRows.filter((straw) => batchIds.has(straw.batchId) && straw.status === "available").length;
          const offspring = herd.filter((animal) => animal.geneticSireCode === bull.code);
          return {
            code: bull.code,
            name: bull.name,
            breed: bull.breed,
            availableStraws: available,
            offspring: offspring.length,
            daughters: offspring.filter((animal) => animal.sex === "female").length,
          };
        }),
        batches: batches.map((batch) => ({
          batchNumber: batch.batchNumber,
          type: batch.semenType,
          received: batch.quantityReceived,
          ...(showCost ? { pricePerStraw: money(batch.pricePerStraw) } : {}),
        })),
      };
    },
  });

  const matingCheck = new FunctionTool({
    name: "mating_check",
    description: "Decision-support pedigree overlap between a female on this farm and a proposed sire code. Not a veterinary opinion.",
    parameters: z.object({
      femaleCode: z.string().describe("Female animal code."),
      sireCode: z.string().describe("Proposed bull or semen code."),
    }),
    execute: async ({ femaleCode, sireCode }) => {
      if (!canViewGenetics(scope.roles)) return denied("mating check");
      const [herd, bullRows] = await Promise.all([
        db.select().from(animals).where(eq(animals.farmId, scope.farmId)),
        db.select().from(bulls).where(eq(bulls.farmId, scope.farmId)),
      ]);
      const byId = new Map(herd.map((animal) => [animal.id, animal]));
      const links: PedigreeLink[] = [
        ...herd.map((animal) => ({
          code: animal.code,
          sireCode: animal.geneticSireCode,
          damCode: animal.geneticDamId ? (byId.get(animal.geneticDamId)?.code ?? null) : null,
          sex: animal.sex,
        })),
        ...bullRows.map((bull) => ({ code: bull.code, sireCode: bull.sireCode, damCode: bull.damCode, sex: "male" })),
      ];
      const flags = matingFlags(femaleCode.trim(), sireCode.trim(), links, scope.matingGenerationWindow);
      return {
        href: `/genetics?female=${encodeURIComponent(femaleCode.trim())}&bull=${encodeURIComponent(sireCode.trim())}`,
        femaleCode: femaleCode.trim(),
        sireCode: sireCode.trim(),
        flags,
        disclaimer:
          "Decision support only. This lists pedigree overlaps from data entered on this farm. It is not a veterinary opinion, an inbreeding coefficient, or a breed-society approval.",
      };
    },
  });

  const embryoStock = new FunctionTool({
    name: "embryo_stock",
    description: "Embryos in storage and recorded transfers.",
    execute: async () => {
      if (!canViewGenetics(scope.roles)) return denied("embryo records");
      const [stock, transfers, herd] = await Promise.all([
        db.select().from(embryos).where(eq(embryos.farmId, scope.farmId)),
        db.select().from(embryoTransfers).where(eq(embryoTransfers.farmId, scope.farmId)).orderBy(desc(embryoTransfers.transferredOn)).limit(12),
        db.select().from(animals).where(eq(animals.farmId, scope.farmId)),
      ]);
      const codeOf = (id: string | null) => (id ? herd.find((animal) => animal.id === id)?.code ?? null : null);
      return {
        href: "/embryos",
        embryos: stock.map((item) => ({
          code: item.code,
          donor: codeOf(item.donorId),
          sire: item.sireCode,
          grade: item.grade,
          storage: item.storage,
          status: item.status,
        })),
        transfers: transfers.map((item) => ({
          embryo: stock.find((embryo) => embryo.id === item.embryoId)?.code ?? item.embryoId,
          recipient: codeOf(item.recipientId),
          date: day(item.transferredOn),
          pregnancy: item.pregnancyResult,
        })),
      };
    },
  });

  const financeSummary = new FunctionTool({
    name: "finance_summary",
    description: "Income and expense totals, excluding voided entries. Refuses the call when this role cannot view finance.",
    execute: async () => {
      if (!canViewFinance(scope.roles)) return denied("finance");
      const entries = await db
        .select()
        .from(financeEntries)
        .where(and(eq(financeEntries.farmId, scope.farmId), isNull(financeEntries.voidedAt)))
        .orderBy(desc(financeEntries.entryOn));
      const income = entries.filter((item) => item.kind === "income").reduce((sum, item) => sum + Number(item.amount), 0);
      const expense = entries.filter((item) => item.kind === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
      return {
        href: "/finance",
        income: money(income.toFixed(2)),
        expense: money(expense.toFixed(2)),
        net: money((income - expense).toFixed(2)),
        recent: entries.slice(0, 10).map((item) => ({
          date: day(item.entryOn),
          kind: item.kind,
          category: item.category,
          amount: money(item.amount),
          note: item.note,
        })),
      };
    },
  });

  const openAlerts = new FunctionTool({
    name: "open_alerts",
    description: "Alerts that are still open and visible to this role.",
    execute: async () => {
      const [list, herd] = await Promise.all([
        db.select().from(alerts).where(and(eq(alerts.farmId, scope.farmId), eq(alerts.status, "open"))),
        db.select({ id: animals.id, code: animals.code }).from(animals).where(eq(animals.farmId, scope.farmId)),
      ]);
      const byId = new Map(herd.map((a) => [a.id, a.code]));
      return {
        href: "/alerts",
        alerts: list
          .filter((alert) => canReadAlert(scope.roles, alert.type))
          .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"))
          .map((alert) => ({
            title: alert.title,
            body: alert.body,
            type: alert.type,
            due: day(alert.dueOn),
            animal: alert.animalId ? (byId.get(alert.animalId) ?? null) : null,
          })),
      };
    },
  });

  const shopOverview = new FunctionTool({
    name: "shop_overview",
    description: "Shop products, published animal listings, and recent orders for this farm.",
    execute: async () => {
      if (!canViewShopAdmin(scope.roles)) return denied("shop and orders");
      const [goods, listingRows, orderRows, herd] = await Promise.all([
        db.select().from(products).where(eq(products.farmId, scope.farmId)),
        db.select().from(listings).where(eq(listings.farmId, scope.farmId)),
        db.select().from(orders).where(eq(orders.farmId, scope.farmId)).orderBy(desc(orders.createdAt)).limit(8),
        db.select({ id: animals.id, code: animals.code }).from(animals).where(eq(animals.farmId, scope.farmId)),
      ]);
      const byId = new Map(herd.map((a) => [a.id, a.code]));
      return {
        href: "/shop",
        publicShop: `/farms/${scope.farmSlug}/shop`,
        products: goods.map((item) => ({
          name: item.name,
          category: item.category,
          price: money(item.price),
          stock: item.stock,
          published: item.published === "yes",
        })),
        listings: listingRows.map((item) => ({
          animal: item.animalId ? (byId.get(item.animalId) ?? null) : null,
          category: item.category,
          price: money(item.price),
          published: item.published === "yes",
        })),
        orders: orderRows.map((item) => ({
          customer: item.customerName,
          amount: money(item.amount),
          status: item.status,
        })),
      };
    },
  });

  const peopleAndAudit = new FunctionTool({
    name: "people_and_audit",
    description: "Staff and pending invites when this role can manage the team, and recent audit entries when this role can view the audit log.",
    execute: async () => {
      const result: Record<string, unknown> = {};
      if (!canManageTeam(scope.roles)) {
        result.team = denied("the team page");
      } else {
        const members = await db
          .select({ name: users.name, email: users.email, roles: farmMembers.roles, disabledAt: users.disabledAt })
          .from(farmMembers)
          .innerJoin(users, eq(users.id, farmMembers.userId))
          .where(eq(farmMembers.farmId, scope.farmId));
        const pending = await db.select().from(invites).where(eq(invites.farmId, scope.farmId));
        result.team = {
          href: "/team",
          members: members.map((member) => ({
            name: member.name,
            email: member.email,
            roles: member.roles,
            disabled: Boolean(member.disabledAt),
          })),
          pendingInvites: pending
            .filter((invite) => !invite.acceptedAt)
            .map((invite) => ({ email: invite.email, roles: invite.roles, expires: invite.expiresAt.toISOString().slice(0, 10) })),
        };
      }
      if (!canViewAudit(scope.roles)) {
        result.audit = denied("the audit log");
      } else {
        const logs = await db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.farmId, scope.farmId))
          .orderBy(desc(auditLogs.createdAt))
          .limit(12);
        result.audit = {
          href: "/audit",
          entries: logs.map((entry) => ({
            action: entry.action,
            entity: entry.entity,
            summary: entry.summary,
            at: entry.createdAt.toISOString(),
          })),
        };
      }
      return result;
    },
  });

  const reportCatalogue = new FunctionTool({
    name: "report_catalogue",
    description: "Which reports this role can open, with the chart page and CSV, Excel, and PDF download paths.",
    execute: async () => {
      if (!canViewReports(scope.roles)) return denied("reports");
      const kinds = ["cattle", "breeding", "milk", "health", "feed", "semen", "weight", "finance", "embryos", "genetics"].filter((kind) =>
        canExportReport(scope.roles, kind),
      );
      return {
        href: "/reports",
        reports: kinds.map((kind) => ({
          kind,
          page: `/reports?tab=${kind}`,
          csv: `/reports/${kind}?format=csv`,
          excel: `/reports/${kind}?format=xlsx`,
          pdf: `/reports/${kind}?format=pdf`,
        })),
      };
    },
  });

  const workspaceMap = new FunctionTool({
    name: "workspace_map",
    description: "Where each farm task is done. Use this when the person asks how to record or open something.",
    execute: () => ({
      screens: [
        { task: "Herd counts and due calvings", path: "/dashboard" },
        { task: "Farm assistant", path: "/ai" },
        { task: "Scan an animal tag or straw and start an AI", path: "/scan" },
        { task: "Cattle register and family tree", path: "/animals" },
        { task: "Sheds and location history", path: "/locations" },
        { task: "Add an animal", path: "/animals/new" },
        { task: "Animal profile, parentage, breeding, health, milk, listing", path: "/animals/{code}" },
        { task: "Heat, insemination, pregnancy check, calving registers", path: "/breeding" },
        { task: "Treatment, vaccine, deworming", path: "/health" },
        { task: "Morning and evening milk", path: "/milk" },
        { task: "Feed stock and movements", path: "/feed" },
        { task: "Bulls and semen straws", path: "/semen" },
        { task: "Mating check", path: "/genetics" },
        { task: "Rule-based insights", path: "/insights" },
        { task: "Embryos and transfers", path: "/embryos" },
        { task: "Income and expense", path: "/finance" },
        { task: "Open alerts", path: "/alerts" },
        { task: "Charts and CSV, Excel, PDF downloads", path: "/reports" },
        { task: "Products and orders", path: "/shop" },
        { task: "Public listings management", path: "/listings" },
        { task: "Catalogue enquiries", path: "/enquiries" },
        { task: "Public catalogue", path: `/farms/${scope.farmSlug}` },
        { task: "Farm settings & breeds", path: "/settings" },
        { task: "Staff invites", path: "/team" },
        { task: "Audit log", path: "/audit" },
      ],
      note: "Saving uses a function call and waits for the person to confirm in the chat.",
    }),
  });

  return [
    herdOverview,
    searchCattle,
    animalProfile,
    breedingRecords,
    healthRecords,
    milkRecords,
    feedStock,
    semenInventory,
    matingCheck,
    embryoStock,
    financeSummary,
    openAlerts,
    shopOverview,
    peopleAndAudit,
    reportCatalogue,
    workspaceMap,
    ...writeTools(scope),
  ];
}
