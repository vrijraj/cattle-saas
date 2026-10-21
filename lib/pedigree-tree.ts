export type AnimalLink = {
  id: string;
  code: string;
  name: string | null;
  geneticDamId: string | null;
  geneticSireCode: string | null;
  geneticSireName: string | null;
  presence: string;
};

export type BullLink = {
  code: string;
  name: string | null;
  sireCode: string | null;
  damCode: string | null;
};

export type PedigreeNode = {
  code: string | null;
  name: string | null;
  href: string | null;
  repeat?: boolean;
};

export const PEDIGREE_GENERATIONS = 8;

export type AncestorChart = {
  self: PedigreeNode;
  parents: PedigreeNode[];
  grandparents: PedigreeNode[];
  greatGrandparents: PedigreeNode[];
  fourthGeneration: PedigreeNode[];
  generations: PedigreeNode[][];
};

export type HerdNode = {
  code: string;
  name: string | null;
  sireCode: string | null;
  presence: string;
  children: HerdNode[];
};

type ParentRefs = {
  sireCode: string | null;
  sireName: string | null;
  damCode: string | null;
  damName: string | null;
};

const emptyParents: ParentRefs = { sireCode: null, sireName: null, damCode: null, damName: null };

export function ancestorChart(animal: AnimalLink, herd: AnimalLink[], bulls: BullLink[]): AncestorChart {
  const byId = new Map(herd.map((row) => [row.id, row]));
  const byCode = new Map(herd.map((row) => [row.code, row]));
  const bullByCode = new Map(bulls.map((bull) => [bull.code, bull]));

  function resolve(code: string | null, name: string | null, seen: Set<string>): { node: PedigreeNode; parents: ParentRefs; seen: Set<string> } {
    if (!code) return { node: { code: null, name: null, href: null }, parents: emptyParents, seen };
    const match = byCode.get(code);
    const bull = bullByCode.get(code);
    const nodeName = match?.name ?? bull?.name ?? name;
    const href = match ? `/animals/${match.code}` : null;
    if (seen.has(code)) return { node: { code, name: nodeName, href, repeat: true }, parents: emptyParents, seen };
    const path = new Set(seen);
    path.add(code);
    if (match) {
      const dam = match.geneticDamId ? byId.get(match.geneticDamId) : undefined;
      return {
        node: { code: match.code, name: match.name, href },
        parents: {
          sireCode: match.geneticSireCode,
          sireName: match.geneticSireName,
          damCode: dam?.code ?? null,
          damName: dam?.name ?? null,
        },
        seen: path,
      };
    }
    if (bull) {
      return {
        node: { code: bull.code, name: nodeName, href: null },
        parents: { sireCode: bull.sireCode, sireName: null, damCode: bull.damCode, damName: null },
        seen: path,
      };
    }
    return { node: { code, name, href: null }, parents: emptyParents, seen: path };
  }

  function pair(parents: ParentRefs, seen: Set<string>) {
    return [resolve(parents.sireCode, parents.sireName, seen), resolve(parents.damCode, parents.damName, seen)] as const;
  }

  const selfParents = pair(
    {
      sireCode: animal.geneticSireCode,
      sireName: animal.geneticSireName,
      damCode: animal.geneticDamId ? (byId.get(animal.geneticDamId)?.code ?? null) : null,
      damName: animal.geneticDamId ? (byId.get(animal.geneticDamId)?.name ?? null) : null,
    },
    new Set([animal.code]),
  );
  const generations: PedigreeNode[][] = [];
  let level: readonly { node: PedigreeNode; parents: ParentRefs; seen: Set<string> }[] = selfParents;
  for (let generation = 0; generation < PEDIGREE_GENERATIONS; generation += 1) {
    generations.push(level.map((parent) => parent.node));
    level = level.flatMap((parent) => pair(parent.parents, parent.seen));
  }

  return {
    self: { code: animal.code, name: animal.name, href: `/animals/${animal.code}` },
    parents: generations[0] ?? [],
    grandparents: generations[1] ?? [],
    greatGrandparents: generations[2] ?? [],
    fourthGeneration: generations[3] ?? [],
    generations,
  };
}

export type ParentLink = {
  id: string;
  damId: string | null;
  sireId: string | null;
};

export function parentLinkCreatesCycle(links: ParentLink[], animalId: string, parentId: string) {
  if (!parentId || animalId === parentId) return true;
  const byId = new Map(links.map((link) => [link.id, link]));
  const seen = new Set<string>();
  const stack = [parentId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    if (current === animalId) return true;
    seen.add(current);
    const node = byId.get(current);
    if (!node) continue;
    if (node.damId) stack.push(node.damId);
    if (node.sireId) stack.push(node.sireId);
  }
  return false;
}

export function herdForest(herd: AnimalLink[]): HerdNode[] {
  const byId = new Map(herd.map((animal) => [animal.id, animal]));
  const childrenOf = new Map<string, AnimalLink[]>();
  for (const animal of herd) {
    if (!animal.geneticDamId || !byId.has(animal.geneticDamId)) continue;
    const list = childrenOf.get(animal.geneticDamId) ?? [];
    list.push(animal);
    childrenOf.set(animal.geneticDamId, list);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.code.localeCompare(b.code));
  }

  const visited = new Set<string>();
  function build(animal: AnimalLink, stack: Set<string>): HerdNode {
    const node: HerdNode = {
      code: animal.code,
      name: animal.name,
      sireCode: animal.geneticSireCode,
      presence: animal.presence,
      children: [],
    };
    if (stack.has(animal.id)) return node;
    visited.add(animal.id);
    const next = new Set(stack);
    next.add(animal.id);
    node.children = (childrenOf.get(animal.id) ?? []).map((child) => build(child, next));
    return node;
  }

  const roots = herd
    .filter((animal) => !animal.geneticDamId || !byId.has(animal.geneticDamId))
    .sort((a, b) => a.code.localeCompare(b.code));
  const forest = roots.map((animal) => build(animal, new Set()));
  for (const animal of [...herd].sort((a, b) => a.code.localeCompare(b.code))) {
    if (!visited.has(animal.id)) forest.push(build(animal, new Set()));
  }

  const size = (node: HerdNode): number => 1 + node.children.reduce((sum, child) => sum + size(child), 0);
  return forest.sort((a, b) => size(b) - size(a) || a.code.localeCompare(b.code));
}
