export function scanLookupError(value: string) {
  const code = value.trim();
  if (!code) return "Enter an animal code, straw code, or tag link.";
  if (code.length > 240) return "That code is too long to look up.";
  if (/[\s<>]/.test(code)) return "That code has characters this lookup cannot use.";
  return null;
}
