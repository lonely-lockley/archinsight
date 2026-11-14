import { BUILTIN_VIEW_QUERIES, builtinViewHasStage } from "./builtin-views.js";
import type {
  DeploymentEnvironment,
  LinkedEdge,
  LinkedElement,
  LinkProjectResult,
  QueryScope,
  RenderGraph,
  RenderGraphEdge,
  RenderGraphGroup,
  IsolateRenderGraphLayout,
  SourceLocation,
} from "./contracts.js";
import { discoverDeploymentEnvironments, executeQuery, selectGraph } from "./query-engine.js";

export interface DiagramElementQuickActionMetadata {
  readonly elementId: string;
  readonly canonicalElementId: string;
  readonly title: string;
  readonly hasChildren: boolean;
  readonly hasDeployment: boolean;
  readonly declaration?: SourceLocation;
  readonly pathEligible: boolean;
}

export type DiagramQuickActionMetadata = Readonly<Record<string, DiagramElementQuickActionMetadata>>;

const fallbackShortestPathQuery = `
MATCH (source:Element)
WHERE elementId(source) = $source
MATCH (target:Element)
WHERE elementId(target) = $target
MATCH path = shortestPath((source)-[:REFERENCES*1.. {withDerived}]->(target))
RETURN TABLE path AS evidence
`.trim();

export function diagramQuickActionMetadata(result: LinkProjectResult): DiagramQuickActionMetadata {
  const elementsById = new Map(result.elements.map((element) => [element.id, element]));
  const childrenByParent = new Map<string, LinkedElement[]>();
  for (const element of result.elements) {
    if (element.parent === undefined) continue;
    const children = childrenByParent.get(element.parent) ?? [];
    children.push(element);
    childrenByParent.set(element.parent, children);
  }
  const deploymentByElement = new Map<string, boolean>();
  const hasDeploymentInScope = (elementId: string): boolean => {
    const cached = deploymentByElement.get(elementId);
    if (cached !== undefined) return cached;
    const element = elementsById.get(elementId);
    const available = (element !== undefined && elementHasDeployment(element))
      || (childrenByParent.get(elementId) ?? []).some((child) => hasDeploymentInScope(child.id));
    deploymentByElement.set(elementId, available);
    return available;
  };
  const metadata: Record<string, DiagramElementQuickActionMetadata> = {};
  for (const element of result.elements) {
    metadata[element.id] = {
      elementId: element.id,
      canonicalElementId: element.id,
      title: elementTitle(element),
      hasChildren: (childrenByParent.get(element.id)?.length ?? 0) > 0,
      hasDeployment: hasDeploymentInScope(element.id),
      ...(element.declaration === undefined ? {} : { declaration: element.declaration }),
      pathEligible: isLogicalElement(element),
    };
  }
  return metadata;
}

export function canonicalDiagramElementId(elementId: string): string {
  const occurrenceSeparator = elementId.indexOf("@@");
  return occurrenceSeparator < 0 ? elementId : elementId.slice(0, occurrenceSeparator);
}

export function diagramElementMetadata(
  metadata: DiagramQuickActionMetadata,
  elementId: string,
): DiagramElementQuickActionMetadata | undefined {
  const canonical = canonicalDiagramElementId(elementId);
  const resolved = metadata[elementId] ?? metadata[canonical];
  return resolved === undefined
    ? undefined
    : { ...resolved, elementId, canonicalElementId: canonical };
}

export function selectIsolatedElementGraph(
  result: LinkProjectResult,
  requestedElementId: string,
  scope?: QueryScope,
): RenderGraph {
  const elementId = canonicalDiagramElementId(requestedElementId);
  const root = result.elements.find((element) => element.id === elementId);
  if (root === undefined || !isLogicalElement(root)) return emptyGraph(root?.context ?? "-");

  if (scope?.view !== undefined
      && (scope.view === "no-filter" || builtinViewHasStage(scope.view, "logical-boundary"))) {
    const graph = selectGraph(result, {
      ...scope,
      context: scope.context ?? root.context,
      tab: scope.tab ?? root.sourceIdentity,
    }, BUILTIN_VIEW_QUERIES[scope.view]);
    return isolateElementInGraph(graph, elementId, root.context);
  }

  const elementsById = new Map(result.elements.map((element) => [element.id, element]));
  const selected = new Set([elementId]);
  const edges = result.edges.flatMap((edge) => {
    if (edge.projected === true || (edge.source !== elementId && edge.target !== elementId)) return [];
    selected.add(edge.source);
    selected.add(edge.target);
    return [renderEdge(edge)];
  });
  return isolatePresentationGraph({
    context: root.context,
    elements: selectedElements(selected, elementsById),
    edges: deduplicateEdges(edges),
    groups: [],
    externalElements: [],
  }, elementId);
}

export function deploymentEnvironmentsForElement(
  result: LinkProjectResult,
  requestedElementId: string,
): readonly DeploymentEnvironment[] {
  const elementId = canonicalDiagramElementId(requestedElementId);
  const root = result.elements.find((element) => element.id === elementId);
  if (root === undefined) return [];
  const candidates = discoverDeploymentEnvironments(result, {
    context: root.context,
    tab: root.sourceIdentity,
  });
  return candidates.filter((environment) => {
    const graph = selectDeploymentGraph(result, elementId, environment.id);
    return Object.keys(graph.elements).length > 0;
  });
}

export function selectDeploymentGraph(
  result: LinkProjectResult,
  requestedElementId: string,
  environment: string,
): RenderGraph {
  const elementId = canonicalDiagramElementId(requestedElementId);
  const root = result.elements.find((element) => element.id === elementId);
  if (root === undefined) return emptyGraph("-");
  const childrenByParent = childrenIndex(result.elements);
  const logicalScope = descendantIds(elementId, childrenByParent);
  const complete = selectGraph(result, {
    context: root.context,
    tab: root.sourceIdentity,
    view: "deployment-container",
    environment,
  }, BUILTIN_VIEW_QUERIES["deployment-container"]);
  return filterDeploymentGraph(complete, logicalScope);
}

export function selectPathGraph(
  result: LinkProjectResult,
  requestedSourceId: string,
  requestedTargetId: string,
  scope?: QueryScope,
): RenderGraph {
  const sourceId = canonicalDiagramElementId(requestedSourceId);
  const targetId = canonicalDiagramElementId(requestedTargetId);
  const source = result.elements.find((element) => element.id === sourceId);
  const target = result.elements.find((element) => element.id === targetId);
  if (source === undefined || target === undefined || !isLogicalElement(source) || !isLogicalElement(target)) {
    return emptyGraph(source?.context ?? target?.context ?? "-");
  }
  const endpoints = endpointGraph(source, target);
  if (scope?.view !== undefined
      && (scope.view === "no-filter" || builtinViewHasStage(scope.view, "logical-boundary"))) {
    const viewGraph = selectGraph(result, {
      ...scope,
      context: scope.context ?? source.context,
      tab: scope.tab ?? source.sourceIdentity,
    }, BUILTIN_VIEW_QUERIES[scope.view]);
    return directedPathCorridor(viewGraph, sourceId, targetId) ?? endpoints;
  }
  const queryResult = executeQuery(result, {
    context: source.context,
    tab: source.sourceIdentity,
  }, fallbackShortestPathQuery, { source: sourceId, target: targetId });
  if (queryResult.kind !== "table" || queryResult.rows.length === 0) return endpoints;
  const evidence = queryResult.rows[0]?.[0];
  if (!isSerializedPath(evidence)) return endpoints;
  const elementsById = new Map(result.elements.map((element) => [element.id, element]));
  const edgesById = new Map(result.edges.map((edge) => [edge.id as string, edge]));
  const selectedIds = new Set(evidence.nodes.flatMap((node) => serializedNodeId(node) ?? []));
  const edges = evidence.relationships.flatMap((relationship) => {
    if (!isSerializedRelationship(relationship)) return [];
    const edge = typeof relationship.originId === "string" ? edgesById.get(relationship.originId) : undefined;
    if (edge === undefined) return [];
    selectedIds.add(relationship.source);
    selectedIds.add(relationship.target);
    return [{
      edge,
      source: relationship.source,
      target: relationship.target,
      derived: relationship.derived === true,
      projected: relationship.projected === true,
    } satisfies RenderGraphEdge];
  });
  return edges.length === 0 ? endpoints : {
    context: source.context,
    elements: selectedElements(selectedIds, elementsById),
    edges,
    groups: [],
    externalElements: [],
  };
}

function directedPathCorridor(graph: RenderGraph, sourceId: string, targetId: string): RenderGraph | undefined {
  if (graph.elements[sourceId] === undefined || graph.elements[targetId] === undefined) return undefined;
  const outgoing = new Map<string, RenderGraphEdge[]>();
  const incoming = new Map<string, RenderGraphEdge[]>();
  for (const edge of graph.edges) {
    if (edge.projected || edge.edge.projected === true) continue;
    const sourceEdges = outgoing.get(edge.source) ?? [];
    sourceEdges.push(edge);
    outgoing.set(edge.source, sourceEdges);
    const targetEdges = incoming.get(edge.target) ?? [];
    targetEdges.push(edge);
    incoming.set(edge.target, targetEdges);
  }
  const reachableFromSource = reachableNodes(sourceId, outgoing, (edge) => edge.target);
  if (!reachableFromSource.has(targetId)) return undefined;
  const reachingTarget = reachableNodes(targetId, incoming, (edge) => edge.source);
  const selected = new Set([...reachableFromSource].filter((id) => reachingTarget.has(id)));
  const edges = graph.edges.filter((edge) => !edge.projected && edge.edge.projected !== true
    && selected.has(edge.source) && selected.has(edge.target));
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of graph.groups) {
      if (selected.has(group.owner) || !group.elements.some((id) => selected.has(id))) continue;
      if (graph.elements[group.owner] === undefined) continue;
      selected.add(group.owner);
      changed = true;
    }
  }
  const elements = Object.fromEntries(
    [...selected]
      .filter((id) => graph.elements[id] !== undefined)
      .sort()
      .map((id) => [id, graph.elements[id]!]),
  );
  const groups = graph.groups.flatMap((group) => {
    const members = group.elements.filter((id) => selected.has(id));
    return members.length === 0 ? [] : [{ ...group, elements: members }];
  });
  return {
    context: graph.context,
    elements,
    edges,
    groups,
    externalElements: graph.externalElements.filter((id) => selected.has(id)),
  };
}

function isolateElementInGraph(graph: RenderGraph, elementId: string, context: string): RenderGraph {
  if (graph.elements[elementId] === undefined) return emptyGraph(context);
  const edges = graph.edges.filter((edge) => !edge.projected && edge.edge.projected !== true
    && (edge.source === elementId || edge.target === elementId));
  const selected = new Set([elementId]);
  for (const edge of edges) {
    selected.add(edge.source);
    selected.add(edge.target);
  }
  const elements = Object.fromEntries(
    [...selected]
      .filter((id) => graph.elements[id] !== undefined)
      .sort()
      .map((id) => [id, graph.elements[id]!]),
  );
  return isolatePresentationGraph({
    context: graph.context,
    elements,
    edges,
    groups: [],
    externalElements: graph.externalElements.filter((id) => selected.has(id)),
  }, elementId);
}

function isolatePresentationGraph(graph: RenderGraph, elementId: string): RenderGraph {
  const incoming = new Set<string>();
  const outgoing = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.target === elementId && edge.source !== elementId) incoming.add(edge.source);
    if (edge.source === elementId && edge.target !== elementId) outgoing.add(edge.target);
  }
  const bidirectional = new Set([...incoming].filter((id) => outgoing.has(id)));
  const incomingOccurrences = new Map<string, string>();
  const outgoingOccurrences = new Map<string, string>();
  const elements = { ...graph.elements };
  for (const id of bidirectional) {
    const element = elements[id];
    if (element === undefined) continue;
    const incomingId = isolateOccurrenceId(id, "incoming");
    const outgoingId = isolateOccurrenceId(id, "outgoing");
    incomingOccurrences.set(id, incomingId);
    outgoingOccurrences.set(id, outgoingId);
    delete elements[id];
    elements[incomingId] = { ...element, id: incomingId };
    elements[outgoingId] = { ...element, id: outgoingId };
  }
  const edges = graph.edges.map((edge) => ({
    ...edge,
    source: edge.target === elementId ? incomingOccurrences.get(edge.source) ?? edge.source : edge.source,
    target: edge.source === elementId ? outgoingOccurrences.get(edge.target) ?? edge.target : edge.target,
  }));
  const externalElements = graph.externalElements.flatMap((id) => {
    const incomingId = incomingOccurrences.get(id);
    const outgoingId = outgoingOccurrences.get(id);
    return incomingId === undefined || outgoingId === undefined ? [id] : [incomingId, outgoingId];
  });
  const layout: IsolateRenderGraphLayout = {
    kind: "isolate",
    focus: elementId,
    incoming: [...incoming].map((id) => incomingOccurrences.get(id) ?? id).sort(),
    outgoing: [...outgoing].map((id) => outgoingOccurrences.get(id) ?? id).sort(),
  };
  return {
    ...graph,
    elements,
    edges,
    groups: [],
    externalElements,
    layout,
  };
}

function isolateOccurrenceId(elementId: string, role: "incoming" | "outgoing"): string {
  return `${elementId}@@isolate-${role}`;
}

function reachableNodes(
  start: string,
  edgesByNode: ReadonlyMap<string, readonly RenderGraphEdge[]>,
  nextNode: (edge: RenderGraphEdge) => string,
): Set<string> {
  const pending = [start];
  const visited = new Set([start]);
  for (let index = 0; index < pending.length; index++) {
    for (const edge of edgesByNode.get(pending[index]!) ?? []) {
      const next = nextNode(edge);
      if (visited.has(next)) continue;
      visited.add(next);
      pending.push(next);
    }
  }
  return visited;
}

function endpointGraph(source: LinkedElement, target: LinkedElement): RenderGraph {
  return {
    context: source.context,
    elements: { [source.id]: source, [target.id]: target },
    edges: [],
    groups: [],
    externalElements: source.context === target.context ? [] : [target.id],
  };
}

function isSerializedPath(value: unknown): value is {
  readonly kind: "path";
  readonly nodes: readonly unknown[];
  readonly relationships: readonly unknown[];
} {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && "kind" in value && value.kind === "path"
    && "nodes" in value && Array.isArray(value.nodes)
    && "relationships" in value && Array.isArray(value.relationships);
}

function serializedNodeId(value: unknown): string | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
      && "kind" in value && value.kind === "node" && "id" in value && typeof value.id === "string"
    ? value.id
    : undefined;
}

function isSerializedRelationship(value: unknown): value is {
  readonly originId: string | null;
  readonly source: string;
  readonly target: string;
  readonly derived: boolean;
  readonly projected: boolean;
} {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && "source" in value && typeof value.source === "string"
    && "target" in value && typeof value.target === "string"
    && "originId" in value && (value.originId === null || typeof value.originId === "string")
    && "derived" in value && typeof value.derived === "boolean"
    && "projected" in value && typeof value.projected === "boolean";
}

function filterDeploymentGraph(graph: RenderGraph, logicalScope: ReadonlySet<string>): RenderGraph {
  const selectedIds = new Set<string>();
  const selectedEdges = graph.edges.filter((edge) => deploymentEdgeTouchesScope(edge, logicalScope));
  for (const edge of selectedEdges) {
    selectedIds.add(edge.source);
    selectedIds.add(edge.target);
  }
  for (const id of Object.keys(graph.elements)) {
    if (logicalScope.has(canonicalDiagramElementId(id))) selectedIds.add(id);
  }
  let groupClosureChanged = true;
  while (groupClosureChanged) {
    groupClosureChanged = false;
    for (const group of graph.groups) {
      if (!selectedIds.has(group.owner) && group.elements.some((id) => selectedIds.has(id))) {
        selectedIds.add(group.owner);
        groupClosureChanged = true;
      }
    }
  }
  const groups: RenderGraphGroup[] = graph.groups.flatMap((group) => {
    const elements = group.elements.filter((id) => selectedIds.has(id));
    return elements.length === 0 ? [] : [{ ...group, elements }];
  });
  const elements = Object.fromEntries(
    [...selectedIds]
      .filter((id) => graph.elements[id] !== undefined)
      .sort()
      .map((id) => [id, graph.elements[id]!]),
  );
  const external = new Set(graph.externalElements.filter((id) => selectedIds.has(id)));
  for (const id of selectedIds) {
    const canonical = canonicalDiagramElementId(id);
    if (!logicalScope.has(canonical) && isLogicalElement(graph.elements[id])) external.add(id);
  }
  return {
    context: graph.context,
    elements,
    edges: selectedEdges.filter((edge) => elements[edge.source] !== undefined && elements[edge.target] !== undefined),
    groups,
    externalElements: [...external].sort(),
  };
}

function deploymentEdgeTouchesScope(edge: RenderGraphEdge, logicalScope: ReadonlySet<string>): boolean {
  if (logicalScope.has(canonicalDiagramElementId(edge.source))
      || logicalScope.has(canonicalDiagramElementId(edge.target))) return true;
  const origins = edge.edge.projectionOrigins ?? [{
    source: edge.edge.originSource ?? edge.edge.source,
    target: edge.edge.originTarget ?? edge.edge.target,
  }];
  return origins.some((origin) => logicalScope.has(canonicalDiagramElementId(origin.source))
    || logicalScope.has(canonicalDiagramElementId(origin.target)));
}

function childrenIndex(elements: readonly LinkedElement[]): Map<string, LinkedElement[]> {
  const result = new Map<string, LinkedElement[]>();
  for (const element of elements) {
    if (element.parent === undefined) continue;
    const children = result.get(element.parent) ?? [];
    children.push(element);
    result.set(element.parent, children);
  }
  return result;
}

function descendantIds(
  root: string,
  childrenByParent: ReadonlyMap<string, readonly LinkedElement[]>,
): Set<string> {
  const result = new Set<string>();
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    for (const child of childrenByParent.get(current) ?? []) pending.push(child.id);
  }
  return result;
}

function selectedElements(
  selected: ReadonlySet<string>,
  elementsById: ReadonlyMap<string, LinkedElement>,
): Readonly<Record<string, LinkedElement>> {
  return Object.fromEntries(
    [...selected]
      .filter((id) => elementsById.has(id))
      .sort()
      .map((id) => [id, elementsById.get(id)!]),
  );
}

function renderEdge(edge: LinkedEdge): RenderGraphEdge {
  return { edge, source: edge.source, target: edge.target, derived: false, projected: edge.projected === true };
}

function deduplicateEdges(edges: readonly RenderGraphEdge[]): RenderGraphEdge[] {
  return [...new Map(edges.map((edge) => [edge.edge.id, edge])).values()];
}

function elementHasDeployment(element: LinkedElement): boolean {
  return element.deployed === true;
}

function isLogicalElement(element: LinkedElement | undefined): boolean {
  return element !== undefined
    && element.type !== "DeploymentElement"
    && !element.baseTypes.includes("DeploymentElement");
}

function elementTitle(element: LinkedElement): string {
  return element.attributes.name?.[0]
    ?? element.attributes.title?.[0]
    ?? element.localId.split("/").at(-1)
    ?? element.id;
}

function emptyGraph(context: string): RenderGraph {
  return { context, elements: {}, edges: [], groups: [], externalElements: [] };
}
