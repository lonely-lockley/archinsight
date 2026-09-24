import { normalizeGraphvizSvgResult } from "@archinsight/graphviz";
import {
  builtinViewDefinition,
  discoverDeploymentEnvironments,
  executeQuery,
  renderGraphviz,
  type BuiltinDiagramView,
  type LanguageDiagnostic,
  type LinkProjectResult,
  type QueryTableResult,
} from "@insight/language";
import type { DiagramPreviewState, DiagramQueryState } from "./diagram-session.js";
import { makeGraphvizBackgroundsTransparent } from "./diagram-svg.js";

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
  readonly theme: "dark" | "light";
  readonly log: (message: string) => void;
  readonly now?: () => number;
}

export async function buildDiagramPreview(
  input: DiagramRenderInput,
  state: DiagramQueryState<DiagramView>,
  context: DiagramRenderingContext,
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
      error: "Fix linker errors before rendering a diagram.",
    };
  }
  return previewState(input, state, context);
}

async function previewState(
  input: DiagramRenderInput,
  state: DiagramQueryState<DiagramView>,
  renderingContext: DiagramRenderingContext,
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
    const result = executeQuery(current.result, {
      context,
      tab,
      view,
      ...(environment === undefined ? {} : { environment }),
    }, query, state.parameters ?? {});
    if (result.kind === "table") {
      renderingContext.log(`INFO ${queryFinishedMessage((renderingContext.now?.() ?? performance.now()) - startedAt, result.metadata.rowCount)}`);
      return {
        ...state,
        contextId: context ?? "-",
        sourceName,
        fileName,
        source,
        queryResult: result,
      };
    }
    const graph = result.graph;
    const dot = renderGraphviz(current.result, graph, renderingContext.theme);
    const svg = await renderSvg(dot);
    renderingContext.log(`INFO ${queryFinishedMessage((renderingContext.now?.() ?? performance.now()) - startedAt)}`);
    return {
      ...state,
      contextId: context ?? "-",
      sourceName,
      fileName,
      source,
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
      error: message,
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

async function renderSvg(dot: string): Promise<string> {
  const { instance } = await import("@viz-js/viz");
  const viz = await instance();
  const result = normalizeGraphvizSvgResult(viz.render(dot, { format: "svg", engine: "dot" }));
  if (result.status === "failure") {
    throw new Error(result.error);
  }
  return makeGraphvizBackgroundsTransparent(result.svg);
}

function viewUsesEnvironment(view: DiagramView): boolean {
  return builtinViewDefinition(view).environment === "single-relevant";
}
