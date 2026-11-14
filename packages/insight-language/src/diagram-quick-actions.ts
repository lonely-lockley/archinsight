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
import { discoverDeploymentEnvironments, selectGraph } from "./query-engine.js";

export interface DiagramElementQuickActionMetadata {
  readonly elementId: string;
  readonly canonicalElementId: string;
  readonly title: string;
  readonly hasChildren: boolean;
  readonly hasDeployment: boolean;
  readonly declaration?: SourceLocation;
  readonly isolateEligible: boolean;
  readonly pathEligible: boolean;
}

export type DiagramQuickActionMetadata = Readonly<Record<string, DiagramElementQuickActionMetadata>>;

export interface PathEndpointEnvironments {
  readonly sourceEnvironment?: string;
  readonly targetEnvironment?: string;
}

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
      isolateEligible: isLogicalElement(element),
      pathEligible: true,
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
  endpointEnvironments?: PathEndpointEnvironments,
): RenderGraph {
  const sourceId = canonicalDiagramElementId(requestedSourceId);
  const targetId = canonicalDiagramElementId(requestedTargetId);
  const source = result.elements.find((element) => element.id === sourceId);
  const target = result.elements.find((element) => element.id === targetId);
  if (source === undefined || target === undefined) {
    return emptyGraph(source?.context ?? target?.context ?? "-");
  }
  const endpoints = endpointGraph(source, target);
  const sourceEnvironment = endpointEnvironments?.sourceEnvironment;
  const targetEnvironment = endpointEnvironments?.targetEnvironment;
  if (sourceEnvironment !== undefined && targetEnvironment !== undefined
      && sourceEnvironment !== targetEnvironment) {
    return endpoints;
  }
  const pathEnvironment = sourceEnvironment ?? targetEnvironment;
  if (pathEnvironment !== undefined) {
    const deploymentView = scope?.view !== undefined
        && builtinViewHasStage(scope.view, "deployment-environment")
      ? scope.view
      : "deployment-container";
    const environmentGraph = selectGraph(result, {
      ...scope,
      context: source.context,
      tab: source.sourceIdentity,
      view: deploymentView,
      environment: pathEnvironment,
    }, BUILTIN_VIEW_QUERIES[deploymentView]);
    return directedPathCorridor(environmentGraph, sourceId, targetId) ?? endpoints;
  }
  const scopedViewQuery = scope?.view === undefined ? undefined : BUILTIN_VIEW_QUERIES[scope.view];
  if (scope?.view !== undefined && scopedViewQuery !== undefined) {
    const viewGraph = selectGraph(result, {
      ...scope,
      context: source.context,
      tab: source.sourceIdentity,
    }, scopedViewQuery);
    const corridor = directedPathCorridor(viewGraph, sourceId, targetId);
    if (corridor !== undefined) return corridor;
  }
  const completeGraph: RenderGraph = {
    context: source.context,
    elements: Object.fromEntries(result.elements.map((element) => [element.id, element])),
    edges: result.edges.map(renderEdge),
    groups: [],
    externalElements: result.elements
      .filter((element) => element.context !== source.context)
      .map((element) => element.id),
  };
  return directedPathCorridor(completeGraph, sourceId, targetId) ?? endpoints;
}

function directedPathCorridor(graph: RenderGraph, sourceId: string, targetId: string): RenderGraph | undefined {
  const sourceOccurrences = graphElementOccurrences(graph, sourceId);
  const targetOccurrences = graphElementOccurrences(graph, targetId);
  if (sourceOccurrences.length === 0 || targetOccurrences.length === 0) return undefined;
  const outgoing = new Map<string, RenderGraphEdge[]>();
  const incoming = new Map<string, RenderGraphEdge[]>();
  for (const edge of graph.edges) {
    const sourceEdges = outgoing.get(edge.source) ?? [];
    sourceEdges.push(edge);
    outgoing.set(edge.source, sourceEdges);
    const targetEdges = incoming.get(edge.target) ?? [];
    targetEdges.push(edge);
    incoming.set(edge.target, targetEdges);
  }
  const reachableFromSource = reachableNodesFrom(sourceOccurrences, outgoing, (edge) => edge.target);
  if (!targetOccurrences.some((id) => reachableFromSource.has(id))) return undefined;
  const reachingTarget = reachableNodesFrom(targetOccurrences, incoming, (edge) => edge.source);
  const selected = new Set([...reachableFromSource].filter((id) => reachingTarget.has(id)));
  const edges = graph.edges.filter((edge) => selected.has(edge.source) && selected.has(edge.target));
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

function graphElementOccurrences(graph: RenderGraph, canonicalId: string): string[] {
  return Object.keys(graph.elements)
    .filter((id) => canonicalDiagramElementId(id) === canonicalId)
    .sort();
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

function reachableNodesFrom(
  starts: readonly string[],
  edgesByNode: ReadonlyMap<string, readonly RenderGraphEdge[]>,
  nextNode: (edge: RenderGraphEdge) => string,
): Set<string> {
  const result = new Set<string>();
  for (const start of starts) {
    for (const id of reachableNodes(start, edgesByNode, nextNode)) result.add(id);
  }
  return result;
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
