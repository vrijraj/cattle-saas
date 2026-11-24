"use server";

import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, locationMoves, locations } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { farmToday, parseFarmDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canManageIsolation, canManageLocations, canWriteAnimals } from "@/lib/permissions";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveShed(formData: FormData) {
  const farm = await requireFarm();
  if (!canManageLocations(farm.roles)) redirect("/locations?error=role");
  const name = text(formData, "name");
  if (!name || name.length > 80) redirect("/locations?error=name");
  const id = text(formData, "id");
  const active = formData.get("active") === "on";

  if (id) {
    const [current] = await db
      .select()
      .from(locations)
      .where(and(eq(locations.id, id), eq(locations.farmId, farm.farmId)))
      .limit(1);
    if (!current) redirect("/locations?error=missing");
    const [duplicate] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.farmId, farm.farmId), eq(locations.name, name), ne(locations.id, current.id)))
      .limit(1);
    if (duplicate) redirect("/locations?error=duplicate");

    await db.transaction(async (tx) => {
      await tx.update(locations).set({ name, active }).where(and(eq(locations.id, current.id), eq(locations.farmId, farm.farmId)));
      await writeAudit(tx, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "update",
        entity: "location",
        entityId: current.id,
        summary: `Shed ${current.name} updated`,
        before: { name: current.name, active: current.active },
        after: { name, active },
      });
    });
  } else {
    const [duplicate] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.farmId, farm.farmId), eq(locations.name, name)))
      .limit(1);
    if (duplicate) redirect("/locations?error=duplicate");

    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(locations)
        .values({ farmId: farm.farmId, name, active: true })
        .returning({ id: locations.id });
      await writeAudit(tx, {
        farmId: farm.farmId,
        actorId: farm.userId,
        action: "create",
        entity: "location",
        entityId: row.id,
        summary: `Shed ${name} added`,
        after: { name },
      });
    });
  }
  redirect("/locations?saved=1");
}

export async function moveAnimal(formData: FormData) {
  const farm = await requireFarm();
  const animalId = text(formData, "animalId");
  const locationId = text(formData, "locationId");
  const [animal] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.id, animalId), eq(animals.farmId, farm.farmId)))
    .limit(1);
  if (!animal) redirect("/animals");
  const safeCode = encodeURIComponent(animal.code);
  if (!canWriteAnimals(farm.roles) && !canManageLocations(farm.roles)) redirect(`/animals/${safeCode}?error=role`);

  const [shed] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.farmId, farm.farmId), eq(locations.active, true)))
    .limit(1);
  if (!shed) redirect(`/animals/${safeCode}?error=location`);
  const today = farmToday(farm.timezone);
  const movedOn = parseFarmDate(text(formData, "movedOn") || today);
  if (!movedOn || movedOn > today) redirect(`/animals/${safeCode}?error=date`);

  await db.transaction(async (tx) => {
    await tx.update(animals).set({ locationId: shed.id, updatedAt: new Date() }).where(and(eq(animals.id, animal.id), eq(animals.farmId, farm.farmId)));
    const [move] = await tx
      .insert(locationMoves)
      .values({
        farmId: farm.farmId,
        animalId: animal.id,
        locationId: shed.id,
        movedOn,
        note: text(formData, "note") || null,
        createdBy: farm.userId,
      })
      .returning({ id: locationMoves.id });
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "location_move",
      entityId: move.id,
      summary: `${animal.code} moved to ${shed.name}`,
      before: { locationId: animal.locationId },
      after: { location: shed.name, locationId: shed.id, movedOn },
    });
  });
  redirect(`/animals/${safeCode}?saved=1`);
}

export async function setIsolation(formData: FormData) {
  const farm = await requireFarm();
  const animalId = text(formData, "animalId");
  const reason = text(formData, "reason");
  const [animal] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.id, animalId), eq(animals.farmId, farm.farmId)))
    .limit(1);
  if (!animal) redirect("/animals");
  const safeCode = encodeURIComponent(animal.code);
  if (!canManageIsolation(farm.roles)) redirect(`/animals/${safeCode}?error=role`);
  if (!reason) redirect(`/animals/${safeCode}?error=isolation`);

  const today = farmToday(farm.timezone);
  const isolatedOn = parseFarmDate(text(formData, "isolatedOn") || today);
  if (!isolatedOn || isolatedOn > today) redirect(`/animals/${safeCode}?error=date`);
  const moveToIsolation = formData.get("moveToIsolation") === "on";

  await db.transaction(async (tx) => {
    let nextLocationId = animal.locationId;
    if (moveToIsolation) {
      const [isoShed] = await tx
        .select({ id: locations.id, name: locations.name })
        .from(locations)
        .where(and(eq(locations.farmId, farm.farmId), eq(locations.name, "Isolation"), eq(locations.active, true)))
        .limit(1);
      if (isoShed && isoShed.id !== animal.locationId) {
        nextLocationId = isoShed.id;
        await tx.insert(locationMoves).values({
          farmId: farm.farmId,
          animalId: animal.id,
          locationId: isoShed.id,
          movedOn: isolatedOn,
          note: `Isolation: ${reason}`,
          createdBy: farm.userId,
        });
      }
    }
    await tx
      .update(animals)
      .set({ isolationReason: reason, isolatedOn, locationId: nextLocationId, updatedAt: new Date() })
      .where(and(eq(animals.id, animal.id), eq(animals.farmId, farm.farmId)));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "isolation",
      entityId: animal.id,
      summary: `${animal.code} isolated: ${reason}`,
      before: { reason: animal.isolationReason, isolatedOn: animal.isolatedOn, locationId: animal.locationId },
      after: { reason, isolatedOn, locationId: nextLocationId },
    });
  });
  redirect(`/animals/${safeCode}?saved=1`);
}

export async function clearIsolation(formData: FormData) {
  const farm = await requireFarm();
  const animalId = text(formData, "animalId");
  const note = text(formData, "note");
  const [animal] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.id, animalId), eq(animals.farmId, farm.farmId)))
    .limit(1);
  if (!animal) redirect("/animals");
  const safeCode = encodeURIComponent(animal.code);
  if (!canManageIsolation(farm.roles)) redirect(`/animals/${safeCode}?error=role`);
  if (!note) redirect(`/animals/${safeCode}?error=isolation`);

  await db.transaction(async (tx) => {
    await tx
      .update(animals)
      .set({ isolationReason: null, isolatedOn: null, updatedAt: new Date() })
      .where(and(eq(animals.id, animal.id), eq(animals.farmId, farm.farmId)));
    await writeAudit(tx, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "isolation",
      entityId: animal.id,
      summary: `${animal.code} isolation cleared: ${note}`,
      before: { reason: animal.isolationReason, isolatedOn: animal.isolatedOn },
      after: { note },
    });
  });
  redirect(`/animals/${safeCode}?saved=1`);
}
