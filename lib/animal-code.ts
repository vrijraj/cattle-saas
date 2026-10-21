export function formatAnimalCode(prefix: string, breedCode: string, sequence: number) {
  return `${prefix}-${breedCode}-${String(sequence).padStart(3, "0")}`;
}
