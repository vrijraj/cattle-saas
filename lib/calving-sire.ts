export function calfSireFromConception(insemination: { bullCode: string | null; bullName: string | null } | null) {
  const code = insemination?.bullCode?.trim() ?? "";
  if (!code) return null;
  return { code, name: insemination?.bullName?.trim() || null };
}
