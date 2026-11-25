export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

/**
 * Pure RFC-4180 CSV parser handling quoted fields, escaped quotes (""), and CRLF/LF line endings.
 */
export function parseCsv(input: string): ParsedCsv {
  const clean = input.replace(/^\uFEFF/, "").trim();
  if (!clean) return { headers: [], rows: [] };

  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\r" && next === "\n") {
      row.push(cell.trim());
      table.push(row);
      row = [];
      cell = "";
      i += 1;
    } else if (ch === "\n" || ch === "\r") {
      row.push(cell.trim());
      table.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  table.push(row);

  const nonEmpty = table.filter((r) => r.some((c) => c.length > 0));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, ""));
  const rows = nonEmpty.slice(1).map((cols) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = (cols[idx] ?? "").trim();
    });
    return obj;
  });

  return { headers, rows };
}

export type AnimalImportRow = {
  line: number;
  name: string;
  breedCode: string;
  sex: "female" | "male" | "unknown";
  dob: string;
  earTag: string;
  rfid: string;
  shed: string;
  lifeStage: "calf" | "heifer" | "cow" | "bull" | "steer";
  lactation: "not_applicable" | "pre_lactation" | "lactating" | "dry";
  reproduction: "not_applicable" | "open" | "bred" | "pregnant" | "fresh";
  purchasePrice: string;
  errors: string[];
};

const VALID_SEX = new Set(["female", "male", "unknown"]);
const VALID_STAGE = new Set(["calf", "heifer", "cow", "bull", "steer"]);
const VALID_LACT = new Set(["not_applicable", "pre_lactation", "lactating", "dry"]);
const VALID_REPRO = new Set(["not_applicable", "open", "bred", "pregnant", "fresh"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateAnimalImportCsv(csvText: string): AnimalImportRow[] {
  const { rows } = parseCsv(csvText);
  return rows.slice(0, 500).map((raw, idx) => {
    const errors: string[] = [];
    const name = raw.name || raw.animalname || "";
    const breedCode = (raw.breedcode || raw.breed || "GIR").toUpperCase();
    const sexRaw = (raw.sex || raw.gender || "female").toLowerCase();
    const sex = (VALID_SEX.has(sexRaw) ? sexRaw : "female") as AnimalImportRow["sex"];
    if (raw.sex && !VALID_SEX.has(sexRaw)) errors.push(`Invalid sex "${raw.sex}"`);

    const dob = raw.dob || raw.dateofbirth || "";
    if (dob && !DATE_RE.test(dob)) errors.push(`DOB must be YYYY-MM-DD`);

    const earTag = raw.eartag || raw.tag || "";
    const rfid = raw.rfid || "";
    const shed = raw.shed || raw.location || "";

    const stageDefault = sex === "male" ? "bull" : "cow";
    const stageRaw = (raw.lifestage || raw.stage || stageDefault).toLowerCase();
    const lifeStage = (VALID_STAGE.has(stageRaw) ? stageRaw : stageDefault) as AnimalImportRow["lifeStage"];
    if (raw.lifestage && !VALID_STAGE.has(stageRaw)) errors.push(`Invalid lifeStage "${raw.lifestage}"`);

    const lactDefault = sex === "male" ? "not_applicable" : lifeStage === "cow" ? "lactating" : "pre_lactation";
    const lactRaw = (raw.lactation || lactDefault).toLowerCase();
    const lactation = (VALID_LACT.has(lactRaw) ? lactRaw : lactDefault) as AnimalImportRow["lactation"];

    const reproDefault = sex === "male" ? "not_applicable" : "open";
    const reproRaw = (raw.reproduction || reproDefault).toLowerCase();
    const reproduction = (VALID_REPRO.has(reproRaw) ? reproRaw : reproDefault) as AnimalImportRow["reproduction"];

    const purchasePrice = raw.purchaseprice || raw.price || "";
    if (purchasePrice && (!Number.isFinite(Number(purchasePrice)) || Number(purchasePrice) < 0)) {
      errors.push("Invalid purchasePrice");
    }

    if (!name && !earTag) errors.push("Provide at least name or earTag");

    return {
      line: idx + 2,
      name,
      breedCode,
      sex,
      dob,
      earTag,
      rfid,
      shed,
      lifeStage,
      lactation: sex === "male" ? "not_applicable" : lactation,
      reproduction: sex === "male" ? "not_applicable" : reproduction,
      purchasePrice,
      errors,
    };
  });
}

export type MilkImportRow = {
  line: number;
  animalCode: string;
  recordedOn: string;
  morningLitres: string | null;
  eveningLitres: string | null;
  fatPercent: string | null;
  snfPercent: string | null;
  errors: string[];
};

export function validateMilkImportCsv(csvText: string): MilkImportRow[] {
  const { rows } = parseCsv(csvText);
  return rows.slice(0, 1000).map((raw, idx) => {
    const errors: string[] = [];
    const animalCode = (raw.animalcode || raw.code || raw.cattleid || "").trim();
    const recordedOn = (raw.recordedon || raw.date || "").trim();
    if (!animalCode) errors.push("Missing animalCode");
    if (!DATE_RE.test(recordedOn)) errors.push("recordedOn must be YYYY-MM-DD");

    const mRaw = raw.morninglitres || raw.morning || "";
    const eRaw = raw.eveninglitres || raw.evening || "";
    const fRaw = raw.fatpercent || raw.fat || "";
    const sRaw = raw.snfpercent || raw.snf || "";

    const mNum = mRaw ? Number(mRaw) : null;
    const eNum = eRaw ? Number(eRaw) : null;
    const fNum = fRaw ? Number(fRaw) : null;
    const sNum = sRaw ? Number(sRaw) : null;

    if (mNum === null && eNum === null) errors.push("Provide morning or evening litres");
    if (mNum !== null && (!Number.isFinite(mNum) || mNum < 0 || mNum > 80)) errors.push("Morning litres must be 0–80");
    if (eNum !== null && (!Number.isFinite(eNum) || eNum < 0 || eNum > 80)) errors.push("Evening litres must be 0–80");
    if (fNum !== null && (!Number.isFinite(fNum) || fNum < 0 || fNum > 15)) errors.push("Fat % must be 0–15");
    if (sNum !== null && (!Number.isFinite(sNum) || sNum < 0 || sNum > 15)) errors.push("SNF % must be 0–15");

    return {
      line: idx + 2,
      animalCode,
      recordedOn,
      morningLitres: mNum !== null && Number.isFinite(mNum) ? mNum.toFixed(1) : null,
      eveningLitres: eNum !== null && Number.isFinite(eNum) ? eNum.toFixed(1) : null,
      fatPercent: fNum !== null && Number.isFinite(fNum) ? fNum.toFixed(2) : null,
      snfPercent: sNum !== null && Number.isFinite(sNum) ? sNum.toFixed(2) : null,
      errors,
    };
  });
}
