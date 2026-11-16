import type {
  LinkedEdge,
  LinkedElement,
  RenderGraph,
  RenderGraphEdge,
  RenderGraphGroup,
  SourceLocation,
} from "./contracts.js";
import { parseDiagramOccurrenceId } from "./occurrence-identity.js";

export type DiagramDiffStatus = "unchanged" | "added" | "removed" | "changed";
export type DiagramDiffCategory = "elements" | "edges" | "groups";

export interface DiagramDiffOrigin {
  readonly side: "before" | "after";
  readonly role:
    | "element-declaration"
    | "attribute-assignment"
    | "relationship-declaration"
    | "projection-origin"
    | "group-owner";
  readonly sourceName: string;
  readonly line: number;
  readonly column: number;
  readonly endLine?: number;
  readonly endColumn?: number;
  readonly semanticPath?: string;
  readonly precision: "exact" | "declaration";
}

export interface DiagramDiffEntry<T> {
  readonly changeId: string;
  readonly status: DiagramDiffStatus;
  readonly before?: T;
  readonly after?: T;
  readonly rendered: T;
  readonly origins: readonly DiagramDiffOrigin[];
}

export interface DiagramEdgeDiff extends DiagramDiffEntry<RenderGraphEdge> {
  readonly key: string;
}

export interface DiagramDiffCounts {
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  readonly unchanged: number;
}

export interface DiagramDiff {
  readonly schemaVersion: "diagram-diff.v1";
  readonly beforeContext: string;
  readonly afterContext: string;
  readonly graph: RenderGraph;
  readonly elements: Readonly<Record<string, DiagramDiffEntry<LinkedElement>>>;
  readonly edges: readonly DiagramEdgeDiff[];
  readonly groups: Readonly<Record<string, DiagramDiffEntry<RenderGraphGroup>>>;
  readonly summary: Readonly<Record<DiagramDiffCategory, DiagramDiffCounts>>;
}

/**
 * Compares two already-selected diagram graphs. The function deliberately has
 * no knowledge of git, files, built-in views, or a particular client.
 */
export function diffRenderGraphs(before: RenderGraph, after: RenderGraph): DiagramDiff {
  const elements = diffElements(before, after);
  const edges = diffEdges(before.edges, after.edges);
  const groups = diffGroups(before, after);
  return {
    schemaVersion: "diagram-diff.v1",
    beforeContext: before.context,
    afterContext: after.context,
    graph: {
      context: after.context || before.context,
      elements: Object.fromEntries(Object.entries(elements).map(([id, entry]) => [id, entry.rendered])),
      edges: edges.map((entry) => entry.rendered),
      groups: unionGroups(before.groups, after.groups, elements),
      externalElements: unionExternalElements(before, after, elements),
      ...(after.layout === undefined ? before.layout === undefined ? {} : { layout: before.layout } : { layout: after.layout }),
    },
    elements,
    edges,
    groups,
    summary: {
      elements: counts(Object.values(elements)),
      edges: counts(edges),
      groups: counts(Object.values(groups)),
    },
  };
}

/**
 * Narrows a union diff to the selected element and its direct neighbours while
 * preserving the original change entries, statuses, origins and edge objects.
 */
export function selectIsolatedDiagramDiff(diff: DiagramDiff, requestedElementId: string): DiagramDiff {
  const elementId = parseDiagramOccurrenceId(requestedElementId).canonicalId;
  if (diff.graph.elements[elementId] === undefined) {
    return filteredDiff(diff, new Set());
  }
  const selected = new Set([elementId]);
  const edges = diff.edges.filter((item) => {
    const visible = item.rendered.source === elementId || item.rendered.target === elementId;
    if (visible) {
      selected.add(item.rendered.source);
      selected.add(item.rendered.target);
    }
    return visible;
  });
  const incoming = new Set<string>();
  const outgoing = new Set<string>();
  for (const item of edges) {
    if (item.rendered.target === elementId && item.rendered.source !== elementId) incoming.add(item.rendered.source);
    if (item.rendered.source === elementId && item.rendered.target !== elementId) outgoing.add(item.rendered.target);
  }
  const narrowed = filteredDiff(diff, selected, edges);
  return {
    ...narrowed,
    graph: {
      ...narrowed.graph,
      layout: {
        kind: "isolate",
        focus: elementId,
        incoming: [...incoming].sort(),
        outgoing: [...outgoing].sort(),
      },
    },
  };
}

function filteredDiff(
  diff: DiagramDiff,
  selected: ReadonlySet<string>,
  selectedEdges: readonly DiagramEdgeDiff[] = [],
): DiagramDiff {
  const { layout: _layout, ...baseGraph } = diff.graph;
  const elements = Object.fromEntries(
    Object.entries(diff.elements).filter(([id]) => selected.has(id)),
  );
  const groups = Object.fromEntries(
    Object.entries(diff.groups).filter(([owner, item]) =>
      selected.has(owner) || item.rendered.elements.some((id) => selected.has(id))
    ),
  );
  const graphGroups = Object.values(groups).map((item) => ({
    ...item.rendered,
    elements: item.rendered.elements.filter((id) => selected.has(id)),
  }));
  return {
    ...diff,
    graph: {
      ...baseGraph,
      elements: Object.fromEntries(
        Object.entries(diff.graph.elements).filter(([id]) => selected.has(id)),
      ),
      edges: selectedEdges.map((item) => item.rendered),
      groups: graphGroups,
      externalElements: diff.graph.externalElements.filter((id) => selected.has(id)),
    },
    elements,
    edges: selectedEdges,
    groups,
    summary: {
      elements: counts(Object.values(elements)),
      edges: counts(selectedEdges),
      groups: counts(Object.values(groups)),
    },
  };
}

function diffElements(
  before: RenderGraph,
  after: RenderGraph,
): Readonly<Record<string, DiagramDiffEntry<LinkedElement>>> {
  const entries: Record<string, DiagramDiffEntry<LinkedElement>> = {};
  const ids = new Set([...Object.keys(before.elements), ...Object.keys(after.elements)]);
  for (const id of [...ids].sort()) {
    const previous = before.elements[id];
    const next = after.elements[id];
    const externalityChanged = before.externalElements.includes(id) !== after.externalElements.includes(id);
    const paths = previous === undefined || next === undefined
      ? []
      : changedPaths(elementValue(previous), elementValue(next));
    entries[id] = entry(
      `element:${id}`,
      previous,
      next,
      (left, right) => !externalityChanged && paths.length === 0,
      (side, value) => elementOrigins(side, value, paths),
    );
  }
  return entries;
}

function diffGroups(
  beforeGraph: RenderGraph,
  afterGraph: RenderGraph,
): Readonly<Record<string, DiagramDiffEntry<RenderGraphGroup>>> {
  const before = beforeGraph.groups;
  const after = afterGraph.groups;
  const previous = new Map(before.map((group) => [group.owner, group]));
  const next = new Map(after.map((group) => [group.owner, group]));
  const entries: Record<string, DiagramDiffEntry<RenderGraphGroup>> = {};
  for (const owner of [...new Set([...previous.keys(), ...next.keys()])].sort()) {
    entries[owner] = entry(
      `group:${owner}`,
      previous.get(owner),
      next.get(owner),
      (left, right) => stableValue(groupValue(left)) === stableValue(groupValue(right)),
      (side, value) => groupOrigins(side, value, side === "before" ? beforeGraph : afterGraph),
    );
  }
  return entries;
}

function diffEdges(before: readonly RenderGraphEdge[], after: readonly RenderGraphEdge[]): readonly DiagramEdgeDiff[] {
  const beforeBuckets = edgeBuckets(before);
  const afterBuckets = edgeBuckets(after);
  const result: DiagramEdgeDiff[] = [];
  for (const key of [...new Set([...beforeBuckets.keys(), ...afterBuckets.keys()])].sort()) {
    const previous = [...(beforeBuckets.get(key) ?? [])].sort(compareEdges);
    const next = [...(afterBuckets.get(key) ?? [])].sort(compareEdges);
    const unmatchedPrevious = [...previous];
    const unmatchedNext = [...next];

    for (let previousIndex = unmatchedPrevious.length - 1; previousIndex >= 0; previousIndex--) {
      const fingerprint = edgeFingerprint(unmatchedPrevious[previousIndex]!);
      const nextIndex = unmatchedNext.findIndex((candidate) => edgeFingerprint(candidate) === fingerprint);
      if (nextIndex === -1) continue;
      const previousEdge = unmatchedPrevious.splice(previousIndex, 1)[0]!;
      const nextEdge = unmatchedNext.splice(nextIndex, 1)[0]!;
      result.push(edgeEntry(key, previousEdge, nextEdge));
    }

    const paired = Math.min(unmatchedPrevious.length, unmatchedNext.length);
    for (let index = 0; index < paired; index++) {
      const previousEdge = unmatchedPrevious[index]!;
      const nextEdge = unmatchedNext[index]!;
      result.push(edgeEntry(key, previousEdge, nextEdge));
    }
    for (const previousEdge of unmatchedPrevious.slice(paired)) {
      result.push(edgeEntry(key, previousEdge, undefined));
    }
    for (const nextEdge of unmatchedNext.slice(paired)) {
      result.push(edgeEntry(key, undefined, nextEdge));
    }
  }
  const sorted = result.sort((left, right) =>
    left.key.localeCompare(right.key)
      || statusOrder(left.status) - statusOrder(right.status)
      || edgeFingerprint(left.rendered).localeCompare(edgeFingerprint(right.rendered))
  );
  const ordinalByKey = new Map<string, number>();
  return sorted.map((item) => {
    const identity = stableValue([item.rendered.source, item.rendered.target, edgeSemanticFingerprint(item.rendered)]);
    const ordinal = ordinalByKey.get(identity) ?? 0;
    ordinalByKey.set(identity, ordinal + 1);
    return { ...item, changeId: `edge:${identity}:${ordinal}` };
  });
}

function edgeEntry(
  key: string,
  before: RenderGraphEdge | undefined,
  after: RenderGraphEdge | undefined,
): DiagramEdgeDiff {
  const paths = before === undefined || after === undefined
    ? []
    : changedPaths(edgeValue(before.edge), edgeValue(after.edge));
  return {
    key,
    ...entry(
      "edge:pending",
      before,
      after,
      (left, right) => stableValue(edgeFingerprint(left)) === stableValue(edgeFingerprint(right)),
      (side, value) => edgeOrigins(side, value, paths),
    ),
  };
}

function edgeBuckets(edges: readonly RenderGraphEdge[]): Map<string, RenderGraphEdge[]> {
  const buckets = new Map<string, RenderGraphEdge[]>();
  for (const edge of edges) {
    const key = stableValue([edge.source, edge.target]);
    const values = buckets.get(key) ?? [];
    values.push(edge);
    buckets.set(key, values);
  }
  return buckets;
}

function compareEdges(left: RenderGraphEdge, right: RenderGraphEdge): number {
  return edgeFingerprint(left).localeCompare(edgeFingerprint(right));
}

function edgeFingerprint(edge: RenderGraphEdge): string {
  return stableValue({
    source: edge.source,
    target: edge.target,
    derived: edge.derived,
    projected: edge.projected,
    edge: edgeValue(edge.edge),
  });
}

function edgeSemanticFingerprint(edge: RenderGraphEdge): string {
  return stableValue({
    source: edge.source,
    target: edge.target,
    derived: edge.derived,
    projected: edge.projected,
    operator: edge.edge.operator,
    type: edge.edge.type,
    originSource: edge.edge.originSource,
    originTarget: edge.edge.originTarget,
    projectionRoot: edge.edge.projectionRoot,
  });
}

function elementValue(element: LinkedElement): unknown {
  const value = withoutKeys(
    element,
    new Set(["id", "context", "localId", "sourceIdentity", "declaration", "noteSource", "annotations"]),
  ) as Record<string, unknown>;
  return element.annotations === undefined
    ? value
    : { ...value, annotations: semanticAnnotations(element.annotations) };
}

function edgeValue(edge: LinkedEdge): unknown {
  const value = withoutKeys(
    edge,
    new Set(["id", "sourceIdentity", "declaration", "noteSource", "annotations", "projectionOrigins"]),
  ) as Record<string, unknown>;
  return {
    ...value,
    ...(edge.annotations === undefined ? {} : { annotations: semanticAnnotations(edge.annotations) }),
    ...(edge.projectionOrigins === undefined
      ? {}
      : {
        projectionOrigins: edge.projectionOrigins
          .map(({ source, target }) => ({ source, target }))
          .sort((left, right) => stableValue(left).localeCompare(stableValue(right))),
      }),
  };
}

function semanticAnnotations(
  annotations: NonNullable<LinkedElement["annotations"]>,
): readonly unknown[] {
  return annotations.map(annotationValue)
    .sort((left, right) => stableValue(left).localeCompare(stableValue(right)));
}

function annotationValue(annotation: NonNullable<LinkedElement["annotations"]>[number]): unknown {
  return annotation.value === undefined
    ? { name: annotation.name }
    : { name: annotation.name, value: annotation.value };
}

function groupValue(group: RenderGraphGroup): unknown {
  return { ...group, elements: [...group.elements].sort() };
}

function withoutKeys(value: object, omitted: ReadonlySet<string>): unknown {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !omitted.has(key)));
}

function entry<T>(
  changeId: string,
  before: T | undefined,
  after: T | undefined,
  equal: (before: T, after: T) => boolean,
  origins: (side: "before" | "after", value: T) => readonly DiagramDiffOrigin[],
): DiagramDiffEntry<T> {
  if (before === undefined && after === undefined) throw new Error("A diff entry needs at least one value");
  if (before === undefined) {
    const added = after as T;
    return { changeId, status: "added", after: added, rendered: added, origins: origins("after", added) };
  }
  if (after === undefined) {
    return { changeId, status: "removed", before, rendered: before, origins: origins("before", before) };
  }
  const unchanged = equal(before, after);
  return {
    changeId,
    status: unchanged ? "unchanged" : "changed",
    before,
    after,
    rendered: after,
    origins: unchanged ? [] : deduplicateOrigins([...origins("before", before), ...origins("after", after)]),
  };
}

function elementOrigins(
  side: "before" | "after",
  element: LinkedElement,
  paths: readonly string[],
): readonly DiagramDiffOrigin[] {
  const result: DiagramDiffOrigin[] = [];
  const semanticPaths = paths.length === 0 ? [undefined] : paths;
  for (const semanticPath of semanticPaths) {
    const exact = semanticPath === "note" ? element.noteSource
      : semanticPath?.startsWith("annotations.")
        ? element.annotations?.[Number.parseInt(semanticPath.split(".")[1] ?? "", 10)]?.source
        : undefined;
    const location = exact ?? element.declaration;
    if (location === undefined) continue;
    result.push(origin(
      side,
      semanticPath?.startsWith("attributes.") || semanticPath?.startsWith("semanticAttributes.")
        ? "attribute-assignment"
        : "element-declaration",
      location,
      semanticPath,
      exact === undefined && semanticPath !== undefined ? "declaration" : "exact",
    ));
  }
  return deduplicateOrigins(result);
}

function edgeOrigins(
  side: "before" | "after",
  rendered: RenderGraphEdge,
  paths: readonly string[],
): readonly DiagramDiffOrigin[] {
  const edge = rendered.edge;
  const result: DiagramDiffOrigin[] = [];
  for (const projection of edge.projectionOrigins ?? []) {
    if (projection.declaration !== undefined) {
      result.push(origin(side, "projection-origin", projection.declaration, undefined, "exact"));
    }
  }
  const semanticPaths = paths.length === 0 ? [undefined] : paths;
  for (const semanticPath of semanticPaths) {
    const exact = semanticPath === "note" ? edge.noteSource
      : semanticPath?.startsWith("annotations.")
        ? edge.annotations?.[Number.parseInt(semanticPath.split(".")[1] ?? "", 10)]?.source
        : undefined;
    const location = exact ?? edge.declaration;
    if (location === undefined) continue;
    result.push(origin(
      side,
      semanticPath?.startsWith("attributes.") || semanticPath?.startsWith("semanticAttributes.")
        ? "attribute-assignment"
        : "relationship-declaration",
      location,
      semanticPath,
      exact === undefined && semanticPath !== undefined ? "declaration" : "exact",
    ));
  }
  return deduplicateOrigins(result);
}

function groupOrigins(
  side: "before" | "after",
  group: RenderGraphGroup,
  graph: RenderGraph,
): readonly DiagramDiffOrigin[] {
  const declaration = graph.elements[group.owner]?.declaration;
  return declaration === undefined ? [] : [origin(side, "group-owner", declaration, undefined, "exact")];
}

function origin(
  side: "before" | "after",
  role: DiagramDiffOrigin["role"],
  location: SourceLocation,
  semanticPath: string | undefined,
  precision: DiagramDiffOrigin["precision"],
): DiagramDiffOrigin {
  return {
    side,
    role,
    sourceName: location.sourceName,
    line: location.line,
    column: location.column,
    ...(location.endLine === undefined ? {} : { endLine: location.endLine }),
    ...(location.endColumn === undefined ? {} : { endColumn: location.endColumn }),
    ...(semanticPath === undefined ? {} : { semanticPath }),
    precision,
  };
}

function deduplicateOrigins(origins: readonly DiagramDiffOrigin[]): readonly DiagramDiffOrigin[] {
  const unique = new Map(origins.map((item) => [stableValue(item), item]));
  return [...unique.values()].sort((left, right) => stableValue(left).localeCompare(stableValue(right)));
}

function changedPaths(before: unknown, after: unknown, prefix = ""): readonly string[] {
  if (stableValue(before) === stableValue(after)) return [];
  if (before === null || after === null || typeof before !== "object" || typeof after !== "object"
      || Array.isArray(before) || Array.isArray(after)) return [prefix || "value"];
  const left = before as Record<string, unknown>;
  const right = after as Record<string, unknown>;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .sort()
    .flatMap((key) => changedPaths(left[key], right[key], prefix === "" ? key : `${prefix}.${key}`));
}

function counts(entries: readonly { readonly status: DiagramDiffStatus }[]): DiagramDiffCounts {
  const result: Record<DiagramDiffStatus, number> = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const entry of entries) result[entry.status]++;
  return result;
}

function unionExternalElements(
  before: RenderGraph,
  after: RenderGraph,
  elements: Readonly<Record<string, DiagramDiffEntry<LinkedElement>>>,
): readonly string[] {
  const afterExternal = new Set(after.externalElements);
  const beforeExternal = new Set(before.externalElements);
  return Object.entries(elements)
    .filter(([id, change]) => change.status === "removed" ? beforeExternal.has(id) : afterExternal.has(id))
    .map(([id]) => id)
    .sort();
}

function unionGroups(
  before: readonly RenderGraphGroup[],
  after: readonly RenderGraphGroup[],
  elements: Readonly<Record<string, DiagramDiffEntry<LinkedElement>>>,
): readonly RenderGraphGroup[] {
  const result = new Map(after.map((group) => [group.owner, { ...group, elements: [...group.elements] }]));
  for (const group of before) {
    const removedElements = group.elements.filter((id) => elements[id]?.status === "removed");
    const current = result.get(group.owner);
    if (current === undefined) {
      if (removedElements.length > 0) result.set(group.owner, { ...group, elements: removedElements });
      continue;
    }
    current.elements = [...new Set([...current.elements, ...removedElements])];
  }
  return [...result.values()].sort((left, right) => left.owner.localeCompare(right.owner));
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function statusOrder(status: DiagramDiffStatus): number {
  return ({ unchanged: 0, changed: 1, removed: 2, added: 3 })[status];
}
