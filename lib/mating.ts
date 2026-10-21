export type PedigreeLink = {
  code: string;
  sireCode: string | null;
  damCode: string | null;
};

export type MatingFlag = {
  flag: "Parent" | "Grandparent" | "Son" | "Common ancestor";
  code: string;
  generation: number;
};

export type PedigreeLine = {
  generation: number;
  role: string;
  code: string;
};

const depth = 4;

function ancestors(start: string, byCode: Map<string, PedigreeLink>) {
  const found = new Map<string, number>();
  const walk = (code: string | null, generation: number, path: Set<string>) => {
    if (!code || generation > depth || path.has(code)) return;
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

export function pedigreeLines(code: string, links: PedigreeLink[], maxDepth = depth): PedigreeLine[] {
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

export function matingFlags(femaleCode: string, proposedSireCode: string, links: PedigreeLink[]) {
  const byCode = new Map(links.map((link) => [link.code, link]));
  const femaleSide = ancestors(femaleCode, byCode);
  const sireSide = ancestors(proposedSireCode, byCode);
  const flags: MatingFlag[] = [];

  const relationship = femaleSide.get(proposedSireCode);
  if (relationship) {
    flags.push({
      flag: relationship === 1 ? "Parent" : relationship === 2 ? "Grandparent" : "Common ancestor",
      code: proposedSireCode,
      generation: relationship,
    });
  }

  if (byCode.get(proposedSireCode)?.damCode === femaleCode) {
    flags.push({ flag: "Son", code: proposedSireCode, generation: 1 });
  }

  for (const [code, generation] of femaleSide) {
    if (code === proposedSireCode || !sireSide.has(code)) continue;
    flags.push({ flag: "Common ancestor", code, generation });
  }

  return flags;
}
