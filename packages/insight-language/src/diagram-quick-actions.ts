import { BUILTIN_VIEW_DEFINITIONS, BUILTIN_VIEW_QUERIES, builtinViewDefinition } from "./builtin-views.js";
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
import { declaredDeploymentEnvironments, materializeGroupedView, selectGraph } from "./query-engine.js";
import { TYPE_CAPABILITIES } from "./semantic-capabilities.js";
import { diagramOccurrenceId, parseDiagramOccurrenceId } from "./occurrence-identity.js";

interface DiagramQuickActionIndex {
  readonly elementsById: ReadonlyMap<string, LinkedElement>;
  readonly childrenByParent: ReadonlyMap<string, readonly LinkedElement[]>;
  readonly deploymentGraphs: Map<string, RenderGraph>;
  readonly completeGraphs: Map<string, RenderGraph>;
  completeDeploymentGraph?: RenderGraph;
  metadata?: DiagramQuickActionMetadata;
}

const indexes = new WeakMap<LinkProjectResult, DiagramQuickActionIndex>();
const deploymentContainerDefinition = builtinViewDefinition("deployment-container");
const allEnvironmentDeploymentPipeline = {
  boundary: deploymentContainerDefinition.boundary,
  stages: deploymentContainerDefinition.stages.filter((stage) => stage !== "deployment-environment"),
  ...(deploymentContainerDefinition.deploymentRootType === undefined
    ? {}
    : { deploymentRootType: deploymentContainerDefinition.deploymentRootType }),
};

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
  const index = diagramQuickActionIndex(result);
  if (index.metadata !== undefined) return index.metadata;
  const { elementsById, childrenByParent } = index;
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
      hasChildren: drillDownLevel(element, childrenByParent.get(element.id) ?? []) !== undefined,
      hasDeployment: hasDeploymentInScope(element.id),
      ...(element.declaration === undefined ? {} : { declaration: element.declaration }),
      isolateEligible: true,
      pathEligible: true,
    };
  }
  index.metadata = metadata;
  return metadata;
}

export function canonicalDiagramElementId(elementId: string): string {
  return parseDiagramOccurrenceId(elementId).canonicalId;
}

export function diagramElementOccurrenceEnvironment(
  result: LinkProjectResult,
  requestedElementId: string,
  preferredEnvironment?: string,
): string | undefined {
  const occurrence = parseDiagramOccurrenceId(requestedElementId);
  const index = diagramQuickActionIndex(result);
  if (occurrence.qualifier !== undefined) {
    const qualifierEnvironment = index.elementsById.get(occurrence.qualifier)?.context;
    if (qualifierEnvironment !== undefined) return qualifierEnvironment;
  }
  const element = index.elementsById.get(occurrence.canonicalId);
  if (element === undefined) return undefined;
  if (element.capabilities?.includes(TYPE_CAPABILITIES.infrastructure) === true) {
    return element.context;
  }
  if (preferredEnvironment === undefined) return undefined;
  const environments = new Set(
    (element.semanticAttributes?.["placement-owner"] ?? [])
      .flatMap((placement) => index.elementsById.get(placement)?.context ?? []),
  );
  if (environments.has(preferredEnvironment)) {
    return preferredEnvironment;
  }
  return environments.size === 1 ? [...environments][0] : undefined;
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
  const index = diagramQuickActionIndex(result);
  const root = index.elementsById.get(elementId);
  if (root === undefined) return emptyGraph("-");

  if (scope?.view !== undefined) {
    const graph = selectGraph(result, {
      ...scope,
      context: scope.context ?? root.context,
      tab: scope.tab ?? root.sourceIdentity,
    }, BUILTIN_VIEW_QUERIES[scope.view]);
    const occurrenceId = resolveGraphElementOccurrence(graph, requestedElementId, elementId);
    return occurrenceId === undefined
      ? emptyGraph(root.context)
      : isolateElementInGraph(graph, occurrenceId, root.context);
  }

  const selected = new Set([elementId]);
  const edges = result.edges.flatMap((edge) => {
    if (edge.projected === true || (edge.source !== elementId && edge.target !== elementId)) return [];
    selected.add(edge.source);
    selected.add(edge.target);
    return [renderEdge(edge)];
  });
  return isolatePresentationGraph({
    context: root.context,
    elements: selectedElements(selected, index.elementsById),
    edges: deduplicateEdges(edges),
    groups: [],
    externalElements: [],
  }, elementId);
}

/** Applies Isolate to an already projected diagram without rebuilding its view. */
export function selectIsolatedRenderGraph(
  graph: RenderGraph,
  requestedElementId: string,
): RenderGraph {
  const elementId = canonicalDiagramElementId(requestedElementId);
  const occurrenceId = resolveGraphElementOccurrence(graph, requestedElementId, elementId);
  return occurrenceId === undefined
    ? emptyGraph(graph.context)
    : isolateElementInGraph(graph, occurrenceId, graph.context);
}

/** Opens exactly the next logical architecture level below one boundary. */
export function selectElementDrillDown(
  result: LinkProjectResult,
  requestedElementId: string,
): RenderGraph {
  const elementId = canonicalDiagramElementId(requestedElementId);
  const index = diagramQuickActionIndex(result);
  const root = index.elementsById.get(elementId);
  if (root === undefined) return emptyGraph("-");

  const directChildren = (index.childrenByParent.get(elementId) ?? []);
  const level = drillDownLevel(root, directChildren);
  if (level === undefined) return emptyGraph(root.context);
  const visibleChildren = directChildren.filter((child) => elementHasType(child, level.visibleType));
  const visibleChildIds = new Set(visibleChildren.map((child) => child.id));
  const inside = new Set([elementId]);
  for (const child of visibleChildren) {
    for (const descendant of logicalDescendantIds(child.id, index.childrenByParent)) inside.add(descendant);
  }
  const selected = new Set([elementId, ...visibleChildIds]);
  const external = new Set<string>();
  const edges: RenderGraphEdge[] = [];
  for (const edge of result.edges) {
    if (edge.projected === true) continue;
    const sourceInside = inside.has(edge.source);
    const targetInside = inside.has(edge.target);
    if (!sourceInside && !targetInside) continue;
    const source = sourceInside
      ? openedDrillDownEndpoint(edge.source, elementId, visibleChildIds, index.elementsById)
      : closedDrillDownEndpoint(edge.source, level.boundaryType, index.elementsById);
    const target = targetInside
      ? openedDrillDownEndpoint(edge.target, elementId, visibleChildIds, index.elementsById)
      : closedDrillDownEndpoint(edge.target, level.boundaryType, index.elementsById);
    if (source === undefined || target === undefined || source === target) continue;
    selected.add(source);
    selected.add(target);
    if (!sourceInside) external.add(source);
    if (!targetInside) external.add(target);
    edges.push(renderEdge(edge, source, target, source !== edge.source || target !== edge.target));
  }
  const elements = selectedElements(selected, index.elementsById);
  return {
    context: root.context,
    elements,
    edges: deduplicateEdges(edges),
    groups: [{ owner: elementId, elements: [...visibleChildIds].sort() }],
    externalElements: [...external].filter((id) => elements[id] !== undefined).sort(),
  };
}

export function deploymentEnvironmentsForElement(
  result: LinkProjectResult,
  requestedElementId: string,
): readonly DeploymentEnvironment[] {
  const elementId = canonicalDiagramElementId(requestedElementId);
  const root = diagramQuickActionIndex(result).elementsById.get(elementId);
  if (root === undefined) return [];
  const candidates = declaredDeploymentEnvironments(result);
  return candidates.flatMap((environment) => {
    const graph = selectDeploymentGraph(result, elementId, environment.id);
    return Object.keys(graph.elements).length === 0
      ? []
      : [{ id: environment.id, ...(environment.name === undefined ? {} : { name: environment.name }) }];
  });
}

/** Environments containing concrete physical occurrences of the selected element. */
export function deploymentOccurrenceEnvironmentsForElement(
  result: LinkProjectResult,
  requestedElementId: string,
): readonly DeploymentEnvironment[] {
  const elementId = canonicalDiagramElementId(requestedElementId);
  const index = diagramQuickActionIndex(result);
  if (!index.elementsById.has(elementId)) return [];
  const graph = completeDeploymentGraph(result);
  const environmentIds = new Set(Object.keys(graph.elements)
    .filter((id) => canonicalDiagramElementId(id) === elementId)
    .flatMap((id) => [...graphOccurrenceEnvironments(graph, id, index.elementsById)]));
  return declaredDeploymentEnvironments(result)
    .filter((environment) => environmentIds.has(environment.id))
    .map((environment) => ({
      id: environment.id,
      ...(environment.name === undefined ? {} : { name: environment.name }),
    }));
}

export function selectDeploymentGraph(
  result: LinkProjectResult,
  requestedElementId: string,
  environment: string,
): RenderGraph {
  const elementId = canonicalDiagramElementId(requestedElementId);
  const index = diagramQuickActionIndex(result);
  const root = index.elementsById.get(elementId);
  if (root === undefined) return emptyGraph("-");
  const cacheKey = `${elementId}\0${environment}`;
  const cached = index.deploymentGraphs.get(cacheKey);
  if (cached !== undefined) return cached;
  const logicalScope = descendantIds(elementId, index.childrenByParent);
  const complete = completeDeploymentGraph(result);
  const graph = filterDeploymentGraph(complete, logicalScope, environment, index.elementsById, root.context);
  index.deploymentGraphs.set(cacheKey, graph);
  return graph;
}

export function deploymentFocusElementIds(
  result: LinkProjectResult,
  requestedElementId: string,
  graph: RenderGraph,
): readonly string[] {
  const rootElementId = canonicalDiagramElementId(requestedElementId);
  const elementsById = diagramQuickActionIndex(result).elementsById;
  const belongsToRoot = (elementId: string): boolean => {
    let current = elementsById.get(elementId);
    const visited = new Set<string>();
    while (current !== undefined && !visited.has(current.id)) {
      if (current.id === rootElementId) return true;
      visited.add(current.id);
      current = current.parent === undefined ? undefined : elementsById.get(current.parent);
    }
    return false;
  };
  return [...new Set(
    Object.keys(graph.elements)
      .map(canonicalDiagramElementId)
      .filter(belongsToRoot),
  )].sort();
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
  const index = diagramQuickActionIndex(result);
  const source = index.elementsById.get(sourceId);
  const target = index.elementsById.get(targetId);
  if (source === undefined || target === undefined) {
    return emptyGraph(source?.context ?? target?.context ?? "-");
  }
  const endpoints = endpointGraph(source, target);
  const sourceEnvironment = endpointEnvironments?.sourceEnvironment;
  const targetEnvironment = endpointEnvironments?.targetEnvironment;
  if (sourceEnvironment !== undefined || targetEnvironment !== undefined) {
    const deploymentGraph = {
      ...completeDeploymentGraph(result),
      context: scope?.context ?? source.context,
    };
    return directedPathCorridor(deploymentGraph, sourceId, targetId, endpointEnvironments, index.elementsById)
      ?? endpoints;
  }
  const scopedViewQuery = scope?.view === undefined ? undefined : BUILTIN_VIEW_QUERIES[scope.view];
  if (scope?.view !== undefined && scopedViewQuery !== undefined) {
    const viewGraph = selectGraph(result, {
      ...scope,
      context: scope.context ?? source.context,
      tab: scope.tab ?? source.sourceIdentity,
    }, scopedViewQuery);
    const corridor = directedPathCorridor(viewGraph, sourceId, targetId);
    if (corridor !== undefined) return corridor;
  }
  let completeGraph = index.completeGraphs.get(source.context);
  if (completeGraph === undefined) {
    completeGraph = {
      context: source.context,
      elements: Object.fromEntries(result.elements.map((element) => [element.id, element])),
      edges: result.edges.filter((edge) => edge.projected !== true).map((edge) => renderEdge(edge)),
      groups: [],
      externalElements: result.elements
        .filter((element) => element.context !== source.context)
        .map((element) => element.id),
    };
    index.completeGraphs.set(source.context, completeGraph);
  }
  return directedPathCorridor(completeGraph, sourceId, targetId) ?? endpoints;
}

function directedPathCorridor(
  graph: RenderGraph,
  sourceId: string,
  targetId: string,
  endpointEnvironments?: PathEndpointEnvironments,
  elementsById?: ReadonlyMap<string, LinkedElement>,
): RenderGraph | undefined {
  const sourceOccurrences = graphElementOccurrences(
    graph,
    sourceId,
    endpointEnvironments?.sourceEnvironment,
    elementsById,
  );
  const targetOccurrences = graphElementOccurrences(
    graph,
    targetId,
    endpointEnvironments?.targetEnvironment,
    elementsById,
  );
  if (sourceOccurrences.length === 0 || targetOccurrences.length === 0) return undefined;
  const sourceOccurrenceSet = new Set(sourceOccurrences);
  const targetOccurrenceSet = new Set(targetOccurrences);
  const outgoing = new Map<string, RenderGraphEdge[]>();
  const incoming = new Map<string, RenderGraphEdge[]>();
  for (const edge of graph.edges) {
    if (sourceOccurrenceSet.has(edge.target) || targetOccurrenceSet.has(edge.source)) continue;
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
  const candidateNodes = new Set([...reachableFromSource].filter((id) => reachingTarget.has(id)));
  const candidateEdges = graph.edges.filter((edge) =>
    candidateNodes.has(edge.source)
      && candidateNodes.has(edge.target)
      && !sourceOccurrenceSet.has(edge.target)
      && !targetOccurrenceSet.has(edge.source)
  );
  const edges = graphHasCycle(candidateNodes, candidateEdges)
    ? edgesOnSimplePaths(sourceOccurrences, targetOccurrenceSet, candidateEdges)
    : candidateEdges;
  if (edges.length === 0) return undefined;
  const selected = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  addContainingGroupOwners(graph, selected);
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

const MAX_SIMPLE_PATH_EDGE_CHECKS = 1_000_000;

function graphHasCycle(nodes: ReadonlySet<string>, edges: readonly RenderGraphEdge[]): boolean {
  const indegree = new Map([...nodes].map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    const targets = outgoing.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
  }
  const pending = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
  let visited = 0;
  for (let index = 0; index < pending.length; index++) {
    const current = pending[index]!;
    visited++;
    for (const target of outgoing.get(current) ?? []) {
      const nextDegree = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, nextDegree);
      if (nextDegree === 0) pending.push(target);
    }
  }
  return visited !== nodes.size;
}

function edgesOnSimplePaths(
  sources: readonly string[],
  targets: ReadonlySet<string>,
  edges: readonly RenderGraphEdge[],
): RenderGraphEdge[] {
  const outgoing = new Map<string, RenderGraphEdge[]>();
  for (const edge of edges) {
    const sourceEdges = outgoing.get(edge.source) ?? [];
    sourceEdges.push(edge);
    outgoing.set(edge.source, sourceEdges);
  }
  const selected = new Set<RenderGraphEdge>();
  let edgeChecks = 0;
  for (const source of sources) {
    const visited = new Set([source]);
    const path: RenderGraphEdge[] = [];
    const stack: Array<{ readonly node: string; nextEdge: number }> = [{ node: source, nextEdge: 0 }];
    while (stack.length > 0) {
      const frame = stack.at(-1)!;
      if (targets.has(frame.node)) {
        for (const edge of path) selected.add(edge);
        backtrackSimplePath(stack, visited, path);
        continue;
      }
      const candidates = outgoing.get(frame.node) ?? [];
      if (frame.nextEdge >= candidates.length) {
        backtrackSimplePath(stack, visited, path);
        continue;
      }
      const edge = candidates[frame.nextEdge]!;
      frame.nextEdge++;
      edgeChecks++;
      if (edgeChecks > MAX_SIMPLE_PATH_EDGE_CHECKS) {
        throw new Error(`Find path exceeded ${MAX_SIMPLE_PATH_EDGE_CHECKS} edge checks while resolving cyclic routes`);
      }
      if (visited.has(edge.target)) continue;
      visited.add(edge.target);
      path.push(edge);
      stack.push({ node: edge.target, nextEdge: 0 });
    }
  }
  return edges.filter((edge) => selected.has(edge));
}

function backtrackSimplePath(
  stack: Array<{ readonly node: string; nextEdge: number }>,
  visited: Set<string>,
  path: RenderGraphEdge[],
): void {
  const removed = stack.pop();
  if (removed === undefined || stack.length === 0) return;
  visited.delete(removed.node);
  path.pop();
}

function graphElementOccurrences(
  graph: RenderGraph,
  canonicalId: string,
  environment?: string,
  elementsById?: ReadonlyMap<string, LinkedElement>,
): string[] {
  return Object.keys(graph.elements)
    .filter((id) => canonicalDiagramElementId(id) === canonicalId)
    .filter((id) => environment === undefined
      || (elementsById !== undefined && graphOccurrenceEnvironments(graph, id, elementsById).has(environment)))
    .sort();
}

function graphOccurrenceEnvironments(
  graph: RenderGraph,
  occurrenceId: string,
  elementsById: ReadonlyMap<string, LinkedElement>,
): ReadonlySet<string> {
  const environments = new Set<string>();
  const occurrence = parseDiagramOccurrenceId(occurrenceId);
  if (occurrence.qualifier !== undefined) {
    const qualifierEnvironment = elementsById.get(occurrence.qualifier)?.context;
    if (qualifierEnvironment !== undefined) environments.add(qualifierEnvironment);
    if (environments.size > 0) return environments;
  }
  for (const group of graph.groups) {
    if (!group.elements.includes(occurrenceId)) continue;
    const groupEnvironment = elementsById.get(group.owner)?.context;
    if (groupEnvironment !== undefined) environments.add(groupEnvironment);
  }
  if (environments.size > 0) return environments;
  const element = graph.elements[occurrenceId] ?? elementsById.get(occurrence.canonicalId);
  for (const placement of element?.semanticAttributes?.["placement-owner"] ?? []) {
    const placementEnvironment = elementsById.get(placement)?.context;
    if (placementEnvironment !== undefined) environments.add(placementEnvironment);
  }
  if (element?.capabilities?.includes(TYPE_CAPABILITIES.infrastructure) === true) {
    environments.add(element.context);
  }
  return environments;
}

function resolveGraphElementOccurrence(
  graph: RenderGraph,
  requestedElementId: string,
  canonicalId: string,
): string | undefined {
  if (graph.elements[requestedElementId] !== undefined) return requestedElementId;
  return graphElementOccurrences(graph, canonicalId)[0];
}

function isolateElementInGraph(graph: RenderGraph, elementId: string, context: string): RenderGraph {
  if (graph.elements[elementId] === undefined) return emptyGraph(context);
  const edges = graph.edges.filter((edge) => edge.source === elementId || edge.target === elementId);
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
  return diagramOccurrenceId(elementId, `isolate-${role}`);
}

function reachableNodesFrom(
  starts: readonly string[],
  edgesByNode: ReadonlyMap<string, readonly RenderGraphEdge[]>,
  nextNode: (edge: RenderGraphEdge) => string,
): Set<string> {
  const pending = [...new Set(starts)];
  const result = new Set(pending);
  for (let index = 0; index < pending.length; index++) {
    for (const edge of edgesByNode.get(pending[index]!) ?? []) {
      const next = nextNode(edge);
      if (result.has(next)) continue;
      result.add(next);
      pending.push(next);
    }
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

function filterDeploymentGraph(
  graph: RenderGraph,
  logicalScope: ReadonlySet<string>,
  environment: string,
  elementsById: ReadonlyMap<string, LinkedElement>,
  context: string,
): RenderGraph {
  const environmentGroups = graph.groups.filter((group) =>
    elementsById.get(group.owner)?.context === environment
  );
  const groupedInEnvironment = new Set(environmentGroups.flatMap((group) => group.elements));
  const environmentEdges = graph.edges.filter((edge) => deploymentEdgeInEnvironment(edge, environment, elementsById));
  const environmentEdgeEndpoints = new Set(environmentEdges.flatMap((edge) => [edge.source, edge.target]));
  const focusIds = new Set(Object.keys(graph.elements)
    .filter((id) => logicalScope.has(canonicalDiagramElementId(id)))
    .filter((id) => groupedInEnvironment.has(id)
      || deploymentOccurrenceEnvironment(id, elementsById) === environment
      || environmentEdgeEndpoints.has(id)));
  const selectedIds = new Set(focusIds);
  const selectedEdges = environmentEdges.filter((edge) => focusIds.has(edge.source) || focusIds.has(edge.target));
  for (const edge of selectedEdges) {
    selectedIds.add(edge.source);
    selectedIds.add(edge.target);
  }
  addContainingGroupOwners(graph, selectedIds);
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
    context,
    elements,
    edges: selectedEdges.filter((edge) => elements[edge.source] !== undefined && elements[edge.target] !== undefined),
    groups,
    externalElements: [...external].sort(),
  };
}

function deploymentEdgeInEnvironment(
  edge: RenderGraphEdge,
  environment: string,
  elementsById: ReadonlyMap<string, LinkedElement>,
): boolean {
  const scopes = [edge.edge.projectionRoot, edge.edge.sourcePlacement, edge.edge.targetPlacement]
    .filter((id): id is string => id !== undefined);
  if (scopes.some((id) => elementsById.get(id)?.context === environment)) return true;
  return [edge.source, edge.target]
    .some((id) => deploymentOccurrenceEnvironment(id, elementsById) === environment);
}

function deploymentOccurrenceEnvironment(
  id: string,
  elementsById: ReadonlyMap<string, LinkedElement>,
): string | undefined {
  const occurrence = parseDiagramOccurrenceId(id);
  if (occurrence.qualifier !== undefined) return elementsById.get(occurrence.qualifier)?.context;
  const element = elementsById.get(occurrence.canonicalId);
  if (element?.capabilities?.includes(TYPE_CAPABILITIES.infrastructure) === true) return element.context;
  const placements = element?.semanticAttributes?.["placement-owner"] ?? [];
  return placements.length === 1 ? elementsById.get(placements[0]!)?.context : undefined;
}

function completeDeploymentGraph(result: LinkProjectResult): RenderGraph {
  const index = diagramQuickActionIndex(result);
  if (index.completeDeploymentGraph !== undefined) return index.completeDeploymentGraph;
  const graphs = Object.keys(result.tabRoots).sort().map((tab) => selectGraph(result, {
    context: index.elementsById.get(result.tabRoots[tab]?.[0] ?? "")?.context ?? "",
    tab,
    view: "deployment-container",
    pipeline: allEnvironmentDeploymentPipeline,
  }, BUILTIN_VIEW_QUERIES["deployment-container"]));
  const groupsByOwner = new Map<string, Set<string>>();
  for (const group of graphs.flatMap((graph) => graph.groups)) {
    const owner = canonicalDiagramElementId(group.owner);
    const members = groupsByOwner.get(owner) ?? new Set<string>();
    for (const member of group.elements) members.add(canonicalDiagramElementId(member));
    groupsByOwner.set(owner, members);
  }
  const edges = new Map<string, RenderGraphEdge>();
  for (const edge of graphs.flatMap((graph) => graph.edges)) {
    const source = canonicalDiagramElementId(edge.source);
    const target = canonicalDiagramElementId(edge.target);
    edges.set(`${edge.edge.id}\0${source}\0${target}\0${edge.derived}\0${edge.projected}`, {
      ...edge,
      source,
      target,
    });
  }
  const selectedCanonicalIds = new Set(graphs.flatMap((graph) => Object.keys(graph.elements).map(canonicalDiagramElementId)));
  const dematerialized: RenderGraph = {
    context: "",
    elements: Object.fromEntries([...selectedCanonicalIds]
      .sort()
      .flatMap((id) => {
        const element = index.elementsById.get(id);
        return element === undefined ? [] : [[id, element]];
      })),
    edges: [...edges.values()],
    groups: [...groupsByOwner].map(([owner, members]) => ({ owner, elements: [...members].sort() })),
    externalElements: [...new Set(graphs.flatMap((graph) => graph.externalElements.map(canonicalDiagramElementId)))].sort(),
  };
  const complete = materializeGroupedView(dematerialized);
  index.completeDeploymentGraph = complete;
  return complete;
}

function childrenIndex(elements: readonly LinkedElement[]): Map<string, readonly LinkedElement[]> {
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

interface DrillDownLevel {
  readonly boundaryType: string;
  readonly visibleType: string;
}

function drillDownLevel(
  root: LinkedElement,
  children: readonly LinkedElement[],
): DrillDownLevel | undefined {
  for (const definition of BUILTIN_VIEW_DEFINITIONS) {
    const boundary = definition.boundary;
    if (boundary === null || !elementHasType(root, boundary.boundaryType)) continue;
    if (children.some((child) => elementHasType(child, boundary.visibleType))) return boundary;
  }
  return undefined;
}

function logicalDescendantIds(
  root: string,
  childrenByParent: ReadonlyMap<string, readonly LinkedElement[]>,
): Set<string> {
  const result = new Set<string>();
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    for (const child of childrenByParent.get(current) ?? []) {
      if (isLogicalElement(child)) pending.push(child.id);
    }
  }
  return result;
}

function openedDrillDownEndpoint(
  id: string,
  root: string,
  visibleChildren: ReadonlySet<string>,
  elementsById: ReadonlyMap<string, LinkedElement>,
): string | undefined {
  let current = elementsById.get(id);
  const visited = new Set<string>();
  while (current !== undefined && !visited.has(current.id)) {
    if (current.id === root || visibleChildren.has(current.id)) return current.id;
    visited.add(current.id);
    current = current.parent === undefined ? undefined : elementsById.get(current.parent);
  }
  return undefined;
}

function closedDrillDownEndpoint(
  id: string,
  boundaryType: string,
  elementsById: ReadonlyMap<string, LinkedElement>,
): string {
  let current = elementsById.get(id);
  const visited = new Set<string>();
  while (current !== undefined && !visited.has(current.id)) {
    if (elementHasType(current, boundaryType)) return current.id;
    visited.add(current.id);
    current = current.parent === undefined ? undefined : elementsById.get(current.parent);
  }
  return id;
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

function renderEdge(
  edge: LinkedEdge,
  source = edge.source,
  target = edge.target,
  derived = false,
): RenderGraphEdge {
  return { edge, source, target, derived, projected: edge.projected === true };
}

function deduplicateEdges(edges: readonly RenderGraphEdge[]): RenderGraphEdge[] {
  return [...new Map(edges.map((edge) => [edge.edge.id, edge])).values()];
}

function elementHasDeployment(element: LinkedElement): boolean {
  return element.deployed === true;
}

function isLogicalElement(element: LinkedElement | undefined): boolean {
  return element !== undefined
    && element.capabilities?.includes(TYPE_CAPABILITIES.deploymentElement) !== true;
}

function elementHasType(element: LinkedElement | undefined, type: string): boolean {
  return element !== undefined && (element.type === type || element.baseTypes.includes(type));
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

function diagramQuickActionIndex(result: LinkProjectResult): DiagramQuickActionIndex {
  const cached = indexes.get(result);
  if (cached !== undefined) return cached;
  const created: DiagramQuickActionIndex = {
    elementsById: new Map(result.elements.map((element) => [element.id, element])),
    childrenByParent: childrenIndex(result.elements),
    deploymentGraphs: new Map(),
    completeGraphs: new Map(),
  };
  indexes.set(result, created);
  return created;
}

function addContainingGroupOwners(graph: RenderGraph, selected: Set<string>): void {
  const ownersByMember = new Map<string, string[]>();
  for (const group of graph.groups) {
    for (const member of group.elements) {
      const owners = ownersByMember.get(member) ?? [];
      owners.push(group.owner);
      ownersByMember.set(member, owners);
    }
  }
  const pending = [...selected];
  for (let index = 0; index < pending.length; index++) {
    for (const owner of ownersByMember.get(pending[index]!) ?? []) {
      if (selected.has(owner) || graph.elements[owner] === undefined) continue;
      selected.add(owner);
      pending.push(owner);
    }
  }
}
