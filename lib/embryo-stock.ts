export function embryoCodeSeries(existing: string[], day: string, count: number) {
  const stem = `EMB-${day.replaceAll("-", "")}-`;
  const used = new Set(existing);
  const codes: string[] = [];
  let number = 1;
  while (codes.length < count && number < count + existing.length + 100) {
    const code = `${stem}${String(number).padStart(2, "0")}`;
    number += 1;
    if (used.has(code)) continue;
    used.add(code);
    codes.push(code);
  }
  return codes;
}

export function embryoStatusLabel(status: string) {
  if (status === "in_stock") return "In stock";
  if (status === "transferred") return "Transferred";
  if (status === "discarded") return "Discarded";
  return status;
}

export function embryoStorageLabel(storage: string) {
  if (storage === "fresh") return "Fresh";
  if (storage === "frozen") return "Frozen";
  return storage;
}
