const herdFields = [
  ["code", "Code"],
  ["name", "Name"],
  ["earTag", "Ear tag"],
  ["breedName", "Breed"],
  ["locationName", "Shed"],
  ["geneticSireCode", "Sire code"],
  ["geneticSireName", "Sire"],
] as const;

export type HerdMatchRow = {
  code: string;
  name: string | null;
  earTag: string | null;
  breedName: string | null;
  locationName: string | null;
  geneticSireCode: string | null;
  geneticSireName: string | null;
};

export function herdMatchField(row: HerdMatchRow, term: string) {
  const query = term.trim().toLowerCase();
  if (!query) return null;
  for (const [key, label] of herdFields) {
    if (row[key]?.toLowerCase().includes(query)) return label;
  }
  return null;
}

export function matchesHerdQuery(row: HerdMatchRow, term: string) {
  const query = term.trim().toLowerCase();
  if (!query) return true;
  return herdMatchField(row, term) !== null;
}
