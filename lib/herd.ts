import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { animals } from "@/db/schema";

export async function farmAnimals(farmId: string) {
  return db
    .select({ id: animals.id, code: animals.code, name: animals.name, sex: animals.sex })
    .from(animals)
    .where(eq(animals.farmId, farmId))
    .orderBy(animals.code);
}
