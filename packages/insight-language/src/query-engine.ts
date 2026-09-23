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
  AiqQueryError,
  analyzeQuery,
  isEndpointReachabilityClause,
  parseQuery,
  type Expression,
  type MatchClause,
  type NodePattern,
  type ParsedGraphQuery,
  type QueryPattern,
  type QuerySourceRange,
  type QueryValue,
  type RelationshipPattern,
  type ParsedTableQuery,
  type PaginationExpression,
  type TableExpression,
  type TableMatchClause,
  type TableProjection,
  type TableValueExpression,
  type ValueExpression,
} from "./query-syntax.js";
import {
  createQueryExecutionContext,
  type QueryExecutionContext,
} from "./query-execution-context.js";
import { runQueryViewPipeline } from "./query-view-pipeline.js";
import { ATTRIBUTE_CAPABILITIES, TYPE_CAPABILITIES } from "./semantic-capabilities.js";
import { aiqFunction } from "./query-function-catalog.js";

export const DEFAULT_QUERY = "MATCH (n:Element {context: $context}) RETURN n";

interface Row {
  readonly nodes: Readonly<Record<string, QueryNode>>;
  readonly relationships: Readonly<Record<string, QueryRelationship>>;
  readonly values: Readonly<Record<string, RuntimeValue>>;
}

interface AggregateState {
  readonly expression: Extract<TableValueExpression, { readonly kind: "function" }>;
  readonly seen?: Set<string>;
  count: number;
  sum: number;
  selected: RuntimeValue;
  collected?: RuntimeValue[];
  valueType?: "number" | "string";
}

interface ProjectionGroup {
  readonly representative?: Row;
  readonly aggregates: readonly AggregateState[];
}

export type QueryParameterValue = null | boolean | number | string | readonly QueryParameterValue[];

export interface QueryColumn {
  readonly name: string;
  readonly type: "string" | "number" | "boolean" | "list" | "node" | "relationship" | "path" | "record" | "any";
  readonly nullable: boolean;
  readonly itemType?: QueryColumn["type"];
}

export type QueryCell = null | boolean | number | string | readonly QueryCell[] | Readonly<Record<string, unknown>>;

export interface QueryResultMetadata {
  readonly context: string | null;
  readonly source: string | null;
  readonly executionComplete: true;
  readonly rowCount: number;
  readonly skip: number;
  readonly limit: number | null;
  readonly pathScopes: readonly Readonly<Record<string, unknown>>[];
  readonly warnings: readonly string[];
}

export interface QueryTableResult {
  readonly schemaVersion: "aiq-table.v1";
  readonly kind: "table";
  readonly columns: readonly QueryColumn[];
  readonly rows: readonly (readonly QueryCell[])[];
  readonly metadata: QueryResultMetadata;
}

export type QueryResult =
  | { readonly kind: "graph"; readonly graph: RenderGraph }
  | QueryTableResult;

export interface QueryExecutionLimits {
  readonly maxExpansions: number;
  readonly maxRows: number;
  readonly maxValues: number;
  readonly maxOutputBytes: number;
  readonly timeoutMs: number;
}

export interface QueryExecutionOptions {
  readonly limits?: Partial<QueryExecutionLimits>;
  readonly signal?: AbortSignal;
}

export const DEFAULT_QUERY_EXECUTION_LIMITS: QueryExecutionLimits = Object.freeze({
  maxExpansions: 1_000_000,
  maxRows: 100_000,
  maxValues: 1_000_000,
  maxOutputBytes: 32 * 1024 * 1024,
  timeoutMs: 10_000,
});

interface RuntimeRecord {
  readonly [key: string]: RuntimeValue;
}

type RuntimeValue = null | boolean | number | string | QueryNode | QueryRelationship | QueryPath
  | readonly RuntimeValue[] | RuntimeRecord;

interface RollupEndpoint {
  readonly id: string;
  readonly binding: QueryNode;
}

interface EvaluationContext extends QueryExecutionContext {
  readonly nodes: readonly QueryNode[];
  readonly nodeById: ReadonlyMap<string, QueryNode>;
  readonly nodesByLabel: ReadonlyMap<string, readonly QueryNode[]>;
  readonly relationships: readonly QueryRelationship[];
  readonly relationshipsBySource: ReadonlyMap<string, readonly QueryRelationship[]>;
  readonly relationshipsByTarget: ReadonlyMap<string, readonly QueryRelationship[]>;
  readonly relationshipsByEndpoint: ReadonlyMap<string, readonly QueryRelationship[]>;
  readonly budget: QueryBudget;
}

interface QueryBudget {
  readonly limits: QueryExecutionLimits;
  readonly deadline: number;
  readonly signal?: AbortSignal;
  expansions: number;
  values: number;
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

interface QueryPathStep {
  readonly index: number;
  readonly from: string;
  readonly to: string;
  readonly relationshipId: string;
  readonly direction: "forward" | "reverse";
}

interface QueryPath {
  readonly kind: "path";
  readonly nodes: readonly QueryNode[];
  readonly relationships: readonly QueryRelationship[];
  readonly steps: readonly QueryPathStep[];
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
  options: QueryExecutionOptions = {},
): RenderGraph {
  try {
    return selectGraphInternal(result, scope, query, options);
  } catch (cause) {
    throw normalizeAiqError(cause);
  }
}

function selectGraphInternal(
  result: LinkProjectResult,
  scope: QueryScope,
  query: string | undefined,
  options: QueryExecutionOptions,
): RenderGraph {
  const parsed = parseQuery(query === undefined || query.trim() === "" ? DEFAULT_QUERY : query);
  if (parsed.kind !== "graph") {
    throw new Error("selectGraph requires a graph RETURN; use executeQuery for RETURN TABLE");
  }
  const execution = evaluationContext(
    createQueryExecutionContext(result, scope),
    createQueryBudget(normalizedLimits(options.limits), options.signal),
  );
  const rows = evaluate(execution, parsed);
  const selectedElements = new Map<string, LinkedElement>();
  const selectedEdges: RenderGraphEdge[] = [];
  const selectedEdgeIdentities = new Map<LinkedEdge, Set<string>>();
  const returnedRelationshipPatterns = relationshipPatternsReturnedBy(parsed);
  const returnsPath = parsed.matches.some((match) => match.pattern.path !== undefined && parsed.returns.includes(match.pattern.path.alias));
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
      const path = row.values[alias];
      if (isQueryPath(path)) {
        const unsupported = path.relationships.find((relationship) => relationship.kind !== "REFERENCES");
        if (unsupported !== undefined) {
          throw new AiqQueryError(
            "AIQ_UNRENDERABLE_PATH",
            `Graph RETURN cannot render a path over ${unsupported.kind}; use RETURN TABLE for structural paths`,
          );
        }
        for (const pathNode of path.nodes) {
          const element = linkedElementForNode(pathNode);
          if (element !== undefined) selectedElements.set(pathNode.id, element);
        }
        for (const pathEdge of path.relationships) {
          if (pathEdge.edge !== undefined) {
            addSelectedEdge(selectedEdges, {
              edge: contextualLinkedEdge(pathEdge),
              source: pathEdge.source,
              target: pathEdge.target,
              derived: pathEdge.derived,
              projected: pathEdge.projected,
            }, pathEdge.edge, selectedEdgeIdentities);
          }
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
    : returnsPath || hasAuthoritativeEdgeSelection(returnedRelationshipPatterns, selectedStructuralRelationships)
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
    rollUpSystems: (_result, graph, _scope, rootType) => rollUpDeploymentSystems(execution, graph, rootType),
    simplifyInfrastructure: (_result, graph, rootType) => simplifyDeploymentSystemInfrastructure(execution, graph, rootType),
  });
}

export function executeQuery(
  result: LinkProjectResult,
  scope: QueryScope,
  query: string | undefined,
  parameters: Readonly<Record<string, QueryParameterValue>> = {},
  options: QueryExecutionOptions = {},
): QueryResult {
  try {
    const source = query === undefined || query.trim() === "" ? DEFAULT_QUERY : query;
    const parsed = parseQuery(source);
    if (parsed.kind === "graph") {
      if (Object.keys(parameters).length > 0) {
        throw new AiqQueryError("AIQ_PARAMETER", "Graph queries do not accept user parameters");
      }
      const limits = normalizedLimits(options.limits);
      const graphResult: QueryResult = { kind: "graph", graph: selectGraph(result, scope, source, options) };
      assertOutputBudget(graphResult, limits);
      return graphResult;
    }
    validateQueryParameters(source, scope, parameters);
    const limits = normalizedLimits(options.limits);
    const table = executeTableQuery(evaluationContext(
      createQueryExecutionContext(result, scope),
      createQueryBudget(limits, options.signal),
    ), parsed, parameters);
    assertOutputBudget(table, limits);
    return table;
  } catch (cause) {
    throw normalizeAiqError(cause);
  }
}

function normalizeAiqError(cause: unknown): AiqQueryError {
  if (cause instanceof AiqQueryError) return cause;
  const message = cause instanceof Error ? cause.message : String(cause);
  const stable = /^(AIQ_[A-Z_]+):\s*(.*)$/s.exec(message);
  if (stable !== null) return new AiqQueryError(stable[1]!, stable[2]!);
  const code = /parameter|\$context|\$tab/i.test(message) ? "AIQ_PARAMETER"
    : /requires|expected|numeric|number|string|boolean|list|homogeneous|comparison/i.test(message) ? "AIQ_TYPE_ERROR"
    : /RETURN TABLE|graph RETURN|result/i.test(message) ? "AIQ_RESULT_KIND"
    : "AIQ_EVALUATION";
  return new AiqQueryError(code, message);
}

function validateQueryParameters(
  source: string,
  scope: QueryScope,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): void {
  const references = analyzeTableParameterNames(source);
  const userReferences = references.filter((name) => name !== "context" && name !== "tab");
  const supplied = Object.keys(parameters);
  for (const reserved of ["context", "tab"]) {
    if (Object.hasOwn(parameters, reserved)) throw new Error(`Parameter $${reserved} is reserved for query scope`);
  }
  const missing = userReferences.filter((name) => !Object.hasOwn(parameters, name));
  if (missing.length > 0) throw new Error(`Missing query parameter${missing.length === 1 ? "" : "s"}: ${missing.map((name) => `$${name}`).join(", ")}`);
  const unused = supplied.filter((name) => !userReferences.includes(name));
  if (unused.length > 0) throw new Error(`Unused query parameter${unused.length === 1 ? "" : "s"}: ${unused.map((name) => `$${name}`).join(", ")}`);
  if (references.includes("context") && scope.context === undefined) throw new Error("Query requires $context scope");
  if (references.includes("tab") && scope.tab === undefined) throw new Error("Query requires $tab scope");
  for (const [name, value] of Object.entries(parameters)) validateParameterValue(name, value);
}

function analyzeTableParameterNames(source: string): readonly string[] {
  const analysis = analyzeQuery(source);
  return analysis.referencedVariables;
}

function validateParameterValue(name: string, value: QueryParameterValue): void {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`Parameter $${name} must be a finite number`);
  if (Array.isArray(value)) value.forEach((item) => validateParameterValue(name, item));
}

function removeDescendantProjectionsCapturedBySystemSeeds(
  result: LinkProjectResult,
  graph: RenderGraph,
  scope: QueryScope,
  rootType: string,
): RenderGraph {
  const sourceSystems = new Set(result.elements
    .filter((element) => element.sourceIdentity === scope.tab && elementHasType(element, rootType))
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

function relationshipPatternsReturnedBy(query: ParsedGraphQuery): ReadonlyMap<string, RelationshipPattern> {
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

function rollUpDeploymentSystems(context: EvaluationContext, graph: RenderGraph, rootType: string): RenderGraph {
  const { elementsById, parentByChild } = context;
  const systemFor = (id: string): string | undefined => lineage(baseOccurrenceId(id), parentByChild)
    .find((candidate) => elementHasType(elementsById.get(candidate), rootType));
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
  const openedSystems = openedTabBoundaries(context, rootType);
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

function simplifyDeploymentSystemInfrastructure(
  context: EvaluationContext,
  graph: RenderGraph,
  rootType: string,
): RenderGraph {
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
    .find((candidate) => elementHasType(elementsById.get(candidate), rootType));
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

function internalElements(result: LinkProjectResult, rows: readonly Row[], query: ParsedGraphQuery): ReadonlySet<string> {
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

function evaluationContext(
  base: QueryExecutionContext,
  budget = createQueryBudget(DEFAULT_QUERY_EXECUTION_LIMITS),
): EvaluationContext {
  const nodes = queryNodes(base);
  const relationships = queryRelationships(base, budget);
  return {
    ...base,
    nodes,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    nodesByLabel: indexNodesByLabel(nodes),
    relationships,
    relationshipsBySource: indexRelationships(relationships, (relationship) => relationship.source),
    relationshipsByTarget: indexRelationships(relationships, (relationship) => relationship.target),
    relationshipsByEndpoint: indexRelationshipEndpoints(relationships),
    budget,
  };
}

function indexNodesByLabel(nodes: readonly QueryNode[]): ReadonlyMap<string, readonly QueryNode[]> {
  const result = new Map<string, QueryNode[]>();
  for (const node of nodes) {
    for (const label of labels(node)) {
      const indexed = result.get(label) ?? [];
      indexed.push(node);
      result.set(label, indexed);
    }
  }
  return result;
}

function candidateNodes(context: EvaluationContext, pattern: NodePattern): readonly QueryNode[] {
  return pattern.label === undefined ? context.nodes : context.nodesByLabel.get(pattern.label) ?? [];
}

function indexRelationshipEndpoints(
  relationships: readonly QueryRelationship[],
): ReadonlyMap<string, readonly QueryRelationship[]> {
  const result = new Map<string, QueryRelationship[]>();
  for (const relationship of relationships) {
    for (const endpoint of new Set([relationship.source, relationship.target])) {
      const indexed = result.get(endpoint) ?? [];
      indexed.push(relationship);
      result.set(endpoint, indexed);
    }
  }
  return result;
}

function indexRelationships(
  relationships: readonly QueryRelationship[],
  key: (relationship: QueryRelationship) => string,
): ReadonlyMap<string, readonly QueryRelationship[]> {
  const result = new Map<string, QueryRelationship[]>();
  for (const relationship of relationships) {
    const indexed = result.get(key(relationship)) ?? [];
    indexed.push(relationship);
    result.set(key(relationship), indexed);
  }
  return result;
}

function normalizedLimits(overrides: Partial<QueryExecutionLimits> | undefined): QueryExecutionLimits {
  const limits = { ...DEFAULT_QUERY_EXECUTION_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Query execution limit '${name}' must be a positive integer`);
  }
  return limits;
}

function createQueryBudget(limits: QueryExecutionLimits, signal?: AbortSignal): QueryBudget {
  return {
    limits,
    deadline: Date.now() + limits.timeoutMs,
    ...(signal === undefined ? {} : { signal }),
    expansions: 0,
    values: 0,
  };
}

function chargeExpansion(context: EvaluationContext, count = 1): void {
  context.budget.expansions += count;
  checkQueryBudget(context);
  if (context.budget.expansions > context.budget.limits.maxExpansions) {
    throw new Error(`AIQ_BUDGET_EXCEEDED: query exceeded maxExpansions=${context.budget.limits.maxExpansions}`);
  }
}

function chargeValues(context: EvaluationContext, count: number): void {
  context.budget.values += count;
  checkQueryBudget(context);
  if (context.budget.values > context.budget.limits.maxValues) {
    throw new Error(`AIQ_BUDGET_EXCEEDED: query exceeded maxValues=${context.budget.limits.maxValues}`);
  }
}

function assertRows(context: EvaluationContext, rows: readonly Row[]): void {
  checkQueryBudget(context);
  if (rows.length > context.budget.limits.maxRows) {
    throw new Error(`AIQ_BUDGET_EXCEEDED: query exceeded maxRows=${context.budget.limits.maxRows}`);
  }
}

function appendRow(context: EvaluationContext, rows: Row[], row: Row): void {
  rows.push(row);
  assertRows(context, rows);
}

function appendRows(context: EvaluationContext, rows: Row[], additions: readonly Row[]): void {
  for (const row of additions) appendRow(context, rows, row);
}

function checkQueryBudget(context: EvaluationContext): void {
  if (context.budget.signal?.aborted === true) throw new Error("AIQ_CANCELLED: query execution was cancelled");
  if (Date.now() > context.budget.deadline) {
    throw new Error(`AIQ_BUDGET_EXCEEDED: query exceeded timeoutMs=${context.budget.limits.timeoutMs}`);
  }
}

function assertOutputBudget(value: QueryResult, limits: QueryExecutionLimits): void {
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes > limits.maxOutputBytes) {
    throw new Error(`AIQ_OUTPUT_TOO_LARGE: serialized result exceeds maxOutputBytes=${limits.maxOutputBytes}`);
  }
}

function executeTableQuery(
  context: EvaluationContext,
  query: ParsedTableQuery,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): QueryTableResult {
  let rows: readonly Row[] = [{ nodes: {}, relationships: {}, values: {} }];
  for (let clauseIndex = 0; clauseIndex < query.clauses.length; clauseIndex++) {
    const input = query.clauses[clauseIndex]!;
    if (input.kind === "match") {
      rows = isEndpointReachabilityClause(query, clauseIndex)
        ? endpointReachabilityRows(context, rows, input.clause, parameters)
        : tableMatchRows(context, rows, input.clause, parameters);
    } else if (input.kind === "unwind") {
      const unwound: Row[] = [];
      for (const row of rows) {
        const value = evaluateTableValue(row, input.expression, context, parameters);
        const values = value === null ? [] : Array.isArray(value) ? value : [value];
        chargeValues(context, values.length);
        for (const item of values) appendRow(context, unwound, bindRuntimeValue(row, input.alias, item));
      }
      rows = unwound;
    } else {
      rows = applyTableProjection(rows, input.clause.projection, context, parameters);
      if (input.clause.where !== undefined) {
        rows = rows.filter((row) => evaluateTablePredicate(row, input.clause.where!, context, parameters));
      }
      if (input.clause.orderBy.length > 0) chargeValues(context, rows.length);
      rows = applyTableOrder(rows, input.clause.orderBy);
      rows = applyTablePagination(rows, input.clause.skip, input.clause.limit, parameters);
    }
    assertRows(context, rows);
  }
  rows = applyTableProjection(rows, query.projection, context, parameters);
  if (query.orderBy.length > 0) chargeValues(context, rows.length);
  rows = applyTableOrder(rows, query.orderBy);
  const skip = resolvePagination(query.skip, parameters, 0);
  const limit = query.limit === undefined ? undefined : resolvePagination(query.limit, parameters, 0);
  rows = rows.slice(skip, limit === undefined ? undefined : skip + limit);
  assertRows(context, rows);

  const names = query.projection.items.map((item) => requiredProjectionAlias(item.alias));
  const rawRows = rows.map((row) => names.map((name) => runtimeBinding(row, name)));
  const columns = names.map((name, index): QueryColumn => columnFor(
    name,
    rawRows.map((row) => row[index] ?? null),
    query.projection.items[index]!.expression,
  ));
  return {
    schemaVersion: "aiq-table.v1",
    kind: "table",
    columns,
    rows: rawRows.map((row) => row.map(serializeRuntimeValue)),
    metadata: {
      context: context.scope.context ?? null,
      source: context.scope.tab ?? null,
      executionComplete: true,
      rowCount: rows.length,
      skip,
      limit: limit ?? null,
      pathScopes: query.clauses.flatMap((input) => input.kind === "match" && input.clause.pattern.path !== undefined
        ? [{
            operation: input.clause.pattern.path.mode,
            min: input.clause.pattern.path.min,
            max: input.clause.pattern.path.max ?? null,
            direction: input.clause.pattern.direction ?? "outgoing",
            relationshipType: input.clause.pattern.relationship?.type ?? null,
            selectors: [...(input.clause.pattern.relationship?.selectors ?? [])].sort(),
          }]
        : []),
      warnings: context.result.diagnostics
        .filter((diagnostic) => diagnostic.level === "WARNING" || diagnostic.level === "NOTE")
        .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
    },
  };
}

function endpointReachabilityRows(
  context: EvaluationContext,
  inputRows: readonly Row[],
  clause: TableMatchClause,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): readonly Row[] {
  try {
    const pattern = materializePatternParameters(clause.pattern, context.scope, parameters);
    const definition = pattern.path!;
    const relationship = pattern.relationship!;
    const right = pattern.right!;
    const maximum = definition.max ?? Number.POSITIVE_INFINITY;
    const results: Row[] = [];
    const emitted = new Set<string>();
    for (const row of inputRows) {
      const boundLeft = row.nodes[pattern.left.alias];
      const boundRight = row.nodes[right.alias];
      if ((boundLeft === undefined && hasRuntimeBinding(row, pattern.left.alias))
          || (boundRight === undefined && hasRuntimeBinding(row, right.alias))) continue;
      const starts = (boundLeft === undefined ? candidateNodes(context, pattern.left) : [boundLeft])
        .filter((node) => matchesNode(node, pattern.left, context))
        .sort((left, next) => left.id.localeCompare(next.id));
      for (const start of starts) {
        const emit = (node: QueryNode): void => {
          if (emitted.has(node.id) || !matchesPathTarget(node, boundRight, right, context)) return;
          emitted.add(node.id);
          appendRow(context, results, {
            nodes: { ...row.nodes, [pattern.left.alias]: start, [right.alias]: node },
            relationships: row.relationships,
            values: row.values,
          });
        };
        if (definition.min === 0) emit(start);
        const queue: { readonly node: QueryNode; readonly depth: number }[] = [{ node: start, depth: 0 }];
        const visitedDepth = new Map<string, number>([[start.id, 0]]);
        for (let index = 0; index < queue.length; index++) {
          const state = queue[index]!;
          if (state.depth >= maximum) continue;
          for (const transition of pathTransitions(context, state.node, relationship, pattern.direction)) {
            const nextDepth = state.depth + 1;
            if (nextDepth >= definition.min) emit(transition.node);
            const previousDepth = visitedDepth.get(transition.node.id);
            if (previousDepth !== undefined && previousDepth <= nextDepth) continue;
            visitedDepth.set(transition.node.id, nextDepth);
            chargeValues(context, 1);
            queue.push({ node: transition.node, depth: nextDepth });
          }
        }
      }
    }
    return results;
  } catch (cause) {
    throw queryErrorAt(cause, clause.range);
  }
}

function tableMatchRows(
  context: EvaluationContext,
  inputRows: readonly Row[],
  clause: TableMatchClause,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): readonly Row[] {
  try {
    return tableMatchRowsInternal(context, inputRows, clause, parameters);
  } catch (cause) {
    throw queryErrorAt(cause, clause.range);
  }
}

function tableMatchRowsInternal(
  context: EvaluationContext,
  inputRows: readonly Row[],
  clause: TableMatchClause,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): readonly Row[] {
  const pattern = materializePatternParameters(clause.pattern, context.scope, parameters);
  const match: MatchClause = {
    optional: false,
    rollup: clause.rollup,
    pattern,
  };
  const filter = (rows: readonly Row[]): readonly Row[] => clause.where === undefined
    ? rows
    : rows.filter((row) => evaluateTablePredicate(row, clause.where!, context, parameters));
  const matchedRows = (rows: readonly Row[]): readonly Row[] => {
    const anchoredRows = rows.flatMap((row) => anchorPatternRow(row, pattern, clause.where, context, parameters));
    if (pattern.path?.mode !== "shortest" || clause.where === undefined) return filter(matchRows(context, anchoredRows, match));
    const exhaustivePattern: QueryPattern = {
      ...pattern,
      path: { ...pattern.path, mode: "all", max: pattern.path.max ?? Math.max(0, context.nodes.length - 1) },
    };
    const candidates = filter(pathMatchRows(context, anchoredRows, exhaustivePattern, undefined));
    const shortest = new Map<string, { row: Row; length: number }>();
    for (const candidate of candidates) {
      const path = candidate.values[pattern.path.alias];
      if (!isQueryPath(path)) continue;
      const endpoint = pattern.right === undefined ? "" : candidate.nodes[pattern.right.alias]?.id ?? "";
      const start = candidate.nodes[pattern.left.alias]?.id ?? "";
      const key = `${start}\0${endpoint}`;
      const previous = shortest.get(key);
      if (previous === undefined || path.relationships.length < previous.length) {
        shortest.set(key, { row: candidate, length: path.relationships.length });
      }
    }
    return [...shortest.values()].map((item) => item.row);
  };
  if (!clause.optional) {
    if (pattern.path?.mode !== "shortest" || clause.where === undefined) return matchedRows(inputRows);
    const results: Row[] = [];
    for (const row of inputRows) appendRows(context, results, matchedRows([row]));
    return results;
  }
  const results: Row[] = [];
  for (const row of inputRows) {
    const matched = matchedRows([row]);
    appendRows(context, results, matched.length > 0 ? matched : [bindMissingPatternAliases(row, pattern)]);
  }
  return results;
}

function anchorPatternRow(
  row: Row,
  pattern: QueryPattern,
  where: TableExpression | undefined,
  context: EvaluationContext,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): readonly Row[] {
  if (where === undefined) return [row];
  const aliases = new Set([pattern.left.alias, pattern.right?.alias].filter((alias): alias is string => alias !== undefined));
  let next = row;
  for (const [alias, id] of elementIdAnchors(where, parameters)) {
    if (!aliases.has(alias) || hasRuntimeBinding(next, alias)) continue;
    const node = context.nodeById.get(id);
    if (node === undefined) return [];
    next = bindRuntimeValue(next, alias, node);
  }
  return [next];
}

function elementIdAnchors(
  expression: TableExpression,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): readonly (readonly [alias: string, id: string])[] {
  if (expression.kind === "and") {
    return [...elementIdAnchors(expression.left, parameters), ...elementIdAnchors(expression.right, parameters)];
  }
  if (expression.kind !== "compare" || expression.operator !== "eq") return [];
  const direct = elementIdAnchor(expression.left, expression.right, parameters);
  const reversed = elementIdAnchor(expression.right, expression.left, parameters);
  return direct === undefined ? reversed === undefined ? [] : [reversed] : [direct];
}

function elementIdAnchor(
  candidate: TableValueExpression,
  value: TableValueExpression,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): readonly [alias: string, id: string] | undefined {
  if (candidate.kind !== "function" || candidate.name.toLowerCase() !== "elementid"
      || candidate.arguments.length !== 1 || candidate.arguments[0]?.kind !== "binding") return undefined;
  const resolved = value.kind === "literal" ? value.value
    : value.kind === "parameter" ? parameters[value.name]
    : undefined;
  return typeof resolved === "string" ? [candidate.arguments[0].alias, resolved] : undefined;
}

function materializePatternParameters(
  pattern: QueryPattern,
  scope: QueryScope,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): QueryPattern {
  const resolve = (value: QueryValue): QueryValue => {
    if (value.kind === "literal") return value;
    const resolved = value.name === "context" ? scope.context
      : value.name === "tab" ? scope.tab
      : parameters[value.name];
    if (resolved === undefined || resolved === null || Array.isArray(resolved)) {
      throw new Error(`Pattern property parameter $${value.name} must be a scalar value`);
    }
    return { kind: "literal", value: String(resolved) };
  };
  const node = (value: NodePattern): NodePattern => ({
    ...value,
    properties: Object.fromEntries(Object.entries(value.properties).map(([name, item]) => [name, resolve(item)])),
  });
  return {
    ...pattern,
    left: node(pattern.left),
    ...(pattern.right === undefined ? {} : { right: node(pattern.right) }),
    ...(pattern.relationship === undefined ? {} : {
      relationship: {
        ...pattern.relationship,
        properties: Object.fromEntries(Object.entries(pattern.relationship.properties).map(([name, item]) => [name, resolve(item)])),
      },
    }),
  };
}

function bindMissingPatternAliases(row: Row, pattern: QueryPattern): Row {
  let next = row;
  for (const alias of [pattern.left.alias, pattern.relationship?.alias, pattern.right?.alias, pattern.path?.alias]) {
    if (alias !== undefined && runtimeBinding(next, alias) === null) next = bindRuntimeValue(next, alias, null);
  }
  return next;
}

function bindRuntimeValue(row: Row, alias: string, value: RuntimeValue): Row {
  const nodes = { ...row.nodes };
  const relationships = { ...row.relationships };
  const values = { ...row.values };
  delete nodes[alias];
  delete relationships[alias];
  delete values[alias];
  if (isQueryNode(value)) nodes[alias] = value;
  else if (isQueryRelationship(value)) relationships[alias] = value;
  else values[alias] = value;
  return { nodes, relationships, values };
}

function runtimeBinding(row: Row, alias: string): RuntimeValue {
  return row.nodes[alias] ?? row.relationships[alias] ?? row.values[alias] ?? null;
}

function hasRuntimeBinding(row: Row, alias: string): boolean {
  return Object.hasOwn(row.nodes, alias) || Object.hasOwn(row.relationships, alias) || Object.hasOwn(row.values, alias);
}

function applyTableProjection(
  rows: readonly Row[],
  projection: TableProjection,
  context: EvaluationContext,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): readonly Row[] {
  const aggregateItems = projection.items.filter((item) => isAggregateExpression(item.expression));
  for (const item of projection.items) {
    if (!isAggregateExpression(item.expression) && containsAggregate(item.expression)) {
      throw new Error("Aggregate functions must be the complete projection expression");
    }
  }
  let projected: Row[];
  if (aggregateItems.length === 0) {
    projected = rows.map((row) => projectTableRow(row, projection, context, parameters));
  } else {
    const keys = projection.items.filter((item) => !isAggregateExpression(item.expression));
    const aggregateExpressions = aggregateItems.map((item) => item.expression as Extract<TableValueExpression, { readonly kind: "function" }>);
    const groups = new Map<string, ProjectionGroup>();
    for (const row of rows) {
      const key = runtimeKey(keys.map((item) => evaluateTableValue(row, item.expression, context, parameters)));
      const group = groups.get(key) ?? {
        representative: row,
        aggregates: aggregateExpressions.map(createAggregateState),
      };
      updateAggregateStates(group.aggregates, row, context, parameters);
      groups.set(key, group);
    }
    if (rows.length === 0 && keys.length === 0) {
      groups.set("[]", { aggregates: aggregateExpressions.map(createAggregateState) });
    }
    projected = [...groups.values()].map((group) => {
      let result: Row = { nodes: {}, relationships: {}, values: {} };
      let aggregateIndex = 0;
      for (const item of projection.items) {
        const alias = requiredProjectionAlias(item.alias);
        const value = isAggregateExpression(item.expression)
          ? aggregateResult(group.aggregates[aggregateIndex++]!)
          : evaluateTableValue(requiredRow(group.representative), item.expression, context, parameters);
        result = bindRuntimeValue(result, alias, value);
      }
      return result;
    });
  }
  if (!projection.distinct) return projected;
  const seen = new Set<string>();
  return projected.filter((row) => {
    const key = runtimeKey(projection.items.map((item) => runtimeBinding(row, requiredProjectionAlias(item.alias))));
    if (seen.has(key)) return false;
    seen.add(key);
    chargeValues(context, 1);
    return true;
  });
}

function projectTableRow(
  row: Row,
  projection: TableProjection,
  context: EvaluationContext,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): Row {
  return projection.items.reduce<Row>((result, item) => bindRuntimeValue(
    result,
    requiredProjectionAlias(item.alias),
    evaluateTableValue(row, item.expression, context, parameters),
  ), { nodes: {}, relationships: {}, values: {} });
}

function isAggregateExpression(expression: TableValueExpression): boolean {
  return expression.kind === "function" && aiqFunction(expression.name)?.kind === "aggregate";
}

function containsAggregate(expression: TableValueExpression): boolean {
  if (isAggregateExpression(expression)) return true;
  if (expression.kind === "property") return containsAggregate(expression.target);
  if (expression.kind === "list") return expression.values.some(containsAggregate);
  if (expression.kind === "function") return expression.arguments.some(containsAggregate);
  if (expression.kind === "quantifier") return containsAggregate(expression.source);
  if (expression.kind === "listComprehension") return containsAggregate(expression.source) || containsAggregate(expression.projection);
  return false;
}

function createAggregateState(
  expression: Extract<TableValueExpression, { readonly kind: "function" }>,
): AggregateState {
  const name = expression.name.toLowerCase();
  return {
    expression,
    ...(expression.distinct ? { seen: new Set<string>() } : {}),
    count: 0,
    sum: 0,
    selected: null,
    ...(name === "collect" ? { collected: [] } : {}),
  };
}

function updateAggregateStates(
  states: readonly AggregateState[],
  row: Row,
  context: EvaluationContext,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): void {
  for (const state of states) {
    updateAggregateState(state, row, context, parameters);
  }
}

function updateAggregateState(
  state: AggregateState,
  row: Row,
  context: EvaluationContext,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): void {
  try {
    updateAggregateStateInternal(state, row, context, parameters);
  } catch (cause) {
    throw queryErrorAt(cause, state.expression.range);
  }
}

function updateAggregateStateInternal(
  state: AggregateState,
  row: Row,
  context: EvaluationContext,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): void {
  const expression = state.expression;
  const value: RuntimeValue = expression.star
    ? true
    : expression.arguments[0] === undefined
      ? null
      : evaluateTableValue(row, expression.arguments[0], context, parameters);
  if (value === null) return;
  if (state.seen !== undefined) {
    const key = runtimeKey(value);
    if (state.seen.has(key)) return;
    state.seen.add(key);
    chargeValues(context, 1);
  }
  const name = expression.name.toLowerCase();
  state.count += 1;
  if (name === "collect") {
    state.collected!.push(value);
    chargeValues(context, 1);
    return;
  }
  if (name === "sum" || name === "avg") {
    if (typeof value !== "number") throw new Error(`${expression.name} requires numeric values`);
    state.sum += value;
    if (!Number.isFinite(state.sum)) throw new Error(`${expression.name} result is outside the finite numeric range`);
    return;
  }
  if (name === "count") return;
  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error(`${expression.name} requires homogeneous number or string values`);
  }
  const valueType: "number" | "string" = typeof value === "number" ? "number" : "string";
  if (state.valueType !== undefined && state.valueType !== valueType) {
    throw new Error(`${expression.name} requires homogeneous number or string values`);
  }
  state.valueType = valueType;
  if (state.selected === null || compareOrdered(value, state.selected) * (name === "min" ? 1 : -1) < 0) {
    state.selected = value;
  }
}

function aggregateResult(state: AggregateState): RuntimeValue {
  const name = state.expression.name.toLowerCase();
  if (name === "count") return state.count;
  if (name === "collect") return state.collected!;
  if (name === "sum") return state.sum;
  if (name === "avg") return state.count === 0 ? null : state.sum / state.count;
  return state.selected;
}

function applyTableOrder(rows: readonly Row[], orderBy: readonly { readonly alias: string; readonly direction: "asc" | "desc" }[]): readonly Row[] {
  if (orderBy.length === 0) return rows;
  for (const item of orderBy) {
    if (rows.length > 0 && runtimeBinding(rows[0]!, item.alias) === null && !Object.hasOwn(rows[0]!.values, item.alias)) {
      throw new Error(`ORDER BY references unknown output alias '${item.alias}'`);
    }
  }
  return rows.map((row, index) => ({ row, index })).sort((left, right) => {
    for (const item of orderBy) {
      const comparison = compareForSort(runtimeBinding(left.row, item.alias), runtimeBinding(right.row, item.alias), item.direction);
      if (comparison !== 0) return comparison;
    }
    return left.index - right.index;
  }).map((item) => item.row);
}

function compareForSort(left: RuntimeValue, right: RuntimeValue, direction: "asc" | "desc"): number {
  if (left === null || right === null) {
    if (left === right) return 0;
    const nullOrder = left === null ? 1 : -1;
    return direction === "asc" ? nullOrder : -nullOrder;
  }
  const comparison = compareOrdered(left, right);
  return direction === "asc" ? comparison : -comparison;
}

function compareOrdered(left: RuntimeValue, right: RuntimeValue): number {
  if ((typeof left !== "number" || typeof right !== "number")
      && (typeof left !== "string" || typeof right !== "string")) {
    throw new Error("Ordered comparison requires two numbers or two strings");
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

function applyTablePagination(
  rows: readonly Row[],
  skip: PaginationExpression | undefined,
  limit: PaginationExpression | undefined,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): readonly Row[] {
  const offset = resolvePagination(skip, parameters, 0);
  const count = limit === undefined ? undefined : resolvePagination(limit, parameters, 0);
  return rows.slice(offset, count === undefined ? undefined : offset + count);
}

function resolvePagination(
  expression: PaginationExpression | undefined,
  parameters: Readonly<Record<string, QueryParameterValue>>,
  fallback: number,
): number {
  if (expression === undefined) return fallback;
  const value = expression.kind === "number" ? expression.value : parameters[expression.name];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("SKIP and LIMIT require non-negative safe integers");
  }
  return value;
}

function evaluateTablePredicate(
  row: Row,
  expression: TableExpression,
  context: EvaluationContext,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): boolean {
  try {
    return evaluateTablePredicateInternal(row, expression, context, parameters);
  } catch (cause) {
    throw queryErrorAt(cause, expression.range);
  }
}

function evaluateTablePredicateInternal(
  row: Row,
  expression: TableExpression,
  context: EvaluationContext,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): boolean {
  if (expression.kind === "and") {
    return evaluateTablePredicate(row, expression.left, context, parameters)
      && evaluateTablePredicate(row, expression.right, context, parameters);
  }
  if (expression.kind === "or") {
    return evaluateTablePredicate(row, expression.left, context, parameters)
      || evaluateTablePredicate(row, expression.right, context, parameters);
  }
  if (expression.kind === "not") return !evaluateTablePredicate(row, expression.expression, context, parameters);
  if (expression.kind === "truthy") return evaluateTableValue(row, expression.expression, context, parameters) === true;
  const left = evaluateTableValue(row, expression.left, context, parameters);
  if (expression.kind === "is") {
    if (expression.target.toLowerCase() === "null") return left === null;
    return tableValueMatchesType(left, expression.target, context);
  }
  const right = evaluateTableValue(row, expression.right, context, parameters);
  if (expression.kind === "in") {
    return Array.isArray(right)
      ? right.some((value) => equalRuntimeValues(left, value))
      : equalRuntimeValues(left, right);
  }
  if (left === null || right === null) return false;
  if (expression.operator === "eq") return equalRuntimeValues(left, right);
  if (expression.operator === "ne") return !equalRuntimeValues(left, right);
  if (expression.operator === "contains") {
    if (typeof left === "string" && typeof right === "string") return left.includes(right);
    if (Array.isArray(left)) return left.some((value) => equalRuntimeValues(value, right));
    return false;
  }
  const comparison = compareOrdered(left, right);
  return expression.operator === "lt" ? comparison < 0
    : expression.operator === "lte" ? comparison <= 0
    : expression.operator === "gt" ? comparison > 0
    : comparison >= 0;
}

function evaluateTableValue(
  row: Row,
  expression: TableValueExpression,
  context: EvaluationContext,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): RuntimeValue {
  try {
    return evaluateTableValueInternal(row, expression, context, parameters);
  } catch (cause) {
    throw queryErrorAt(cause, expression.range);
  }
}

function evaluateTableValueInternal(
  row: Row,
  expression: TableValueExpression,
  context: EvaluationContext,
  parameters: Readonly<Record<string, QueryParameterValue>>,
): RuntimeValue {
  if (expression.kind === "literal") return expression.value;
  if (expression.kind === "parameter") {
    if (expression.name === "context") return context.scope.context ?? null;
    if (expression.name === "tab") return context.scope.tab ?? null;
    return parameterAsRuntime(parameters[expression.name] ?? null);
  }
  if (expression.kind === "binding") return runtimeBinding(row, expression.alias);
  if (expression.kind === "property") {
    const target = evaluateTableValue(row, expression.target, context, parameters);
    return runtimeProperty(target, expression.property);
  }
  if (expression.kind === "list") {
    const values = expression.values.map((value) => evaluateTableValue(row, value, context, parameters));
    chargeValues(context, values.length);
    return values;
  }
  if (expression.kind === "function") {
    if (isAggregateExpression(expression)) throw new Error(`Aggregate ${expression.name} is only valid as a projection item`);
    const values = expression.arguments.map((value) => evaluateTableValue(row, value, context, parameters));
    return evaluateTableFunction(expression.name, values, context);
  }
  if (expression.kind === "quantifier") {
    const source = evaluateTableValue(row, expression.source, context, parameters);
    if (source === null) return null;
    if (!Array.isArray(source)) throw new Error(`${expression.name} requires a list`);
    chargeValues(context, source.length);
    const results = source.map((value) => expression.predicate === undefined
      ? Boolean(value)
      : evaluateTablePredicate(bindRuntimeValue(row, expression.alias, value), expression.predicate, context, parameters));
    const name = expression.name.toLowerCase();
    if (name === "all") return results.every(Boolean);
    if (name === "any") return results.some(Boolean);
    throw new Error(`Unknown quantifier function '${expression.name}'`);
  }
  const source = evaluateTableValue(row, expression.source, context, parameters);
  if (source === null) return [];
  if (!Array.isArray(source)) throw new Error("List comprehension requires a list");
  const result = source.flatMap((value) => {
    const nested = bindRuntimeValue(row, expression.alias, value);
    if (expression.predicate !== undefined && !evaluateTablePredicate(nested, expression.predicate, context, parameters)) return [];
    return [evaluateTableValue(nested, expression.projection, context, parameters)];
  });
  chargeValues(context, result.length);
  return result;
}

function queryErrorAt(cause: unknown, range: QuerySourceRange | undefined): AiqQueryError {
  if (cause instanceof AiqQueryError) return cause;
  const normalized = normalizeAiqError(cause);
  return range === undefined ? normalized : new AiqQueryError(normalized.code, normalized.detail, range);
}

function parameterAsRuntime(value: QueryParameterValue): RuntimeValue {
  return Array.isArray(value) ? value.map(parameterAsRuntime) : value as Exclude<QueryParameterValue, readonly QueryParameterValue[]>;
}

function runtimeProperty(value: RuntimeValue, name: string): RuntimeValue {
  if (value === null) return null;
  if (isQueryPath(value)) {
    if (name === "steps") return value.steps.map((step) => ({ ...step }));
    if (name === "nodes") return value.nodes;
    if (name === "relationships") return value.relationships;
    if (name === "length") return value.relationships.length;
    return null;
  }
  if (isQueryNode(value)) return propertyValue(value, name) ?? null;
  if (isQueryRelationship(value)) return edgePropertyValue(value, name) ?? null;
  if (Array.isArray(value)) return name === "length" || name === "size" ? value.length : null;
  if (typeof value === "object") return (value as RuntimeRecord)[name] ?? null;
  return null;
}

function evaluateTableFunction(name: string, values: readonly RuntimeValue[], context: EvaluationContext): RuntimeValue {
  switch (name.toLowerCase()) {
    case "elementid": {
      const value = values[0];
      return isQueryNode(value) ? value.id : isQueryRelationship(value) ? queryRelationshipIdentity(value) : null;
    }
    case "nodes": return isQueryPath(values[0]) ? values[0].nodes : null;
    case "relationships": return isQueryPath(values[0]) ? values[0].relationships : null;
    case "length": return isQueryPath(values[0]) ? values[0].relationships.length : null;
    case "size": {
      const value = values[0];
      return typeof value === "string" || Array.isArray(value) ? value.length : null;
    }
    case "coalesce": return values.find((value) => value !== null) ?? null;
    case "tointeger": return convertToInteger(values[0] ?? null);
    case "tofloat": return convertToFloat(values[0] ?? null);
    case "toboolean": return convertToBoolean(values[0] ?? null);
    case "tostring": return convertToString(values[0] ?? null);
    case "annotations": {
      const value = values[0];
      const annotations = isQueryNode(value)
        ? value.kind === "element" ? value.element.annotations : undefined
        : isQueryRelationship(value) ? value.edge?.annotations : undefined;
      return (annotations ?? []).map((annotation) => ({
        name: annotation.name,
        value: annotation.value ?? null,
        ...(annotation.source === undefined ? {} : { source: annotation.source as unknown as RuntimeValue }),
      }));
    }
    case "startnode": {
      const value = values[0];
      return isQueryRelationship(value) ? context.nodeById.get(value.source) ?? null : null;
    }
    case "endnode": {
      const value = values[0];
      return isQueryRelationship(value) ? context.nodeById.get(value.target) ?? null : null;
    }
    case "originid": {
      const value = values[0];
      return isQueryRelationship(value) ? value.edge?.id ?? null : null;
    }
    default: throw new Error(`Unknown AIQ function '${name}'`);
  }
}

function convertToInteger(value: RuntimeValue): RuntimeValue {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function convertToFloat(value: RuntimeValue): RuntimeValue {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function convertToBoolean(value: RuntimeValue): RuntimeValue {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  return value.toLowerCase() === "true" ? true : value.toLowerCase() === "false" ? false : null;
}

function convertToString(value: RuntimeValue): RuntimeValue {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : null;
}

function tableValueMatchesType(value: RuntimeValue, target: string, context: EvaluationContext): boolean {
  if (isQueryNode(value)) return matchesTypePredicate(value, target);
  if (isQueryRelationship(value)) {
    const type = value.edge?.type ?? value.type ?? value.kind;
    const typeNode = context.nodes.find((node) => node.kind === "type" && node.type === type);
    return type === target || value.kind === target || (typeNode !== undefined && labels(typeNode).has(target));
  }
  return false;
}

function equalRuntimeValues(left: RuntimeValue, right: RuntimeValue): boolean {
  return runtimeKey(left) === runtimeKey(right);
}

function runtimeKey(value: RuntimeValue | readonly RuntimeValue[]): string {
  return JSON.stringify(serializeRuntimeValue(value as RuntimeValue));
}

function isQueryRelationship(value: unknown): value is QueryRelationship {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && "source" in value && "target" in value && "derived" in value && "projected" in value;
}

function isQueryPath(value: unknown): value is QueryPath {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && "kind" in value && value.kind === "path" && "steps" in value && "relationships" in value;
}

function requiredProjectionAlias(alias: string | undefined): string {
  if (alias === undefined) throw new Error("Table projection expression requires AS name");
  return alias;
}

function requiredRow(row: Row | undefined): Row {
  if (row === undefined) throw new Error("Non-aggregate projection cannot be evaluated on an empty group");
  return row;
}

function serializeRuntimeValue(value: RuntimeValue): QueryCell {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(serializeRuntimeValue);
  if (isQueryPath(value)) {
    return {
      kind: "path",
      length: value.relationships.length,
      nodes: value.nodes.map(serializeRuntimeValue),
      relationships: value.relationships.map(serializeRuntimeValue),
      steps: value.steps,
    };
  }
  if (isQueryNode(value)) {
    if (value.kind === "element") {
      return {
        kind: "node",
        nodeKind: value.kind,
        id: value.id,
        type: value.element.type,
        labels: [...labels(value)],
        attributes: value.element.attributes,
        source: value.element.declaration ?? null,
      };
    }
    return { kind: "node", nodeKind: value.kind, id: value.id, labels: [...labels(value)] };
  }
  if (isQueryRelationship(value)) {
    return {
      kind: "relationship",
      id: queryRelationshipIdentity(value),
      originId: value.edge?.id ?? null,
      relationshipKind: value.kind,
      type: value.edge?.type ?? value.type ?? value.kind,
      source: value.source,
      target: value.target,
      derived: value.derived,
      projected: value.projected,
      attributes: value.edge?.attributes ?? {},
      sourceLocation: value.edge?.declaration ?? null,
    };
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeRuntimeValue(item)]));
}

function queryRelationshipIdentity(value: QueryRelationship): string {
  const origin = value.edge?.id ?? `${value.kind}:${value.source}:${value.target}`;
  return `${origin}:${value.source}:${value.target}:${value.derived ? "d" : "a"}:${value.projected ? "p" : "l"}`;
}

function columnFor(name: string, values: readonly RuntimeValue[], expression: TableValueExpression): QueryColumn {
  const present = values.filter((value) => value !== null);
  const types = new Set(present.map(runtimeColumnType));
  const type = types.size === 1 ? [...types][0]! : types.size === 0 ? staticColumnType(expression) : "any";
  const listItems = type === "list"
    ? present.flatMap((value) => Array.isArray(value) ? value : []).filter((value) => value !== null)
    : [];
  const itemTypes = new Set(listItems.map(runtimeColumnType));
  const itemType = itemTypes.size === 1 ? [...itemTypes][0] : undefined;
  return { name, type, nullable: values.length === 0 || values.some((value) => value === null), ...(itemType === undefined ? {} : { itemType }) };
}

function runtimeColumnType(value: RuntimeValue): QueryColumn["type"] {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "list";
  if (isQueryPath(value)) return "path";
  if (isQueryNode(value)) return "node";
  if (isQueryRelationship(value)) return "relationship";
  return "record";
}

function staticColumnType(expression: TableValueExpression): QueryColumn["type"] {
  if (expression.kind === "literal") return expression.value === null ? "any" : runtimeColumnType(expression.value);
  if (expression.kind === "list" || expression.kind === "listComprehension") return "list";
  if (expression.kind === "function") {
    const name = expression.name.toLowerCase();
    if (["count", "sum", "avg", "size", "length", "tointeger", "tofloat"].includes(name)) return "number";
    if (["collect", "annotations", "nodes", "relationships"].includes(name)) return "list";
    if (["toboolean", "all", "any"].includes(name)) return "boolean";
    if (["elementid", "tostring", "originid"].includes(name)) return "string";
  }
  if (expression.kind === "quantifier") return "boolean";
  return "any";
}

function evaluate(context: EvaluationContext, query: ParsedGraphQuery): readonly Row[] {
  let rows: readonly Row[] = [{ nodes: {}, relationships: {}, values: {} }];
  for (const match of query.matches) {
    rows = match.optional
      ? optionalMatchRows(context, rows, match)
      : matchRows(context, rows, match);
    assertRows(context, rows);
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
      appendRow(context, next, row);
    } else {
      appendRows(context, next, matched);
    }
  }
  return next;
}

function matchRows(
  context: EvaluationContext,
  inputRows: readonly Row[],
  clause: MatchClause,
): readonly Row[] {
  if (clause.pattern.path !== undefined) {
    return pathMatchRows(context, inputRows, clause.pattern, clause.where);
  }
  if (clause.rollup) {
    return rollupMatchRows(context, inputRows, clause.pattern, clause.where);
  }
  const pattern = clause.pattern;
  const rows: Row[] = [];
  if (pattern.relationship === undefined || pattern.right === undefined) {
    for (const row of inputRows) {
      const bound = row.nodes[pattern.left.alias];
      if (bound === undefined && hasRuntimeBinding(row, pattern.left.alias)) continue;
      const candidates = bound === undefined ? candidateNodes(context, pattern.left) : [bound];
      for (const node of candidates) {
        chargeExpansion(context);
        if (matchesNode(node, pattern.left, context)) {
          appendRow(context, rows, {
            nodes: { ...row.nodes, [pattern.left.alias]: node },
            relationships: row.relationships,
            values: row.values,
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
    if ((boundLeft === undefined && hasRuntimeBinding(row, pattern.left.alias))
        || (boundRight === undefined && hasRuntimeBinding(row, right.alias))
        || (relationship.alias !== undefined && boundRelationship === undefined && hasRuntimeBinding(row, relationship.alias))) {
      continue;
    }
    const candidates = candidateRelationships(context, pattern.direction, boundLeft, boundRight, boundRelationship);
    for (const edge of candidates) {
      chargeExpansion(context);
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
          values: row.values,
        };
        if (matchesNode(orientation.left, pattern.left, context) && matchesNode(orientation.right, right, context)) {
          appendRow(context, rows, nextRow);
        }
      }
    }
  }
  return rows.filter((row) => evaluateExpression(row, clause.where, context));
}

function candidateRelationships(
  context: EvaluationContext,
  direction: QueryPattern["direction"],
  left: QueryNode | undefined,
  right: QueryNode | undefined,
  relationship: QueryRelationship | undefined,
): readonly QueryRelationship[] {
  if (relationship !== undefined) return [relationship];
  if (left !== undefined) {
    if (direction === "outgoing") return context.relationshipsBySource.get(left.id) ?? [];
    if (direction === "incoming") return context.relationshipsByTarget.get(left.id) ?? [];
    return context.relationshipsByEndpoint.get(left.id) ?? [];
  }
  if (right !== undefined) {
    if (direction === "outgoing") return context.relationshipsByTarget.get(right.id) ?? [];
    if (direction === "incoming") return context.relationshipsBySource.get(right.id) ?? [];
    return context.relationshipsByEndpoint.get(right.id) ?? [];
  }
  return context.relationships;
}

interface PathTraversalState {
  readonly nodes: readonly QueryNode[];
  readonly relationships: readonly QueryRelationship[];
  readonly steps: readonly QueryPathStep[];
  readonly usedRelationships: ReadonlySet<string>;
}

interface PathTransition {
  readonly node: QueryNode;
  readonly relationship: QueryRelationship;
  readonly identity: string;
  readonly direction: "forward" | "reverse";
}

function pathMatchRows(
  context: EvaluationContext,
  inputRows: readonly Row[],
  pattern: QueryPattern,
  where: Expression | undefined,
): readonly Row[] {
  const definition = pattern.path;
  const relationship = pattern.relationship;
  const right = pattern.right;
  if (definition === undefined || relationship === undefined || right === undefined) return [];
  if (pattern.path !== undefined && pattern.path.mode === "shortest" && pattern.path.min > 1) {
    throw new Error("shortestPath supports a minimum of 0 or 1");
  }
  const results: Row[] = [];
  for (const row of inputRows) {
    const boundLeft = row.nodes[pattern.left.alias];
    const boundRight = row.nodes[right.alias];
    if ((boundLeft === undefined && hasRuntimeBinding(row, pattern.left.alias))
        || (boundRight === undefined && hasRuntimeBinding(row, right.alias))) {
      continue;
    }
    if (definition.mode === "shortest" && boundLeft === undefined && boundRight === undefined) {
      throw new Error("shortestPath requires at least one endpoint to be bound by an earlier clause");
    }
    const starts = (boundLeft === undefined ? candidateNodes(context, pattern.left) : [boundLeft])
      .filter((node) => matchesNode(node, pattern.left, context))
      .sort((left, next) => left.id.localeCompare(next.id));
    for (const start of starts) {
      const paths = definition.mode === "shortest"
        ? shortestPaths(context, start, boundRight, right, relationship, pattern.direction, definition.min, definition.max)
        : enumeratePaths(context, start, boundRight, right, relationship, pattern.direction, definition.min, definition.max!);
      for (const path of paths) {
        const next = bindMatchedPath(row, pattern, path);
        if (evaluateExpression(next, where, context)) appendRow(context, results, next);
      }
    }
  }
  return results;
}

function shortestPaths(
  context: EvaluationContext,
  start: QueryNode,
  boundRight: QueryNode | undefined,
  rightPattern: NodePattern,
  relationshipPattern: RelationshipPattern,
  direction: QueryPattern["direction"],
  min: number,
  requestedMax: number | undefined,
): readonly QueryPath[] {
  const maximum = requestedMax ?? Math.max(0, context.nodes.length - 1);
  const initial: PathTraversalState = { nodes: [start], relationships: [], steps: [], usedRelationships: new Set() };
  const queue: PathTraversalState[] = [initial];
  const visitedDepth = new Map<string, number>([[start.id, 0]]);
  const found = new Map<string, QueryPath>();
  for (let index = 0; index < queue.length; index++) {
    const state = queue[index]!;
    const current = state.nodes[state.nodes.length - 1]!;
    const depth = state.relationships.length;
    if (depth >= min && matchesPathTarget(current, boundRight, rightPattern, context) && !found.has(current.id)) {
      found.set(current.id, traversalPath(state));
    }
    if (depth >= maximum) continue;
    for (const transition of pathTransitions(context, current, relationshipPattern, direction)) {
      if (state.usedRelationships.has(transition.identity)) continue;
      const nextDepth = depth + 1;
      const previousDepth = visitedDepth.get(transition.node.id);
      if (previousDepth !== undefined && previousDepth <= nextDepth) continue;
      visitedDepth.set(transition.node.id, nextDepth);
      chargeValues(context, 3);
      queue.push(appendTransition(state, transition));
    }
  }
  return [...found.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, path]) => path);
}

function enumeratePaths(
  context: EvaluationContext,
  start: QueryNode,
  boundRight: QueryNode | undefined,
  rightPattern: NodePattern,
  relationshipPattern: RelationshipPattern,
  direction: QueryPattern["direction"],
  min: number,
  max: number,
): readonly QueryPath[] {
  const results: QueryPath[] = [];
  const visit = (state: PathTraversalState): void => {
    const current = state.nodes[state.nodes.length - 1]!;
    const depth = state.relationships.length;
    if (depth >= min && matchesPathTarget(current, boundRight, rightPattern, context)) results.push(traversalPath(state));
    if (depth >= max) return;
    for (const transition of pathTransitions(context, current, relationshipPattern, direction)) {
      if (!state.usedRelationships.has(transition.identity)) {
        chargeValues(context, 3);
        visit(appendTransition(state, transition));
      }
    }
  };
  visit({ nodes: [start], relationships: [], steps: [], usedRelationships: new Set() });
  return results;
}

function pathTransitions(
  context: EvaluationContext,
  current: QueryNode,
  pattern: RelationshipPattern,
  direction: QueryPattern["direction"],
): readonly PathTransition[] {
  const transitions: PathTransition[] = [];
  const candidates = direction === "outgoing"
    ? context.relationshipsBySource.get(current.id) ?? []
    : direction === "incoming"
      ? context.relationshipsByTarget.get(current.id) ?? []
      : context.relationshipsByEndpoint.get(current.id) ?? [];
  for (const relationship of candidates) {
    chargeExpansion(context);
    if (!matchesRelationship(relationship, pattern, context)) continue;
    const identity = queryRelationshipIdentity(relationship);
    if ((direction === "outgoing" || direction === "undirected") && relationship.source === current.id) {
      const node = context.nodeById.get(relationship.target);
      if (node !== undefined) transitions.push({ node, relationship, identity, direction: "forward" });
    }
    if ((direction === "incoming" || direction === "undirected") && relationship.target === current.id
        && (relationship.source !== relationship.target || direction !== "undirected")) {
      const node = context.nodeById.get(relationship.source);
      if (node !== undefined) transitions.push({ node, relationship, identity, direction: "reverse" });
    }
  }
  return transitions.sort((left, right) =>
    left.identity.localeCompare(right.identity)
      || left.direction.localeCompare(right.direction)
      || left.node.id.localeCompare(right.node.id)
  );
}

function appendTransition(state: PathTraversalState, transition: PathTransition): PathTraversalState {
  const from = state.nodes[state.nodes.length - 1]!.id;
  const usedRelationships = new Set(state.usedRelationships);
  usedRelationships.add(transition.identity);
  return {
    nodes: [...state.nodes, transition.node],
    relationships: [...state.relationships, transition.relationship],
    steps: [...state.steps, {
      index: state.steps.length,
      from,
      to: transition.node.id,
      relationshipId: transition.identity,
      direction: transition.direction,
    }],
    usedRelationships,
  };
}

function traversalPath(state: PathTraversalState): QueryPath {
  return { kind: "path", nodes: state.nodes, relationships: state.relationships, steps: state.steps };
}

function matchesPathTarget(
  node: QueryNode,
  bound: QueryNode | undefined,
  pattern: NodePattern,
  context: EvaluationContext,
): boolean {
  return (bound === undefined || bound.id === node.id) && matchesNode(node, pattern, context);
}

function bindMatchedPath(row: Row, pattern: QueryPattern, path: QueryPath): Row {
  const right = pattern.right!;
  let next: Row = {
    nodes: {
      ...row.nodes,
      [pattern.left.alias]: path.nodes[0]!,
      [right.alias]: path.nodes[path.nodes.length - 1]!,
    },
    relationships: row.relationships,
    values: { ...row.values, [pattern.path!.alias]: path },
  };
  if (pattern.relationship?.alias !== undefined) {
    next = bindRuntimeValue(next, pattern.relationship.alias, path.relationships);
  }
  return next;
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
    if ((boundLeft === undefined && hasRuntimeBinding(row, pattern.left.alias))
        || (boundRight === undefined && hasRuntimeBinding(row, right.alias))
        || (relationship.alias !== undefined && boundRelationship === undefined && hasRuntimeBinding(row, relationship.alias))) {
      continue;
    }
    for (const edge of relationships) {
      chargeExpansion(context);
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
            values: row.values,
          };
          if (matchesNode(sourceEndpoint.binding, orientation.sourcePattern, context)
              && matchesNode(targetEndpoint.binding, orientation.targetPattern, context)
              && evaluateExpression(nextRow, where, context)) {
            appendRow(context, rows, nextRow);
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
    if (where === undefined || evaluateExpression({ nodes: { [pattern.alias]: node }, relationships: {}, values: {} }, where, context)) {
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

function queryRelationships(context: QueryExecutionContext, budget: QueryBudget): readonly QueryRelationship[] {
  const edgeByRelationId = linkedEdgesByGraphRelationId(context.result);
  const relationships: QueryRelationship[] = context.result.graph.relations().flatMap((relation) => {
    chargeRawExpansion(budget);
    return queryRelationshipVariants(relation, edgeByRelationId.get(relation.id), context.contextBySourceIdentity);
  });
  const parentByChild = context.parentByChild;
  for (const relationship of [...relationships]) {
    if (relationship.kind !== "REFERENCES" || relationship.edge === undefined) {
      continue;
    }
    for (const source of lineage(relationship.source, parentByChild)) {
      for (const target of lineage(relationship.target, parentByChild)) {
        chargeRawExpansion(budget);
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

function chargeRawExpansion(budget: QueryBudget): void {
  if (budget.signal?.aborted === true) throw new Error("AIQ_CANCELLED: query execution was cancelled");
  if (Date.now() > budget.deadline) throw new Error(`AIQ_BUDGET_EXCEEDED: query exceeded timeoutMs=${budget.limits.timeoutMs}`);
  budget.expansions++;
  if (budget.expansions > budget.limits.maxExpansions) {
    throw new Error(`AIQ_BUDGET_EXCEEDED: query exceeded maxExpansions=${budget.limits.maxExpansions}`);
  }
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
    return new Set(["Type"]);
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
