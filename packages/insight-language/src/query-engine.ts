import type {
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

export const DEFAULT_QUERY = "MATCH (n:Element {context: $context}) RETURN n";

interface NodePattern {
  readonly alias: string;
  readonly label?: string;
  readonly properties: Readonly<Record<string, QueryValue>>;
}

interface RelationshipPattern {
  readonly alias?: string;
  readonly type?: string;
  readonly properties: Readonly<Record<string, QueryValue>>;
  readonly selectors: ReadonlySet<string>;
}

interface QueryPattern {
  readonly left: NodePattern;
  readonly relationship?: RelationshipPattern;
  readonly right?: NodePattern;
  readonly direction?: "outgoing" | "incoming" | "undirected";
}

interface MatchClause {
  readonly optional: boolean;
  readonly rollup: boolean;
  readonly pattern: QueryPattern;
  readonly where?: Expression;
}

interface ParsedQuery {
  readonly matches: readonly MatchClause[];
  readonly groupBy?: ValueExpression;
  readonly returns: readonly string[];
}

interface Row {
  readonly nodes: Readonly<Record<string, QueryNode>>;
  readonly relationships: Readonly<Record<string, QueryRelationship>>;
}

interface RollupEndpoint {
  readonly id: string;
  readonly binding: QueryNode;
}

interface EvaluationContext {
  readonly result: LinkProjectResult;
  readonly scope: QueryScope;
  readonly tabClosure: ReadonlySet<string>;
}

interface QueryRelationship {
  readonly edge?: LinkedEdge;
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

type QueryValue =
  | { readonly kind: "literal"; readonly value: string }
  | { readonly kind: "variable"; readonly name: string };

type Expression =
  | { readonly kind: "and"; readonly left: Expression; readonly right: Expression }
  | { readonly kind: "or"; readonly left: Expression; readonly right: Expression }
  | { readonly kind: "not"; readonly expression: Expression }
  | { readonly kind: "is"; readonly left: ValueExpression; readonly target: string }
  | { readonly kind: "in"; readonly left: ValueExpression; readonly right: ValueExpression }
  | { readonly kind: "compare"; readonly operator: "eq" | "ne" | "contains"; readonly left: ValueExpression; readonly right: ValueExpression };

type ValueExpression =
  | { readonly kind: "property"; readonly alias: string; readonly property: string }
  | { readonly kind: "binding"; readonly alias: string }
  | { readonly kind: "list"; readonly values: readonly QueryValue[] }
  | QueryValue;

export function selectGraph(
  result: LinkProjectResult,
  scope: QueryScope,
  query: string | undefined,
): RenderGraph {
  const parsed = parseQuery(query === undefined || query.trim() === "" ? DEFAULT_QUERY : query);
  const rows = evaluate(result, scope, parsed);
  const selectedElements = new Map<string, LinkedElement>();
  const selectedEdges: RenderGraphEdge[] = [];
  const groups = new Map<string, RenderGraphGroup>();
  const nodeById = queryNodeIndex(result);

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
            edge: edge.edge,
            source: edge.source,
            target: edge.target,
            derived: edge.derived,
            projected: edge.projected,
          });
        }
      }
    }
    if (parsed.groupBy !== undefined) {
      collectGroup(groups, row, parsed.groupBy, scope);
    }
  }
  let groupedSelectedElements: ReadonlySet<string> = new Set<string>();
  if (parsed.groupBy !== undefined) {
    groupedSelectedElements = collectSelectedReferenceGroups(selectedElements, groups, parsed.groupBy);
    for (const owner of completeReferenceGroupClosure(result, groups, parsed.groupBy)) {
      const element = linkedElementForNode(nodeById.get(owner));
      if (element !== undefined) {
        selectedElements.set(owner, element);
      }
    }
  }

  const completedEdges = selectedEdges.length > 0
    ? selectedEdges
    : result.edges
      .filter((edge) => edge.projected !== true && selectedElements.has(edge.source) && selectedElements.has(edge.target))
      .map((edge) => ({ edge, source: edge.source, target: edge.target, derived: false, projected: false }));
  const internalElementIds = new Set([...internalElements(result, rows, parsed)]
    .filter((id) => selectedElements.has(id)));
  const externalElements = [...selectedElements.keys()]
    .filter((id) => !internalElementIds.has(id) && !groupedSelectedElements.has(id));
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
  return materializeGroupedView(applyViewBoundary(result, selectedGraph, scope));
}

export function selectGraphs(
  result: LinkProjectResult,
  scopes: readonly QueryScope[],
  query: string | undefined,
): ReadonlyMap<QueryScope, RenderGraph> {
  return new Map(scopes.map((scope) => [scope, selectGraph(result, scope, query)]));
}

function addSelectedEdge(edges: RenderGraphEdge[], next: RenderGraphEdge): void {
  if (edges.some((edge) => edge.edge === next.edge && edge.source === next.source && edge.target === next.target)) {
    return;
  }
  edges.push(next);
}

function materializeGroupedView(graph: RenderGraph): RenderGraph {
  const groupsByElement = new Map<string, RenderGraphGroup[]>();
  for (const group of graph.groups) {
    for (const element of group.elements) {
      groupsByElement.set(element, [...(groupsByElement.get(element) ?? []), group]);
    }
  }
  const cloneIdsByElementAndGroup = new Map<string, string>();
  for (const [elementId, memberships] of groupsByElement) {
    if (memberships.length < 2) {
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
    if (memberships.length < 2) {
      continue;
    }
    const element = graph.elements[elementId];
    if (element === undefined) {
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
    source: cloneEndpoint(edge.source, edge.edge.projectionScope, cloneIdsByElementAndGroup),
    target: cloneEndpoint(edge.target, edge.edge.projectionScope, cloneIdsByElementAndGroup),
  }));
  const referenced = new Set<string>([
    ...groups.flatMap((group) => group.elements),
    ...edges.flatMap((edge) => [edge.source, edge.target]),
  ]);
  for (const [elementId, memberships] of groupsByElement) {
    if (memberships.length >= 2 && !referenced.has(elementId)) {
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
      return memberships.length < 2
        ? [element]
        : memberships.map((group) => groupedCloneId(element, group.owner));
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

function applyViewBoundary(result: LinkProjectResult, graph: RenderGraph, scope: QueryScope): RenderGraph {
  const view = scope.view;
  if (view !== "c1" && view !== "c2" && view !== "c3" && view !== "c4") {
    return graph;
  }
  const elementsById = new Map(result.elements.map((element) => [element.id, element]));
  const parentByChild = new Map(result.elements.flatMap((element) =>
    element.parent === undefined ? [] : [[element.id, element.parent]]
  ));
  const openedBoundaries = openedViewBoundaries(result, scope);
  const inside = (id: string): boolean => elementInsideView(elementsById.get(id), scope, openedBoundaries, parentByChild);
  const visibleType = visibleElementType(view);
  const foldedIds = new Map<string, string>();
  const fold = (id: string): string => {
    const existing = foldedIds.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const folded = inside(id)
      ? id
      : closedViewBoundaryEndpoint(id, view, elementsById, parentByChild) ?? id;
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
      ? closedViewBoundaryEndpoint(originSource, view, elementsById, parentByChild) ?? fold(edge.source)
      : openViewEndpoint(originSource, view, elementsById, parentByChild) ?? fold(edge.source);
    const foldedTarget = targetOutside
      ? closedViewBoundaryEndpoint(originTarget, view, elementsById, parentByChild) ?? fold(edge.target)
      : openViewEndpoint(originTarget, view, elementsById, parentByChild) ?? fold(edge.target);
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
  result: LinkProjectResult,
  scope: QueryScope,
): ReadonlySet<string> {
  if (scope.view === "c1") {
    return new Set(scope.context === undefined ? [] : [scope.context]);
  }
  const boundaryType = scope.view === "c2"
    ? "SystemElement"
    : scope.view === "c3"
      ? "ContainerElement"
      : "ComponentElement";
  const closure = tabClosure(result, scope.tab);
  const elementsById = new Map(result.elements.map((element) => [element.id, element]));
  const parentByChild = new Map(result.elements.flatMap((element) =>
    element.parent === undefined ? [] : [[element.id, element.parent]]
  ));
  return new Set([...closure]
    .flatMap((id) => lineage(id, parentByChild))
    .filter((id) => elementHasType(elementsById.get(id), boundaryType))
    .sort());
}

function elementInsideView(
  element: LinkedElement | undefined,
  scope: QueryScope,
  openedBoundaries: ReadonlySet<string>,
  parentByChild: ReadonlyMap<string, string>,
): boolean {
  if (element === undefined) {
    return false;
  }
  if (scope.view === "c1") {
    return scope.context !== undefined && element.context === scope.context;
  }
  return lineage(element.id, parentByChild).some((id) => openedBoundaries.has(id));
}

function closedViewBoundaryEndpoint(
  id: string,
  view: "c1" | "c2" | "c3" | "c4",
  elementsById: ReadonlyMap<string, LinkedElement>,
  parentByChild: ReadonlyMap<string, string>,
): string | undefined {
  const boundaryType = view === "c1" || view === "c2"
    ? "SystemElement"
    : view === "c3"
      ? "ContainerElement"
      : "ComponentElement";
  return lineage(id, parentByChild)
    .find((candidate) => elementHasType(elementsById.get(candidate), boundaryType));
}

function openViewEndpoint(
  id: string,
  view: "c1" | "c2" | "c3" | "c4",
  elementsById: ReadonlyMap<string, LinkedElement>,
  parentByChild: ReadonlyMap<string, string>,
): string | undefined {
  const elementType = visibleElementType(view);
  return lineage(id, parentByChild)
    .find((candidate) => elementHasType(elementsById.get(candidate), elementType));
}

function visibleElementType(view: "c1" | "c2" | "c3" | "c4"): string {
  return view === "c1"
    ? "SystemElement"
    : view === "c2"
      ? "ContainerElement"
      : view === "c3"
        ? "ComponentElement"
        : "CodeElement";
}

function elementHasType(element: LinkedElement | undefined, type: string): boolean {
  return element !== undefined && (element.type === type || element.baseTypes.includes(type));
}

function explicitlyExternal(element: LinkedElement): boolean {
  return element.attributes.kind?.includes("external") === true;
}

function evaluate(result: LinkProjectResult, scope: QueryScope, query: ParsedQuery): readonly Row[] {
  const context = evaluationContext(result, scope);
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
  const relationships = queryRelationships(context.result);
  if (pattern.relationship === undefined || pattern.right === undefined) {
    for (const row of inputRows) {
      const bound = row.nodes[pattern.left.alias];
      const candidates = bound === undefined ? queryNodes(context.result) : [bound];
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
      const source = queryNodeById(context.result, edge.source);
      const target = queryNodeById(context.result, edge.target);
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
  const relationships = queryRelationships(context.result);
  const parentByChild = parentByChildFromGraph(context.result);
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
          const source = queryNodeById(context.result, sourceEndpoint.id);
          const target = queryNodeById(context.result, targetEndpoint.id);
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
      return queryNodeById(context.result, edge.source) === undefined
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
      return queryNodeById(context.result, edge.target) === undefined
        ? []
        : [{ id: edge.target, binding: bound }];
    }
    return [];
  }
  return lineage(edge.target, parentByChild).flatMap((id) => {
    const binding = queryNodeById(context.result, id);
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
    const node = queryNodeById(context.result, id);
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
  return edge.edge?.originSource === undefined ? [] : lineage(edge.edge.originSource, parentByChild);
}

function edgeOriginTargetLineage(edge: QueryRelationship, parentByChild: ReadonlyMap<string, string>): readonly string[] {
  return edge.edge?.originTarget === undefined ? [] : lineage(edge.edge.originTarget, parentByChild);
}

function matchesNode(node: QueryNode, pattern: NodePattern, context: EvaluationContext): boolean {
  if (pattern.label !== undefined && !labels(node).has(pattern.label)) {
    return false;
  }
  return Object.entries(pattern.properties).every(([name, value]) => matchesNodeProperty(node, name, value, context));
}

function queryNodes(result: LinkProjectResult): readonly QueryNode[] {
  const elementsById = new Map(result.elements.map((element) => [element.id, element]));
  const contextById = new Map(result.contexts.map((context) => [context.id, context]));
  return result.graph.nodes().flatMap((node) => queryNodeFromGraphNode(node, elementsById, contextById));
}

function queryNodeById(result: LinkProjectResult, id: string): QueryNode | undefined {
  return queryNodeIndex(result).get(id);
}

function queryNodeIndex(result: LinkProjectResult): ReadonlyMap<string, QueryNode> {
  return new Map(queryNodes(result).map((node) => [node.id, node]));
}

function elementNode(element: LinkedElement): QueryNode {
  return { kind: "element", id: element.id, element };
}

function queryRelationships(result: LinkProjectResult): readonly QueryRelationship[] {
  const edgeByRelationId = linkedEdgesByGraphRelationId(result);
  const contextBySourceIdentity = new Map(result.contexts.map((context) => [context.sourceIdentity, context.id]));
  const relationships: QueryRelationship[] = result.graph.relations().map((relation) =>
    queryRelationshipFromGraphRelation(relation, edgeByRelationId.get(relation.id), contextBySourceIdentity)
  );
  const parentByChild = parentByChildFromGraph(result);
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
          derived: true,
          projected: relationship.projected,
        });
      }
    }
  }
  return relationships;
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
  const mapped = new Map<string, LinkedEdge>();
  const edgesByKey = new Map<string, LinkedEdge[]>();
  for (const edge of result.edges) {
    const values = edgesByKey.get(linkedEdgeKey(edge)) ?? [];
    values.push(edge);
    edgesByKey.set(linkedEdgeKey(edge), values);
  }
  result.graph.relations().forEach((relation) => {
    if (relation.kind !== "REFERENCES") {
      return;
    }
    const edge = edgesByKey.get(graphReferenceKey(relation))?.shift();
    if (edge !== undefined) {
      mapped.set(relation.id, edge);
    }
  });
  return mapped;
}

function linkedEdgeKey(edge: LinkedEdge): string {
  return [
    edge.sourceIdentity,
    edge.source,
    edge.target,
    edge.operator,
    edge.type,
    edge.projected === true ? "projected" : "real",
    edge.projectionScope ?? "",
  ].join("\0");
}

function graphReferenceKey(relation: GraphRelation): string {
  const prefix = "references:";
  if (relation.id.startsWith(prefix)) {
    const withoutPrefix = relation.id.slice(prefix.length);
    const lastSeparator = withoutPrefix.lastIndexOf(":");
    if (lastSeparator >= 0) {
      return withoutPrefix.slice(0, lastSeparator);
    }
  }
  return [
    relation.ownerSource,
    relation.source,
    relation.target,
    relation.type ?? relation.kind,
    relation.type ?? relation.kind,
    relation.projected === true ? "projected" : "real",
  ].join("\0");
}

function parentByChildFromGraph(result: LinkProjectResult): ReadonlyMap<string, string> {
  const resultMap = new Map<string, string>();
  for (const relationId of result.graph.relationsOfKind("CONTAINS")) {
    const relation = result.graph.relation(relationId);
    if (relation !== undefined) {
      resultMap.set(relation.target, relation.source);
    }
  }
  return resultMap;
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

function evaluationContext(result: LinkProjectResult, scope: QueryScope): EvaluationContext {
  return {
    result,
    scope,
    tabClosure: tabClosure(result, scope.tab),
  };
}

function tabClosure(result: LinkProjectResult, tab: string | undefined): ReadonlySet<string> {
  if (tab === undefined) {
    return new Set();
  }
  const roots = new Set(result.tabRoots[tab] ?? []);
  if (roots.size === 0) {
    return new Set();
  }
  const parentByChild = new Map(result.elements.flatMap((element) =>
    element.parent === undefined ? [] : [[element.id, element.parent]]
  ));
  return new Set(result.elements
    .filter((element) => element.synthetic !== true
      && (roots.has(element.id) || ancestors(element.id, parentByChild).some((ancestor) => roots.has(ancestor))))
    .map((element) => element.id));
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
    return context.tabClosure.has(edge.originSource ?? edge.source)
      && endpointIsExternal(context.result, edge.originTarget ?? edge.target);
  }
  return context.tabClosure.has(edge.originSource ?? edge.source)
    || context.tabClosure.has(edge.originTarget ?? edge.target);
}

function sourceRootsInTabClosure(result: LinkProjectResult, sourceName: string, tabClosure: ReadonlySet<string>): boolean {
  return (result.tabRoots[sourceName] ?? []).some((root) => tabClosure.has(root));
}

function endpointIsExternal(result: LinkProjectResult, id: string): boolean {
  const node = queryNodeById(result, id);
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
    return property(value, "kind") === "external";
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
  groups: Map<string, RenderGraphGroup>,
  expression: ValueExpression,
): ReadonlySet<string> {
  const grouped = new Set<string>();
  if (expression.kind !== "property") {
    return grouped;
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
    for (const owner of owners) {
      collectGroupValue(groups, node, owner, undefined);
      grouped.add(element.id);
    }
  }
  return grouped;
}

function completeReferenceGroupClosure(
  result: LinkProjectResult,
  groups: Map<string, RenderGraphGroup>,
  expression: ValueExpression,
): ReadonlySet<string> {
  if (expression.kind !== "property") {
    return new Set();
  }
  const nodeById = queryNodeIndex(result);
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

function parseQuery(query: string): ParsedQuery {
  return new QueryParser(tokenizeQuery(query)).parseQuery();
}

type QueryToken =
  | { readonly kind: "identifier"; readonly text: string }
  | { readonly kind: "string"; readonly text: string }
  | { readonly kind: "variable"; readonly text: string }
  | { readonly kind: "symbol"; readonly text: string }
  | { readonly kind: "eof"; readonly text: "" };

function tokenizeQuery(source: string): readonly QueryToken[] {
  const tokens: QueryToken[] = [];
  for (let index = 0; index < source.length;) {
    const char = source[index] ?? "";
    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index++;
      while (/[A-Za-z0-9_]/.test(source[index] ?? "")) {
        index++;
      }
      tokens.push({ kind: "identifier", text: source.slice(start, index) });
      continue;
    }
    if (char === "$") {
      const start = index + 1;
      index++;
      if (!/[A-Za-z_]/.test(source[index] ?? "")) {
        throw new Error(`Unsupported query variable near '${source.slice(index - 1)}'`);
      }
      while (/[A-Za-z0-9_]/.test(source[index] ?? "")) {
        index++;
      }
      tokens.push({ kind: "variable", text: source.slice(start, index) });
      continue;
    }
    if (char === "'") {
      const start = ++index;
      while (index < source.length && source[index] !== "'") {
        index++;
      }
      if (index >= source.length) {
        throw new Error("Unterminated string literal in query");
      }
      tokens.push({ kind: "string", text: source.slice(start, index) });
      index++;
      continue;
    }
    const two = source.slice(index, index + 2);
    if (two === "->" || two === "<-" || two === "<>") {
      tokens.push({ kind: "symbol", text: two });
      index += 2;
      continue;
    }
    if ("()[]{}:,.=-".includes(char)) {
      tokens.push({ kind: "symbol", text: char });
      index++;
      continue;
    }
    throw new Error(`Unsupported query token '${char}'`);
  }
  tokens.push({ kind: "eof", text: "" });
  return tokens;
}

class QueryParser {
  private index = 0;
  private readonly aliases = new Set<string>();

  constructor(private readonly tokens: readonly QueryToken[]) {
  }

  parseQuery(): ParsedQuery {
    const matches: MatchClause[] = [];
    while (this.atKeyword("MATCH") || this.atKeyword("OPTIONAL")) {
      matches.push(this.parseMatchClause());
    }
    if (matches.length === 0) {
      throw new Error("Unsupported MATCH clause");
    }
    let groupBy: ValueExpression | undefined;
    if (this.consumeKeyword("GROUP")) {
      this.expectKeyword("BY");
      groupBy = this.parseValueExpression();
    }
    this.expectKeyword("RETURN");
    const returns = this.parseReturnList();
    this.expectEof();
    return {
      matches,
      ...(groupBy === undefined ? {} : { groupBy }),
      returns,
    };
  }

  private parseMatchClause(): MatchClause {
    const optional = this.consumeKeyword("OPTIONAL");
    this.expectKeyword("MATCH");
    const rollup = this.consumeKeyword("ROLLUP");
    const pattern = this.parsePattern();
    const where = this.consumeKeyword("WHERE") ? this.parseExpression() : undefined;
    return {
      optional,
      rollup,
      pattern,
      ...(where === undefined ? {} : { where }),
    };
  }

  private parsePattern(): QueryPattern {
    const left = this.parseNodePattern();
    const incoming = this.consumeSymbol("<-");
    if (!incoming && !this.consumeSymbol("-")) {
      return { left };
    }
    const relationship = this.parseRelationshipPattern();
    const direction = incoming
      ? this.consumeSymbol("-") ? "incoming" : undefined
      : this.consumeSymbol("->")
        ? "outgoing"
        : this.consumeSymbol("-")
          ? "undirected"
          : undefined;
    if (direction === undefined) {
      const expected = incoming ? "'-'" : "'->' or '-'";
      throw new Error(`Expected ${expected} after relationship pattern, found '${this.current().text}'`);
    }
    return {
      left,
      relationship,
      right: this.parseNodePattern(),
      direction,
    };
  }

  private parseNodePattern(): NodePattern {
    this.expectSymbol("(");
    const alias = this.expectIdentifier();
    this.aliases.add(alias);
    const label = this.consumeSymbol(":") ? this.expectIdentifier() : undefined;
    const properties = this.consumeSymbol("{") ? this.parseProperties("}") : {};
    this.expectSymbol(")");
    return {
      alias,
      ...(label === undefined ? {} : { label }),
      properties,
    };
  }

  private parseRelationshipPattern(): RelationshipPattern {
    this.expectSymbol("[");
    let alias: string | undefined;
    let type: string | undefined;
    if (this.atIdentifier()) {
      const identifier = this.expectIdentifier();
      if (this.consumeSymbol(":")) {
        alias = identifier;
        type = this.expectIdentifier();
      } else {
        alias = identifier;
      }
    } else if (this.consumeSymbol(":")) {
      type = this.expectIdentifier();
    }
    if (alias !== undefined) {
      this.aliases.add(alias);
    }
    const parsed = this.consumeSymbol("{") ? this.parseRelationshipProperties() : { properties: {}, selectors: new Set<string>() };
    this.expectSymbol("]");
    return {
      ...(alias === undefined ? {} : { alias }),
      ...(type === undefined ? {} : { type }),
      properties: parsed.properties,
      selectors: parsed.selectors,
    };
  }

  private parseProperties(endSymbol: string): Readonly<Record<string, QueryValue>> {
    const properties: Record<string, QueryValue> = {};
    if (this.consumeSymbol(endSymbol)) {
      return properties;
    }
    while (true) {
      const name = this.expectIdentifier();
      this.expectSymbol(":");
      properties[name] = this.parseQueryValue();
      if (this.consumeSymbol(endSymbol)) {
        return properties;
      }
      this.expectSymbol(",");
    }
  }

  private parseRelationshipProperties(): { readonly properties: Readonly<Record<string, QueryValue>>; readonly selectors: ReadonlySet<string> } {
    const properties: Record<string, QueryValue> = {};
    const selectors = new Set<string>();
    if (this.consumeSymbol("}")) {
      return { properties, selectors };
    }
    while (true) {
      const name = this.expectIdentifier();
      if (this.consumeSymbol(":")) {
        properties[name] = this.parseQueryValue();
      } else {
        selectors.add(name);
      }
      if (this.consumeSymbol("}")) {
        return { properties, selectors };
      }
      this.expectSymbol(",");
    }
  }

  private parseExpression(): Expression {
    return this.parseOrExpression();
  }

  private parseOrExpression(): Expression {
    let expression = this.parseAndExpression();
    while (this.consumeKeyword("OR")) {
      expression = { kind: "or", left: expression, right: this.parseAndExpression() };
    }
    return expression;
  }

  private parseAndExpression(): Expression {
    let expression = this.parseNotExpression();
    while (this.consumeKeyword("AND")) {
      expression = { kind: "and", left: expression, right: this.parseNotExpression() };
    }
    return expression;
  }

  private parseNotExpression(): Expression {
    if (this.consumeKeyword("NOT")) {
      return { kind: "not", expression: this.parseNotExpression() };
    }
    return this.parsePrimaryExpression();
  }

  private parsePrimaryExpression(): Expression {
    if (this.consumeSymbol("(")) {
      const expression = this.parseExpression();
      this.expectSymbol(")");
      return expression;
    }
    return this.parseComparison();
  }

  private parseComparison(): Expression {
    const left = this.parseValueExpression();
    if (this.consumeKeyword("IS")) {
      if (this.consumeKeyword("NOT")) {
        return { kind: "not", expression: { kind: "is", left, target: this.expectIdentifier() } };
      }
      return { kind: "is", left, target: this.expectIdentifier() };
    }
    if (this.consumeKeyword("IN")) {
      return { kind: "in", left, right: this.parseValueExpression() };
    }
    const operator = this.parseComparisonOperator();
    const right = this.parseValueExpression();
    return {
      kind: "compare",
      operator,
      left,
      right,
    };
  }

  private parseComparisonOperator(): "eq" | "ne" | "contains" {
    if (this.consumeSymbol("=")) {
      return "eq";
    }
    if (this.consumeSymbol("<>")) {
      return "ne";
    }
    this.expectKeyword("CONTAINS");
    return "contains";
  }

  private parseValueExpression(): ValueExpression {
    if (this.consumeSymbol("[")) {
      const values: QueryValue[] = [];
      if (this.consumeSymbol("]")) {
        return { kind: "list", values };
      }
      while (true) {
        values.push(this.parseQueryValue());
        if (this.consumeSymbol("]")) {
          return { kind: "list", values };
        }
        this.expectSymbol(",");
      }
    }
    if (this.atIdentifier()) {
      const identifier = this.expectIdentifier();
      if (this.consumeSymbol(".")) {
        return {
          kind: "property",
          alias: identifier,
          property: this.expectIdentifier(),
        };
      }
      return this.aliases.has(identifier)
        ? { kind: "binding", alias: identifier }
        : { kind: "literal", value: identifier };
    }
    return this.parseQueryValue();
  }

  private parseQueryValue(): QueryValue {
    const token = this.current();
    if (token.kind === "variable") {
      this.index++;
      return { kind: "variable", name: token.text };
    }
    if (token.kind === "string") {
      this.index++;
      return { kind: "literal", value: token.text };
    }
    if (token.kind === "identifier") {
      this.index++;
      return { kind: "literal", value: token.text };
    }
    throw new Error(`Expected query value, found '${token.text}'`);
  }

  private parseReturnList(): readonly string[] {
    const returns = [this.expectIdentifier()];
    while (this.consumeSymbol(",")) {
      returns.push(this.expectIdentifier());
    }
    return returns;
  }

  private atIdentifier(): boolean {
    return this.current().kind === "identifier";
  }

  private atKeyword(keyword: string): boolean {
    const token = this.current();
    return token.kind === "identifier" && token.text.toUpperCase() === keyword;
  }

  private consumeKeyword(keyword: string): boolean {
    if (!this.atKeyword(keyword)) {
      return false;
    }
    this.index++;
    return true;
  }

  private expectKeyword(keyword: string): void {
    if (!this.consumeKeyword(keyword)) {
      throw new Error(`Expected ${keyword}, found '${this.current().text}'`);
    }
  }

  private consumeSymbol(symbol: string): boolean {
    const token = this.current();
    if (token.kind !== "symbol" || token.text !== symbol) {
      return false;
    }
    this.index++;
    return true;
  }

  private expectSymbol(symbol: string): void {
    if (!this.consumeSymbol(symbol)) {
      throw new Error(`Expected '${symbol}', found '${this.current().text}'`);
    }
  }

  private expectIdentifier(): string {
    const token = this.current();
    if (token.kind !== "identifier") {
      throw new Error(`Expected identifier, found '${token.text}'`);
    }
    this.index++;
    return token.text;
  }

  private expectEof(): void {
    if (this.current().kind !== "eof") {
      throw new Error(`Unexpected query token '${this.current().text}'`);
    }
  }

  private current(): QueryToken {
    return this.tokens[this.index] ?? { kind: "eof", text: "" };
  }
}
