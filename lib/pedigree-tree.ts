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
};

export type AncestorChart = {
  self: PedigreeNode;
  parents: PedigreeNode[];
  grandparents: PedigreeNode[];
  greatGrandparents: PedigreeNode[];
  fourthGeneration: PedigreeNode[];
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

  function resolve(code: string | null, name: string | null): { node: PedigreeNode; parents: ParentRefs } {
    if (!code) return { node: { code: null, name: null, href: null }, parents: emptyParents };
    const match = byCode.get(code);
    if (match) {
      const dam = match.geneticDamId ? byId.get(match.geneticDamId) : undefined;
      return {
        node: { code: match.code, name: match.name, href: `/animals/${match.code}` },
        parents: {
          sireCode: match.geneticSireCode,
          sireName: match.geneticSireName,
          damCode: dam?.code ?? null,
          damName: dam?.name ?? null,
        },
      };
    }
    const bull = bullByCode.get(code);
    if (bull) {
      return {
        node: { code: bull.code, name: bull.name ?? name, href: null },
        parents: { sireCode: bull.sireCode, sireName: null, damCode: bull.damCode, damName: null },
      };
    }
    return { node: { code, name, href: null }, parents: emptyParents };
  }

  function pair(parents: ParentRefs) {
    return [resolve(parents.sireCode, parents.sireName), resolve(parents.damCode, parents.damName)] as const;
  }

  const selfParents = pair({
    sireCode: animal.geneticSireCode,
    sireName: animal.geneticSireName,
    damCode: animal.geneticDamId ? (byId.get(animal.geneticDamId)?.code ?? null) : null,
    damName: animal.geneticDamId ? (byId.get(animal.geneticDamId)?.name ?? null) : null,
  });
  const grandparents = selfParents.flatMap((parent) => pair(parent.parents));
  const greatGrandparents = grandparents.flatMap((parent) => pair(parent.parents));
  const fourthGeneration = greatGrandparents.flatMap((parent) => pair(parent.parents));

  return {
    self: { code: animal.code, name: animal.name, href: `/animals/${animal.code}` },
    parents: selfParents.map((parent) => parent.node),
    grandparents: grandparents.map((parent) => parent.node),
    greatGrandparents: greatGrandparents.map((parent) => parent.node),
    fourthGeneration: fourthGeneration.map((parent) => parent.node),
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
