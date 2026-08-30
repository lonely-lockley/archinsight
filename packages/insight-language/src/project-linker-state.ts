import type { GraphRelation, GraphUpdateImpact, IndexedGraph } from "./indexed-graph.js";
import type {
  DuplicateLinkedEdgeGroup,
  LinkedEdge,
  LinkProjectRequest,
  LinkProjectResult,
  ProjectSource,
} from "./contracts.js";
import { linkProject } from "./project-linker.js";

export interface ProjectSourceReplacement {
  readonly sourceName: string;
  readonly source?: string;
}

export interface ProjectLinkerStateUpdate {
  readonly impact: GraphUpdateImpact;
  readonly affectedSources: ReadonlySet<string>;
  readonly relinkedSources: ReadonlySet<string>;
  readonly result: LinkProjectResult;
}

export class ProjectLinkerState {
  private readonly snapshot: LinkProjectRequest["snapshot"];
  private readonly sourcesByName: Map<string, ProjectSource>;
  private currentResult: LinkProjectResult;

  constructor(request: LinkProjectRequest, existingResult?: LinkProjectResult) {
    this.snapshot = request.snapshot;
    this.sourcesByName = new Map(request.sources.map((source) => [source.sourceName, source]));
    this.currentResult = existingResult ?? linkProject(this.request());
  }

  result(): LinkProjectResult {
    return this.currentResult;
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
    });
  }

  replaceSource(replacement: ProjectSourceReplacement): ProjectLinkerStateUpdate {
    const previous = this.currentResult;
    const addingSource = replacement.source !== undefined && !this.sourcesByName.has(replacement.sourceName);
    const replacedReferences = previous.graph.sourceContribution(replacement.sourceName)?.referencedNodes ?? new Set<string>();
    const impact = previous.graph.removeSourceContribution(replacement.sourceName);
    if (replacement.source === undefined) {
      this.sourcesByName.delete(replacement.sourceName);
    } else {
      this.sourcesByName.set(replacement.sourceName, {
        sourceName: replacement.sourceName,
        source: replacement.source,
      });
    }
    // A new source can satisfy references that were unresolved in the previous
    // graph, so there is no dependency edge from those consumers to follow yet.
    // It can also introduce duplicates in an existing context. Relink every
    // source for additions; replacements and removals keep using graph impact.
    const affectedSources = addingSource
      ? new Set(this.sourcesByName.keys())
      : new Set([replacement.sourceName, ...impact.dependentSources]);
    const relinkedSources = this.relinkSupportSources(previous, affectedSources, new Map([
      [replacement.sourceName, replacedReferences],
    ]));
    for (const source of relinkedSources) {
      if (source !== replacement.sourceName) {
        previous.graph.removeSourceContribution(source);
      }
    }
    const partialResult = linkProject({
      snapshot: this.snapshot,
      sources: [...relinkedSources].flatMap((source) => {
        const projectSource = this.sourcesByName.get(source);
        return projectSource === undefined ? [] : [projectSource];
      }),
    });
    mergeGraph(previous.graph, partialResult.graph);
    this.currentResult = mergeResults(previous, partialResult, relinkedSources, previous.graph);
    return {
      impact,
      affectedSources,
      relinkedSources,
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
    };
  }

  private relinkSupportSources(
    previous: LinkProjectResult,
    affectedSources: ReadonlySet<string>,
    preservedReferencesBySource: ReadonlyMap<string, ReadonlySet<string>>,
  ): ReadonlySet<string> {
    const result = new Set<string>();
    const visited = new Set<string>();
    const pending = [...affectedSources];
    const contextBySource = new Map(previous.contexts.map((context) => [context.sourceIdentity, context.id]));
    const sourcesByContext = new Map<string, Set<string>>();
    for (const context of previous.contexts) {
      const sources = sourcesByContext.get(context.id) ?? new Set<string>();
      sources.add(context.sourceIdentity);
      sourcesByContext.set(context.id, sources);
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
      const context = contextBySource.get(source);
      if (context !== undefined) {
        for (const siblingSource of sourcesByContext.get(context) ?? []) {
          if (this.sourcesByName.has(siblingSource)) {
            pending.push(siblingSource);
          }
        }
      }
      for (const imported of previous.imports.filter((item) => item.sourceIdentity === source)) {
        for (const providerSource of sourcesByContext.get(imported.sourceContext) ?? []) {
          if (this.sourcesByName.has(providerSource)) {
            pending.push(providerSource);
          }
        }
      }
      const referencedNodes = preservedReferencesBySource.get(source)
        ?? previous.graph.sourceContribution(source)?.referencedNodes
        ?? [];
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
