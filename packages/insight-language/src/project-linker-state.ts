import type { GraphRelation, GraphUpdateImpact, IndexedGraph } from "./indexed-graph.js";
import type {
  DuplicateLinkedEdgeGroup,
  LinkedEdge,
  LinkProjectRequest,
  LinkProjectResult,
  ProjectSource,
} from "./contracts.js";
import {
  linkProjectWithSourceCache,
  ProjectLinkerSourceCache,
} from "./project-linker.js";
import type { ParsedSource, PortableParsedSource, SourceAnalysisMetadata } from "./parser-facade.js";
import type { ProjectLinkerProfiler } from "./project-linker-profiler.js";

export interface ProjectSourceReplacement {
  readonly sourceName: string;
  readonly source?: string;
}

export interface ProjectLinkerStateUpdate {
  readonly impact: GraphUpdateImpact;
  readonly affectedSources: ReadonlySet<string>;
  readonly supportSources: ReadonlySet<string>;
  readonly relinkedSources: ReadonlySet<string>;
  readonly reparsedSourceCount: number;
  readonly result: LinkProjectResult;
}

export class ProjectLinkerState {
  private readonly snapshot: LinkProjectRequest["snapshot"];
  private readonly operatorImplementations: LinkProjectRequest["operatorImplementations"];
  private readonly sourcesByName: Map<string, ProjectSource>;
  private readonly sourceCache: ProjectLinkerSourceCache;
  private readonly profiler: ProjectLinkerProfiler | undefined;
  private readonly derivedGraphSurfaceBySource: Map<string, string>;
  private currentResult: LinkProjectResult;

  constructor(
    request: LinkProjectRequest,
    existingResult?: LinkProjectResult,
    sourceCache = new ProjectLinkerSourceCache(),
    profiler?: ProjectLinkerProfiler,
    derivedGraphSurfaceBySource?: ReadonlyMap<string, string>,
  ) {
    this.snapshot = request.snapshot;
    this.operatorImplementations = request.operatorImplementations;
    this.sourcesByName = new Map(request.sources.map((source) => [source.sourceName, source]));
    this.sourceCache = sourceCache;
    this.profiler = profiler;
    this.currentResult = existingResult ?? linkProjectWithSourceCache(this.request(), this.sourceCache, this.profiler);
    this.derivedGraphSurfaceBySource = new Map(derivedGraphSurfaceBySource ?? request.sources.map((source) => [
      source.sourceName,
      this.sourceCache.metadata(source.sourceName, source.source).derivedGraphSignature,
    ]));
  }

  result(): LinkProjectResult {
    return this.currentResult;
  }

  parsedSource(sourceName: string, source: string): ParsedSource {
    return this.sourceCache.parse(sourceName, source);
  }

  sourceParseCount(): number {
    return this.sourceCache.parseCount();
  }

  portableParsedSources(): readonly PortableParsedSource[] {
    return this.sourceCache.portableParsedSources();
  }

  sourceMetadata(sourceName: string, source: string): SourceAnalysisMetadata {
    return this.sourceCache.metadata(sourceName, source);
  }

  /**
   * Creates an isolated, in-memory branch of this state. The language snapshot
   * and immutable result records are shared, while the mutable graph is copied.
   * Updating the fork cannot change the original state.
   */
  fork(): ProjectLinkerState {
    return new ProjectLinkerState(this.request(), {
      ...this.currentResult,
      graph: this.currentResult.graph.clone(),
    }, this.sourceCache.fork(), this.profiler, this.derivedGraphSurfaceBySource);
  }

  replaceSource(replacement: ProjectSourceReplacement): ProjectLinkerStateUpdate {
    return this.replaceSources([replacement]);
  }

  replaceSources(replacements: readonly ProjectSourceReplacement[]): ProjectLinkerStateUpdate {
    const parseCountBefore = this.sourceCache.parseCount();
    const previous = this.currentResult;
    const candidateGraph = previous.graph.clone();
    const uniqueReplacements = [...new Map(replacements.map((item) => [item.sourceName, item])).values()]
      .sort((left, right) => left.sourceName.localeCompare(right.sourceName));
    const existingSources = new Set(this.sourcesByName.keys());
    const replacementNames = new Set(uniqueReplacements.map((item) => item.sourceName));
    const preservedReferences = new Map<string, ReadonlySet<string>>();
    const impacts: GraphUpdateImpact[] = [];
    let derivedGraphSurfaceChanged = false;
    for (const replacement of uniqueReplacements) {
      const previousDerivedGraphSurface = this.derivedGraphSurfaceBySource.get(replacement.sourceName);
      const nextDerivedGraphSurface = replacement.source === undefined
        ? undefined
        : this.sourceCache.parse(replacement.sourceName, replacement.source).metadata.derivedGraphSignature;
      derivedGraphSurfaceChanged ||= previousDerivedGraphSurface !== nextDerivedGraphSurface;
      preservedReferences.set(
        replacement.sourceName,
        resultReferencedNodes(previous, replacement.sourceName),
      );
      impacts.push(candidateGraph.removeSourceContribution(replacement.sourceName));
      if (replacement.source === undefined) {
        this.sourcesByName.delete(replacement.sourceName);
        this.derivedGraphSurfaceBySource.delete(replacement.sourceName);
        this.sourceCache.delete(replacement.sourceName);
      } else {
        this.sourcesByName.set(replacement.sourceName, {
          sourceName: replacement.sourceName,
          source: replacement.source,
        });
        this.derivedGraphSurfaceBySource.set(replacement.sourceName, nextDerivedGraphSurface!);
      }
    }
    // A new source can satisfy references that were unresolved in the previous
    // graph, so there is no dependency edge from those consumers to follow yet.
    // It can also introduce duplicates in an existing context. Relink every
    // source for additions; replacements and removals keep using graph impact.
    const addingSource = uniqueReplacements.some((item) =>
      item.source !== undefined && !existingSources.has(item.sourceName)
    );
    const removedNodes = new Set(impacts.flatMap((impact) => [...impact.removedNodes]));
    const dependentSources = new Set(impacts.flatMap((impact) => [...impact.dependentSources]));
    if (derivedGraphSurfaceChanged) {
      for (const source of resultDependentSources(previous, removedNodes)) {
        dependentSources.add(source);
      }
    }
    const linkSupportSources = (sources: ReadonlySet<string>): LinkProjectResult => linkProjectWithSourceCache({
      snapshot: this.snapshot,
      // Preserve the canonical project order. Deployment inheritance is
      // evaluated in source order, so feeding the BFS discovery order here can
      // make an incremental result differ from a clean link.
      sources: [...this.sourcesByName.values()].filter((source) => sources.has(source.sourceName)),
      ...(this.operatorImplementations === undefined ? {} : { operatorImplementations: this.operatorImplementations }),
    }, this.sourceCache, this.profiler);
    // Foreign relationships incident on replaced nodes are restored below when
    // the dependency surface is stable. Their owners participate in relinking
    // only when topology changed; an attribute-only edit must retain the
    // one-source incremental path even when many consumers use the provider.
    let affectedSources: ReadonlySet<string> = addingSource
      ? new Set([...this.sourcesByName.keys(), ...replacementNames])
      : derivedGraphSurfaceChanged
        ? new Set([...replacementNames, ...dependentSources])
        : replacementNames;
    let supportSources = this.relinkSupportSources(
      previous,
      affectedSources,
      preservedReferences,
      addingSource || derivedGraphSurfaceChanged,
    );
    let partialResult = linkSupportSources(supportSources);
    const dependencySurfaceChanged = addingSource || derivedGraphSurfaceChanged || [...replacementNames].some((source) =>
      !sameDependencySurface(previous.graph, partialResult.graph, source)
    );
    if (!addingSource && dependencySurfaceChanged) {
      if (!derivedGraphSurfaceChanged) {
        for (const source of resultDependentSources(previous, removedNodes)) {
          dependentSources.add(source);
        }
      }
      affectedSources = new Set([
        ...replacementNames,
        ...dependentSources,
      ]);
      const expandedSupportSources = this.relinkSupportSources(
        previous,
        affectedSources,
        preservedReferences,
        true,
      );
      if (!sameSet(supportSources, expandedSupportSources)) {
        supportSources = expandedSupportSources;
        partialResult = linkSupportSources(supportSources);
      }
    }
    // Graph-topology changes can alter global diagnostics owned by otherwise
    // unchanged support sources. Attribute-only edits keep the smaller set.
    const candidateSources = dependencySurfaceChanged ? supportSources : affectedSources;
    for (const source of candidateSources) {
      if (!replacementNames.has(source)) {
        candidateGraph.removeSourceContribution(source);
      }
    }
    mergeGraph(candidateGraph, partialResult.graph);
    const candidateResult = mergeResults(previous, partialResult, candidateSources, candidateGraph);
    const relinkedSources = changedResultSources(previous, candidateResult, candidateSources);
    const graph = previous.graph.clone();
    for (const source of relinkedSources) {
      graph.removeSourceContribution(source);
    }
    mergeGraph(graph, partialResult.graph);
    restoreForeignRelations(graph, previous.graph, relinkedSources);
    this.currentResult = mergeResults(previous, partialResult, relinkedSources, graph);
    return {
      impact: mergeImpacts(impacts),
      affectedSources,
      supportSources,
      relinkedSources,
      reparsedSourceCount: this.sourceCache.parseCount() - parseCountBefore,
      result: this.currentResult,
    };
  }

  removeSource(sourceName: string): ProjectLinkerStateUpdate {
    return this.replaceSource({ sourceName });
  }

  private request(): LinkProjectRequest {
    return {
      snapshot: this.snapshot,
      sources: [...this.sourcesByName.values()],
      ...(this.operatorImplementations === undefined ? {} : { operatorImplementations: this.operatorImplementations }),
    };
  }

  private relinkSupportSources(
    previous: LinkProjectResult,
    affectedSources: ReadonlySet<string>,
    preservedReferencesBySource: ReadonlyMap<string, ReadonlySet<string>>,
    expandSupportClosure: boolean,
  ): ReadonlySet<string> {
    const result = new Set<string>();
    const visited = new Set<string>();
    const pending = [
      ...affectedSources,
      ...[...this.sourcesByName.values()].flatMap((source) =>
        this.sourceCache.metadata(source.sourceName, source.source).contributesToSnapshot ? [source.sourceName] : []
      ),
    ];
    const contextBySource = new Map(previous.contexts.map((context) => [context.sourceIdentity, context.id]));
    const sourcesByContext = new Map<string, Set<string>>();
    const importsBySource = new Map<string, typeof previous.imports>();
    for (const context of previous.contexts) {
      const sources = sourcesByContext.get(context.id) ?? new Set<string>();
      sources.add(context.sourceIdentity);
      sourcesByContext.set(context.id, sources);
    }
    for (const imported of previous.imports) {
      const imports = importsBySource.get(imported.sourceIdentity) ?? [];
      importsBySource.set(imported.sourceIdentity, [...imports, imported]);
    }

    while (pending.length > 0) {
      const source = pending.shift()!;
      if (visited.has(source)) {
        continue;
      }
      visited.add(source);
      // Removed sources still have to participate in result replacement so
      // their contexts, elements, diagnostics, and tab roots are discarded.
      result.add(source);
      // An isolated source edit needs only direct declarations and reference
      // targets. If removing its old graph contribution affected another
      // source, retain the complete support closure: deployment and projection
      // output can depend on context beyond the graph's direct references.
      if (!expandSupportClosure && !affectedSources.has(source)) {
        continue;
      }
      const context = contextBySource.get(source);
      if (context !== undefined) {
        for (const siblingSource of sourcesByContext.get(context) ?? []) {
          if (this.sourcesByName.has(siblingSource)) {
            pending.push(siblingSource);
          }
        }
      }
      for (const imported of importsBySource.get(source) ?? []) {
        for (const providerSource of sourcesByContext.get(imported.sourceContext) ?? []) {
          if (this.sourcesByName.has(providerSource)) {
            pending.push(providerSource);
          }
        }
      }
      const referencedNodes = preservedReferencesBySource.get(source)
        ?? resultReferencedNodes(previous, source);
      for (const referencedNode of referencedNodes) {
        const providerSource = graphNodeSource(previous.graph.node(referencedNode));
        if (providerSource !== undefined && this.sourcesByName.has(providerSource)) {
          pending.push(providerSource);
        }
      }
    }

    return result;
  }
}

function resultReferencedNodes(result: LinkProjectResult, source: string): ReadonlySet<string> {
  const referenced = new Set(result.graph.sourceContribution(source)?.referencedNodes ?? []);
  for (const element of result.elements) {
    if (element.sourceIdentity === source) {
      for (const owner of element.sharedInfrastructureOwners ?? []) referenced.add(owner);
      addReferenceAttributeValues(referenced, element.referenceAttributes, element.attributes, result.graph);
    }
  }
  for (const edge of result.edges) {
    if (edge.sourceIdentity === source) {
      addReferenceAttributeValues(referenced, edge.referenceAttributes, edge.attributes, result.graph);
    }
  }
  return referenced;
}

function resultDependentSources(
  result: LinkProjectResult,
  targets: ReadonlySet<string>,
): ReadonlySet<string> {
  if (targets.size === 0) {
    return new Set();
  }
  const dependent = new Set<string>();
  for (const element of result.elements) {
    if (element.sharedInfrastructureOwners?.some((id) => targets.has(id)) || referencesAny(element.referenceAttributes, element.attributes, targets)) {
      dependent.add(element.sourceIdentity);
    }
  }
  for (const edge of result.edges) {
    if (referencesAny(edge.referenceAttributes, edge.attributes, targets)) {
      dependent.add(edge.sourceIdentity);
    }
  }
  return dependent;
}

function addReferenceAttributeValues(
  target: Set<string>,
  referenceAttributes: readonly string[] | undefined,
  attributes: Readonly<Record<string, readonly string[]>>,
  graph: IndexedGraph,
): void {
  for (const attribute of referenceAttributes ?? []) {
    for (const value of attributes[attribute] ?? []) {
      if (graph.node(value) !== undefined) {
        target.add(value);
      }
    }
  }
}

function referencesAny(
  referenceAttributes: readonly string[] | undefined,
  attributes: Readonly<Record<string, readonly string[]>>,
  targets: ReadonlySet<string>,
): boolean {
  return (referenceAttributes ?? []).some((attribute) =>
    (attributes[attribute] ?? []).some((value) => targets.has(value))
  );
}

function changedResultSources(
  previous: LinkProjectResult,
  next: LinkProjectResult,
  candidates: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set([...candidates].filter((source) => sourceResultSignature(previous, source) !== sourceResultSignature(next, source)));
}

function sourceResultSignature(result: LinkProjectResult, source: string): string {
  const contribution = result.graph.sourceContribution(source);
  const byJson = (left: unknown, right: unknown): number => JSON.stringify(left).localeCompare(JSON.stringify(right));
  return JSON.stringify({
    diagnostics: result.diagnostics.filter((item) => item.sourceName === source).sort(byJson),
    contexts: result.contexts.filter((item) => item.sourceIdentity === source).sort(byJson),
    elements: result.elements.filter((item) => item.sourceIdentity === source).sort(byJson),
    imports: result.imports.filter((item) => item.sourceIdentity === source).sort(byJson),
    edges: result.edges.filter((item) => item.sourceIdentity === source).sort(byJson),
    tabRoots: result.tabRoots[source] ?? [],
    graph: contribution === undefined ? undefined : {
      nodes: [...contribution.ownedNodes].flatMap((id) => {
        const node = result.graph.node(id);
        return node === undefined ? [] : [node];
      }).sort(byJson),
      relations: [...contribution.ownedRelations].flatMap((id) => {
        const relation = result.graph.relation(id);
        return relation === undefined ? [] : [relation];
      }).sort(byJson),
      referencedNodes: [...contribution.referencedNodes].sort(),
    },
  });
}

function mergeImpacts(impacts: readonly GraphUpdateImpact[]): GraphUpdateImpact {
  return {
    removedNodes: new Set(impacts.flatMap((impact) => [...impact.removedNodes])),
    removedRelations: new Set(impacts.flatMap((impact) => [...impact.removedRelations])),
    dependentSources: new Set(impacts.flatMap((impact) => [...impact.dependentSources])),
  };
}

function graphNodeSource(node: ReturnType<IndexedGraph["node"]>): string | undefined {
  if (node?.kind === "source") {
    return node.id;
  }
  if (node?.kind === "element") {
    return node.declarationSource;
  }
  if (node?.kind === "type") {
    return node.ownerSource;
  }
  return undefined;
}

function sameDependencySurface(previous: IndexedGraph, next: IndexedGraph, source: string): boolean {
  const signature = (graph: IndexedGraph): string | undefined => {
    const contribution = graph.sourceContribution(source);
    if (contribution === undefined) {
      return undefined;
    }
    const byJson = (left: unknown, right: unknown): number => JSON.stringify(left).localeCompare(JSON.stringify(right));
    return JSON.stringify({
      nodes: [...contribution.ownedNodes].flatMap((id) => {
        const node = graph.node(id);
        return node === undefined ? [] : [node];
      }).sort(byJson),
      relations: [...contribution.ownedRelations].flatMap((id) => {
        const relation = graph.relation(id);
        return relation === undefined ? [] : [relation];
      }).sort(byJson),
      references: [...contribution.referencedNodes].sort(),
    });
  };
  return signature(previous) === signature(next);
}

function sameSet<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function mergeResults(
  previous: LinkProjectResult,
  partial: LinkProjectResult,
  relinkedSources: ReadonlySet<string>,
  graph: IndexedGraph,
): LinkProjectResult {
  const contexts = replaceBySource(previous.contexts, partial.contexts, relinkedSources, (context) => context.sourceIdentity);
  const elements = replaceBySource(previous.elements, partial.elements, relinkedSources, (element) => element.sourceIdentity);
  const imports = replaceBySource(previous.imports, partial.imports, relinkedSources, (item) => item.sourceIdentity);
  const edges = replaceBySource(previous.edges, partial.edges, relinkedSources, (edge) => edge.sourceIdentity);
  return {
    diagnostics: replaceBySource(previous.diagnostics, partial.diagnostics, relinkedSources, (diagnostic) => diagnostic.sourceName),
    graph,
    contexts,
    elements,
    imports,
    edges,
    tabRoots: mergeTabRoots(previous.tabRoots, partial.tabRoots, relinkedSources),
    duplicateEdges: duplicateLinkedEdges(edges),
    presentations: partial.presentations,
  };
}

function mergeTabRoots(
  previous: Readonly<Record<string, readonly string[]>>,
  partial: Readonly<Record<string, readonly string[]>>,
  relinkedSources: ReadonlySet<string>,
): Readonly<Record<string, readonly string[]>> {
  return {
    ...Object.fromEntries(Object.entries(previous).filter(([source]) => !relinkedSources.has(source))),
    ...Object.fromEntries(Object.entries(partial).filter(([source]) => relinkedSources.has(source))),
  };
}

function replaceBySource<T>(
  previous: readonly T[],
  partial: readonly T[],
  relinkedSources: ReadonlySet<string>,
  source: (item: T) => string,
): readonly T[] {
  return [
    ...previous.filter((item) => !relinkedSources.has(source(item))),
    ...partial.filter((item) => relinkedSources.has(source(item))),
  ];
}

function mergeGraph(target: IndexedGraph, source: IndexedGraph): void {
  for (const node of source.nodes()) {
    if (target.node(node.id) === undefined) {
      target.addNode(node);
    }
  }
  for (const relation of source.relations()) {
    addRelationIfPossible(target, relation);
  }
}

function restoreForeignRelations(
  target: IndexedGraph,
  previous: IndexedGraph,
  relinkedSources: ReadonlySet<string>,
): void {
  for (const relation of previous.relations()) {
    if (!relinkedSources.has(relation.ownerSource)) {
      addRelationIfPossible(target, relation);
    }
  }
}

function addRelationIfPossible(graph: IndexedGraph, relation: GraphRelation): void {
  if (graph.relation(relation.id) !== undefined || graph.node(relation.source) === undefined || graph.node(relation.target) === undefined) {
    return;
  }
  graph.addRelation(relation);
}

function duplicateLinkedEdges(edges: readonly LinkedEdge[]): readonly DuplicateLinkedEdgeGroup[] {
  const groups = new Map<string, LinkedEdge[]>();
  for (const edge of edges) {
    const key = `${edge.source}\0${edge.operator}\0${edge.target}`;
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      source: group[0]!.source,
      operator: group[0]!.operator,
      target: group[0]!.target,
      edges: group,
    }));
}
