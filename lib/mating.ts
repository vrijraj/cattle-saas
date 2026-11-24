export type PedigreeLink = {
  code: string;
  sireCode: string | null;
  damCode: string | null;
  sex?: string | null;
};

export type MatingFlag = {
  flag: "Parent" | "Son" | "Daughter" | "Grandparent" | "Full sibling" | "Half sibling" | "Common ancestor";
  code: string;
  generation: number;
};

export type PedigreeLine = {
  generation: number;
  role: string;
  code: string;
};

const defaultDepth = 4;

const flagOrder: Record<MatingFlag["flag"], number> = {
  Parent: 1,
  Son: 2,
  Daughter: 2,
  Grandparent: 3,
  "Full sibling": 4,
  "Half sibling": 5,
  "Common ancestor": 6,
};

function ancestors(start: string, byCode: Map<string, PedigreeLink>, maxDepth: number) {
  const found = new Map<string, number>();
  const walk = (code: string | null, generation: number, path: Set<string>) => {
    if (!code || generation > maxDepth || path.has(code)) return;
    if (generation > 0) {
      const earlier = found.get(code);
      if (earlier === undefined || generation < earlier) found.set(code, generation);
    }
    const node = byCode.get(code);
    if (!node) return;
    const next = new Set(path);
    next.add(code);
    walk(node.sireCode, generation + 1, next);
    walk(node.damCode, generation + 1, next);
  };
  walk(start, 0, new Set());
  return found;
}

export function pedigreeLines(code: string, links: PedigreeLink[], maxDepth = defaultDepth): PedigreeLine[] {
  const byCode = new Map(links.map((link) => [link.code, link]));
  const lines: PedigreeLine[] = [];
  const walk = (current: string | null, generation: number, role: string, path: Set<string>) => {
    if (!current || generation > maxDepth || path.has(current)) return;
    if (generation > 0) lines.push({ generation, role, code: current });
    const node = byCode.get(current);
    if (!node) return;
    const next = new Set(path);
    next.add(current);
    walk(node.sireCode, generation + 1, generation === 0 ? "Sire" : `${role} · sire`, next);
    walk(node.damCode, generation + 1, generation === 0 ? "Dam" : `${role} · dam`, next);
  };
  walk(code, 0, "Self", new Set());
  return lines;
}

export function matingFlags(femaleCode: string, proposedSireCode: string, links: PedigreeLink[], maxDepth = defaultDepth) {
  const windowDepth = Math.min(6, Math.max(3, Math.trunc(maxDepth || defaultDepth)));
  const byCode = new Map(links.map((link) => [link.code, link]));
  const femaleSide = ancestors(femaleCode, byCode, windowDepth);
  const sireSide = ancestors(proposedSireCode, byCode, windowDepth);
  const flags: MatingFlag[] = [];
  const seen = new Set<string>();

  const push = (entry: MatingFlag) => {
    const key = `${entry.flag}:${entry.code}`;
    if (seen.has(key)) return;
    seen.add(key);
    flags.push(entry);
  };

  // Proposed sire is an ancestor of the female
  const sireInFemaleTree = femaleSide.get(proposedSireCode);
  if (sireInFemaleTree) {
    push({
      flag: sireInFemaleTree === 1 ? "Parent" : sireInFemaleTree === 2 ? "Grandparent" : "Common ancestor",
      code: proposedSireCode,
      generation: sireInFemaleTree,
    });
  }

  // Female is an ancestor of the proposed sire (e.g., mother x son, grandmother x grandson)
  const proposed = byCode.get(proposedSireCode);
  const femaleInSireTree = sireSide.get(femaleCode);
  if (femaleInSireTree === 1) {
    push({
      flag: proposed?.sex === "female" ? "Daughter" : "Son",
      code: proposedSireCode,
      generation: 1,
    });
  } else if (femaleInSireTree === 2) {
    push({
      flag: "Grandparent",
      code: femaleCode,
      generation: 2,
    });
  } else if (femaleInSireTree && femaleInSireTree >= 3) {
    push({
      flag: "Common ancestor",
      code: femaleCode,
      generation: femaleInSireTree,
    });
  }

  // Full / half sibling check (generation 1 parents match)
  const female = byCode.get(femaleCode);
  if (female && proposed && femaleCode !== proposedSireCode) {
    const sameSire = Boolean(female.sireCode && proposed.sireCode && female.sireCode === proposed.sireCode);
    const sameDam = Boolean(female.damCode && proposed.damCode && female.damCode === proposed.damCode);
    if (sameSire && sameDam) {
      push({ flag: "Full sibling", code: `${female.sireCode} × ${female.damCode}`, generation: 1 });
    } else if (sameSire && female.sireCode) {
      push({ flag: "Half sibling", code: female.sireCode, generation: 1 });
    } else if (sameDam && female.damCode) {
      push({ flag: "Half sibling", code: female.damCode, generation: 1 });
    }
  }

  // Shared ancestors
  for (const [code, generation] of femaleSide) {
    if (code === proposedSireCode || code === femaleCode || !sireSide.has(code)) continue;
    push({ flag: "Common ancestor", code, generation });
  }

  return flags.sort((a, b) => flagOrder[a.flag] - flagOrder[b.flag] || a.generation - b.generation || a.code.localeCompare(b.code));
}
