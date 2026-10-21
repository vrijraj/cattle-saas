export type MilkSheetRow = {
  animalId: string;
  morningLitres: string | null;
  eveningLitres: string | null;
  voidedAt: Date | null;
};

export function milkDaySummary(animalIds: string[], rows: MilkSheetRow[]) {
  const active = new Map(rows.filter((row) => !row.voidedAt).map((row) => [row.animalId, row]));
  const entered = animalIds.filter((id) => active.has(id));
  const total = entered.reduce((sum, id) => {
    const row = active.get(id);
    return sum + Number(row?.morningLitres ?? 0) + Number(row?.eveningLitres ?? 0);
  }, 0);
  return {
    active,
    entered: entered.length,
    notEntered: animalIds.length - entered.length,
    total,
    average: entered.length ? total / entered.length : 0,
    completion: animalIds.length ? Math.round((entered.length / animalIds.length) * 100) : 0,
  };
}
