import type {
  LinkedContext,
  LinkedElement,
  LinkProjectResult,
  QueryScope,
} from "./contracts.js";

export interface QueryExecutionContext {
  readonly result: LinkProjectResult;
  readonly scope: QueryScope;
  readonly elementsById: ReadonlyMap<string, LinkedElement>;
  readonly contextsById: ReadonlyMap<string, LinkedContext>;
  readonly contextBySourceIdentity: ReadonlyMap<string, string>;
  readonly parentByChild: ReadonlyMap<string, string>;
  readonly tabClosure: ReadonlySet<string>;
}

export function createQueryExecutionContext(
  result: LinkProjectResult,
  scope: QueryScope,
): QueryExecutionContext {
  return {
    result,
    scope,
    elementsById: new Map(result.elements.map((element) => [element.id, element])),
    contextsById: new Map(result.contexts.map((context) => [context.id, context])),
    contextBySourceIdentity: new Map(result.contexts.map((context) => [context.sourceIdentity, context.id])),
    parentByChild: containmentIndex(result),
    tabClosure: buildTabClosure(result, scope.tab),
  };
}

function containmentIndex(result: LinkProjectResult): ReadonlyMap<string, string> {
  const parentByChild = new Map<string, string>();
  for (const relationId of result.graph.relationsOfKind("CONTAINS")) {
    const relation = result.graph.relation(relationId);
    if (relation !== undefined) {
      parentByChild.set(relation.target, relation.source);
    }
  }
  return parentByChild;
}

function buildTabClosure(result: LinkProjectResult, tab: string | undefined): ReadonlySet<string> {
  if (tab === undefined) {
    return new Set();
  }
  const roots = new Set(result.tabRoots[tab] ?? []);
  if (roots.size === 0) {
    return new Set();
  }
  const parentByChild = new Map(result.elements.flatMap((element) =>
    element.parent === undefined ? [] : [[element.id, element.parent] as const]
  ));
  return new Set(result.elements
    .filter((element) => element.synthetic !== true
      && (roots.has(element.id) || ancestors(element.id, parentByChild).some((ancestor) => roots.has(ancestor))))
    .map((element) => element.id));
}

function ancestors(id: string, parentByChild: ReadonlyMap<string, string>): readonly string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  let current = parentByChild.get(id);
  while (current !== undefined && !visited.has(current)) {
    visited.add(current);
    result.push(current);
    current = parentByChild.get(current);
  }
  return result;
}
