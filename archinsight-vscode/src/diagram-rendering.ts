import {
  builtinViewDefinition,
  diagramQuickActionMetadata,
  discoverDeploymentEnvironments,
  type BuiltinDiagramView,
  type LanguageDiagnostic,
  type LinkProjectResult,
  type QueryTableResult,
  type RenderGraph,
  type RenderTheme,
  type DiagramDiff,
} from "@insight/language";
import type { DiagramPreviewState, DiagramQueryState } from "./diagram-session.js";
import {
  executeDiagramQueryInWorker,
  renderDiagramDiffInWorker,
  renderDiagramGraphInWorker,
} from "./diagram-viz-worker-client.js";

export type DiagramView = BuiltinDiagramView;

export interface PreviewState extends DiagramPreviewState<DiagramView> {
  readonly contextId: string;
  readonly sourceName: string;
  readonly queryResult?: QueryTableResult;
}

interface DiagramLinkedProject {
  readonly result: LinkProjectResult;
  readonly diagnostics: readonly LanguageDiagnostic[];
}

export interface DiagramRenderInput {
  readonly current: DiagramLinkedProject;
  readonly sourceName: string;
  readonly fileName: string;
  readonly source: string;
  readonly blockOnLinkerErrors: boolean;
  readonly queryScope?: {
    readonly tab?: string;
    readonly context?: string;
  };
}

export interface DiagramRenderingContext {
  readonly theme: RenderTheme;
  readonly log: (message: string) => void;
  readonly now?: () => number;
}

export async function buildDiagramPreview(
  input: DiagramRenderInput,
  state: DiagramQueryState<DiagramView>,
  context: DiagramRenderingContext,
  signal?: AbortSignal,
): Promise<PreviewState> {
  logQueryDiagnostics(input.current.diagnostics, context.log);
  if (input.blockOnLinkerErrors
      && input.current.diagnostics.some((diagnostic) => (diagnostic.level ?? "ERROR") === "ERROR")) {
    context.log("ERROR Query failed: Fix linker errors before running the query.");
    return {
      ...state,
      contextId: "-",
      sourceName: input.sourceName,
      fileName: input.fileName,
      source: input.source,
      quickActionMetadata: diagramQuickActionMetadata(input.current.result),
      error: "Fix linker errors before rendering a diagram.",
    };
  }
  return previewState(input, state, context, signal);
}

async function previewState(
  input: DiagramRenderInput,
  state: DiagramQueryState<DiagramView>,
  renderingContext: DiagramRenderingContext,
  signal?: AbortSignal,
): Promise<PreviewState> {
  const { current, sourceName, source, fileName } = input;
  const { view, query, environment } = state;
  const sourceContext = current.result.contexts.find((candidate) => candidate.sourceIdentity === sourceName);
  const tab = input.queryScope === undefined ? sourceName : input.queryScope.tab;
  const context = input.queryScope === undefined ? sourceContext?.id : input.queryScope.context;
  const startedAt = renderingContext.now?.() ?? performance.now();
  try {
    if (viewUsesEnvironment(view) && environment === undefined) {
      const available = discoverDeploymentEnvironments(current.result, { context, tab });
      throw new Error(available.length === 0
        ? "No deployment environments are relevant to this source."
        : "Select an environment for the D2 view.");
    }
    const rendered = await executeDiagramQueryInWorker(current.result, {
      context,
      tab,
      view,
      ...(environment === undefined ? {} : { environment }),
    }, query, state.parameters ?? {}, renderingContext.theme, signal);
    const result = rendered.result;
    if (result.kind === "table") {
      renderingContext.log(`INFO ${queryFinishedMessage((renderingContext.now?.() ?? performance.now()) - startedAt, result.metadata.rowCount)}`);
      return {
        ...state,
        contextId: context ?? "-",
        sourceName,
        fileName,
        source,
        quickActionMetadata: diagramQuickActionMetadata(current.result),
        queryResult: result,
      };
    }
    const dot = rendered.dot!;
    const svg = rendered.svg!;
    renderingContext.log(`INFO ${queryFinishedMessage((renderingContext.now?.() ?? performance.now()) - startedAt)}`);
    return {
      ...state,
      contextId: context ?? "-",
      sourceName,
      fileName,
      source,
      quickActionMetadata: diagramQuickActionMetadata(current.result),
      dot,
      svg,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderingContext.log(`ERROR Query failed: ${message}`);
    return {
      ...state,
      contextId: context ?? "-",
      sourceName,
      fileName,
      source,
      quickActionMetadata: diagramQuickActionMetadata(current.result),
      error: message,
    };
  }
}

export async function buildQuickActionPreview(
  input: DiagramRenderInput,
  state: DiagramQueryState<DiagramView>,
  graph: RenderGraph,
  renderingContext: DiagramRenderingContext,
  signal?: AbortSignal,
): Promise<PreviewState> {
  const contextId = graph.context || "-";
  try {
    const { dot, svg } = await renderDiagramGraphInWorker(
      input.current.result, graph, renderingContext.theme, signal
    );
    return {
      ...state,
      contextId,
      sourceName: input.sourceName,
      fileName: input.fileName,
      source: input.source,
      dot,
      svg,
      quickActionMetadata: diagramQuickActionMetadata(input.current.result),
    };
  } catch (error) {
    return {
      ...state,
      contextId,
      sourceName: input.sourceName,
      fileName: input.fileName,
      source: input.source,
      error: error instanceof Error ? error.message : String(error),
      quickActionMetadata: diagramQuickActionMetadata(input.current.result),
    };
  }
}

export async function buildDiagramDiffPreview(
  input: DiagramRenderInput,
  state: DiagramQueryState<DiagramView>,
  before: LinkProjectResult,
  after: LinkProjectResult,
  diff: DiagramDiff,
  renderingContext: DiagramRenderingContext,
  signal?: AbortSignal,
): Promise<PreviewState> {
  try {
    const { dot, svg } = await renderDiagramDiffInWorker(
      before, after, diff, renderingContext.theme, signal
    );
    return {
      ...state,
      contextId: diff.graph.context || '-',
      sourceName: input.sourceName,
      fileName: input.fileName,
      source: input.source,
      dot,
      svg,
      quickActionMetadata: {
        ...diagramQuickActionMetadata(before),
        ...diagramQuickActionMetadata(after),
      },
    };
  } catch (error) {
    return {
      ...state,
      contextId: diff.graph.context || '-',
      sourceName: input.sourceName,
      fileName: input.fileName,
      source: input.source,
      error: error instanceof Error ? error.message : String(error),
      quickActionMetadata: {
        ...diagramQuickActionMetadata(before),
        ...diagramQuickActionMetadata(after),
      },
    };
  }
}

export function queryFinishedMessage(durationMs: number, rowCount?: number): string {
  const duration = `${Math.max(0, Math.round(durationMs))} ms`;
  return rowCount === undefined
    ? `Query finished in ${duration}`
    : `Query finished in ${duration}: ${rowCount} ${rowCount === 1 ? "row" : "rows"}`;
}

function logQueryDiagnostics(
  diagnostics: readonly LanguageDiagnostic[],
  log: (message: string) => void,
): void {
  for (const diagnostic of diagnostics) {
    const level = diagnostic.level ?? "ERROR";
    log(`${level} ${diagnostic.code}: ${diagnostic.message} (${diagnostic.sourceName}:${diagnostic.line}:${diagnostic.column + 1})`);
  }
}

function viewUsesEnvironment(view: DiagramView): boolean {
  return builtinViewDefinition(view).environment === "single-relevant";
}
