import type {
  DeploymentEnvironment,
  LinkedContext,
  LinkedEdge,
  LinkedElement,
  LinkProjectResult,
  QueryScope,
  RenderGraph,
  RenderGraphEdge,
  RenderGraphGroup,
} from "./contracts.js";
import type { GraphNode, GraphRelation } from "./indexed-graph.js";
import { linkedElementIsExplicitlyExternal } from "./externality.js";
import {
  queryViewPipeline,
  type ViewBoundaryDefinition,
} from "./builtin-views.js";
import {
  parseQuery,
  type Expression,
  type MatchClause,
  type NodePattern,
  type ParsedQuery,
  type QueryPattern,
  type QueryValue,
  type RelationshipPattern,
  type ValueExpression,
} from "./query-syntax.js";
import {
  createQueryExecutionContext,
  type QueryExecutionContext,
} from "./query-execution-context.js";
import { runQueryViewPipeline } from "./query-view-pipeline.js";
import { ATTRIBUTE_CAPABILITIES, TYPE_CAPABILITIES } from "./semantic-capabilities.js";

export const DEFAULT_QUERY = "MATCH (n:Element {context: $context}) RETURN n";

interface Row {
  readonly nodes: Readonly<Record<string, QueryNode>>;
  readonly relationships: Readonly<Record<string, QueryRelationship>>;
}

interface RollupEndpoint {
  readonly id: string;
  readonly binding: QueryNode;
}

interface EvaluationContext extends QueryExecutionContext {
  readonly nodes: readonly QueryNode[];
  readonly nodeById: ReadonlyMap<string, QueryNode>;
  readonly relationships: readonly QueryRelationship[];
}

interface QueryRelationship {
  readonly edge?: LinkedEdge;
  readonly originSource?: string;
  readonly originTarget?: string;
  readonly source: string;
  readonly target: string;
  readonly kind: string;
  readonly type?: string;
  readonly context?: string;
  readonly derived: boolean;
  readonly projected: boolean;
}

type QueryNode =
  | { readonly kind: "element"; readonly id: string; readonly element: LinkedElement }
  | { readonly kind: "context"; readonly id: string; readonly context: string; readonly sourceIdentity: string; readonly attributes: Readonly<Record<string, readonly string[]>> }
  | { readonly kind: "source"; readonly id: string; readonly sourceIdentity: string }
  | { readonly kind: "type"; readonly id: string; readonly type: string; readonly baseTypes: readonly string[] };

export function selectGraph(
  result: LinkProjectResult,
  scope: QueryScope,
  query: string | undefined,
): RenderGraph {
  const parsed = parseQuery(query === undefined || query.trim() === "" ? DEFAULT_QUERY : query);
  const execution = evaluationContext(createQueryExecutionContext(result, scope));
  const rows = evaluate(execution, parsed);
  const selectedElements = new Map<string, LinkedElement>();
  const selectedEdges: RenderGraphEdge[] = [];
  const selectedEdgeIdentities = new Map<LinkedEdge, Set<string>>();
  const returnedRelationshipPatterns = relationshipPatternsReturnedBy(parsed);
  const selectedStructuralRelationships = new Set<string>();
  const groups = new Map<string, RenderGraphGroup>();
  const nodeById = execution.nodeById;

  for (const row of rows) {
    for (const alias of parsed.returns) {
      const node = row.nodes[alias];
      if (node !== undefined) {
        const element = linkedElementForNode(node);
        if (element !== undefined) {
          selectedElements.set(node.id, element);
        }
      }
      const edge = row.relationships[alias];
      if (edge !== undefined) {
        const source = linkedElementForNode(nodeById.get(edge.source));
        const target = linkedElementForNode(nodeById.get(edge.target));
        if (source !== undefined) {
          selectedElements.set(edge.source, source);
        }
        if (target !== undefined) {
          selectedElements.set(edge.target, target);
        }
        if (edge.edge !== undefined) {
          addSelectedEdge(selectedEdges, {
            edge: contextualLinkedEdge(edge),
            source: edge.source,
            target: edge.target,
            derived: edge.derived,
            projected: edge.projected,
          }, edge.edge, selectedEdgeIdentities);
        } else if (returnedRelationshipPatterns.has(alias)) {
          selectedStructuralRelationships.add(alias);
        }
      }
    }
    if (parsed.groupBy !== undefined) {
      collectGroup(groups, row, parsed.groupBy, scope);
    }
  }
  let groupedSelectedElements: ReadonlySet<string> = new Set<string>();
  if (parsed.groupBy !== undefined) {
    groupedSelectedElements = collectSelectedReferenceGroups(selectedElements, selectedEdges, groups, parsed.groupBy);
    for (const owner of completeReferenceGroupClosure(execution.nodeById, groups, parsed.groupBy)) {
      const element = linkedElementForNode(nodeById.get(owner));
      if (element !== undefined) {
        selectedElements.set(owner, element);
      }
    }
  }

  const completedEdges = selectedEdges.length > 0
    ? selectedEdges
    : hasAuthoritativeEdgeSelection(returnedRelationshipPatterns, selectedStructuralRelationships)
      ? []
      : result.edges
        .filter((edge) => edge.projected !== true && selectedElements.has(edge.source) && selectedElements.has(edge.target))
        .map((edge) => ({ edge, source: edge.source, target: edge.target, derived: false, projected: false }));
  const internalElementIds = new Set([...internalElements(result, rows, parsed)]
    .filter((id) => selectedElements.has(id)));
  const externalElements = [...selectedElements.entries()]
    .filter(([id, element]) => explicitlyExternal(element)
      || (!internalElementIds.has(id) && !groupedSelectedElements.has(id)))
    .map(([id]) => id);
  const selectedGraph: RenderGraph = {
    context: scope.context ?? "",
    elements: Object.fromEntries(selectedElements),
    edges: completedEdges,
    groups: [...groups.values()].map((group) => ({
      ...group,
      elements: group.elements.filter((id) => selectedElements.has(id)),
    })).filter((group) => group.elements.length > 0),
    externalElements,
  };
  return runQueryViewPipeline(result, scope, selectedGraph, {
    applyBoundary: (_result, graph) => applyViewBoundary(execution, graph),
    filterDeploymentSeeds: removeDescendantProjectionsCapturedBySystemSeeds,
    materializeGroups: materializeGroupedView,
    applyEnvironment: (_result, graph) => applyDeploymentEnvironmentScope(execution, graph),
    rollUpSystems: (_result, graph) => rollUpDeploymentSystems(execution, graph),
    simplifyInfrastructure: (_result, graph) => simplifyDeploymentSystemInfrastructure(execution, graph),
  });
}

function removeDescendantProjectionsCapturedBySystemSeeds(
  result: LinkProjectResult,
  graph: RenderGraph,
  scope: QueryScope,
): RenderGraph {
  const sourceSystems = new Set(result.elements
    .filter((element) => element.sourceIdentity === scope.tab && elementHasType(element, "SystemElement"))
    .map((element) => element.id));
  const edges = graph.edges.filter((edge) => {
    const originSource = edge.edge.originSource ?? edge.edge.source;
    const originTarget = edge.edge.originTarget ?? edge.edge.target;
    return ![edge.source, edge.target].some((endpoint) => {
      const system = baseOccurrenceId(endpoint);
      return sourceSystems.has(system) && originSource !== system && originTarget !== system;
    });
  });
  const referenced = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  const grouped = new Set(graph.groups.flatMap((group) => group.elements));
  const retained = new Set(Object.keys(graph.elements).filter((id) =>
    referenced.has(id) || grouped.has(id) || !sourceSystems.has(baseOccurrenceId(id))
  ));
  return {
    ...graph,
    elements: Object.fromEntries(Object.entries(graph.elements).filter(([id]) => retained.has(id))),
    edges,
    groups: graph.groups.map((group) => ({
      ...group,
      elements: group.elements.filter((id) => retained.has(id)),
    })).filter((group) => group.elements.length > 0),
    externalElements: graph.externalElements.filter((id) => retained.has(id)),
  };
}

export function discoverDeploymentEnvironments(
  result: LinkProjectResult,
  scope: Pick<QueryScope, "context" | "tab">,
): readonly DeploymentEnvironment[] {
  const execution = createQueryExecutionContext(result, scope);
  const closure = execution.tabClosure;
  const elementsById = execution.elementsById;
  const environmentIds = new Set<string>();
  const wireEnvironmentIds = new Set<string>();

  for (const element of result.elements) {
    if (!closure.has(element.id) || element.deployed !== true) {
      continue;
    }
    for (const targetId of [
      ...semanticAttribute(element, ATTRIBUTE_CAPABILITIES.placementOwner),
      ...semanticAttribute(element, ATTRIBUTE_CAPABILITIES.infrastructureUses),
    ]) {
      const target = elementsById.get(targetId);
      if (target !== undefined && target.context !== element.context) {
        environmentIds.add(target.context);
      }
    }
  }

  for (const edge of result.edges) {
    if (edge.projected === true || edge.sourceIdentity !== scope.tab) {
      continue;
    }
    for (const targetId of semanticAttribute(edge, ATTRIBUTE_CAPABILITIES.infrastructureUses)) {
      const target = elementsById.get(targetId);
      if (target !== undefined && target.context !== elementsById.get(edge.source)?.context) {
        wireEnvironmentIds.add(target.context);
      }
    }
  }

  for (const context of result.contexts) {
    const ownsConcreteDeployment = result.elements.some((element) =>
      element.context === context.id && elementHasCapability(element, TYPE_CAPABILITIES.deployment)
    );
    if (context.synthetic !== true && context.sourceIdentity === scope.tab
        && (context.capabilities?.includes(TYPE_CAPABILITIES.environment) === true || ownsConcreteDeployment)) {
      environmentIds.add(context.id);
    }
  }
  if (environmentIds.size === 0) {
    for (const environment of wireEnvironmentIds) {
      environmentIds.add(environment);
    }
  }

  const contextsById = execution.contextsById;
  const environmentNamesByContext = new Map<string, string>();
  for (const element of result.elements) {
    if (element.synthetic === true || element.parent !== undefined
        || !elementHasCapability(element, TYPE_CAPABILITIES.environment)) {
      continue;
    }
    const name = element.attributes.name?.[0];
    if (name !== undefined) {
      environmentNamesByContext.set(element.context, name);
    }
  }
  return [...environmentIds]
    .map((id) => {
      const name = environmentNamesByContext.get(id) ?? contextsById.get(id)?.attributes.name?.[0];
      return { id, ...(name === undefined ? {} : { name }) };
    })
    .sort((left, right) => (left.name ?? left.id).localeCompare(right.name ?? right.id) || left.id.localeCompare(right.id));
}

function relationshipPatternsReturnedBy(query: ParsedQuery): ReadonlyMap<string, RelationshipPattern> {
  const returned = new Set(query.returns);
  return new Map(query.matches.flatMap((match) => {
    const relationship = match.pattern.relationship;
    return relationship?.alias !== undefined && returned.has(relationship.alias)
      ? [[relationship.alias, relationship] as const]
      : [];
  }));
}

function hasAuthoritativeEdgeSelection(
  returned: ReadonlyMap<string, RelationshipPattern>,
  selectedStructuralRelationships: ReadonlySet<string>,
): boolean {
  return [...returned].some(([alias, pattern]) =>
    pattern.type === "REFERENCES"
      || (pattern.type === undefined && !selectedStructuralRelationships.has(alias))
  );
}

export function selectGraphs(
  result: LinkProjectResult,
  scopes: readonly QueryScope[],
  query: string | undefined,
): ReadonlyMap<QueryScope, RenderGraph> {
  return new Map(scopes.map((scope) => [scope, selectGraph(result, scope, query)]));
}

function addSelectedEdge(
  edges: RenderGraphEdge[],
  next: RenderGraphEdge,
  identity: LinkedEdge,
  identities: Map<LinkedEdge, Set<string>>,
): void {
  const endpointKey = `${next.source}\0${next.target}`;
  const selectedEndpoints = identities.get(identity) ?? new Set<string>();
  if (selectedEndpoints.has(endpointKey)) {
    return;
  }
  selectedEndpoints.add(endpointKey);
  identities.set(identity, selectedEndpoints);
  edges.push(next);
}

function contextualLinkedEdge(relationship: QueryRelationship): LinkedEdge {
  const edge = relationship.edge!;
  const originSource = relationship.originSource ?? edge.originSource;
  const originTarget = relationship.originTarget ?? edge.originTarget;
  if (originSource === edge.originSource && originTarget === edge.originTarget) {
    return edge;
  }
  return {
    ...edge,
    ...(originSource === undefined ? {} : { originSource }),
    ...(originTarget === undefined ? {} : { originTarget }),
  };
}

function materializeGroupedView(graph: RenderGraph, materializeDeploymentPlacements = true): RenderGraph {
  const groupsByElement = new Map<string, RenderGraphGroup[]>();
  for (const group of graph.groups) {
    for (const element of group.elements) {
      groupsByElement.set(element, [...(groupsByElement.get(element) ?? []), group]);
    }
  }
  const placementMaterializationRequired = materializeDeploymentPlacements && [...groupsByElement].some(([elementId]) => {
    const element = graph.elements[elementId];
    return element?.deployed === true && (element.attributes.runsOn?.length ?? 0) > 1;
  });
  const clonedElementIds = new Set([...groupsByElement].flatMap(([elementId, memberships]) => {
    const element = graph.elements[elementId];
    return memberships.length > 1 || (placementMaterializationRequired && element?.deployed === true)
      ? [elementId]
      : [];
  }));
  if (clonedElementIds.size === 0) {
    return graph;
  }
  const cloneIdsByElementAndGroup = new Map<string, string>();
  for (const [elementId, memberships] of groupsByElement) {
    if (!clonedElementIds.has(elementId)) {
      continue;
    }
    for (const group of memberships) {
      cloneIdsByElementAndGroup.set(groupedCloneKey(elementId, group.owner), groupedCloneId(elementId, group.owner));
    }
  }
  if (cloneIdsByElementAndGroup.size === 0) {
    return graph;
  }

  const elements: Record<string, LinkedElement> = { ...graph.elements };
  for (const [elementId, memberships] of groupsByElement) {
    const element = graph.elements[elementId];
    if (element === undefined || !clonedElementIds.has(elementId)) {
      continue;
    }
    for (const group of memberships) {
      const cloneId = groupedCloneId(elementId, group.owner);
      elements[cloneId] = {
        ...element,
        id: cloneId,
        attributes: {
          ...element.attributes,
          projectedFrom: [element.id],
        },
      };
    }
  }

  const groups = graph.groups.map((group) => ({
    ...group,
    elements: group.elements.map((element) => cloneIdsByElementAndGroup.get(groupedCloneKey(element, group.owner)) ?? element),
  }));
  const edges = graph.edges.map((edge) => ({
    ...edge,
    source: cloneEndpoint(edge.source, edge.edge.sourcePlacement, cloneIdsByElementAndGroup),
    target: cloneEndpoint(edge.target, edge.edge.targetPlacement, cloneIdsByElementAndGroup),
  }));
  const referenced = new Set<string>([
    ...groups.flatMap((group) => group.elements),
    ...edges.flatMap((edge) => [edge.source, edge.target]),
  ]);
  for (const elementId of clonedElementIds) {
    if (!referenced.has(elementId)) {
      delete elements[elementId];
    }
  }
  return {
    ...graph,
    elements,
    edges,
    groups,
    externalElements: graph.externalElements.flatMap((element) => {
      const memberships = groupsByElement.get(element) ?? [];
      const clones = memberships.flatMap((group) => {
        const clone = cloneIdsByElementAndGroup.get(groupedCloneKey(element, group.owner));
        return clone === undefined ? [] : [clone];
      });
      return elements[element] === undefined ? clones : [element, ...clones];
    }),
  };
}

function cloneEndpoint(
  elementId: string,
  projectionScope: string | undefined,
  cloneIdsByElementAndGroup: ReadonlyMap<string, string>,
): string {
  return projectionScope === undefined
    ? elementId
    : cloneIdsByElementAndGroup.get(groupedCloneKey(elementId, projectionScope)) ?? elementId;
}

function groupedCloneKey(elementId: string, groupOwner: string): string {
  return `${elementId}\0${groupOwner}`;
}

function groupedCloneId(elementId: string, groupOwner: string): string {
  return `${elementId}@@${groupOwner}`;
}

function applyDeploymentEnvironmentScope(
  context: EvaluationContext,
  graph: RenderGraph,
): RenderGraph {
  const { result, scope, elementsById } = context;
  const environments = discoverDeploymentEnvironments(result, scope);
  const environment = scope.environment ?? (environments.length === 1 ? environments[0]?.id : undefined);
  if (environment === undefined) {
    return emptyScopedGraph(graph);
  }
  if (!environments.some((candidate) => candidate.id === environment)) {
    return emptyScopedGraph(graph);
  }

  const sourceElements = context.tabClosure;
  const groups = graph.groups.filter((group) => elementEnvironment(group.owner, elementsById) === environment);
  const selectedIds = new Set(groups.flatMap((group) => [group.owner, ...group.elements]));
  const candidateEdges = graph.edges.filter((edge) => deploymentEdgeInEnvironment(edge, environment, elementsById));
  const edges = candidateEdges.filter((edge) => {
    const sourceAllowed = deploymentEndpointAllowed(edge.source, environment, elementsById);
    const targetAllowed = deploymentEndpointAllowed(edge.target, environment, elementsById);
    return sourceAllowed && targetAllowed;
  });
  for (const edge of edges) {
    selectedIds.add(edge.source);
    selectedIds.add(edge.target);
  }

  const elements = Object.fromEntries(Object.entries(graph.elements).filter(([id]) => selectedIds.has(id)));
  const externalElements = new Set(graph.externalElements.filter((id) => selectedIds.has(id)));
  for (const id of selectedIds) {
    const occurrenceEnvironment = deploymentOccurrenceEnvironment(id, elementsById);
    if (occurrenceEnvironment !== undefined && occurrenceEnvironment !== environment
        && isLogicalDeploymentEndpoint(id, elementsById)) {
      externalElements.add(id);
    }
    if (isLogicalDeploymentEndpoint(id, elementsById) && !sourceElements.has(baseOccurrenceId(id))) {
      externalElements.add(id);
    }
  }
  return {
    ...graph,
    elements,
    edges,
    groups: groups.map((group) => ({ ...group, elements: group.elements.filter((id) => selectedIds.has(id)) })),
    externalElements: [...externalElements],
  };
}

function emptyScopedGraph(graph: RenderGraph): RenderGraph {
  return { ...graph, elements: {}, edges: [], groups: [], externalElements: [] };
}

function deploymentEdgeInEnvironment(
  edge: RenderGraphEdge,
  environment: string,
  elementsById: ReadonlyMap<string, LinkedElement>,
): boolean {
  const scopes = [edge.edge.projectionRoot, edge.edge.sourcePlacement, edge.edge.targetPlacement]
    .filter((id): id is string => id !== undefined);
  if (scopes.some((id) => elementEnvironment(id, elementsById) === environment)) {
    return true;
  }
  return [edge.source, edge.target]
    .some((id) => elementEnvironment(id, elementsById) === environment);
}

function deploymentEndpointAllowed(
  id: string,
  environment: string,
  elementsById: ReadonlyMap<string, LinkedElement>,
): boolean {
  return isLogicalDeploymentEndpoint(id, elementsById)
    || elementEnvironment(id, elementsById) === environment;
}

function isLogicalDeploymentEndpoint(id: string, elementsById: ReadonlyMap<string, LinkedElement>): boolean {
  const element = elementsById.get(baseOccurrenceId(id));
  return element !== undefined && !elementHasCapability(element, TYPE_CAPABILITIES.infrastructure);
}

function deploymentOccurrenceEnvironment(
  id: string,
  elementsById: ReadonlyMap<string, LinkedElement>,
): string | undefined {
  const separator = id.indexOf("@@");
  if (separator >= 0) {
    return elementEnvironment(id.slice(separator + 2), elementsById);
  }
  const runsOn = semanticAttribute(elementsById.get(id), ATTRIBUTE_CAPABILITIES.placementOwner);
  return runsOn.length === 1 ? elementEnvironment(runsOn[0]!, elementsById) : undefined;
}

function elementEnvironment(
  id: string,
  elementsById: ReadonlyMap<string, LinkedElement>,
): string | undefined {
  return elementsById.get(baseOccurrenceId(id))?.context;
}

function baseOccurrenceId(id: string): string {
  const separator = id.indexOf("@@");
  return separator < 0 ? id : id.slice(0, separator);
}

function rollUpDeploymentSystems(context: EvaluationContext, graph: RenderGraph): RenderGraph {
  const { elementsById, parentByChild } = context;
  const systemFor = (id: string): string | undefined => lineage(baseOccurrenceId(id), parentByChild)
    .find((candidate) => elementHasType(elementsById.get(candidate), "SystemElement"));
  const fold = (id: string): string => {
    const system = systemFor(id);
    if (system === undefined) {
      return id;
    }
    const separator = id.indexOf("@@");
    return separator < 0 ? system : `${system}${id.slice(separator)}`;
  };
  const foldedElement = (id: string): LinkedElement | undefined => {
    const folded = fold(id);
    const base = elementsById.get(baseOccurrenceId(folded));
    if (base === undefined) {
      return graph.elements[id];
    }
    return folded === base.id
      ? base
      : { ...base, id: folded, attributes: { ...base.attributes, projectedFrom: [base.id] } };
  };

  const groups = graph.groups.map((group) => ({
    ...group,
    elements: [...new Set(group.elements.map(fold))],
  })).filter((group) => group.elements.length > 0);
  const edges: RenderGraphEdge[] = [];
  for (const edge of graph.edges) {
    const originSource = edge.edge.originSource ?? edge.edge.source;
    const originTarget = edge.edge.originTarget ?? edge.edge.target;
    const originSourceSystem = systemFor(originSource);
    const originTargetSystem = systemFor(originTarget);
    if (originSource !== originTarget
        && originSourceSystem !== undefined
        && originSourceSystem === originTargetSystem) {
      continue;
    }
    const next = { ...edge, source: fold(edge.source), target: fold(edge.target) };
    if (next.source !== next.target) {
      addFoldedViewEdge(edges, next);
    }
  }

  const referenced = new Set([
    ...groups.flatMap((group) => [group.owner, ...group.elements]),
    ...edges.flatMap((edge) => [edge.source, edge.target]),
  ]);
  const elements: Record<string, LinkedElement> = {};
  for (const id of referenced) {
    const direct = graph.elements[id];
    const element = direct ?? [...Object.keys(graph.elements)]
      .filter((candidate) => fold(candidate) === id)
      .map(foldedElement)
      .find((candidate) => candidate !== undefined);
    if (element !== undefined) {
      elements[id] = element.id === id ? element : { ...element, id };
    }
  }
  const openedSystems = openedTabBoundaries(context, "SystemElement");
  const externalElements = new Set(graph.externalElements.map(fold).filter((id) => referenced.has(id)));
  for (const id of referenced) {
    const system = systemFor(id);
    const systemElement = system === undefined ? undefined : elementsById.get(system);
    if (system !== undefined
        && (!openedSystems.has(system)
          || (systemElement !== undefined && explicitlyExternal(systemElement)))) {
      externalElements.add(id);
    }
  }
  return {
    ...graph,
    elements,
    edges,
    groups,
    externalElements: [...externalElements],
  };
}

function simplifyDeploymentSystemInfrastructure(context: EvaluationContext, graph: RenderGraph): RenderGraph {
  const { result, elementsById, parentByChild } = context;
  const externalElements = new Set(graph.externalElements);
  const placementGroupOwners = new Set(graph.groups.map((group) => group.owner));
  const retained = new Set(Object.keys(graph.elements).filter((id) => {
    const element = elementsById.get(baseOccurrenceId(id)) ?? graph.elements[id];
    return !elementHasCapability(element, TYPE_CAPABILITIES.infrastructure)
      || (externalElements.has(id) && !placementGroupOwners.has(id));
  }));
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

  const edges: RenderGraphEdge[] = [];
  const trace = (source: string, first: RenderGraphEdge): void => {
    const visited = new Set<string>();
    const follow = (edge: RenderGraphEdge, carrier: RenderGraphEdge): void => {
      const target = edge.target;
      const nextCarrier = logicalRelationshipCarrier(carrier, edge);
      if (target === source) {
        return;
      }
      if (retained.has(target)) {
        addFoldedViewEdge(edges, { ...nextCarrier, source, target });
        return;
      }
      if (visited.has(target)) {
        return;
      }
      visited.add(target);
      for (const next of outgoing.get(target) ?? []) {
        follow(next, nextCarrier);
      }
    };
    follow(first, first);
  };

  for (const source of retained) {
    for (const edge of outgoing.get(source) ?? []) {
      trace(source, edge);
    }
  }

  const systemFor = (id: string): string | undefined => lineage(baseOccurrenceId(id), parentByChild)
    .find((candidate) => elementHasType(elementsById.get(candidate), "SystemElement"));
  for (const source of Object.keys(graph.elements)) {
    if (retained.has(source) || (incoming.get(source)?.length ?? 0) > 0) {
      continue;
    }
    for (const edge of outgoing.get(source) ?? []) {
      const originSource = edge.edge.originSource ?? edge.edge.source;
      const system = systemFor(originSource);
      if (system === undefined) {
        continue;
      }
      const placement = edge.edge.sourcePlacement ?? edge.edge.targetPlacement ?? edge.edge.projectionScope;
      const occurrence = placement === undefined ? system : `${system}@@${placement}`;
      const logicalSource = retained.has(occurrence) ? occurrence : retained.has(system) ? system : undefined;
      if (logicalSource !== undefined) {
        trace(logicalSource, edge);
      }
    }
  }

  const projectedByLogicalEdge = new Map<string, RenderGraphEdge[]>();
  for (const edge of graph.edges) {
    const originSource = edge.edge.originSource;
    const originTarget = edge.edge.originTarget;
    if (edge.projected !== true || originSource === undefined || originTarget === undefined) {
      continue;
    }
    const projectionScope = edge.edge.projectionRoot
      ?? edge.edge.projectionScope
      ?? edge.edge.sourcePlacement
      ?? edge.edge.targetPlacement
      ?? "";
    const key = `${originSource}\0${originTarget}\0${projectionScope}`;
    const related = projectedByLogicalEdge.get(key) ?? [];
    related.push(edge);
    projectedByLogicalEdge.set(key, related);
  }
  for (const related of projectedByLogicalEdge.values()) {
    const first = related[0]!;
    const originSource = first.edge.originSource!;
    const originTarget = first.edge.originTarget!;
    const sourceSystem = systemFor(originSource);
    const targetSystem = systemFor(originTarget);
    if (sourceSystem === undefined || targetSystem === undefined || sourceSystem === targetSystem) {
      continue;
    }
    const projectionEnvironment = first.edge.projectionRoot === undefined
      ? undefined
      : elementEnvironment(first.edge.projectionRoot, elementsById);
    const occurrence = (system: string): string | undefined => {
      const relatedCandidates = related.flatMap((edge) => [edge.source, edge.target])
        .filter((id) => retained.has(id) && systemFor(id) === system);
      const retainedCandidates = [...retained].filter((id) => systemFor(id) === system);
      const candidates = [...new Set([...relatedCandidates, ...retainedCandidates])];
      if (projectionEnvironment !== undefined) {
        return candidates.find((id) => deploymentOccurrenceEnvironment(id, elementsById) === projectionEnvironment)
          ?? candidates.find((id) => id === system);
      }
      return candidates[0];
    };
    const source = occurrence(sourceSystem);
    const target = occurrence(targetSystem);
    const relatedSimplifiedEdges = edges.filter((edge) =>
      linkedEdgeHasProjectionOrigin(edge.edge, originSource, originTarget)
      && (edge.edge.projectionRoot
        ?? edge.edge.projectionScope
        ?? edge.edge.sourcePlacement
        ?? edge.edge.targetPlacement
        ?? "") === (first.edge.projectionRoot
          ?? first.edge.projectionScope
          ?? first.edge.sourcePlacement
          ?? first.edge.targetPlacement
          ?? "")
    );
    if (source === undefined || target === undefined || source === target
        || endpointsConnected(source, target, relatedSimplifiedEdges)) {
      continue;
    }
    for (const carrier of related.filter((edge) => (edge.edge.attributes.model?.length ?? 0) > 0)) {
      addFoldedViewEdge(edges, { ...carrier, source, target });
    }
  }

  const environmentRootByContext = new Map(result.elements
    .filter((element) => element.synthetic !== true && element.parent === undefined
      && elementHasCapability(element, TYPE_CAPABILITIES.environment))
    .map((element) => [element.context, element.id]));
  const groupedEnvironmentsByElement = new Map<string, Set<string>>();
  for (const group of graph.groups) {
    const environment = elementEnvironment(group.owner, elementsById);
    if (environment === undefined || !environmentRootByContext.has(environment)) {
      continue;
    }
    for (const id of group.elements) {
      if (!retained.has(id)) {
        continue;
      }
      const environments = groupedEnvironmentsByElement.get(id) ?? new Set<string>();
      environments.add(environment);
      groupedEnvironmentsByElement.set(id, environments);
    }
  }
  const groupMembersByEnvironment = new Map<string, string[]>();
  for (const id of retained) {
    const element = elementsById.get(baseOccurrenceId(id)) ?? graph.elements[id];
    const environments = new Set(groupedEnvironmentsByElement.get(id) ?? []);
    const occurrenceEnvironment = deploymentOccurrenceEnvironment(id, elementsById);
    if (occurrenceEnvironment !== undefined) {
      environments.add(occurrenceEnvironment);
    }
    if (environments.size === 0 && elementHasCapability(element, TYPE_CAPABILITIES.infrastructure)
        && environmentRootByContext.has(element?.context ?? "")) {
      environments.add(element!.context);
    }
    for (const environment of environments) {
      const members = groupMembersByEnvironment.get(environment) ?? [];
      members.push(id);
      groupMembersByEnvironment.set(environment, members);
    }
  }
  const groups: RenderGraphGroup[] = [...groupMembersByEnvironment].map(([environment, members]) => ({
    owner: environmentRootByContext.get(environment) ?? environment,
    elements: members,
  }));

  return {
    ...graph,
    elements: Object.fromEntries(Object.entries(graph.elements).filter(([id]) => retained.has(id))),
    edges,
    groups,
    externalElements: graph.externalElements.filter((id) => retained.has(id)),
  };
}

function linkedEdgeHasProjectionOrigin(edge: LinkedEdge, source: string, target: string): boolean {
  return (edge.originSource === source && edge.originTarget === target)
    || edge.projectionOrigins?.some((origin) => origin.source === source && origin.target === target) === true;
}

function endpointsConnected(source: string, target: string, edges: readonly RenderGraphEdge[]): boolean {
  const neighbors = new Map<string, Set<string>>();
  for (const edge of edges) {
    const sourceNeighbors = neighbors.get(edge.source) ?? new Set<string>();
    sourceNeighbors.add(edge.target);
    neighbors.set(edge.source, sourceNeighbors);
    const targetNeighbors = neighbors.get(edge.target) ?? new Set<string>();
    targetNeighbors.add(edge.source);
    neighbors.set(edge.target, targetNeighbors);
  }
  const pending = [source];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === target) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    pending.push(...(neighbors.get(current) ?? []));
  }
  return false;
}

function logicalRelationshipCarrier(current: RenderGraphEdge, candidate: RenderGraphEdge): RenderGraphEdge {
  const currentModel = current.edge.attributes.model;
  const candidateModel = candidate.edge.attributes.model;
  return (currentModel === undefined || currentModel.length === 0)
      && candidateModel !== undefined && candidateModel.length > 0
    ? candidate
    : current;
}

function internalElements(result: LinkProjectResult, rows: readonly Row[], query: ParsedQuery): ReadonlySet<string> {
  const aliases = new Set(query.matches.flatMap((match) =>
    match.optional ? [] : patternNodeAliases(match.pattern)
  ));
  return new Set(rows.flatMap((row) =>
    [...aliases].flatMap((alias) => {
      const node = row.nodes[alias];
      return node !== undefined && linkedElementForNode(node) !== undefined ? [node.id] : [];
    })
  ));
}

function patternNodeAliases(pattern: QueryPattern): readonly string[] {
  return pattern.right === undefined ? [pattern.left.alias] : [pattern.left.alias, pattern.right.alias];
}

function applyViewBoundary(context: EvaluationContext, graph: RenderGraph): RenderGraph {
  const { result, scope, elementsById, parentByChild } = context;
  const boundary = queryViewPipeline(scope.view, scope.pipeline).boundary;
  if (boundary === null) {
    return graph;
  }
  const openedBoundaries = openedViewBoundaries(context, boundary);
  const inside = (id: string): boolean => elementInsideView(elementsById.get(id), scope, boundary, openedBoundaries, parentByChild);
  const visibleType = boundary.visibleType;
  const foldedIds = new Map<string, string>();
  const fold = (id: string): string => {
    const existing = foldedIds.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const folded = inside(id)
      ? id
      : closedViewBoundaryEndpoint(id, boundary, elementsById, parentByChild) ?? id;
    foldedIds.set(id, folded);
    return folded;
  };

  const elements = new Map<string, LinkedElement>();
  const externalElements = new Set<string>();
  for (const element of Object.values(graph.elements)) {
    if ((inside(element.id) && elementHasType(element, visibleType)) || explicitlyExternal(element)) {
      const foldedId = fold(element.id);
      const folded = elementsById.get(foldedId) ?? element;
      elements.set(foldedId, folded);
      if (explicitlyExternal(element) || explicitlyExternal(folded)) {
        externalElements.add(foldedId);
      }
    }
  }

  const edges: RenderGraphEdge[] = [];
  for (const edge of graph.edges) {
    const originSource = edge.edge.originSource ?? edge.edge.source;
    const originTarget = edge.edge.originTarget ?? edge.edge.target;
    const sourceOutside = !inside(originSource);
    const targetOutside = !inside(originTarget);
    const foldedSource = sourceOutside
      ? closedViewBoundaryEndpoint(originSource, boundary, elementsById, parentByChild) ?? fold(edge.source)
      : openViewEndpoint(originSource, boundary, elementsById, parentByChild) ?? fold(edge.source);
    const foldedTarget = targetOutside
      ? closedViewBoundaryEndpoint(originTarget, boundary, elementsById, parentByChild) ?? fold(edge.target)
      : openViewEndpoint(originTarget, boundary, elementsById, parentByChild) ?? fold(edge.target);
    if (foldedSource === foldedTarget && originSource !== originTarget) {
      continue;
    }
    const source = elementsById.get(foldedSource);
    const target = elementsById.get(foldedTarget);
    if (source !== undefined) {
      elements.set(source.id, source);
      if (sourceOutside || explicitlyExternal(source)) {
        externalElements.add(source.id);
      }
    }
    if (target !== undefined) {
      elements.set(target.id, target);
      if (targetOutside || explicitlyExternal(target)) {
        externalElements.add(target.id);
      }
    }
    addFoldedViewEdge(edges, { ...edge, source: foldedSource, target: foldedTarget });
  }

  const groups = graph.groups.map((group) => ({
    ...group,
    elements: [...new Set(group.elements
      .filter((id) => inside(id) && elementHasType(elementsById.get(id), visibleType))
      .map(fold))],
  })).filter((group) => group.elements.length > 0);

  return {
    ...graph,
    elements: Object.fromEntries(elements),
    edges,
    groups,
    externalElements: [...externalElements],
  };
}

function addFoldedViewEdge(edges: RenderGraphEdge[], next: RenderGraphEdge): void {
  const duplicateIndex = edges.findIndex((edge) => sameViewRelationship(edge, next));
  if (duplicateIndex < 0) {
    edges.push(next);
    return;
  }
  if (edges[duplicateIndex]!.derived && !next.derived) {
    edges[duplicateIndex] = next;
  }
}

function sameViewRelationship(left: RenderGraphEdge, right: RenderGraphEdge): boolean {
  return left.source === right.source
    && left.target === right.target
    && left.projected === right.projected
    && (left.edge.originSource ?? left.edge.source) === (right.edge.originSource ?? right.edge.source)
    && (left.edge.originTarget ?? left.edge.target) === (right.edge.originTarget ?? right.edge.target)
    && left.edge.operator === right.edge.operator
    && left.edge.sourceIdentity === right.edge.sourceIdentity
    && left.edge.declaration?.sourceName === right.edge.declaration?.sourceName
    && left.edge.declaration?.line === right.edge.declaration?.line
    && left.edge.declaration?.column === right.edge.declaration?.column;
}

function openedViewBoundaries(
  context: EvaluationContext,
  boundary: ViewBoundaryDefinition,
): ReadonlySet<string> {
  const { scope } = context;
  if (boundary.scope === "context") {
    return new Set(scope.context === undefined ? [] : [scope.context]);
  }
  return openedTabBoundaries(context, boundary.boundaryType);
}

function openedTabBoundaries(
  context: EvaluationContext,
  boundaryType: string,
): ReadonlySet<string> {
  return new Set([...context.tabClosure]
    .flatMap((id) => lineage(id, context.parentByChild))
    .filter((id) => elementHasType(context.elementsById.get(id), boundaryType))
    .sort());
}

function elementInsideView(
  element: LinkedElement | undefined,
  scope: QueryScope,
  boundary: ViewBoundaryDefinition,
  openedBoundaries: ReadonlySet<string>,
  parentByChild: ReadonlyMap<string, string>,
): boolean {
  if (element === undefined) {
    return false;
  }
  if (boundary.scope === "context") {
    return scope.context !== undefined && element.context === scope.context;
  }
  return lineage(element.id, parentByChild).some((id) => openedBoundaries.has(id));
}

function closedViewBoundaryEndpoint(
  id: string,
  boundary: ViewBoundaryDefinition,
  elementsById: ReadonlyMap<string, LinkedElement>,
  parentByChild: ReadonlyMap<string, string>,
): string | undefined {
  return lineage(id, parentByChild)
    .find((candidate) => elementHasType(elementsById.get(candidate), boundary.boundaryType));
}

function openViewEndpoint(
  id: string,
  boundary: ViewBoundaryDefinition,
  elementsById: ReadonlyMap<string, LinkedElement>,
  parentByChild: ReadonlyMap<string, string>,
): string | undefined {
  return lineage(id, parentByChild)
    .find((candidate) => elementHasType(elementsById.get(candidate), boundary.visibleType));
}

function elementHasType(element: LinkedElement | undefined, type: string): boolean {
  return element !== undefined && (element.type === type || element.baseTypes.includes(type));
}

function elementHasCapability(element: LinkedElement | undefined, capability: string): boolean {
  return element?.capabilities?.includes(capability) === true;
}

function semanticAttribute(
  item: Pick<LinkedElement | LinkedEdge, "semanticAttributes"> | undefined,
  capability: string,
): readonly string[] {
  return item?.semanticAttributes?.[capability] ?? [];
}

function explicitlyExternal(element: LinkedElement): boolean {
  return linkedElementIsExplicitlyExternal(element);
}

function evaluationContext(base: QueryExecutionContext): EvaluationContext {
  const nodes = queryNodes(base);
  return {
    ...base,
    nodes,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    relationships: queryRelationships(base),
  };
}

function evaluate(context: EvaluationContext, query: ParsedQuery): readonly Row[] {
  let rows: readonly Row[] = [{ nodes: {}, relationships: {} }];
  for (const match of query.matches) {
    rows = match.optional
      ? optionalMatchRows(context, rows, match)
      : matchRows(context, rows, match);
  }
  return rows;
}

function optionalMatchRows(
  context: EvaluationContext,
  rows: readonly Row[],
  clause: MatchClause,
): readonly Row[] {
  const next: Row[] = [];
  for (const row of rows) {
    const matched = matchRows(context, [row], clause);
    if (matched.length === 0) {
      next.push(row);
    } else {
      next.push(...matched);
    }
  }
  return next;
}

function matchRows(
  context: EvaluationContext,
  inputRows: readonly Row[],
  clause: MatchClause,
): readonly Row[] {
  if (clause.rollup) {
    return rollupMatchRows(context, inputRows, clause.pattern, clause.where);
  }
  const pattern = clause.pattern;
  const rows: Row[] = [];
  const relationships = context.relationships;
  if (pattern.relationship === undefined || pattern.right === undefined) {
    for (const row of inputRows) {
      const bound = row.nodes[pattern.left.alias];
      const candidates = bound === undefined ? context.nodes : [bound];
      for (const node of candidates) {
        if (matchesNode(node, pattern.left, context)) {
          rows.push({
            nodes: { ...row.nodes, [pattern.left.alias]: node },
            relationships: row.relationships,
          });
        }
      }
    }
    return rows.filter((row) => evaluateExpression(row, clause.where, context));
  }

  const right = pattern.right;
  const relationship = pattern.relationship;
  for (const row of inputRows) {
    const boundLeft = row.nodes[pattern.left.alias];
    const boundRight = row.nodes[right.alias];
    const boundRelationship = relationship.alias === undefined ? undefined : row.relationships[relationship.alias];
    for (const edge of relationships) {
      if (boundRelationship !== undefined && boundRelationship !== edge) {
        continue;
      }
      if (!matchesRelationship(edge, relationship, context)) {
        continue;
      }
      const source = context.nodeById.get(edge.source);
      const target = context.nodeById.get(edge.target);
      if (source === undefined || target === undefined) {
        continue;
      }
      for (const orientation of relationshipOrientations(source, target, pattern.direction)) {
        if (boundLeft !== undefined && boundLeft.id !== orientation.left.id) {
          continue;
        }
        if (boundRight !== undefined && boundRight.id !== orientation.right.id) {
          continue;
        }
        const nextRow: Row = {
          nodes: {
            ...row.nodes,
            [pattern.left.alias]: orientation.left,
            [right.alias]: orientation.right,
          },
          relationships: relationship.alias === undefined
            ? row.relationships
            : { ...row.relationships, [relationship.alias]: edge },
        };
        if (matchesNode(orientation.left, pattern.left, context) && matchesNode(orientation.right, right, context)) {
          rows.push(nextRow);
        }
      }
    }
  }
  return rows.filter((row) => evaluateExpression(row, clause.where, context));
}

function rollupMatchRows(
  context: EvaluationContext,
  inputRows: readonly Row[],
  pattern: QueryPattern,
  where: Expression | undefined,
): readonly Row[] {
  if (pattern.relationship === undefined || pattern.right === undefined) {
    return matchRows(context, inputRows, { optional: false, rollup: false, pattern, ...(where === undefined ? {} : { where }) });
  }

  const rows: Row[] = [];
  const relationships = context.relationships;
  const parentByChild = context.parentByChild;
  const right = pattern.right;
  const relationship = pattern.relationship;
  for (const row of inputRows) {
    const boundLeft = row.nodes[pattern.left.alias];
    const boundRight = row.nodes[right.alias];
    const boundRelationship = relationship.alias === undefined ? undefined : row.relationships[relationship.alias];
    for (const edge of relationships) {
      if (boundRelationship !== undefined && boundRelationship !== edge) {
        continue;
      }
      if (!matchesRelationship(edge, relationship, context)) {
        continue;
      }
      for (const orientation of rollupOrientations(pattern, right, boundLeft, boundRight)) {
        const sourceEndpoint = rollupSourceEndpoint(context, edge, orientation.sourcePattern, orientation.sourceBound, parentByChild);
        if (sourceEndpoint === undefined) {
          continue;
        }
        for (const targetEndpoint of rollupTargetCandidates(context, edge, orientation.targetBound, parentByChild)) {
          const source = context.nodeById.get(sourceEndpoint.id);
          const target = context.nodeById.get(targetEndpoint.id);
          if (source === undefined || target === undefined) {
            continue;
          }
          const leftEndpoint = orientation.reversed ? targetEndpoint : sourceEndpoint;
          const rightEndpoint = orientation.reversed ? sourceEndpoint : targetEndpoint;
          const nextRow: Row = {
            nodes: {
              ...row.nodes,
              [pattern.left.alias]: leftEndpoint.binding,
              [right.alias]: rightEndpoint.binding,
            },
            relationships: relationship.alias === undefined
              ? row.relationships
              : {
                ...row.relationships,
                [relationship.alias]: {
                  ...edge,
                  source: source.id,
                  target: target.id,
                },
              },
          };
          if (matchesNode(sourceEndpoint.binding, orientation.sourcePattern, context)
              && matchesNode(targetEndpoint.binding, orientation.targetPattern, context)
              && evaluateExpression(nextRow, where, context)) {
            rows.push(nextRow);
            break;
          }
        }
      }
    }
  }
  return rows;
}

interface RollupOrientation {
  readonly sourcePattern: NodePattern;
  readonly sourceBound: QueryNode | undefined;
  readonly targetPattern: NodePattern;
  readonly targetBound: QueryNode | undefined;
  readonly reversed: boolean;
}

function rollupOrientations(
  pattern: QueryPattern,
  right: NodePattern,
  boundLeft: QueryNode | undefined,
  boundRight: QueryNode | undefined,
): readonly RollupOrientation[] {
  const outgoing: RollupOrientation = {
    sourcePattern: pattern.left,
    sourceBound: boundLeft,
    targetPattern: right,
    targetBound: boundRight,
    reversed: false,
  };
  const incoming: RollupOrientation = {
    sourcePattern: right,
    sourceBound: boundRight,
    targetPattern: pattern.left,
    targetBound: boundLeft,
    reversed: true,
  };
  if (pattern.direction === "incoming") {
    return [incoming];
  }
  if (pattern.direction !== "undirected") {
    return [outgoing];
  }
  return [outgoing, incoming];
}

function relationshipOrientations(
  source: QueryNode,
  target: QueryNode,
  direction: QueryPattern["direction"],
): readonly { readonly left: QueryNode; readonly right: QueryNode }[] {
  if (direction === "incoming") {
    return [{ left: target, right: source }];
  }
  if (direction !== "undirected" || source.id === target.id) {
    return [{ left: source, right: target }];
  }
  return [
    { left: source, right: target },
    { left: target, right: source },
  ];
}

function rollupSourceEndpoint(
  context: EvaluationContext,
  edge: QueryRelationship,
  pattern: NodePattern,
  bound: QueryNode | undefined,
  parentByChild: ReadonlyMap<string, string>,
): RollupEndpoint | undefined {
  if (bound !== undefined) {
    if (lineage(edge.source, parentByChild).includes(bound.id)) {
      return { id: bound.id, binding: bound };
    }
    if (edgeOriginSourceLineage(edge, parentByChild).includes(bound.id)) {
      return context.nodeById.get(edge.source) === undefined
        ? undefined
        : { id: edge.source, binding: bound };
    }
    return undefined;
  }
  return nearestEndpoint(context, edge.source, pattern, undefined, parentByChild);
}

function rollupTargetCandidates(
  context: EvaluationContext,
  edge: QueryRelationship,
  bound: QueryNode | undefined,
  parentByChild: ReadonlyMap<string, string>,
): readonly RollupEndpoint[] {
  if (bound !== undefined) {
    if (lineage(edge.target, parentByChild).includes(bound.id)) {
      return [{ id: bound.id, binding: bound }];
    }
    if (edgeOriginTargetLineage(edge, parentByChild).includes(bound.id)) {
      return context.nodeById.get(edge.target) === undefined
        ? []
        : [{ id: edge.target, binding: bound }];
    }
    return [];
  }
  return lineage(edge.target, parentByChild).flatMap((id) => {
    const binding = context.nodeById.get(id);
    return binding === undefined ? [] : [{ id, binding }];
  });
}

function nearestEndpoint(
  context: EvaluationContext,
  start: string,
  pattern: NodePattern,
  where: Expression | undefined,
  parentByChild: ReadonlyMap<string, string>,
  binding: QueryNode | undefined = undefined,
): { readonly id: string; readonly binding: QueryNode } | undefined {
  for (const id of lineage(start, parentByChild)) {
    const node = context.nodeById.get(id);
    if (node === undefined || !matchesNode(node, pattern, context)) {
      continue;
    }
    if (where === undefined || evaluateExpression({ nodes: { [pattern.alias]: node }, relationships: {} }, where, context)) {
      return { id: node.id, binding: binding ?? node };
    }
  }
  return undefined;
}

function edgeOriginSourceLineage(edge: QueryRelationship, parentByChild: ReadonlyMap<string, string>): readonly string[] {
  const origin = edge.originSource ?? edge.edge?.originSource;
  return origin === undefined ? [] : lineage(origin, parentByChild);
}

function edgeOriginTargetLineage(edge: QueryRelationship, parentByChild: ReadonlyMap<string, string>): readonly string[] {
  const origin = edge.originTarget ?? edge.edge?.originTarget;
  return origin === undefined ? [] : lineage(origin, parentByChild);
}

function matchesNode(node: QueryNode, pattern: NodePattern, context: EvaluationContext): boolean {
  if (pattern.label !== undefined && !labels(node).has(pattern.label)) {
    return false;
  }
  return Object.entries(pattern.properties).every(([name, value]) => matchesNodeProperty(node, name, value, context));
}

function queryNodes(context: QueryExecutionContext): readonly QueryNode[] {
  return context.result.graph.nodes().flatMap((node) =>
    queryNodeFromGraphNode(node, context.elementsById, context.contextsById)
  );
}

function elementNode(element: LinkedElement): QueryNode {
  return { kind: "element", id: element.id, element };
}

function queryRelationships(context: QueryExecutionContext): readonly QueryRelationship[] {
  const edgeByRelationId = linkedEdgesByGraphRelationId(context.result);
  const relationships: QueryRelationship[] = context.result.graph.relations().flatMap((relation) =>
    queryRelationshipVariants(relation, edgeByRelationId.get(relation.id), context.contextBySourceIdentity)
  );
  const parentByChild = context.parentByChild;
  for (const relationship of [...relationships]) {
    if (relationship.kind !== "REFERENCES" || relationship.edge === undefined) {
      continue;
    }
    for (const source of lineage(relationship.source, parentByChild)) {
      for (const target of lineage(relationship.target, parentByChild)) {
        if (source === relationship.source && target === relationship.target) {
          continue;
        }
        if (source === target || isDescendantOf(source, target, parentByChild) || isDescendantOf(target, source, parentByChild)) {
          continue;
        }
        relationships.push({
          edge: relationship.edge,
          source,
          target,
          kind: relationship.kind,
          ...(relationship.type === undefined ? {} : { type: relationship.type }),
          ...(relationship.context === undefined ? {} : { context: relationship.context }),
          ...(relationship.originSource === undefined ? {} : { originSource: relationship.originSource }),
          ...(relationship.originTarget === undefined ? {} : { originTarget: relationship.originTarget }),
          derived: true,
          projected: relationship.projected,
        });
      }
    }
  }
  return relationships;
}

function queryRelationshipVariants(
  relation: GraphRelation,
  edge: LinkedEdge | undefined,
  contextBySourceIdentity: ReadonlyMap<string, string>,
): readonly QueryRelationship[] {
  const base = queryRelationshipFromGraphRelation(relation, edge, contextBySourceIdentity);
  if (edge === undefined) {
    return [base];
  }
  const origins = edge.projectionOrigins ?? [];
  return origins.length === 0
    ? [base]
    : origins.map((origin) => ({
      ...base,
      originSource: origin.source,
      originTarget: origin.target,
    }));
}

function queryNodeFromGraphNode(
  node: GraphNode,
  elementsById: ReadonlyMap<string, LinkedElement>,
  contextById: ReadonlyMap<string, LinkedContext>,
): readonly QueryNode[] {
  switch (node.kind) {
    case "context": {
      const context = contextById.get(node.id);
      return [{
        kind: "context",
        id: node.id,
        context: node.id,
        sourceIdentity: context?.sourceIdentity ?? "",
        attributes: context?.attributes ?? {},
      }];
    }
    case "source":
      return [{ kind: "source", id: node.id, sourceIdentity: node.id }];
    case "type":
      return [{ kind: "type", id: node.id, type: node.id, baseTypes: node.baseTypes }];
    case "element": {
      const element = elementsById.get(node.id);
      return element === undefined ? [] : [elementNode(element)];
    }
  }
}

function queryRelationshipFromGraphRelation(
  relation: GraphRelation,
  edge: LinkedEdge | undefined,
  contextBySourceIdentity: ReadonlyMap<string, string>,
): QueryRelationship {
  const context = edge === undefined ? undefined : contextBySourceIdentity.get(edge.sourceIdentity);
  return {
    ...(edge === undefined ? {} : { edge }),
    source: relation.source,
    target: relation.target,
    kind: relation.kind,
    type: relation.type ?? relation.kind,
    ...(context === undefined ? {} : { context }),
    derived: relation.derived === true,
    projected: relation.projected === true,
  };
}

function linkedEdgesByGraphRelationId(result: LinkProjectResult): ReadonlyMap<string, LinkedEdge> {
  return new Map(result.edges.map((edge) => [edge.id, edge]));
}

function lineage(id: string, parentByChild: ReadonlyMap<string, string>): readonly string[] {
  return [id, ...ancestors(id, parentByChild)];
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

function isDescendantOf(id: string, ancestor: string, parentByChild: ReadonlyMap<string, string>): boolean {
  return ancestors(id, parentByChild).includes(ancestor);
}

function relationshipInTab(relationship: QueryRelationship, context: EvaluationContext): boolean {
  const edge = relationship.edge;
  if (edge === undefined) {
    return false;
  }
  if (relationship.projected && edge.sourceIdentity !== undefined) {
    if (edge.sourceIdentity === context.scope.tab || sourceRootsInTabClosure(context.result, edge.sourceIdentity, context.tabClosure)) {
      return true;
    }
    return context.tabClosure.has(relationship.originSource ?? edge.originSource ?? edge.source)
      && endpointIsExternal(context, relationship.originTarget ?? edge.originTarget ?? edge.target);
  }
  return context.tabClosure.has(relationship.originSource ?? edge.originSource ?? edge.source)
    || context.tabClosure.has(relationship.originTarget ?? edge.originTarget ?? edge.target);
}

function sourceRootsInTabClosure(result: LinkProjectResult, sourceName: string, tabClosure: ReadonlySet<string>): boolean {
  return (result.tabRoots[sourceName] ?? []).some((root) => tabClosure.has(root));
}

function endpointIsExternal(context: EvaluationContext, id: string): boolean {
  const node = context.nodeById.get(id);
  return node !== undefined && matchesTypePredicate(node, "External");
}

function evaluateTabSourceIdentityComparison(row: Row, expression: Extract<Expression, { readonly kind: "compare" }>, context: EvaluationContext): boolean | undefined {
  if (expression.operator === "contains") {
    return undefined;
  }
  const left = tabSourceIdentityPredicate(row, expression.left, expression.right, context);
  if (left !== undefined) {
    return left;
  }
  return tabSourceIdentityPredicate(row, expression.right, expression.left, context);
}

function tabSourceIdentityPredicate(row: Row, propertyExpression: ValueExpression, tabExpression: ValueExpression, context: EvaluationContext): boolean | undefined {
  if (propertyExpression.kind !== "property" || propertyExpression.property !== "sourceIdentity" || !isTabValueExpression(tabExpression)) {
    return undefined;
  }
  const node = row.nodes[propertyExpression.alias];
  if (node?.kind === "element") {
    return context.tabClosure.has(node.id);
  }
  const relationship = row.relationships[propertyExpression.alias];
  if (relationship !== undefined) {
    return relationshipInTab(relationship, context);
  }
  return undefined;
}

function isTabValueExpression(expression: ValueExpression): boolean {
  return expression.kind === "variable" && expression.name === "tab";
}

function isTabVariable(value: QueryValue): boolean {
  return value.kind === "variable" && value.name === "tab";
}

function matchesNodeProperty(node: QueryNode, name: string, value: QueryValue, context: EvaluationContext): boolean {
  if (name === "sourceIdentity" && isTabVariable(value) && node.kind === "element") {
    return context.tabClosure.has(node.id);
  }
  return equalQueryValues(property(node, name), resolveValue(value, context.scope));
}

function matchesRelationship(edge: QueryRelationship, pattern: RelationshipPattern, context: EvaluationContext): boolean {
  if (pattern.type !== undefined && pattern.type !== edge.kind) {
    return false;
  }
  if (!Object.entries(pattern.properties).every(([name, value]) => matchesRelationshipProperty(edge, name, value, context))) {
    return false;
  }
  if (!matchesSelectorDimension(edge.derived, pattern.selectors, "derived", "withDerived")) {
    return false;
  }
  if (!matchesSelectorDimension(edge.projected, pattern.selectors, "projected", "withProjected")) {
    return false;
  }
  return true;
}

function matchesSelectorDimension(
  value: boolean,
  selectors: ReadonlySet<string>,
  exact: string,
  inclusive: string,
): boolean {
  if (selectors.has(exact)) {
    return value;
  }
  return selectors.has(inclusive) || !value;
}

function matchesRelationshipProperty(edge: QueryRelationship, name: string, value: QueryValue, context: EvaluationContext): boolean {
  if (name === "sourceIdentity" && isTabVariable(value)) {
    return relationshipInTab(edge, context);
  }
  return equalQueryValues(edgePropertyValue(edge, name), resolveValue(value, context.scope));
}

function evaluateExpression(row: Row, expression: Expression | undefined, context: EvaluationContext): boolean {
  if (expression === undefined) {
    return true;
  }
  if (expression.kind === "and") {
    return evaluateExpression(row, expression.left, context) && evaluateExpression(row, expression.right, context);
  }
  if (expression.kind === "or") {
    return evaluateExpression(row, expression.left, context) || evaluateExpression(row, expression.right, context);
  }
  if (expression.kind === "not") {
    return !evaluateExpression(row, expression.expression, context);
  }
  if (expression.kind === "is") {
    return matchesTypePredicate(evaluateValue(row, expression.left, context.scope), expression.target);
  }
  if (expression.kind === "in") {
    return includesQueryValue(evaluateValue(row, expression.right, context.scope), evaluateValue(row, expression.left, context.scope));
  }
  const tabComparison = evaluateTabSourceIdentityComparison(row, expression, context);
  if (tabComparison !== undefined) {
    return expression.operator === "ne" ? !tabComparison : tabComparison;
  }
  const left = evaluateValue(row, expression.left, context.scope);
  const right = evaluateValue(row, expression.right, context.scope);
  return compareQueryValues(left, right, expression.operator);
}

function evaluateValue(row: Row, expression: ValueExpression, scope: QueryScope): string | readonly string[] | QueryNode | undefined {
  if (expression.kind === "literal" || expression.kind === "variable") {
    return resolveValue(expression, scope);
  }
  if (expression.kind === "list") {
    return expression.values.flatMap((value) => {
      const resolved = resolveValue(value, scope);
      return resolved === undefined ? [] : [resolved];
    });
  }
  if (expression.kind === "binding") {
    return row.nodes[expression.alias];
  }
  const node = row.nodes[expression.alias];
  if (node !== undefined) {
    return propertyValue(node, expression.property);
  }
  const edge = row.relationships[expression.alias];
  if (edge !== undefined) {
    return edgePropertyValue(edge, expression.property);
  }
  return undefined;
}

function equalQueryValues(left: string | readonly string[] | QueryNode | undefined, right: string | readonly string[] | QueryNode | undefined): boolean {
  if (left === undefined || right === undefined) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  if (isQueryNode(left) || isQueryNode(right)) {
    return isQueryNode(left) && isQueryNode(right) && left.id === right.id;
  }
  return left === right;
}

function compareQueryValues(
  left: string | readonly string[] | QueryNode | undefined,
  right: string | readonly string[] | QueryNode | undefined,
  operator: "eq" | "ne" | "contains",
): boolean {
  if (left === undefined || right === undefined) {
    return false;
  }
  if (operator === "eq") {
    return equalQueryValues(left, right);
  }
  if (operator === "ne") {
    return !equalQueryValues(left, right);
  }
  return containsQueryValue(left, right);
}

function includesQueryValue(container: string | readonly string[] | QueryNode | undefined, item: string | readonly string[] | QueryNode | undefined): boolean {
  if (container === undefined || item === undefined || Array.isArray(item)) {
    return false;
  }
  if (Array.isArray(container)) {
    const itemValue = isQueryNode(item) ? item.id : item;
    return container.includes(itemValue);
  }
  if (isQueryNode(container)) {
    return isQueryNode(item) && container.id === item.id;
  }
  return container === item;
}

function matchesTypePredicate(value: string | readonly string[] | QueryNode | undefined, target: string): boolean {
  if (!isQueryNode(value)) {
    return false;
  }
  if (target === "External") {
    return value.kind === "element"
      && linkedElementIsExplicitlyExternal(value.element);
  }
  return labels(value).has(target);
}

function containsQueryValue(left: string | readonly string[] | QueryNode | undefined, right: string | readonly string[] | QueryNode | undefined): boolean {
  if (typeof right !== "string") {
    return false;
  }
  if (typeof left === "string") {
    return left.includes(right);
  }
  if (Array.isArray(left)) {
    return left.includes(right);
  }
  return false;
}

function labels(node: QueryNode): ReadonlySet<string> {
  if (node.kind === "context") {
    return new Set(["Context"]);
  }
  if (node.kind === "source") {
    return new Set(["SourceIdentity"]);
  }
  if (node.kind === "type") {
    return new Set(["Type", node.type, ...node.baseTypes]);
  }
  return new Set(["Element", node.element.type, ...node.element.baseTypes]);
}

function property(node: QueryNode, name: string): string | undefined {
  const value = propertyValue(node, name);
  return typeof value === "string" ? value : undefined;
}

function propertyValue(node: QueryNode, name: string): string | readonly string[] | QueryNode | undefined {
  if (node.kind === "context") {
    if (name === "id" || name === "context") {
      return node.context;
    }
    if (name === "kind" || name === "type") {
      return "Context";
    }
    if (name === "sourceIdentity" || name === "source") {
      return node.sourceIdentity;
    }
    const values = node.attributes[name];
    return values?.length === 1 ? values[0] : values;
  }
  if (node.kind === "source") {
    if (name === "id" || name === "sourceIdentity" || name === "source") {
      return node.sourceIdentity;
    }
    if (name === "kind" || name === "type") {
      return "SourceIdentity";
    }
    return undefined;
  }
  if (node.kind === "type") {
    if (name === "id" || name === "type") {
      return node.type;
    }
    if (name === "kind") {
      return "Type";
    }
    if (name === "baseType") {
      return node.baseTypes[0];
    }
    if (name === "baseTypes") {
      return node.baseTypes;
    }
    return undefined;
  }
  const element = node.element;
  if (name === "deployed") {
    return String(element.deployed === true);
  }
  if (name === "id") {
    return element.localId;
  }
  if (name === "context") {
    return element.context;
  }
  if (name === "sourceIdentity") {
    return element.sourceIdentity;
  }
  if (name === "type") {
    return element.type;
  }
  if (name === "constructor") {
    return element.constructor;
  }
  if (name === "baseType") {
    return element.baseTypes[0];
  }
  if (name === "baseTypes") {
    return element.baseTypes;
  }
  if (name === "parent") {
    return queryNodeByIdFromElement(element.parent ?? element.context);
  }
  const values = element.attributes[name];
  if (element.listAttributes?.includes(name) === true) {
    return values;
  }
  if (values === undefined) {
    return undefined;
  }
  if (element.referenceAttributes?.includes(name) === true && values.length === 1) {
    return queryNodeByIdFromElement(values[0] ?? "");
  }
  return values.length === 1 ? values[0] : values;
}

function linkedElementForNode(node: QueryNode | undefined): LinkedElement | undefined {
  if (node === undefined || node.kind === "source" || node.kind === "type") {
    return undefined;
  }
  if (node.kind === "element") {
    return node.element;
  }
  return {
    id: node.id,
    context: node.context,
    localId: node.id,
    type: "Context",
    constructor: "context",
    sourceIdentity: node.sourceIdentity,
    baseTypes: ["Element"],
    attributes: node.attributes,
  };
}

function queryNodeByIdFromElement(id: string): QueryNode {
  return id.includes("/")
    ? { kind: "element", id, element: placeholderElement(id) }
    : { kind: "context", id, context: id, sourceIdentity: "", attributes: {} };
}

function placeholderElement(id: string): LinkedElement {
  const [context = "", localId = id] = id.split("/");
  return {
    id,
    context,
    localId,
    type: "Element",
    constructor: "",
    sourceIdentity: "",
    baseTypes: [],
    attributes: {},
  };
}

function edgeProperty(edge: QueryRelationship, name: string): string | undefined {
  const value = edgePropertyValue(edge, name);
  return typeof value === "string" ? value : undefined;
}

function edgePropertyValue(relationship: QueryRelationship, name: string): string | readonly string[] | QueryNode | undefined {
  const edge = relationship.edge;
  if (name === "derived") {
    return String(relationship.derived);
  }
  if (name === "projected") {
    return String(relationship.projected);
  }
  if (name === "operator") {
    return edge?.operator;
  }
  if (name === "type") {
    return edge?.type ?? relationship.type ?? relationship.kind;
  }
  if (name === "sourceIdentity") {
    return edge?.sourceIdentity;
  }
  if (name === "context") {
    return relationship.context;
  }
  if (name === "projectionRoot") {
    return edge?.projectionRoot;
  }
  const values = edge?.attributes[name];
  if (edge?.listAttributes?.includes(name) === true) {
    return values;
  }
  if (values === undefined) {
    return undefined;
  }
  if (edge?.referenceAttributes?.includes(name) === true && values.length === 1) {
    return queryNodeByIdFromElement(values[0] ?? "");
  }
  return values.length === 1 ? values[0] : values;
}

function collectGroup(
  groups: Map<string, RenderGraphGroup>,
  row: Row,
  expression: ValueExpression,
  scope: QueryScope,
): void {
  const value = evaluateValue(row, expression, scope);
  const node = expression.kind === "property" ? row.nodes[expression.alias] : undefined;
  if (node === undefined || value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    if (!isReferenceGroupExpression(row, expression)) {
      throw new Error("Cannot GROUP BY list-valued expression");
    }
    for (const item of value) {
      collectGroupValue(groups, node, item, undefined);
    }
    return;
  }
  collectGroupValue(groups, node, isQueryNode(value) ? value.id : `scalar__${String(value)}`, isQueryNode(value) ? undefined : String(value));
}

function collectGroupValue(
  groups: Map<string, RenderGraphGroup>,
  node: QueryNode,
  owner: string,
  label: string | undefined,
): void {
  const existing = groups.get(owner);
  const elements = new Set(existing?.elements ?? []);
  if (node.kind === "element") {
    elements.add(node.id);
  }
  groups.set(owner, {
    owner,
    ...(label === undefined ? {} : { label }),
    elements: [...elements],
  });
}

function collectSelectedReferenceGroups(
  selectedElements: ReadonlyMap<string, LinkedElement>,
  selectedEdges: readonly RenderGraphEdge[],
  groups: Map<string, RenderGraphGroup>,
  expression: ValueExpression,
): ReadonlySet<string> {
  const grouped = new Set<string>();
  if (expression.kind !== "property") {
    return grouped;
  }
  for (const group of groups.values()) {
    for (const element of group.elements) {
      grouped.add(element);
    }
  }
  for (const element of selectedElements.values()) {
    if (element.referenceAttributes?.includes(expression.property) !== true) {
      continue;
    }
    const node: QueryNode = { kind: "element", id: element.id, element };
    const value = propertyValue(node, expression.property);
    const owners = Array.isArray(value)
      ? value
      : isQueryNode(value)
        ? [value.id]
        : [];
    const isSinglePlacement = element.semanticAttributeNames?.[ATTRIBUTE_CAPABILITIES.placementOwner]
      === expression.property;
    const selectedOwners = isSinglePlacement && owners.length > 1 ? [] : owners;
    for (const owner of selectedOwners) {
      collectGroupValue(groups, node, owner, undefined);
      grouped.add(element.id);
    }
  }
  for (const edge of selectedEdges) {
    collectSelectedEdgePlacementGroup(selectedElements, groups, grouped, expression.property, edge.source, edge.edge.sourcePlacement);
    collectSelectedEdgePlacementGroup(selectedElements, groups, grouped, expression.property, edge.target, edge.edge.targetPlacement);
  }
  return grouped;
}

function collectSelectedEdgePlacementGroup(
  selectedElements: ReadonlyMap<string, LinkedElement>,
  groups: Map<string, RenderGraphGroup>,
  grouped: Set<string>,
  propertyName: string,
  elementId: string,
  placement: string | undefined,
): void {
  if (placement === undefined) {
    return;
  }
  const element = selectedElements.get(elementId);
  if (element?.referenceAttributes?.includes(propertyName) !== true
      || element.attributes[propertyName]?.includes(placement) !== true) {
    return;
  }
  collectGroupValue(groups, { kind: "element", id: element.id, element }, placement, undefined);
  grouped.add(element.id);
}

function completeReferenceGroupClosure(
  nodeById: ReadonlyMap<string, QueryNode>,
  groups: Map<string, RenderGraphGroup>,
  expression: ValueExpression,
): ReadonlySet<string> {
  if (expression.kind !== "property") {
    return new Set();
  }
  const visited = new Set<string>();
  const selectedOwners = new Set<string>();
  for (const owner of [...groups.keys()]) {
    collectReferenceGroupOwner(groups, nodeById, expression.property, owner, visited, selectedOwners);
  }
  return selectedOwners;
}

function collectReferenceGroupOwner(
  groups: Map<string, RenderGraphGroup>,
  nodeById: ReadonlyMap<string, QueryNode>,
  propertyName: string,
  elementId: string,
  visited: Set<string>,
  selectedOwners: Set<string>,
): void {
  if (visited.has(elementId)) {
    return;
  }
  visited.add(elementId);
  const node = nodeById.get(elementId);
  if (node?.kind !== "element" || node.element.referenceAttributes?.includes(propertyName) !== true) {
    return;
  }
  selectedOwners.add(elementId);
  const value = propertyValue(node, propertyName);
  const owners = Array.isArray(value)
    ? value
    : isQueryNode(value)
      ? [value.id]
      : [];
  for (const owner of owners) {
    collectGroupValue(groups, node, owner, undefined);
    collectReferenceGroupOwner(groups, nodeById, propertyName, owner, visited, selectedOwners);
  }
}

function isReferenceGroupExpression(row: Row, expression: ValueExpression): boolean {
  if (expression.kind !== "property") {
    return false;
  }
  const node = row.nodes[expression.alias];
  if (node?.kind === "element" && node.element.referenceAttributes?.includes(expression.property) === true) {
    return true;
  }
  const relationship = row.relationships[expression.alias];
  return relationship?.edge?.referenceAttributes?.includes(expression.property) === true;
}

function isQueryNode(value: unknown): value is QueryNode {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && "id" in value
    && "kind" in value;
}

function resolveValue(value: QueryValue, scope: QueryScope): string | undefined {
  if (value.kind === "literal") {
    return value.value;
  }
  if (value.name === "context") {
    return scope.context;
  }
  if (value.name === "tab") {
    return scope.tab ?? "";
  }
  throw new Error(`Unknown query variable: $${value.name}`);
}

function elementById(result: LinkProjectResult, id: string): LinkedElement | undefined {
  return result.elements.find((candidate) => candidate.id === id);
}
