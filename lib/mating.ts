export type PedigreeLink = {
  code: string;
  sireCode: string | null;
  damCode: string | null;
};

export type MatingFlag = {
  flag: "Parent" | "Grandparent" | "Common ancestor";
  code: string;
  generation: number;
};

export function matingFlags(femaleCode: string, proposedSireCode: string, links: PedigreeLink[]) {
  const byCode = new Map(links.map((link) => [link.code, link]));
  const flags: MatingFlag[] = [];
  const seen = new Set<string>();

  const walk = (code: string | null, generation: number) => {
    if (!code || generation > 4 || seen.has(`${generation}:${code}`)) return;
    seen.add(`${generation}:${code}`);
    if (generation > 0 && code === proposedSireCode) {
      flags.push({
        flag: generation === 1 ? "Parent" : generation === 2 ? "Grandparent" : "Common ancestor",
        code,
        generation,
      });
    }
    const node = byCode.get(code);
    if (!node) return;
    walk(node.sireCode, generation + 1);
    walk(node.damCode, generation + 1);
  };

  walk(femaleCode, 0);
  return flags;
}
