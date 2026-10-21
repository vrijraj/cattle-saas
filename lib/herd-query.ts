export function matchesHerdQuery(
  row: {
    code: string;
    name: string | null;
    earTag: string | null;
    breedName: string | null;
    locationName: string | null;
    geneticSireCode: string | null;
    geneticSireName: string | null;
  },
  term: string,
) {
  const query = term.trim().toLowerCase();
  if (!query) return true;
  return [row.code, row.name, row.earTag, row.breedName, row.locationName, row.geneticSireCode, row.geneticSireName].some((value) =>
    value?.toLowerCase().includes(query),
  );
}
