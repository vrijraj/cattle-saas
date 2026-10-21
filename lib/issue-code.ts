import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { codeCounters } from "@/db/schema";
import { formatAnimalCode } from "@/lib/animal-code";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function issueAnimalCode(tx: Transaction, farmId: string, prefix: string, breedCode: string) {
  await tx.insert(codeCounters).values({ farmId, breedCode, nextValue: 1 }).onConflictDoNothing();
  const [counter] = await tx
    .select()
    .from(codeCounters)
    .where(and(eq(codeCounters.farmId, farmId), eq(codeCounters.breedCode, breedCode)))
    .for("update");
  const sequence = counter?.nextValue ?? 1;
  await tx
    .update(codeCounters)
    .set({ nextValue: sequence + 1 })
    .where(and(eq(codeCounters.farmId, farmId), eq(codeCounters.breedCode, breedCode)));
  return formatAnimalCode(prefix, breedCode, sequence);
}
