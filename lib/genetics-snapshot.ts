import { bullPerformance, type BullPerformance } from "@/lib/bull-performance";

type Animal = {
  id: string;
  code: string;
  name: string | null;
  sex: string;
  dob: string | null;
  geneticSireCode: string | null;
  lactation: string;
};

type Birth = { damId: string; calfId: string | null; calvedOn: string; outcome: string; voidedAt: Date | null };
type Health = { animalId: string; voidedAt: Date | null };
type Milk = { animalId: string; morningLitres: string | null; eveningLitres: string | null; voidedAt: Date | null };
type Insemination = { id: string; bullCode: string; voidedAt: Date | null };
type Pregnancy = { inseminationId: string | null; result: string; voidedAt: Date | null };

export function geneticsPerformance(
  input: {
    herd: Animal[];
    births: Birth[];
    health: Health[];
    milk: Milk[];
    ais: Insemination[];
    checks: Pregnancy[];
  },
  filters: { year?: string; lactation?: string; sire?: string } = {},
): BullPerformance[] {
  const mates = input.ais
    .filter((row) => !row.voidedAt)
    .map((row) => {
      const results = input.checks.filter((check) => check.inseminationId === row.id && !check.voidedAt);
      const pregnant = results.some((check) => check.result === "pregnant");
      return { bullCode: row.bullCode, result: pregnant ? "pregnant" : (results[0]?.result ?? "") };
    });
  return bullPerformance(
    input.herd.map((animal) => ({
      id: animal.id,
      code: animal.code,
      name: animal.name,
      sex: animal.sex,
      dob: animal.dob,
      sireCode: animal.geneticSireCode,
      lactationNumber: input.births.filter((birth) => birth.damId === animal.id && !birth.voidedAt).length,
      dailyMilk: input.milk
        .filter((row) => row.animalId === animal.id && !row.voidedAt)
        .map((row) => Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0)),
      healthEvents: input.health.filter((row) => row.animalId === animal.id && !row.voidedAt).length,
      calvingOutcome: input.births.find((birth) => birth.calfId === animal.id && !birth.voidedAt)?.outcome ?? null,
      inMilk: animal.lactation === "lactating",
    })),
    filters,
    {
      mates,
      daughterBirths: input.births.filter((birth) => !birth.voidedAt).map((birth) => ({ damId: birth.damId, calvedOn: birth.calvedOn })),
    },
  );
}
