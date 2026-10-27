"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, locationMoves, locations } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { farmToday, parseFarmDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canWriteAnimals } from "@/lib/permissions";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveShed(formData: FormData) {
  const farm = await requireFarm();
  if (!canWriteAnimals(farm.roles)) redirect("/locations?error=role");
  const name = text(formData, "name");
  if (!name) redirect("/locations?error=name");
  const id = text(formData, "id");
  const active = formData.get("active") === "on";
  if (id) {
    const [current] = await db
      .select()
      .from(locations)
      .where(and(eq(locations.id, id), eq(locations.farmId, farm.farmId)))
      .limit(1);
    if (!current) redirect("/locations?error=missing");
    await db.update(locations).set({ name, active }).where(eq(locations.id, current.id));
    await writeAudit(db, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "update",
      entity: "location",
      entityId: current.id,
      summary: `Shed ${current.name} updated`,
      before: { name: current.name, active: current.active },
      after: { name, active },
    });
  } else {
    const [row] = await db
      .insert(locations)
      .values({ farmId: farm.farmId, name, active: true })
      .returning({ id: locations.id });
    await writeAudit(db, {
      farmId: farm.farmId,
      actorId: farm.userId,
      action: "create",
      entity: "location",
      entityId: row.id,
      summary: `Shed ${name} added`,
      after: { name },
    });
  }
  redirect("/locations");
}

export async function moveAnimal(formData: FormData) {
  const farm = await requireFarm();
  if (!canWriteAnimals(farm.roles)) redirect("/animals?error=role");
  const animalId = text(formData, "animalId");
  const locationId = text(formData, "locationId");
  const [animal] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.id, animalId), eq(animals.farmId, farm.farmId)))
    .limit(1);
  const [shed] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.farmId, farm.farmId), eq(locations.active, true)))
    .limit(1);
  if (!animal || !shed) redirect(animal ? `/animals/${animal.code}?error=location` : "/animals?error=location");
  const movedOn = parseFarmDate(text(formData, "movedOn") || farmToday(farm.timezone));
  if (!movedOn) redirect(`/animals/${animal.code}?error=date`);
  await db.update(animals).set({ locationId: shed.id, updatedAt: new Date() }).where(eq(animals.id, animal.id));
  const [move] = await db
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
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "update",
    entity: "location_move",
    entityId: move.id,
    summary: `${animal.code} moved to ${shed.name}`,
    after: { location: shed.name, movedOn },
  });
  redirect(`/animals/${animal.code}`);
}

export async function setIsolation(formData: FormData) {
  const farm = await requireFarm();
  if (!canWriteAnimals(farm.roles)) redirect("/animals?error=role");
  const animalId = text(formData, "animalId");
  const reason = text(formData, "reason");
  const [animal] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.id, animalId), eq(animals.farmId, farm.farmId)))
    .limit(1);
  if (!animal || !reason) redirect(animal ? `/animals/${animal.code}?error=isolation` : "/animals?error=isolation");
  const isolatedOn = parseFarmDate(text(formData, "isolatedOn") || farmToday(farm.timezone));
  if (!isolatedOn) redirect(`/animals/${animal.code}?error=date`);
  await db.update(animals).set({ isolationReason: reason, isolatedOn, updatedAt: new Date() }).where(eq(animals.id, animal.id));
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "update",
    entity: "isolation",
    entityId: animal.id,
    summary: `${animal.code} isolated: ${reason}`,
    after: { reason, isolatedOn },
  });
  redirect(`/animals/${animal.code}`);
}

export async function clearIsolation(formData: FormData) {
  const farm = await requireFarm();
  if (!canWriteAnimals(farm.roles)) redirect("/animals?error=role");
  const animalId = text(formData, "animalId");
  const note = text(formData, "note");
  const [animal] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.id, animalId), eq(animals.farmId, farm.farmId)))
    .limit(1);
  if (!animal || !note) redirect(`/animals/${animal?.code ?? ""}?error=isolation`);
  await db
    .update(animals)
    .set({ isolationReason: null, isolatedOn: null, updatedAt: new Date() })
    .where(eq(animals.id, animal.id));
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "update",
    entity: "isolation",
    entityId: animal.id,
    summary: `${animal.code} isolation cleared: ${note}`,
    before: { reason: animal.isolationReason, isolatedOn: animal.isolatedOn },
    after: { note },
  });
  redirect(`/animals/${animal.code}`);
}
