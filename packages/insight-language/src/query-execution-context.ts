import { queryViewPipeline } from "./builtin-views.js";
import { TYPE_CAPABILITIES } from "./semantic-capabilities.js";
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
  readonly tabDeploymentOwners: ReadonlySet<string>;
  readonly tabClosure: ReadonlySet<string>;
}

export function createQueryExecutionContext(
  result: LinkProjectResult,
  scope: QueryScope,
): QueryExecutionContext {
  const elementsById = new Map(result.elements.map((element) => [element.id, element]));
  const parentByChild = containmentIndex(result);
  const tabClosure = buildTabClosure(result, scope.tab);
  const tabDeploymentOwners = new Set<string>();
  if (scope.tab && queryViewPipeline(scope.view, scope.pipeline).stages.includes("deployment-materialization")) {
    for (const root of result.tabRoots[scope.tab] ?? []) {
      // A file extending a child can select its physical system without
      // bringing the system's other children into the logical source scope.
      const owner = ancestors(root, parentByChild).find((id) =>
        elementsById.get(id)?.capabilities?.includes(TYPE_CAPABILITIES.deploymentBoundary));
      if (owner && !tabClosure.has(owner) && elementsById.get(owner)?.deployed) tabDeploymentOwners.add(owner);
    }
  }
  return {
    result,
    scope,
    elementsById,
    contextsById: new Map(result.contexts.map((context) => [context.id, context])),
    contextBySourceIdentity: new Map(result.contexts.map((context) => [context.sourceIdentity, context.id])),
    parentByChild,
    tabClosure,
    tabDeploymentOwners,
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
