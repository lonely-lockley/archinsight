import { normalizeGraphvizSvgResult } from "@archinsight/graphviz";
import {
  builtinViewDefinition,
  discoverDeploymentEnvironments,
  renderGraphviz,
  selectGraph,
  type BuiltinDiagramView,
  type LanguageDiagnostic,
  type LinkProjectResult,
} from "@insight/language";
import type { DiagramPreviewState, DiagramQueryState } from "./diagram-session.js";
import { makeGraphvizBackgroundsTransparent } from "./diagram-svg.js";

export type DiagramView = BuiltinDiagramView;

export interface PreviewState extends DiagramPreviewState<DiagramView> {
  readonly contextId: string;
  readonly sourceName: string;
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
}

export interface DiagramRenderingContext {
  readonly theme: "dark" | "light";
  readonly log: (message: string) => void;
}

export async function buildDiagramPreview(
  input: DiagramRenderInput,
  state: DiagramQueryState<DiagramView>,
  context: DiagramRenderingContext,
): Promise<PreviewState> {
  if (input.blockOnLinkerErrors
      && input.current.diagnostics.some((diagnostic) => (diagnostic.level ?? "ERROR") === "ERROR")) {
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
  const context = current.result.contexts.find((candidate) => candidate.sourceIdentity === sourceName);
  try {
    if (viewUsesEnvironment(view) && environment === undefined) {
      const available = discoverDeploymentEnvironments(current.result, { context: context?.id, tab: sourceName });
      throw new Error(available.length === 0
        ? "No deployment environments are relevant to this source."
        : "Select an environment for the D2 view.");
    }
    const graph = selectGraph(current.result, {
      context: context?.id,
      tab: sourceName,
      view,
      ...(environment === undefined ? {} : { environment }),
    }, query);
    const dot = renderGraphviz(current.result, graph, renderingContext.theme);
    const svg = await renderSvg(dot);
    renderingContext.log("Render finished: diagram rendered successfully");
    return {
      ...state,
      contextId: context?.id ?? "-",
      sourceName,
      fileName,
      source,
      dot,
      svg,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderingContext.log(`Render failed: ${message}`);
    return {
      ...state,
      contextId: context?.id ?? "-",
      sourceName,
      fileName,
      source,
      error: message,
    };
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
