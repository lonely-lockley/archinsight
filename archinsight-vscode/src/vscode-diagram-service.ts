import * as vscode from "vscode";
import {
  BUILTIN_VIEW_QUERIES,
  builtinViewDefinition,
  discoverDeploymentEnvironments,
} from "@insight/language";
import { buildDiagramPreview, type DiagramRenderInput, type DiagramView, type PreviewState } from "./diagram-rendering.js";
import {
  DiagramSession,
  type DiagramEnvironmentSelection,
  type DiagramQueryState,
  type DiagramSessionPorts,
} from "./diagram-session.js";

export const viewQueries: Record<DiagramView, string> = BUILTIN_VIEW_QUERIES;

export type DiagramHostPorts = Pick<
  DiagramSessionPorts<DiagramRenderInput, DiagramView, PreviewState>,
  "publishPreview" | "publishQuery" | "onQueryChanged" | "requestPng"
>;

export function viewUsesEnvironment(view: DiagramView): boolean {
  return builtinViewDefinition(view).environment === "single-relevant";
}

export function createDiagramSession(
  initialState: DiagramQueryState<DiagramView>,
  hostPorts: DiagramHostPorts,
  log: (message: string) => void,
): DiagramSession<DiagramRenderInput, DiagramView, PreviewState> {
  return new DiagramSession<DiagramRenderInput, DiagramView, PreviewState>(initialState, {
    usesEnvironment: viewUsesEnvironment,
    chooseEnvironment,
    buildPreview: (input, state) => buildDiagramPreview(input, state, {
      theme: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? "dark" : "light",
      log,
    }),
    save: saveBytes,
    warn: (message) => void vscode.window.showWarningMessage(message),
    decodePng: decodePngDataUrl,
    ...hostPorts,
  });
}

export async function saveBytes(fileName: string, content: Uint8Array): Promise<void> {
  const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(fileName) });
  if (uri === undefined) {
    return;
  }
  await vscode.workspace.fs.writeFile(uri, content);
}

async function chooseEnvironment(
  input: DiagramRenderInput,
  selected: string | undefined,
  forcePicker: boolean,
): Promise<DiagramEnvironmentSelection> {
  const context = input.current.result.contexts.find((candidate) => candidate.sourceIdentity === input.sourceName);
  const environments = discoverDeploymentEnvironments(input.current.result, {
    context: context?.id,
    tab: input.sourceName,
  });
  if (environments.length === 0) {
    if (forcePicker) {
      void vscode.window.showInformationMessage("No deployment environments are relevant to this source.");
    }
    return { cancelled: false };
  }
  if (environments.length === 1) {
    return { environment: environments[0]!.id, cancelled: false };
  }
  if (!forcePicker && selected !== undefined && environments.some((environment) => environment.id === selected)) {
    return { environment: selected, cancelled: false };
  }
  const picked = await vscode.window.showQuickPick(
    environments.map((environment) => ({
      label: environment.id,
      description: environment.name === undefined || environment.name === environment.id ? undefined : environment.name,
      environment,
    })),
    {
      title: "D2 Deployment Environment",
      placeHolder: "Select the environment to open at container level",
      matchOnDescription: true,
    },
  );
  return picked === undefined
    ? { cancelled: true }
    : { environment: picked.environment.id, cancelled: false };
}

function decodePngDataUrl(dataUrl: string): Uint8Array | undefined {
  const data = /^data:image\/png;base64,(.+)$/.exec(dataUrl)?.[1];
  return data === undefined ? undefined : Buffer.from(data, "base64");
}
