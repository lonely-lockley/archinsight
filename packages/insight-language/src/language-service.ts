import { CompletionEngine } from "./completion-engine.js";
import type {
  CompletionRequest,
  CompletionResult,
  InsightSyntaxProvider,
  LanguageSnapshot,
  LinkProjectRequest,
  LinkProjectResult,
  ProjectSource,
  QueryScope,
  RenderGraph,
} from "./contracts.js";
import { buildLanguageSnapshotResultFromSources, coreLanguageSnapshot, type LanguageSnapshotSource } from "./core-snapshot.js";
import { createGeneratedInsightSyntaxProvider } from "./generated-provider.js";
import { renderGraphviz } from "./graphviz-renderer.js";
import { linkProject } from "./project-linker.js";
import { ProjectLinkerState, type ProjectLinkerStateUpdate, type ProjectSourceReplacement } from "./project-linker-state.js";
import { ProjectAnalysisSession } from "./project-analysis-session.js";
import { selectGraph } from "./query-engine.js";

export interface InsightLanguageServiceOptions {
  readonly snapshot?: LanguageSnapshot;
  readonly syntaxProvider?: InsightSyntaxProvider;
}

export interface ServiceLinkRequest {
  readonly sources: readonly ProjectSource[];
  readonly snapshot?: LanguageSnapshot;
}

export interface ServiceCompletionRequest extends Omit<CompletionRequest, "snapshot"> {
  readonly snapshot?: LanguageSnapshot;
}

export interface ServiceRenderRequest {
  readonly result: LinkProjectResult;
  readonly scope: QueryScope;
  readonly query?: string;
  readonly theme?: string;
}

export interface ServiceRenderResult {
  readonly graph: RenderGraph;
  readonly dot: string;
}

export class InsightLanguageService {
  private readonly defaultSnapshot: LanguageSnapshot;
  private readonly completionEngine: CompletionEngine;

  constructor(options: InsightLanguageServiceOptions = {}) {
    this.defaultSnapshot = options.snapshot ?? coreLanguageSnapshot;
    this.completionEngine = new CompletionEngine(options.syntaxProvider ?? createGeneratedInsightSyntaxProvider());
  }

  snapshot(): LanguageSnapshot {
    return this.defaultSnapshot;
  }

  buildSnapshot(
    sources: readonly LanguageSnapshotSource[],
    baseSnapshots: readonly LanguageSnapshot[] = [],
  ): ReturnType<typeof buildLanguageSnapshotResultFromSources> {
    return buildLanguageSnapshotResultFromSources(sources, baseSnapshots);
  }

  createProjectAnalysisSession(sources: readonly ProjectSource[]): ProjectAnalysisSession {
    return ProjectAnalysisSession.create(sources, [this.defaultSnapshot]);
  }

  complete(request: ServiceCompletionRequest): CompletionResult {
    return this.completionEngine.complete({
      ...request,
      snapshot: request.snapshot ?? this.defaultSnapshot,
    });
  }

  link(request: ServiceLinkRequest): LinkProjectResult {
    return linkProject(this.linkRequest(request));
  }

  createState(request: ServiceLinkRequest): ProjectLinkerState {
    return new ProjectLinkerState(this.linkRequest(request));
  }

  forkState(state: ProjectLinkerState): ProjectLinkerState {
    return state.fork();
  }

  replaceSource(state: ProjectLinkerState, replacement: ProjectSourceReplacement): ProjectLinkerStateUpdate {
    return state.replaceSource(replacement);
  }

  removeSource(state: ProjectLinkerState, sourceName: string): ProjectLinkerStateUpdate {
    return state.removeSource(sourceName);
  }

  select(result: LinkProjectResult, scope: QueryScope, query?: string): RenderGraph {
    return selectGraph(result, scope, query);
  }

  render(request: ServiceRenderRequest): ServiceRenderResult {
    const graph = this.select(request.result, request.scope, request.query);
    return {
      graph,
      dot: renderGraphviz(request.result, graph, request.theme ?? "light"),
    };
  }

  linkAndRender(request: ServiceLinkRequest & Omit<ServiceRenderRequest, "result">): ServiceRenderResult & { readonly result: LinkProjectResult } {
    const result = this.link(request);
    return {
      result,
      ...this.render({
        result,
        scope: request.scope,
        ...(request.query === undefined ? {} : { query: request.query }),
        ...(request.theme === undefined ? {} : { theme: request.theme }),
      }),
    };
  }

  private linkRequest(request: ServiceLinkRequest): LinkProjectRequest {
    return {
      snapshot: request.snapshot ?? this.defaultSnapshot,
      sources: request.sources,
    };
  }
}
