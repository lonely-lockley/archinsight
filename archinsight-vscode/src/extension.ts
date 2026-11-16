import * as vscode from "vscode";
import * as fs from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import {
  completionDetail,
  completionDisplayLabel,
  completionDocumentationMarkdown,
  completionSortText,
  diagnosticIdentity,
  filterTreeByQuery,
  semanticTokenModifierBits,
} from "@archinsight/editor-support";
import {
  buildProjectStructure,
  buildTypeHierarchy,
  analyzeQuery,
  completeAiq,
  coreLanguageSnapshot,
  coreSource,
  coreSources,
  elementCompletionDocumentation,
  filterTypeHierarchy,
  insightSemanticTokenModifiers,
  insightSemanticTokenTypes,
  InsightLanguageService,
  resolveBuiltinView,
  semanticHighlightInsight,
  selectIsolatedDiagramDiff,
  type CompletionKind,
  type ContextualIdentifier,
  type LanguageDiagnostic,
  type LanguageSnapshot,
  type LinkedElement,
  type LinkProjectResult,
  type ProjectStructureDeclaration,
  type ProjectSource,
  type DiagramDiff,
  type QueryParameterValue,
  type QueryScope,
  type TypeHierarchyNode,
  type VisibleIdentifier,
} from "@insight/language";
import {
  parseControlsWebviewToHostMessage,
  parsePreviewWebviewToHostMessage,
  parseWorkbenchWebviewToHostMessage,
  type WorkbenchHostToWebviewMessage,
  type AttributedDiagramDiff,
  type DiagramDiffRevisionCatalogue,
  type WebviewQueryScopeState,
} from "@archinsight/contracts";
import {
  resolveQueryScopeState,
  selectQueryScope,
  type QueryScopeContextChoice,
} from "@archinsight/workbench/query-scope-state";
import {
  beginIsolate,
  cancelDeployment,
  cancelIsolate,
  cancelFindPath,
  retryFindPathTarget,
  type DeploymentMode,
  type DiagramQuickActionId,
  type FindPathMode,
  type IsolateMode,
  type TransientDiagramResultKind,
} from "@archinsight/workbench/diagram-quick-actions";
import {
  DiagramQuickActionService,
  type PreparedFindPath,
} from "@archinsight/workbench/diagram-quick-action-service";
import { DiagramQuickActionCoordinator } from "@archinsight/workbench/diagram-quick-action-coordinator";
import {
  attributeVersionedDiagramDiff,
  buildVersionedDiagramDiff,
  projectVersionedDiagramDiff,
} from "@archinsight/workbench/versioned-diagram-diff-service";
import { diagramDiffDeclarationSource } from "@archinsight/workbench/versioned-diagram-diff";
import {
  fileNameWithExtension,
  type DiagramArtifactKind,
  type DiagramSession,
  type DiagramQueryState as SessionDiagramQueryState,
} from "./diagram-session.js";
import {
  buildQuickActionPreview,
  buildDiagramDiffPreview,
  type DiagramRenderInput,
  type DiagramView,
  type PreviewState,
} from "./diagram-rendering.js";
import { openGitVersionedRepository, type GitVersionedRepository } from "@archinsight/git";
import { createDiagramSession, saveBytes, viewQueries } from "./vscode-diagram-service.js";
import { previewHtml } from "./preview-webview.js";
import { renderThemeForColorThemeKind } from "./theme.js";
import { LatestWinsCoordinator } from "./latest-wins.js";
import { disposeDiagramVizWorker, selectDiagramQueryInWorker } from "./diagram-viz-worker-client.js";
import {
  analyzeProjectInWorker,
  analyzeProjectRevisionInWorker,
  disposeProjectAnalysisWorker,
} from "./project-analysis-worker-client.js";
import {
  isIgnoredSource,
  isInside,
  isInsightDocument,
  readWorkspaceSources,
  sourceNameForUri,
  sourceUris,
  workspaceRoot,
} from "./workspace-sources.js";

type AgentSkillTarget = "generic" | "codex" | "claude";

type DiagramQueryState = SessionDiagramQueryState<DiagramView>;

interface LinkedProject {
  readonly root: vscode.Uri;
  readonly sources: readonly ProjectSource[];
  readonly sourceUris: ReadonlyMap<string, vscode.Uri>;
  readonly snapshot: LanguageSnapshot;
  readonly result: LinkProjectResult;
  readonly diagnostics: readonly LanguageDiagnostic[];
  readonly tokenVocabulary: InsightTokenVocabulary;
}

interface DiagramDiffSessionState {
  readonly catalogue: DiagramDiffRevisionCatalogue;
  readonly before: LinkedProject;
  readonly after: LinkedProject;
  readonly selectedElementId: string;
  readonly beforeRevision: string;
  readonly afterRevision: string;
  readonly beforeShort: string;
  readonly afterShort: string;
}

interface DiagramDiffProjectionState {
  readonly session: DiagramDiffSessionState;
  readonly fullDiff: DiagramDiff;
  readonly attributed?: AttributedDiagramDiff;
}

interface SemanticTokenCacheEntry {
  readonly version: number;
  readonly tokens: vscode.SemanticTokens;
}

interface StructureNode {
  readonly label: string;
  readonly description?: string;
  readonly icon: string;
  readonly iconColor: string;
  readonly kind: "root" | "type" | "context" | "import" | "element";
  readonly location?: vscode.Location;
  readonly children: readonly StructureNode[];
}

type InsightTokenVocabulary = Record<string, never>;

interface VirtualWorkbenchDocument {
  readonly uri: vscode.Uri;
  readonly sourceName: string;
  readonly fileName: string;
  readonly source: string;
  readonly readOnly: boolean;
}

interface ArchinsightCliStatus {
  readonly version: string;
  readonly supportsAgentSkillTargets: boolean;
}

const semanticTokenTypes = insightSemanticTokenTypes;
type SemanticTokenType = typeof semanticTokenTypes[number];
const semanticTokenModifiers = insightSemanticTokenModifiers;
type SemanticTokenModifier = typeof semanticTokenModifiers[number];
const semanticLegend = new vscode.SemanticTokensLegend([...semanticTokenTypes], [...semanticTokenModifiers]);

const service = new InsightLanguageService({ snapshot: coreLanguageSnapshot });
const output = vscode.window.createOutputChannel("Archinsight");

function validatedWebviewMessage<T>(parser: (value: unknown) => T, value: unknown, channel: string): T | undefined {
  try {
    return parser(value);
  } catch (error) {
    output.appendLine(`Ignored invalid ${channel} webview message: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

let activePreview: PreviewSession | undefined;
const previewSessions = new Set<PreviewSession>();
let activeWorkbenchEditor: ArchinsightWorkbenchEditorSession | undefined;
const archinsightEditorViewType = "archinsight.editor";
const archinsightCoreEditorViewType = "archinsight.coreEditor";
const coreSourceScheme = "archinsight-core";
const coreSourceName = coreSources.some((source) => source.sourceName === "core.ai") ? "core.ai" : coreSources[0]?.sourceName ?? "core.ai";
const coreSourceByName = new Map(coreSources.map((source) => [source.sourceName, source.source]));
const coreSourceUri = vscode.Uri.from({ scheme: coreSourceScheme, path: `/${coreSourceName}` });

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("archinsight");
  const aiqDiagnostics = vscode.languages.createDiagnosticCollection("archinsight-aiq");
  const project = new ProjectModel(diagnostics);
  const structure = new ArchinsightStructureProvider(project);
  const controls = new ArchinsightControlsProvider(project, context.extensionUri);
  const workbenchEditor = new ArchinsightWorkbenchEditorProvider(project, context.extensionUri, controls);
  const sourceWatcher = vscode.workspace.createFileSystemWatcher("**/*.ai");
  const refreshChangedSource = (uri: vscode.Uri): void => {
    const root = workspaceRoot();
    if (root === undefined || !isInside(root, uri)) {
      return;
    }
    const sourceName = sourceNameForUri(root, uri);
    if (!isIgnoredSource(sourceName)) {
      project.scheduleRefresh();
    }
  };
  const updateAiqDiagnostics = (document: vscode.TextDocument): void => {
    if (!isAiqDocument(document)) return;
    const analysis = analyzeQuery(document.getText(), { sourceName: document.fileName });
    aiqDiagnostics.set(document.uri, analysis.diagnostics.map(vscodeDiagnostic));
  };

  context.subscriptions.push(
    output,
    project,
    diagnostics,
    aiqDiagnostics,
    sourceWatcher,
    sourceWatcher.onDidCreate(refreshChangedSource),
    sourceWatcher.onDidChange(refreshChangedSource),
    sourceWatcher.onDidDelete(refreshChangedSource),
    vscode.window.registerCustomEditorProvider(archinsightEditorViewType, workbenchEditor, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
    vscode.window.createTreeView("archinsightStructure", { treeDataProvider: structure }),
    vscode.window.registerWebviewViewProvider("archinsightControls", controls, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.workspace.registerTextDocumentContentProvider(coreSourceScheme, new CoreSourceContentProvider()),
    vscode.commands.registerCommand("archinsight.runQuery", async () => {
      await runActiveAiqQuery(project, workbenchEditor);
    }),
    vscode.commands.registerCommand("archinsight.linkProject", async () => {
      await project.refresh("manual");
      showLinkSummary(project.current);
    }),
    vscode.commands.registerCommand("archinsight.previewDiagram", async () => {
      await project.refresh("preview");
      await previewDiagram(project);
    }),
    vscode.commands.registerCommand("archinsight.preview.noFilter", async () => previewView(project, "no-filter")),
    vscode.commands.registerCommand("archinsight.preview.c1", async () => previewView(project, "c1")),
    vscode.commands.registerCommand("archinsight.preview.c2", async () => previewView(project, "c2")),
    vscode.commands.registerCommand("archinsight.preview.c3", async () => previewView(project, "c3")),
    vscode.commands.registerCommand("archinsight.preview.c4", async () => previewView(project, "c4")),
    vscode.commands.registerCommand("archinsight.preview.deploymentSystem", async () => previewView(project, "deployment-system")),
    vscode.commands.registerCommand("archinsight.preview.deploymentContainer", async () => previewView(project, "deployment-container", undefined, true)),
    vscode.commands.registerCommand("archinsight.preview.deployment", async () => previewView(project, "deployment")),
    vscode.commands.registerCommand("archinsight.preview.editQuery", async () => controls.focus(activeWorkbenchEditor?.currentView(), activeWorkbenchEditor?.currentQuery())),
    vscode.commands.registerCommand("archinsight.preview.downloadSource", async () => {
      if (activeWorkbenchEditor !== undefined) {
        await activeWorkbenchEditor.download("source");
      } else if (activePreview !== undefined) {
        await activePreview.download("source");
      } else {
        await downloadActiveSource();
      }
    }),
    vscode.commands.registerCommand("archinsight.preview.downloadSvg", async () => (activeWorkbenchEditor ?? activePreview)?.download("svg")),
    vscode.commands.registerCommand("archinsight.preview.downloadPng", async () => (activeWorkbenchEditor ?? activePreview)?.download("png")),
    vscode.commands.registerCommand("archinsight.preview.downloadDot", async () => (activeWorkbenchEditor ?? activePreview)?.download("dot")),
    vscode.commands.registerCommand("archinsight.showStructure", async () => {
      await project.refresh("structure");
      await vscode.commands.executeCommand("workbench.view.explorer");
      structure.refresh();
    }),
    vscode.commands.registerCommand("archinsight.checkCli", async () => {
      await checkCliCommand();
    }),
    vscode.commands.registerCommand("archinsight.installCli", () => {
      openCliInstallTerminal();
    }),
    vscode.commands.registerCommand("archinsight.generateAgentSkill", async () => {
      await generateAgentSkillCommand();
    }),
    vscode.commands.registerCommand("archinsight.structure.filter", async () => {
      const value = await vscode.window.showInputBox({
        title: "Filter Project Structure",
        prompt: "Filter by element name, type, or section.",
        placeHolder: "system, Container, kafka",
        value: structure.filterText,
      });
      if (value !== undefined) {
        structure.setFilter(value);
        await vscode.commands.executeCommand("workbench.view.explorer");
      }
    }),
    vscode.commands.registerCommand("archinsight.structure.clearFilter", () => {
      structure.setFilter("");
    }),
    vscode.commands.registerCommand("archinsight.structure.toggleLanguageTypes", () => {
      structure.toggleLanguageTypes();
    }),
    vscode.commands.registerCommand("archinsight.structure.toggleOperators", () => {
      structure.toggleOperators();
    }),
    vscode.commands.registerCommand("archinsight.structure.toggleIdentifiers", () => {
      structure.toggleIdentifiers();
    }),
    vscode.commands.registerCommand("archinsight.openStructureLocation", async (location: vscode.Location) => {
      await workbenchEditor.openLocation(location);
    }),
    vscode.window.tabGroups.onDidChangeTabs(() => {
      void pinActiveArchinsightPreviewTab();
    }),
    vscode.languages.registerCompletionItemProvider(
      { language: "insight", scheme: "file" },
      new InsightCompletionProvider(project),
      "@",
      "-",
      "~",
      ">",
      ":",
      "=",
      ".",
      ...letters(),
    ),
    vscode.languages.registerCompletionItemProvider(
      { language: "archinsight-query", scheme: "file" },
      new AiqCompletionProvider(project),
      "$", ":", ".", ...letters(),
    ),
    vscode.languages.registerDocumentSymbolProvider(
      { language: "insight", scheme: "file" },
      new InsightDocumentSymbolProvider(project),
    ),
    vscode.languages.registerHoverProvider(
      { language: "insight", scheme: "file" },
      new InsightHoverProvider(project),
    ),
    vscode.languages.registerDocumentSemanticTokensProvider(
      { language: "insight", scheme: "file" },
      new InsightSemanticTokensProvider(project),
      semanticLegend,
    ),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isInsightDocument(document)) {
        void project.refresh("save");
      }
      updateAiqDiagnostics(document);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (isInsightDocument(event.document)) {
        project.scheduleRefresh();
      }
      updateAiqDiagnostics(event.document);
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (isInsightDocument(document)) {
        project.scheduleRefresh();
      }
      updateAiqDiagnostics(document);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (isAiqDocument(document)) aiqDiagnostics.delete(document.uri);
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor !== undefined && isInsightDocument(editor.document)) {
        void activePreview?.setActiveDocument(editor.document);
      }
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      void workbenchEditor.refreshTheme();
      for (const preview of previewSessions) void preview.refreshTheme();
    }),
  );

  vscode.workspace.textDocuments.forEach(updateAiqDiagnostics);

  context.subscriptions.push(project.onDidChange(() => {
    structure.refresh();
    void workbenchEditor.refreshFromProject(project.current);
    if (activePreview !== undefined) {
      void activePreview.refreshFromProject(project.current);
    }
  }));
  void project.refresh("activation");
}

async function runActiveAiqQuery(
  project: ProjectModel,
  workbenchEditor: ArchinsightWorkbenchEditorProvider,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const textQueryDocument = editor !== undefined && isAiqDocument(editor.document) ? editor.document : undefined;
  const workbenchQuery = activeWorkbenchEditor?.activeQueryDocumentSource();
  const query = textQueryDocument?.getText() ?? workbenchQuery;
  if (query === undefined) {
    void vscode.window.showWarningMessage("Open an AIQ .aiq file before running a query.");
    return;
  }

  await project.refresh("run-query");
  const current = project.current;
  if (current === undefined) {
    void vscode.window.showWarningMessage("Open an Archinsight project before running a query.");
    return;
  }
  if (current.diagnostics.some((diagnostic) => (diagnostic.level ?? "ERROR") === "ERROR")) {
    void vscode.window.showErrorMessage("Fix linker errors before running the query.");
    return;
  }

  if (activeWorkbenchEditor !== undefined && workbenchQuery !== undefined) {
    await activeWorkbenchEditor.render("no-filter", query);
    activeWorkbenchEditor.activate();
    return;
  }
  if (textQueryDocument === undefined) return;
  const origin = new vscode.Position(0, 0);
  await workbenchEditor.openLocation(
    new vscode.Location(textQueryDocument.uri, new vscode.Range(origin, origin)),
    { view: "no-filter", query },
  );
}

export function deactivate(): void {
  disposeDiagramVizWorker();
  disposeProjectAnalysisWorker();
  output.dispose();
}

async function checkCliCommand(): Promise<void> {
  const status = await archinsightCliStatus();
  if (status?.supportsAgentSkillTargets === true) {
    await vscode.window.showInformationMessage(`Archinsight CLI ${status.version} is available.`);
    return;
  }
  if (status !== undefined) {
    const choice = await vscode.window.showWarningMessage(
      `Archinsight CLI ${status.version} is available, but it does not support agent skill targets. Update the CLI before generating agent skills.`,
      "Update CLI",
    );
    if (choice === "Update CLI") {
      openCliInstallTerminal();
    }
    return;
  }
  const choice = await vscode.window.showWarningMessage(
    "Archinsight CLI is not available on PATH. Agents need the CLI to validate and inspect Insight projects.",
    "Install CLI",
  );
  if (choice === "Install CLI") {
    openCliInstallTerminal();
  }
}

function openCliInstallTerminal(): void {
  const terminal = vscode.window.createTerminal({
    name: "Archinsight CLI",
    cwd: workspaceRoot()?.fsPath,
  });
  terminal.show();
  terminal.sendText("npm install -g @archinsight/cli@next");
}

async function generateAgentSkillCommand(): Promise<void> {
  const root = workspaceRoot();
  if (root === undefined) {
    await vscode.window.showWarningMessage("Open a workspace before generating an Archinsight agent skill.");
    return;
  }

  const status = await archinsightCliStatus();
  if (status === undefined) {
    const choice = await vscode.window.showWarningMessage(
      "Archinsight CLI is required to generate an agent skill.",
      "Install CLI",
    );
    if (choice === "Install CLI") {
      openCliInstallTerminal();
    }
    return;
  }
  if (!status.supportsAgentSkillTargets) {
    const choice = await vscode.window.showWarningMessage(
      `Archinsight CLI ${status.version} does not support agent skill targets. Update the CLI before generating an agent skill.`,
      "Update CLI",
    );
    if (choice === "Update CLI") {
      openCliInstallTerminal();
    }
    return;
  }

  const target = await vscode.window.showQuickPick(
    ["codex", "claude", "generic"],
    {
      title: "Generate Archinsight Agent Skill",
      placeHolder: "Select the agent runtime target.",
    },
  );
  if (!isAgentSkillTarget(target)) {
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: "Archinsight Skill",
    cwd: root.fsPath,
  });
  terminal.show();
  terminal.sendText(`archinsight skill init . --target ${target}`);
  output.appendLine(`Archinsight CLI ${status.version}: started skill generation for target '${target}' in ${root.fsPath}`);
}

function isAgentSkillTarget(value: string | undefined): value is AgentSkillTarget {
  return value === "generic" || value === "codex" || value === "claude";
}

async function archinsightCliStatus(): Promise<ArchinsightCliStatus | undefined> {
  const version = (await execArchinsight(["--version"]))?.trim();
  if (version === undefined || version === "") {
    return undefined;
  }
  const help = await execArchinsight(["--help"]);
  return {
    version,
    supportsAgentSkillTargets: help?.includes("--target") === true
      && help.includes("archinsight skill init")
      && help.includes("codex")
      && help.includes("claude"),
  };
}

async function execArchinsight(args: readonly string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      "archinsight",
      [...args],
      {
        timeout: 5000,
        windowsHide: true,
        shell: process.platform === "win32",
      },
      (error, stdout) => {
        if (error !== null) {
          resolve(undefined);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function pinActiveArchinsightPreviewTab(): Promise<void> {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (tab === undefined || !tab.isPreview || !isArchinsightEditorTab(tab)) {
    return;
  }
  await vscode.commands.executeCommand("workbench.action.keepEditor");
}

function isArchinsightEditorTab(tab: vscode.Tab): boolean {
  return (tab.input instanceof vscode.TabInputCustom && tab.input.viewType === archinsightEditorViewType)
    || (tab.input instanceof vscode.TabInputWebview && tab.input.viewType === archinsightCoreEditorViewType);
}

class ProjectModel implements vscode.Disposable {
  private readonly listeners = new Set<(revision: number) => void>();
  private readonly refreshes = new LatestWinsCoordinator();
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private committedRevision = 0;
  current: LinkedProject | undefined;

  constructor(private readonly diagnostics: vscode.DiagnosticCollection) {
  }

  onDidChange(listener: (revision: number) => void): vscode.Disposable {
    this.listeners.add(listener);
    return new vscode.Disposable(() => this.listeners.delete(listener));
  }

  scheduleRefresh(): void {
    if (this.refreshTimer !== undefined) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      void this.refresh("change");
    }, 250);
  }

  async refresh(reason: string): Promise<void> {
    const operation = this.refreshes.begin();
    const root = workspaceRoot();
    if (root === undefined) {
      if (!operation.isCurrent()) return;
      this.current = undefined;
      this.diagnostics.clear();
      this.fire();
      return;
    }
    try {
      const sources = await readWorkspaceSources(root);
      if (!operation.isCurrent()) return;
      const analysis = await analyzeProjectInWorker(root.toString(), sources, operation.signal);
      const analysisMode = analysis.mode;
      const project: LinkedProject = {
        root,
        sources,
        sourceUris: sourceUris(root, sources),
        snapshot: analysis.snapshotBuild.snapshot,
        result: analysis.result,
        diagnostics: analysis.diagnostics,
        tokenVocabulary: tokenVocabulary(analysis.snapshotBuild.snapshot, sources),
      };
      if (!operation.isCurrent()) return;
      this.current = project;
      this.updateDiagnostics(project);
      output.appendLine(`Linker finished (${reason}, ${analysisMode}): ${summary(project.diagnostics)}`);
      this.fire();
    } catch (error) {
      if (!operation.isCurrent() || operation.signal.aborted) return;
      output.appendLine(`Linker failed (${reason}): ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  dispose(): void {
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    this.refreshes.dispose();
    this.listeners.clear();
  }

  private updateDiagnostics(project: LinkedProject): void {
    const grouped = new Map<string, vscode.Diagnostic[]>();
    const seen = new Set<string>();
    for (const diagnostic of project.diagnostics) {
      const identity = diagnosticIdentity({ ...diagnostic, source: diagnostic.sourceName });
      if (seen.has(identity)) {
        continue;
      }
      seen.add(identity);
      const uri = project.sourceUris.get(diagnostic.sourceName);
      if (uri === undefined) {
        continue;
      }
      const items = grouped.get(diagnostic.sourceName) ?? [];
      items.push(vscodeDiagnostic(diagnostic));
      grouped.set(diagnostic.sourceName, items);
    }
    this.diagnostics.clear();
    for (const [sourceName, items] of grouped) {
      const uri = project.sourceUris.get(sourceName);
      if (uri !== undefined) {
        this.diagnostics.set(uri, items);
      }
    }
  }

  private fire(): void {
    const revision = ++this.committedRevision;
    for (const listener of this.listeners) {
      listener(revision);
    }
  }
}

class InsightCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly project: ProjectModel) {
  }

  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
    const current = this.project.current;
    const sourceName = current === undefined ? document.fileName : sourceNameForUri(current.root, document.uri);
    const result = service.complete({
      sourceName,
      source: document.getText(),
      cursorOffset: document.offsetAt(position),
      snapshot: current?.snapshot ?? coreLanguageSnapshot,
      indexedIdentifiers: current === undefined ? new Map() : visibleIdentifiersForSource(current.result, sourceName),
      contextualIdentifiers: current === undefined ? [] : contextualIdentifiers(current.result),
      contextIds: current === undefined ? [] : [...new Set(current.result.contexts.map((context) => context.id))],
      rootTypes: new Map(current?.result.contexts.map((root) => [root.id, root.type]) ?? []),
    });
    return result.items.map((item) => {
      const completion = new vscode.CompletionItem(completionDisplayLabel(item), completionKind(item));
      completion.insertText = item.insertText;
      completion.keepWhitespace = true;
      completion.range = new vscode.Range(
        document.positionAt(result.replacementStartOffset),
        document.positionAt(result.replacementEndOffset),
      );
      completion.detail = completionDetail(item);
      completion.sortText = completionSortText(item);
      const documentation = completionDocumentationMarkdown(item.documentation);
      if (documentation !== undefined) {
        completion.documentation = new vscode.MarkdownString(documentation, false);
      }
      return completion;
    });
  }
}

class AiqCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly project: ProjectModel) {
  }

  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
    const current = this.project.current;
    const result = completeAiq({
      source: document.getText(),
      cursorOffset: document.offsetAt(position),
      snapshot: current?.snapshot ?? coreLanguageSnapshot,
      analysis: current?.result,
    });
    return result.items.map((item) => {
      const completion = new vscode.CompletionItem(item.label, aiqCompletionKind(item.kind));
      completion.insertText = item.insertText;
      completion.detail = item.detail;
      completion.documentation = item.documentation;
      completion.range = new vscode.Range(
        document.positionAt(result.replacementStartOffset),
        document.positionAt(result.replacementEndOffset),
      );
      return completion;
    });
  }
}

function aiqCompletionKind(kind: string): vscode.CompletionItemKind {
  if (kind === "keyword" || kind === "selector") return vscode.CompletionItemKind.Keyword;
  if (kind === "function") return vscode.CompletionItemKind.Function;
  if (kind === "property") return vscode.CompletionItemKind.Property;
  if (kind === "type") return vscode.CompletionItemKind.Class;
  if (kind === "parameter") return vscode.CompletionItemKind.Constant;
  return vscode.CompletionItemKind.Variable;
}

class InsightHoverProvider implements vscode.HoverProvider {
  constructor(private readonly project: ProjectModel) {
  }

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const current = this.project.current;
    if (current === undefined) {
      return undefined;
    }
    const word = document.getText(document.getWordRangeAtPosition(position));
    if (word.length === 0) {
      return undefined;
    }
    const element = current.result.elements.find((candidate) => candidate.localId === word || candidate.id.endsWith(`/${word}`));
    if (element !== undefined) {
      return new vscode.Hover([
        `**${element.localId}**`,
        `type: \`${element.type}\``,
        element.baseTypes.length === 0 ? "" : `extends: ${element.baseTypes.map((item) => `\`${item}\``).join(", ")}`,
      ].filter((item) => item.length > 0).join("\n\n"));
    }
    const type = current.snapshot.types.find((candidate) => candidate.name === word);
    if (type !== undefined) {
      return new vscode.Hover([
        `**${type.name}**`,
        type.baseType === undefined ? "" : `extends: \`${type.baseType}\``,
      ].filter((item) => item.length > 0).join("\n\n"));
    }
    return undefined;
  }
}

class InsightDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  constructor(private readonly project: ProjectModel) {
  }

  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const current = this.project.current;
    if (current === undefined) {
      return [];
    }
    const sourceName = sourceNameForUri(current.root, document.uri);
    return documentSymbolsForSource(current, sourceName);
  }
}

class InsightSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  private readonly cache = new Map<string, SemanticTokenCacheEntry>();
  private readonly lastGoodTokens = new Map<string, vscode.SemanticTokens>();

  constructor(private readonly project: ProjectModel) {
  }

  provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.SemanticTokens {
    const current = this.project.current;
    const uriKey = document.uri.toString();
    if (current !== undefined && hasErrors(current.diagnostics)) {
      const lastGood = this.lastGoodTokens.get(uriKey);
      if (lastGood !== undefined) {
        return lastGood;
      }
    }
    const snapshot = current?.snapshot ?? coreLanguageSnapshot;
    const cacheKey = `${document.uri.toString()}:${semanticSnapshotKey(snapshot)}`;
    const cached = this.cache.get(cacheKey);
    if (cached?.version === document.version) {
      return cached.tokens;
    }
    const builder = new vscode.SemanticTokensBuilder(semanticLegend);
    for (const token of semanticHighlightInsight(document.getText(), snapshot)) {
      builder.push(
        token.line,
        token.column,
        token.length,
        semanticTokenIndex(token.type),
        semanticTokenModifierBits(token.modifiers, semanticTokenModifiers),
      );
    }
    const tokens = builder.build();
    this.cache.set(cacheKey, { version: document.version, tokens });
    if (current === undefined || !hasErrors(current.diagnostics)) {
      this.lastGoodTokens.set(uriKey, tokens);
    }
    return tokens;
  }
}

class ArchinsightStructureProvider implements vscode.TreeDataProvider<StructureNode> {
  private readonly changeEmitter = new vscode.EventEmitter<StructureNode | undefined>();
  private filterQuery = "";
  private showLanguageTypes = false;
  private showOperators = false;
  private showIdentifiers = true;
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly project: ProjectModel) {
    this.syncFilterContexts();
  }

  get filterText(): string {
    return this.filterQuery;
  }

  setFilter(value: string): void {
    this.filterQuery = value.trim();
    this.refresh();
  }

  toggleLanguageTypes(): void {
    this.showLanguageTypes = !this.showLanguageTypes;
    this.syncFilterContexts();
    this.refresh();
  }

  toggleOperators(): void {
    this.showOperators = !this.showOperators;
    this.syncFilterContexts();
    this.refresh();
  }

  toggleIdentifiers(): void {
    this.showIdentifiers = !this.showIdentifiers;
    this.syncFilterContexts();
    this.refresh();
  }

  refresh(): void {
    this.changeEmitter.fire(undefined);
  }

  getTreeItem(element: StructureNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      element.label,
      element.children.length === 0 ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Expanded,
    );
    item.description = element.description;
    item.contextValue = element.kind;
    item.iconPath = new vscode.ThemeIcon(element.icon, new vscode.ThemeColor(element.iconColor));
    if (element.location !== undefined) {
      item.command = {
        command: "archinsight.openStructureLocation",
        title: "Open Declaration",
        arguments: [element.location],
      };
    }
    return item;
  }

  getChildren(element?: StructureNode): StructureNode[] {
    if (element !== undefined) {
      return [...element.children];
    }
    const current = this.project.current;
    if (current === undefined) {
      return [];
    }
    const types = typeTree(current, this.showLanguageTypes, this.showOperators);
    const roots: StructureNode[] = [];
    if (types.length > 0) {
      roots.push({ label: "Types", icon: "symbol-class", iconColor: "symbolIcon.classForeground", kind: "root", children: types });
    }
    if (this.showIdentifiers) {
      roots.push({ label: "Declarations", icon: "symbol-variable", iconColor: "symbolIcon.variableForeground", kind: "root", children: declarationTree(current) });
    }
    return filterTreeByQuery(roots, this.filterQuery, (node) => [
      node.label,
      node.description ?? "",
      node.kind,
    ].join(" "));
  }

  private syncFilterContexts(): void {
    void vscode.commands.executeCommand("setContext", "archinsight.structure.showLanguageTypes", this.showLanguageTypes);
    void vscode.commands.executeCommand("setContext", "archinsight.structure.showOperators", this.showOperators);
    void vscode.commands.executeCommand("setContext", "archinsight.structure.showIdentifiers", this.showIdentifiers);
  }
}

class ArchinsightControlsProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private currentView: DiagramView = "c1";
  private currentQuery = "";
  private readOnly = true;

  public constructor(
    private readonly project: ProjectModel,
    private readonly extensionUri: vscode.Uri,
  ) {
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview")],
    };
    view.webview.html = controlsHtml(view.webview, this.extensionUri);
    view.webview.onDidReceiveMessage((value: unknown) => {
      const message = validatedWebviewMessage(parseControlsWebviewToHostMessage, value, "controls");
      if (message === undefined) return;
      if (message.command === "ready") {
        void this.postState();
        return;
      }
      if (message.command === "clipboardRead") {
        void this.postClipboardText(message.requestId);
        return;
      }
      if (message.command === "clipboardWrite") {
        void vscode.env.clipboard.writeText(message.text);
        return;
      }
      if (message.command !== "render") {
        return;
      }
      if (this.readOnly) {
        return;
      }
      this.currentView = message.view;
      this.currentQuery = message.query;
      void previewView(this.project, message.view, message.query);
    });
    void this.postState();
  }

  async focus(view?: DiagramView, query?: string): Promise<void> {
    this.updateState(view, query);
    if (view !== undefined && query !== undefined) {
      this.readOnly = false;
    }
    await vscode.commands.executeCommand("archinsightControls.focus");
    await this.postState(true);
  }

  async sync(view: DiagramView, query: string): Promise<void> {
    this.updateState(view, query);
    this.readOnly = false;
    await this.postState();
  }

  async clear(): Promise<void> {
    this.currentQuery = "";
    this.readOnly = true;
    await this.postState();
  }

  private updateState(view?: DiagramView, query?: string): void {
    if (view !== undefined) {
      this.currentView = view;
    }
    if (query !== undefined) {
      this.currentQuery = query;
    }
  }

  private async postState(focusQuery = false): Promise<void> {
    await this.view?.webview.postMessage({
      command: "state",
      view: this.currentView,
      query: this.currentQuery,
      readOnly: this.readOnly,
      focusQuery,
    });
  }

  private async postClipboardText(requestId: number): Promise<void> {
    const text = await vscode.env.clipboard.readText();
    await this.view?.webview.postMessage({ command: "clipboardText", requestId, text });
  }
}

class CoreSourceContentProvider implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(uri: vscode.Uri): string {
    return coreSourceByName.get(path.basename(uri.path)) ?? coreSource;
  }
}

class ArchinsightWorkbenchEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly sessions = new Set<ArchinsightWorkbenchEditorSession>();
  private readonly pendingInitialStates = new Map<string, DiagramQueryState>();
  private readonly quickActionCoordinator = new DiagramQuickActionCoordinator<never>();
  private findPathProjectRoot: string | undefined;
  private isolateProjectRoot: string | undefined;
  private deploymentProjectRoot: string | undefined;
  private diffProjectRoot: string | undefined;
  private diffSession: DiagramDiffSessionState | undefined;

  private get findPathMode(): FindPathMode {
    return this.quickActionCoordinator.findPathMode();
  }

  private set findPathMode(mode: FindPathMode) {
    this.quickActionCoordinator.setFindPathMode(mode);
  }

  private get isolateMode(): IsolateMode {
    return this.quickActionCoordinator.isolateMode();
  }

  private set isolateMode(mode: IsolateMode) {
    this.quickActionCoordinator.setIsolateMode(mode);
  }

  private get deploymentMode(): DeploymentMode {
    return this.quickActionCoordinator.deploymentMode();
  }

  private set deploymentMode(mode: DeploymentMode) {
    this.quickActionCoordinator.setDeploymentMode(mode);
  }

  constructor(
    private readonly project: ProjectModel,
    private readonly extensionUri: vscode.Uri,
    private readonly controls: ArchinsightControlsProvider,
  ) {
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    await this.attachSession(document, panel);
  }

  private async attachSession(
    document: vscode.TextDocument | undefined,
    panel: vscode.WebviewPanel,
    virtualDocument?: VirtualWorkbenchDocument,
    initialState?: DiagramQueryState,
  ): Promise<ArchinsightWorkbenchEditorSession> {
    const fileName = virtualDocument?.fileName
      ?? (document === undefined ? coreSourceName : path.basename(document.uri.fsPath));
    panel.iconPath = vscode.Uri.joinPath(
      this.extensionUri,
      "assets",
      "file-icons",
      fileName.toLocaleLowerCase().endsWith(".aiq") ? "aiq.svg" : "ai.svg",
    );
    const sessionUri = document?.uri ?? virtualDocument?.uri;
    const pendingState = sessionUri === undefined ? undefined : this.pendingInitialStates.get(sessionUri.toString());
    if (sessionUri !== undefined) {
      this.pendingInitialStates.delete(sessionUri.toString());
    }
    const documentState: DiagramQueryState | undefined = document !== undefined && isAiqDocument(document)
      ? { view: "no-filter", query: document.getText() }
      : undefined;
    const session = new ArchinsightWorkbenchEditorSession(
      this.project,
      this.extensionUri,
      this.controls,
      document,
      panel,
      (location, state) => this.openLocation(location, state),
      () => this.findPathMode,
      (mode) => this.setFindPathMode(mode),
      () => this.cancelFindPathMode(),
      () => this.isolateMode,
      (mode) => this.setIsolateMode(mode),
      () => this.cancelIsolateMode(),
      () => this.deploymentMode,
      (mode) => this.setDeploymentMode(mode),
      () => this.cancelDeploymentMode(),
      () => this.diffSession,
      (state) => this.setDiagramDiffSession(state),
      () => this.cancelDiagramDiff(),
      virtualDocument,
      initialState ?? pendingState ?? documentState,
    );
    this.sessions.add(session);
    activeWorkbenchEditor = session;
    void this.controls.sync(session.currentView(), session.currentQuery());
    panel.onDidDispose(() => {
      this.sessions.delete(session);
      session.dispose();
      this.syncControlsFromActiveSession();
    });
    panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.active) {
        activeWorkbenchEditor = session;
        this.syncControlsFromActiveSession();
        void session.activateDiagramDiff();
      }
    });
    await session.open();
    void pinActiveArchinsightPreviewTab();
    return session;
  }

  async refreshFromProject(current: LinkedProject | undefined): Promise<void> {
    for (const session of this.sessions) session.cancelQuickActionRendering();
    if (this.diffSession !== undefined && current?.root.toString() !== this.diffProjectRoot) {
      await this.setDiagramDiffSession(undefined);
    }
    const mode = this.findPathMode;
    const projectChanged = mode.status !== "idle"
      && current?.root.toString() !== this.findPathProjectRoot;
    const sourceMissing = mode.status !== "idle"
      && current?.result.elements.some((element) => element.id === mode.sourceId) !== true;
    const targetMissing = (mode.status === "resolving-path" || mode.status === "showing-path")
      && current?.result.elements.some((element) => element.id === mode.targetId) !== true;
    if (projectChanged || sourceMissing || targetMissing) {
      await this.cancelFindPathMode(false);
      void vscode.window.showInformationMessage(
        projectChanged
          ? "Find path was cancelled because the project changed."
          : `Find path was cancelled because the ${sourceMissing ? "source" : "target"} element is no longer available.`,
      );
    }
    const isolateMode = this.isolateMode;
    const isolateProjectChanged = isolateMode.status !== "idle"
      && current?.root.toString() !== this.isolateProjectRoot;
    const isolatedElementMissing = isolateMode.status === "showing-isolate"
      && current?.result.elements.some((element) => element.id === isolateMode.elementId) !== true;
    if (isolateProjectChanged || isolatedElementMissing) {
      await this.cancelIsolateMode(false);
      void vscode.window.showInformationMessage(
        isolateProjectChanged
          ? "Isolate was closed because the project changed."
          : "Isolate was closed because the selected element is no longer available.",
      );
    }
    const deploymentMode = this.deploymentMode;
    const deploymentProjectChanged = deploymentMode.status !== "idle"
      && current?.root.toString() !== this.deploymentProjectRoot;
    const deployedElementMissing = deploymentMode.status === "showing-deployment"
      && current?.result.elements.some((element) => element.id === deploymentMode.elementId) !== true;
    if (deploymentProjectChanged || deployedElementMissing) {
      await this.cancelDeploymentMode(false);
      void vscode.window.showInformationMessage(
        deploymentProjectChanged
          ? "Deployment view was closed because the project changed."
          : "Deployment view was closed because the selected element is no longer available.",
      );
    }
    await Promise.all([...this.sessions].map((session) => session.refreshFromProject(current)));
  }

  private async setFindPathMode(mode: FindPathMode): Promise<void> {
    if (mode.status === "idle") {
      this.findPathProjectRoot = undefined;
    } else if (this.findPathMode.status === "idle" || this.findPathProjectRoot === undefined) {
      this.findPathProjectRoot = this.project.current?.root.toString();
    }
    this.findPathMode = mode;
    await Promise.all([...this.sessions].map((session) => session.postFindPathMode(mode)));
  }

  private async cancelFindPathMode(restoreDiagram = true): Promise<void> {
    const restoreFindPathResult = restoreDiagram && this.findPathMode.status === "showing-path";
    for (const session of this.sessions) session.cancelQuickActionRendering();
    await this.setFindPathMode(cancelFindPath(this.findPathMode));
    if (restoreFindPathResult) {
      await Promise.all([...this.sessions].map((session) => session.restoreQuickActionResult()));
    }
  }

  private async setIsolateMode(mode: IsolateMode): Promise<void> {
    if (mode.status === "idle") {
      this.isolateProjectRoot = undefined;
    } else if (this.isolateMode.status === "idle" || this.isolateProjectRoot === undefined) {
      this.isolateProjectRoot = this.project.current?.root.toString();
    }
    this.isolateMode = mode;
    await Promise.all([...this.sessions].map((session) => session.postIsolateMode(mode)));
  }

  private async cancelIsolateMode(restoreDiagram = true): Promise<void> {
    const restoreIsolateResult = restoreDiagram && this.isolateMode.status === "showing-isolate";
    for (const session of this.sessions) session.cancelQuickActionRendering();
    await this.setIsolateMode(cancelIsolate(this.isolateMode));
    if (restoreIsolateResult) {
      await Promise.all([...this.sessions].map((session) => session.restoreQuickActionResult()));
    }
  }

  private async setDeploymentMode(mode: DeploymentMode): Promise<void> {
    if (mode.status === "idle") {
      this.deploymentProjectRoot = undefined;
    } else if (this.deploymentMode.status === "idle" || this.deploymentProjectRoot === undefined) {
      this.deploymentProjectRoot = this.project.current?.root.toString();
    }
    this.deploymentMode = mode;
    await Promise.all([...this.sessions].map((session) => session.postDeploymentMode(mode)));
  }

  private async cancelDeploymentMode(restoreDiagram = true): Promise<void> {
    const restoreDeploymentResult = restoreDiagram && this.deploymentMode.status === "showing-deployment";
    for (const session of this.sessions) session.cancelQuickActionRendering();
    await this.setDeploymentMode(cancelDeployment(this.deploymentMode));
    if (restoreDeploymentResult) {
      await Promise.all([...this.sessions].map((session) => session.restoreQuickActionResult()));
    }
  }

  private async setDiagramDiffSession(state: DiagramDiffSessionState | undefined): Promise<void> {
    this.diffSession = state;
    this.diffProjectRoot = state === undefined ? undefined : this.project.current?.root.toString();
    await Promise.all([...this.sessions].map((session) => session.onDiagramDiffSessionChanged(state)));
  }

  private async cancelDiagramDiff(): Promise<void> {
    if (this.diffSession === undefined) return;
    for (const session of this.sessions) session.cancelQuickActionRendering();
    await this.setDiagramDiffSession(undefined);
  }

  async refreshTheme(): Promise<void> {
    await Promise.all([...this.sessions].map((session) => session.refreshTheme()));
  }

  async openLocation(location: vscode.Location, state?: DiagramQueryState): Promise<void> {
    if (location.uri.scheme === coreSourceScheme) {
      await this.openCoreSource(location.range, path.basename(location.uri.path), state);
      return;
    }
    const existing = this.sessionFor(location.uri);
    if (existing !== undefined) {
      activeWorkbenchEditor = existing;
      existing.activate();
      if (state !== undefined) {
        await existing.render(state.view, state.query, false, state.environment);
      }
      await existing.reveal(location.range.start);
      return;
    }

    if (state !== undefined) {
      this.pendingInitialStates.set(location.uri.toString(), state);
    }
    await vscode.commands.executeCommand("vscode.openWith", location.uri, archinsightEditorViewType, { preview: false });
    const session = await this.waitForSession(location.uri);
    if (session === undefined) {
      this.pendingInitialStates.delete(location.uri.toString());
      await vscode.window.showTextDocument(location.uri, { preview: false, selection: location.range });
      return;
    }
    activeWorkbenchEditor = session;
    if (state !== undefined && (session.currentView() !== state.view || session.currentQuery() !== state.query
        || session.currentEnvironment() !== state.environment)) {
      await session.render(state.view, state.query, false, state.environment);
    }
    await session.reveal(location.range.start);
  }

  private syncControlsFromActiveSession(): void {
    const session = this.activeSession();
    activeWorkbenchEditor = session;
    if (session === undefined) {
      void this.controls.clear();
      return;
    }
    void this.controls.sync(session.currentView(), session.currentQuery());
  }

  private activeSession(): ArchinsightWorkbenchEditorSession | undefined {
    return [...this.sessions].find((session) => session.isActive())
      ?? [...this.sessions][0];
  }

  private sessionFor(uri: vscode.Uri): ArchinsightWorkbenchEditorSession | undefined {
    return [...this.sessions].find((session) => session.matches(uri));
  }

  private async waitForSession(uri: vscode.Uri): Promise<ArchinsightWorkbenchEditorSession | undefined> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const session = this.sessionFor(uri);
      if (session !== undefined) {
        return session;
      }
      await sleep(50);
    }
    return undefined;
  }

  private async openCoreSource(selection: vscode.Range, sourceName = coreSourceName, state?: DiagramQueryState): Promise<void> {
    const uri = coreSourceUriFor(sourceName);
    const source = coreSourceByName.get(sourceName) ?? coreSource;
    const existing = this.sessionFor(uri);
    if (existing !== undefined) {
      activeWorkbenchEditor = existing;
      existing.activate();
      if (state !== undefined) {
        await existing.render(state.view, state.query, false, state.environment);
      }
      await existing.reveal(selection.start);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      archinsightCoreEditorViewType,
      `[r] ${sourceName}`,
      vscode.ViewColumn.Active,
      { retainContextWhenHidden: true },
    );
    const session = await this.attachSession(undefined, panel, {
      uri,
      sourceName,
      fileName: sourceName,
      source,
      readOnly: true,
    }, state);
    activeWorkbenchEditor = session;
    await session.reveal(selection.start);
  }
}

class ArchinsightWorkbenchEditorSession {
  private readonly diagram: DiagramSession<DiagramRenderInput, DiagramView, PreviewState>;
  private disposed = false;
  private applyingEdit = false;
  private lastSource: string | undefined;
  private webviewReady = false;
  private pendingReveal: vscode.Position | undefined;
  private queryScopeTab: string | undefined;
  private queryScopeContext: string | undefined;
  private readonly quickActionCoordinator = new DiagramQuickActionCoordinator<never>();
  private versionedRepositoryPromise: Promise<GitVersionedRepository | undefined> | undefined;
  private diffCatalogue: DiagramDiffRevisionCatalogue | undefined;
  private diffProjection: DiagramDiffProjectionState | undefined;
  private versioningOperation: AbortController | undefined;

  constructor(
    private readonly project: ProjectModel,
    private readonly extensionUri: vscode.Uri,
    private readonly controls: ArchinsightControlsProvider,
    private readonly document: vscode.TextDocument | undefined,
    private readonly panel: vscode.WebviewPanel,
    private readonly openLocation: (location: vscode.Location, state?: DiagramQueryState) => Promise<void>,
    private readonly readFindPathMode: () => FindPathMode,
    private readonly writeFindPathMode: (mode: FindPathMode) => Promise<void>,
    private readonly cancelFindPathMode: () => Promise<void>,
    private readonly readIsolateMode: () => IsolateMode,
    private readonly writeIsolateMode: (mode: IsolateMode) => Promise<void>,
    private readonly cancelIsolateMode: () => Promise<void>,
    private readonly readDeploymentMode: () => DeploymentMode,
    private readonly writeDeploymentMode: (mode: DeploymentMode) => Promise<void>,
    private readonly cancelDeploymentMode: () => Promise<void>,
    private readonly readDiagramDiffSession: () => DiagramDiffSessionState | undefined,
    private readonly writeDiagramDiffSession: (state: DiagramDiffSessionState | undefined) => Promise<void>,
    private readonly cancelDiagramDiffSession: () => Promise<void>,
    private readonly virtualDocument?: VirtualWorkbenchDocument,
    initialState?: DiagramQueryState,
  ) {
    this.diagram = createDiagramSession(initialState ?? { view: "c1", query: viewQueries.c1 }, {
      publishPreview: async (state) => {
        this.panel.title = this.panelTitle(state.fileName);
        await this.postPreview(state);
      },
      publishQuery: async (state) => {
        await this.panel.webview.postMessage({ command: "query", ...state });
      },
      onQueryChanged: async (state) => {
        await this.controls.sync(state.view, state.query);
      },
      requestPng: async (svg) => {
        await this.panel.webview.postMessage({ command: "exportPng", svg });
      },
    }, (message) => output.appendLine(message));
  }

  currentView(): DiagramView {
    return this.diagram.queryState().view;
  }

  currentQuery(): string {
    return this.diagram.queryState().query;
  }

  currentEnvironment(): string | undefined {
    return this.diagram.queryState().environment;
  }

  isActive(): boolean {
    return this.panel.active;
  }

  activeQueryDocumentSource(): string | undefined {
    return this.isActive() && this.isQueryDocument() ? this.document?.getText() : undefined;
  }

  matches(uri: vscode.Uri): boolean {
    return this.uri().toString() === uri.toString();
  }

  activate(): void {
    this.panel.reveal(this.panel.viewColumn, false);
  }

  async open(): Promise<void> {
    this.panel.title = this.panelTitle(this.fileName());
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview")],
    };
    this.panel.webview.html = workbenchEditorHtml(this.panel.webview, this.extensionUri);
    this.panel.webview.onDidReceiveMessage((value: unknown) => {
      const message = validatedWebviewMessage(parseWorkbenchWebviewToHostMessage, value, "workbench");
      if (message === undefined) return;
      void this.handleMessage(message);
    });
    await this.project.refresh("custom-editor");
  }

  dispose(): void {
    this.disposed = true;
    this.diagram.dispose("Editor closed");
    this.quickActionCoordinator.invalidate();
    this.versioningOperation?.abort();
  }

  async refreshFromProject(current: LinkedProject | undefined): Promise<void> {
    if (this.disposed) {
      return;
    }
    const sourceName = this.sourceName(current);
    const source = this.sourceText(current, sourceName);
    if (source !== this.lastSource) {
      await this.postSource();
    }
    await this.postDiagnostics(this.editorDiagnostics(current));
    await this.postQueryScope(current);
    if (current === undefined) {
      return;
    }
    const input = this.renderInput(current, this.diagram.queryState().query);
    if (input === undefined) {
      return;
    }
    const diffSession = this.readDiagramDiffSession();
    if (diffSession !== undefined) {
      if (this.diffProjection?.session !== diffSession) await this.renderCurrentDiagramDiff();
      return;
    }
    await this.diagram.refresh(input);
  }

  async refreshTheme(): Promise<void> {
    if (this.disposed) return;
    this.cancelQuickActionRendering();
    const diffSession = this.readDiagramDiffSession();
    if (diffSession !== undefined) {
      const projection = this.diffProjection?.session === diffSession ? this.diffProjection : undefined;
      if (projection !== undefined) await this.renderDiagramDiff(diffSession, projection.fullDiff);
      else await this.renderCurrentDiagramDiff();
      return;
    }
    const current = this.project.current;
    const input = current === undefined
      ? undefined
      : this.renderInput(current, this.diagram.queryState().query);
    await this.diagram.refreshGraph(input);
  }

  async render(
    view: DiagramView,
    query = viewQueries[view],
    forceEnvironmentPicker = false,
    requestedEnvironment: string | undefined = this.currentEnvironment(),
    parameters?: Readonly<Record<string, QueryParameterValue>>,
  ): Promise<void> {
    this.cancelQuickActionRendering();
    this.quickActionCoordinator.clearResult();
    const current = this.project.current;
    const status = await this.diagram.render(current === undefined ? undefined : this.renderInput(current, query), {
      view, query, forceEnvironmentPicker, requestedEnvironment, ...(parameters === undefined ? {} : { parameters })
    });
    if (status === "rendered" && this.readDiagramDiffSession() !== undefined) {
      await this.renderCurrentDiagramDiff();
    }
  }

  private async handleMessage(message: ReturnType<typeof parseWorkbenchWebviewToHostMessage>): Promise<void> {
    if (message.command === "ready") {
      this.webviewReady = true;
      await this.postSource();
      await this.refreshFromProject(this.project.current);
      await this.flushPendingReveal();
      return;
    }
    if (message.command === "sourceChanged") {
      if (this.isReadOnly()) {
        return;
      }
      await this.replaceDocument(message.source);
      if (this.isQueryDocument()) {
        this.diagram.setQueryState("no-filter", message.source);
        const state = this.diagram.queryState();
        await this.controls.sync(state.view, state.query);
        await this.panel.webview.postMessage({ command: "query", ...state });
        await this.postDiagnostics(this.editorDiagnostics(this.project.current, message.source));
      }
      return;
    }
    if (message.command === "selectQueryScope") {
      await this.selectQueryScope(message.variable, message.value);
      return;
    }
    if (message.command === "cancel") {
      this.diagram.cancel();
      return;
    }
    if (message.command === "render") {
      await this.render(message.view, message.query, false, this.currentEnvironment(), message.parameters);
      return;
    }
    if (message.command === "selectDeploymentEnvironment") {
      await this.render("deployment-container", viewQueries["deployment-container"], true);
      return;
    }
    if (message.command === "refresh") {
      await this.project.refresh("custom-editor:refresh");
      return;
    }
    if (message.command === "download") {
      await this.download(message.kind);
      return;
    }
    if (message.command === "editQuery") {
      this.diagram.setQueryState(message.view, message.query);
      await this.controls.focus(message.view, message.query);
      return;
    }
    if (message.command === "png") {
      this.diagram.resolvePng(message.dataUrl);
      return;
    }
    if (message.command === "complete") {
      await this.complete(message.requestId, message.sourceName, message.source, message.cursorOffset);
      return;
    }
    if (message.command === "clipboardRead") {
      await this.postClipboardText(message.requestId);
      return;
    }
    if (message.command === "clipboardWrite") {
      await vscode.env.clipboard.writeText(message.text);
      return;
    }
    if (message.command === "diagramQuickAction") {
      await this.executeDiagramQuickAction(message.action, message.elementId);
      return;
    }
    if (message.command === "compareDiagramDiff") {
      await this.compareDiagramDiff(message.before, message.after, message.elementId);
      return;
    }
    if (message.command === "cancelDiagramDiffPicker") {
      this.quickActionCoordinator.invalidate();
      this.cancelVersioningOperation();
      this.diffCatalogue = undefined;
      return;
    }
    if (message.command === "cancelDiagramDiff") {
      await this.cancelDiagramDiffSession();
      return;
    }
    if (message.command === "selectPathTarget") {
      await this.selectPathTarget(message.elementId);
      return;
    }
    if (message.command === "reverseFindPath") {
      await this.reverseFindPath();
      return;
    }
    if (message.command === "cancelFindPath") {
      await this.cancelFindPathMode();
      return;
    }
    if (message.command === "cancelIsolate") {
      await this.cancelIsolateMode();
      return;
    }
    if (message.command === "cancelDeployment") {
      await this.cancelDeploymentMode();
      return;
    }
    if (message.command === "openDeclaration") {
      await this.openDeclaration(message.declaration);
    }
  }

  async postFindPathMode(state = this.readFindPathMode()): Promise<void> {
    if (!this.webviewReady) return;
    await this.panel.webview.postMessage({ command: "findPathMode", state } satisfies WorkbenchHostToWebviewMessage);
  }

  async postIsolateMode(state = this.readIsolateMode()): Promise<void> {
    if (!this.webviewReady) return;
    await this.panel.webview.postMessage({ command: "isolateMode", state } satisfies WorkbenchHostToWebviewMessage);
  }

  async postDeploymentMode(state = this.readDeploymentMode()): Promise<void> {
    if (!this.webviewReady) return;
    await this.panel.webview.postMessage({ command: "deploymentMode", state } satisfies WorkbenchHostToWebviewMessage);
  }

  async onDiagramDiffSessionChanged(state: DiagramDiffSessionState | undefined): Promise<void> {
    if (this.diffProjection?.session !== state) this.diffProjection = undefined;
    await this.postDiagramDiffMode();
    if (state === undefined) {
      this.diffCatalogue = undefined;
      this.quickActionCoordinator.clearResult();
      const current = this.project.current;
      const input = current === undefined ? undefined : this.renderInput(current, this.diagram.queryState().query);
      if (input !== undefined) await this.diagram.refresh(input);
      return;
    }
    if (this.isActive() && this.diffProjection === undefined) await this.renderCurrentDiagramDiff();
  }

  async activateDiagramDiff(): Promise<void> {
    const state = this.readDiagramDiffSession();
    if (state === undefined || this.diffProjection?.session === state) return;
    await this.renderCurrentDiagramDiff();
  }

  cancelQuickActionRendering(): void {
    this.quickActionCoordinator.invalidate();
    this.cancelVersioningOperation();
  }

  async restoreQuickActionResult(): Promise<void> {
    if (this.quickActionCoordinator.resultState().status !== "visible") return;
    const previousResult = this.quickActionCoordinator.resultState();
    this.quickActionCoordinator.clearResult();
    const diffSession = this.readDiagramDiffSession();
    const diffProjection = this.diffProjection?.session === diffSession ? this.diffProjection : undefined;
    if (diffSession !== undefined && diffProjection !== undefined) {
      await this.renderDiagramDiff(diffSession, diffProjection.fullDiff);
      if (previousResult.status === "visible") this.quickActionCoordinator.showResult(previousResult.kind);
      return;
    }
    const current = this.project.current;
    if (current === undefined) return;
    const input = this.renderInput(current, this.diagram.queryState().query);
    if (input !== undefined) await this.diagram.refresh(input);
  }

  private async executeDiagramQuickAction(action: DiagramQuickActionId, elementId: string): Promise<void> {
    const current = this.project.current;
    if (current === undefined) return;
    const quickActions = new DiagramQuickActionService(current.result);
    const metadata = quickActions.metadata(elementId);
    if (metadata === undefined) return;
    if (action === "diff") {
      const source = diagramDiffDeclarationSource(metadata);
      if (source !== undefined) await this.openDiagramDiffPicker(elementId, source);
      return;
    }
    if (action === "go-to-declaration") {
      if (metadata.declaration !== undefined && this.declarationNavigationAvailable()) {
        await this.openDeclaration({
          source: metadata.declaration.sourceName,
          line: metadata.declaration.line,
          column: metadata.declaration.column,
        });
      }
      return;
    }
    if (action === "find-path") {
      if (metadata.pathEligible) {
        if (this.readDeploymentMode().status !== "idle") await this.cancelDeploymentMode();
        if (this.readIsolateMode().status !== "idle") await this.cancelIsolateMode();
        const mode = quickActions.beginFindPath(
          metadata.canonicalElementId,
          this.quickActionScope(current),
          this.currentPathEndpointEnvironment(),
        );
        if (mode !== undefined) await this.writeFindPathMode(mode);
      }
      return;
    }
    if (action === "isolate") {
      if (!metadata.isolateEligible) return;
      if (this.readDeploymentMode().status !== "idle") await this.cancelDeploymentMode();
      if (this.readFindPathMode().status !== "idle") await this.cancelFindPathMode();
      const diffSession = this.readDiagramDiffSession();
      const diffProjection = this.diffProjection?.session === diffSession ? this.diffProjection : undefined;
      if (diffSession !== undefined && diffProjection !== undefined) {
        const isolated = selectIsolatedDiagramDiff(diffProjection.fullDiff, metadata.canonicalElementId);
        const accepted = await this.renderDiagramDiff(diffSession, isolated);
        if (accepted) await this.writeIsolateMode(beginIsolate(metadata));
        return;
      }
      const prepared = quickActions.isolate(metadata.elementId, this.quickActionScope(current));
      if (prepared === undefined) return;
      const accepted = await this.renderQuickActionGraph(prepared.graph, "isolate");
      if (accepted) await this.writeIsolateMode(prepared.mode);
      return;
    }
    if (!metadata.hasDeployment) return;
    const environments = quickActions.deploymentEnvironments(metadata.canonicalElementId);
    if (environments.length === 0) {
      void vscode.window.showInformationMessage(`No deployment is available for ${metadata.title}.`);
      return;
    }
    let environment = environments[0]!.id;
    if (environments.length > 1) {
      const picked = await vscode.window.showQuickPick(environments.map((candidate) => ({
        label: candidate.id,
        description: candidate.name === undefined || candidate.name === candidate.id ? undefined : candidate.name,
        environment: candidate.id,
      })), { title: "Deployment Environment", placeHolder: "Select the environment to show" });
      if (picked === undefined) return;
      if (this.project.current !== current || this.disposed) return;
      environment = picked.environment;
    }
    if (this.readFindPathMode().status !== "idle") await this.cancelFindPathMode();
    if (this.readIsolateMode().status !== "idle") await this.cancelIsolateMode();
    if (this.readDeploymentMode().status !== "idle") await this.cancelDeploymentMode();
    const prepared = quickActions.deployment(metadata.canonicalElementId, environment);
    if (prepared === undefined) return;
    const accepted = await this.renderQuickActionGraph(prepared.graph, "deployment");
    if (accepted) {
      await this.writeDeploymentMode(prepared.mode);
    }
  }

  private async openDiagramDiffPicker(elementId: string, source: string): Promise<void> {
    const current = this.project.current;
    if (current === undefined || !this.versioningEligibleWorkspace()) return;
    const generation = this.quickActionCoordinator.nextGeneration();
    const operation = this.beginVersioningOperation();
    await this.panel.webview.postMessage({
      command: "diagramDiffPicker",
      state: { status: "loading", source, elementId },
    } satisfies WorkbenchHostToWebviewMessage);
    try {
      const repository = await this.versionedRepository();
      if (repository === undefined) throw new Error("Version history is unavailable for this workspace");
      const catalogue = await repository.catalogueForPath(source, operation.signal);
      if (!this.quickActionCoordinator.isCurrent(generation) || this.disposed) return;
      this.diffCatalogue = catalogue;
      const currentIndex = catalogue.revisions.findIndex((item) => item.id === catalogue.currentRevision);
      const before = catalogue.revisions.slice(Math.max(0, currentIndex + 1)).find((item) => item.id !== catalogue.currentRevision)?.id;
      await this.panel.webview.postMessage({
        command: "diagramDiffPicker",
        state: {
          status: "ready",
          source,
          elementId,
          catalogue,
          ...(before === undefined ? {} : { before }),
          after: catalogue.currentRevision,
        },
      } satisfies WorkbenchHostToWebviewMessage);
    } catch (cause) {
      if (!this.quickActionCoordinator.isCurrent(generation) || this.disposed) return;
      await this.panel.webview.postMessage({
        command: "diagramDiffPicker",
        state: { status: "error", source, elementId, message: cause instanceof Error ? cause.message : String(cause) },
      } satisfies WorkbenchHostToWebviewMessage);
    }
  }

  private async compareDiagramDiff(beforeRevision: string, afterRevision: string, elementId: string): Promise<void> {
    if (this.readDeploymentMode().status !== "idle") await this.cancelDeploymentMode();
    if (this.readIsolateMode().status !== "idle") await this.cancelIsolateMode();
    if (this.readFindPathMode().status !== "idle") await this.cancelFindPathMode();
    const current = this.project.current;
    const input = current === undefined ? undefined : this.renderInput(current, this.diagram.queryState().query);
    const repository = await this.versionedRepository();
    const catalogue = this.diffCatalogue;
    if (current === undefined || input === undefined || repository === undefined || catalogue === undefined) return;
    const generation = this.quickActionCoordinator.nextGeneration();
    const operation = this.beginVersioningOperation();
    const signal = operation.signal;
    try {
      const beforeRevisionEntry = catalogue.revisions.find((item) => item.id === beforeRevision);
      const afterRevisionEntry = catalogue.revisions.find((item) => item.id === afterRevision);
      if (beforeRevisionEntry === undefined || afterRevisionEntry === undefined) throw new Error("Selected revision is no longer available");
      const semantic = await buildVersionedDiagramDiff({
        repository,
        beforeRevision,
        afterRevision,
        signal,
        buildRevision: (sources) => this.linkRevision(current.root, sources, signal),
        validateRevision: (project, side) => {
          const blocking = project.diagnostics
            .filter((item) => (item.level ?? "ERROR") === "ERROR")
            .map((item) => `${side === "before" ? "Before" : "After"}: ${item.message}`);
          if (blocking.length > 0) throw new Error(blocking.join("\n"));
        },
        selectGraph: (project) => this.revisionGraph(project, signal),
      });
      if (!this.quickActionCoordinator.isCurrent(generation) || this.disposed) return;
      const session: DiagramDiffSessionState = {
        catalogue,
        before: semantic.before,
        after: semantic.after,
        selectedElementId: elementId,
        beforeRevision,
        afterRevision,
        beforeShort: beforeRevisionEntry.shortId,
        afterShort: afterRevisionEntry.shortId,
      };
      this.diffProjection = { session, fullDiff: semantic.diff };
      await this.writeDiagramDiffSession(session);
      const accepted = await this.renderDiagramDiff(session, semantic.diff, generation);
      if (!accepted) {
        this.diffProjection = undefined;
        await this.writeDiagramDiffSession(undefined);
        await this.panel.webview.postMessage({
          command: "diagramDiffPicker",
          state: { status: "error", source: catalogue.source, elementId, message: "Diagram diff could not be rendered" },
        } satisfies WorkbenchHostToWebviewMessage);
        return;
      }
      this.quickActionCoordinator.showResult("diff");
      await this.panel.webview.postMessage({ command: "diagramDiffPicker", state: { status: "closed" } } satisfies WorkbenchHostToWebviewMessage);
      await this.postDiagramDiffMode();
      try {
        const attributed = await attributeVersionedDiagramDiff(repository, semantic, signal);
        if (!this.quickActionCoordinator.isCurrent(generation) || this.disposed
            || this.readDiagramDiffSession() !== session || this.diffProjection?.session !== session) return;
        this.diffProjection = { ...this.diffProjection, attributed };
      } catch (cause) {
        if (signal.aborted || !this.quickActionCoordinator.isCurrent(generation) || this.disposed) return;
        console.warn("Archinsight diagram diff attribution failed", cause);
      }
    } catch (cause) {
      if (!this.quickActionCoordinator.isCurrent(generation) || this.disposed) return;
      await this.panel.webview.postMessage({
        command: "diagramDiffPicker",
        state: {
          status: "error",
          source: catalogue.source,
          elementId,
          message: cause instanceof Error ? cause.message : String(cause),
        },
      } satisfies WorkbenchHostToWebviewMessage);
    }
  }

  private async revisionGraph(
    project: LinkedProject,
    signal: AbortSignal,
  ): Promise<import("@insight/language").RenderGraph | undefined> {
    const current = this.project.current;
    const input = current === undefined ? undefined : this.renderInput(current, this.diagram.queryState().query);
    const sourceName = input?.queryScope?.tab ?? input?.sourceName;
    if (sourceName === undefined) return undefined;
    if (!project.sources.some((item) => item.sourceName === sourceName)) return undefined;
    const state = this.diagram.queryState();
    const currentScope: QueryScope = {
      ...(input?.queryScope?.context === undefined ? {} : { context: input.queryScope.context }),
      tab: sourceName,
      view: state.view,
      ...(state.environment === undefined ? {} : { environment: state.environment }),
    };
    const sourceContext = project.result.contexts.find((item) => item.sourceIdentity === sourceName)?.id;
    const result = await selectDiagramQueryInWorker(project.result, {
      ...currentScope,
      tab: sourceName,
      ...(currentScope.context !== undefined || sourceContext === undefined ? {} : { context: sourceContext }),
    }, state.query, state.parameters ?? {}, signal);
    if (result.kind !== "graph") throw new Error("The active query must return a graph to build a diagram diff");
    return result.graph;
  }

  private async linkRevision(
    root: vscode.Uri,
    sources: readonly ProjectSource[],
    signal: AbortSignal,
  ): Promise<LinkedProject> {
    const analysis = await analyzeProjectRevisionInWorker(sources, signal);
    return {
      root,
      sources,
      sourceUris: sourceUris(root, sources),
      snapshot: analysis.snapshotBuild.snapshot,
      result: analysis.result,
      diagnostics: analysis.diagnostics,
      tokenVocabulary: tokenVocabulary(analysis.snapshotBuild.snapshot, sources),
    };
  }

  private async renderCurrentDiagramDiff(): Promise<boolean> {
    const session = this.readDiagramDiffSession();
    if (session === undefined) return false;
    const generation = this.quickActionCoordinator.nextGeneration();
    const operation = this.beginVersioningOperation();
    try {
      const semantic = await projectVersionedDiagramDiff(session, (project) =>
        this.revisionGraph(project, operation.signal));
      if (!this.quickActionCoordinator.isCurrent(generation) || this.disposed
          || this.readDiagramDiffSession() !== session) return false;
      this.diffProjection = { session, fullDiff: semantic.diff };
      const accepted = await this.renderDiagramDiff(session, semantic.diff, generation);
      if (!accepted) return false;
      this.quickActionCoordinator.showResult("diff");
      const repository = await this.versionedRepository();
      if (repository !== undefined) {
        void attributeVersionedDiagramDiff(repository, semantic, operation.signal).then((attributed) => {
          if (!operation.signal.aborted && this.readDiagramDiffSession() === session
              && this.diffProjection?.session === session && this.diffProjection.fullDiff === semantic.diff) {
            this.diffProjection = { ...this.diffProjection, attributed };
          }
        }).catch((cause) => {
          if (!operation.signal.aborted) console.warn("Archinsight diagram diff attribution failed", cause);
        });
      }
      return true;
    } catch (cause) {
      if (!operation.signal.aborted && this.quickActionCoordinator.isCurrent(generation)) {
        void vscode.window.showErrorMessage(
          `Diagram diff failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
      return false;
    }
  }

  private async renderDiagramDiff(
    session: DiagramDiffSessionState,
    diff: DiagramDiff,
    generation = this.quickActionCoordinator.nextGeneration(),
  ): Promise<boolean> {
    const current = this.project.current;
    if (current === undefined) return false;
    const input = this.renderInput(current, this.diagram.queryState().query);
    if (input === undefined) return false;
    const preview = await buildDiagramDiffPreview(
      input,
      this.diagram.queryState(),
      session.before.result,
      session.after.result,
      diff,
      { theme: renderThemeForColorThemeKind(vscode.window.activeColorTheme.kind), log: (message) => output.appendLine(message) },
    );
    if (!this.quickActionCoordinator.isCurrent(generation) || this.disposed) return false;
    await this.diagram.publishAdHoc(preview);
    return preview.error === undefined;
  }

  private async postDiagramDiffMode(): Promise<void> {
    const session = this.readDiagramDiffSession();
    const state = session === undefined ? { status: "idle" as const } : {
      status: "showing-diff" as const,
      before: session.beforeRevision,
      after: session.afterRevision,
      beforeShort: session.beforeShort,
      afterShort: session.afterShort,
      currentRevision: session.catalogue.currentRevision,
      selectedElementId: session.selectedElementId,
    };
    if (this.webviewReady) {
      await this.panel.webview.postMessage({ command: "diagramDiffMode", state } satisfies WorkbenchHostToWebviewMessage);
    }
  }

  private versioningEligibleWorkspace(): boolean {
    return this.project.current?.root.scheme === "file";
  }

  private versionedRepository(): Promise<GitVersionedRepository | undefined> {
    if (!this.versioningEligibleWorkspace()) return Promise.resolve(undefined);
    this.versionedRepositoryPromise ??= openGitVersionedRepository(
      this.project.current?.root.fsPath ?? this.document!.uri.fsPath,
    );
    return this.versionedRepositoryPromise;
  }

  private beginVersioningOperation(): AbortController {
    this.versioningOperation?.abort();
    const controller = new AbortController();
    this.versioningOperation = controller;
    return controller;
  }

  private cancelVersioningOperation(): void {
    this.versioningOperation?.abort();
    this.versioningOperation = undefined;
  }

  private async selectPathTarget(elementId: string): Promise<void> {
    const current = this.project.current;
    const selecting = this.readFindPathMode();
    if (current === undefined || selecting.status !== "selecting-target") return;
    try {
      const prepared = new DiagramQuickActionService(current.result)
        .selectPathTarget(selecting, elementId, this.currentPathEndpointEnvironment());
      if (prepared === undefined) return;
      await this.resolveAndRenderPath(prepared, retryFindPathTarget(prepared.resolving), false);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Find path failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private quickActionScope(current: LinkedProject): QueryScope {
    const queryState = this.diagram.queryState();
    const input = this.renderInput(current, queryState.query);
    const sourceName = input?.queryScope?.tab ?? input?.sourceName;
    const context = input?.queryScope?.context
      ?? current.result.contexts.find((candidate) => candidate.sourceIdentity === sourceName)?.id;
    return {
      ...(context === undefined ? {} : { context }),
      ...(sourceName === undefined ? {} : { tab: sourceName }),
      view: queryState.view,
      ...(queryState.environment === undefined ? {} : { environment: queryState.environment }),
    };
  }

  private currentPathEndpointEnvironment(): string | undefined {
    const queryState = this.diagram.queryState();
    return resolveBuiltinView(queryState.view)?.environment === "single-relevant"
      ? queryState.environment
      : undefined;
  }

  private async reverseFindPath(): Promise<void> {
    const showing = this.readFindPathMode();
    if (showing.status !== "showing-path") return;
    const current = this.project.current;
    if (current === undefined) return;
    try {
      const prepared = new DiagramQuickActionService(current.result).reversePath(showing);
      if (prepared === undefined) return;
      await this.resolveAndRenderPath(prepared, showing, true);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Find path failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async resolveAndRenderPath(
    prepared: PreparedFindPath,
    failureMode: FindPathMode,
    preserveVisibleResult: boolean,
  ): Promise<void> {
    const { resolving, showing, graph } = prepared;
    await this.writeFindPathMode(resolving);
    if (this.readFindPathMode() !== resolving) return;
    if (graph.edges.length === 0) {
      output.appendLine(`No path found between ${resolving.sourceTitle} and ${resolving.targetTitle}.`);
    }
    if (this.readFindPathMode() !== resolving) return;
    await this.writeFindPathMode(showing);
    if (this.readFindPathMode() !== showing) return;
    const accepted = await this.renderQuickActionGraph(graph, "find-path");
    if (!accepted && this.readFindPathMode() === showing) {
      if (preserveVisibleResult) this.quickActionCoordinator.showResult("find-path");
      await this.writeFindPathMode(failureMode);
    }
  }

  private async renderQuickActionGraph(
    graph: import("@insight/language").RenderGraph,
    resultKind: TransientDiagramResultKind,
  ): Promise<boolean> {
    const current = this.project.current;
    if (current === undefined) return false;
    const input = this.renderInput(current, this.diagram.queryState().query);
    if (input === undefined) return false;
    const generation = this.quickActionCoordinator.nextGeneration();
    const preview = await buildQuickActionPreview(input, this.diagram.queryState(), graph, {
      theme: renderThemeForColorThemeKind(vscode.window.activeColorTheme.kind),
      log: (message) => output.appendLine(message),
    });
    if (!this.quickActionCoordinator.isCurrent(generation) || this.disposed) return false;
    await this.diagram.publishAdHoc(preview);
    const accepted = preview.error === undefined;
    if (accepted) this.quickActionCoordinator.showResult(resultKind);
    else this.quickActionCoordinator.clearResult();
    return accepted;
  }

  private async postSource(): Promise<void> {
    const sourceName = this.sourceName(this.project.current);
    const queryState = this.diagram.queryState();
    this.lastSource = this.sourceText(this.project.current, sourceName);
    const versioningAvailable = this.versioningEligibleWorkspace()
      && await this.versionedRepository().then((repository) => repository !== undefined).catch(() => false);
    await this.panel.webview.postMessage({
      command: "source",
      source: this.lastSource,
      sourceName,
      fileName: this.fileName(),
      view: queryState.view,
      query: queryState.query,
      environment: queryState.environment,
      parameters: queryState.parameters,
      queries: viewQueries,
      diagnostics: this.editorDiagnostics(this.project.current),
      symbols: this.project.current?.snapshot ?? coreLanguageSnapshot,
      readOnly: this.isReadOnly(),
      queryScope: this.queryScopeState(this.project.current),
      versioningAvailable,
    });
    await this.postFindPathMode();
    await this.postIsolateMode();
    await this.postDeploymentMode();
    await this.postDiagramDiffMode();
  }

  private async postDiagnostics(diagnostics: readonly LanguageDiagnostic[]): Promise<void> {
    await this.panel.webview.postMessage({ command: "diagnostics", diagnostics });
  }

  private async postQueryScope(current: LinkedProject | undefined): Promise<void> {
    const versioningAvailable = this.versioningEligibleWorkspace()
      && await this.versionedRepository().then((repository) => repository !== undefined).catch(() => false);
    await this.panel.webview.postMessage({
      command: "queryScope",
      state: this.queryScopeState(current),
      versioningAvailable,
    } satisfies WorkbenchHostToWebviewMessage);
  }

  private tokenVocabulary(source: string): InsightTokenVocabulary {
    return this.project.current?.tokenVocabulary
      ?? tokenVocabulary(coreLanguageSnapshot, [{ sourceName: this.sourceName(this.project.current), source }]);
  }

  private async postPreview(state: PreviewState): Promise<void> {
    await this.panel.webview.postMessage({ command: "preview", state });
  }

  private async postClipboardText(requestId: number): Promise<void> {
    const text = await vscode.env.clipboard.readText();
    await this.panel.webview.postMessage({
      command: "clipboardText",
      requestId,
      text,
    } satisfies WorkbenchHostToWebviewMessage);
  }

  private async complete(requestId: number, sourceName: string, source: string, cursorOffset: number): Promise<void> {
    const current = this.project.current;
    const result = service.complete({
      sourceName,
      source,
      cursorOffset,
      snapshot: current?.snapshot ?? coreLanguageSnapshot,
      indexedIdentifiers: current === undefined ? new Map() : visibleIdentifiersForSource(current.result, sourceName),
      contextualIdentifiers: current === undefined ? [] : contextualIdentifiers(current.result),
      contextIds: current === undefined ? [] : [...new Set(current.result.contexts.map((context) => context.id))],
      rootTypes: new Map(current?.result.contexts.map((root) => [root.id, root.type]) ?? []),
    });
    await this.panel.webview.postMessage({
      command: "completionResult",
      requestId,
      replacementStartOffset: result.replacementStartOffset,
      replacementEndOffset: result.replacementEndOffset,
      items: result.items.map((item) => ({
        label: item.label,
        insertText: item.insertText,
        kind: item.kind,
        typeName: item.typeName,
        imported: item.imported,
        documentation: item.documentation,
      })),
    });
  }

  private async openDeclaration(declaration: { readonly source: string; readonly line: number; readonly column: number }): Promise<void> {
    if (!this.declarationNavigationAvailable()) return;
    const current = this.project.current;
    if (current === undefined) {
      return;
    }
    const queryState = this.diagram.queryState();
    if (coreSourceByName.has(declaration.source)) {
      await this.openLocation(new vscode.Location(coreSourceUriFor(declaration.source), locationRange({ line: declaration.line, column: declaration.column })), queryState);
      return;
    }
    const uri = current.sourceUris.get(declaration.source);
    if (uri === undefined) {
      return;
    }
    const position = new vscode.Position(Math.max(0, declaration.line - 1), Math.max(0, declaration.column - 1));
    await this.openLocation(new vscode.Location(uri, new vscode.Range(position, position)), queryState);
  }

  private declarationNavigationAvailable(): boolean {
    const session = this.readDiagramDiffSession();
    return session === undefined
      || session.beforeRevision === session.catalogue.currentRevision
      || session.afterRevision === session.catalogue.currentRevision;
  }

  async reveal(position: vscode.Position): Promise<void> {
    this.pendingReveal = position;
    await this.flushPendingReveal();
  }

  private async flushPendingReveal(): Promise<void> {
    if (!this.webviewReady || this.pendingReveal === undefined) {
      return;
    }
    const position = this.pendingReveal;
    this.pendingReveal = undefined;
    await this.panel.webview.postMessage({
      command: "reveal",
      line: position.line + 1,
      column: position.character + 1,
    } satisfies WorkbenchHostToWebviewMessage);
  }

  private async replaceDocument(source: string): Promise<void> {
    if (this.document === undefined || this.isReadOnly() || this.applyingEdit || source === this.document.getText()) {
      return;
    }
    this.lastSource = source;
    this.applyingEdit = true;
    try {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(this.document.uri, fullDocumentRange(this.document), source);
      await vscode.workspace.applyEdit(edit);
    } finally {
      this.applyingEdit = false;
    }
  }

  async download(kind: DiagramArtifactKind): Promise<void> {
    const current = this.project.current;
    const sourceName = this.sourceName(current);
    await this.diagram.download(kind, kind === "source" ? {
      fileName: this.fileName(),
      source: this.sourceText(current, sourceName),
    } : undefined);
  }

  private isReadOnly(): boolean {
    return this.virtualDocument?.readOnly === true || this.document?.uri.scheme === coreSourceScheme;
  }

  private sourceName(current: LinkedProject | undefined): string {
    if (this.virtualDocument !== undefined) {
      return this.virtualDocument.sourceName;
    }
    const document = this.document;
    if (document === undefined) {
      return coreSourceName;
    }
    const root = current?.root ?? workspaceRoot();
    return root === undefined ? path.basename(document.uri.fsPath) : sourceNameForUri(root, document.uri);
  }

  private sourceText(current: LinkedProject | undefined, sourceName: string): string {
    if (this.virtualDocument !== undefined) {
      return this.virtualDocument.source;
    }
    return current?.sources.find((item) => item.sourceName === sourceName)?.source ?? this.document?.getText() ?? "";
  }

  private fileName(): string {
    if (this.virtualDocument !== undefined) {
      return this.virtualDocument.fileName;
    }
    return this.document === undefined ? coreSourceName : path.basename(this.document.uri.fsPath);
  }

  private panelTitle(fileName: string): string {
    return this.isReadOnly() ? `[r] ${fileName}` : fileName;
  }

  private uri(): vscode.Uri {
    return this.virtualDocument?.uri ?? this.document?.uri ?? coreSourceUri;
  }

  private isQueryDocument(): boolean {
    return this.document !== undefined && isAiqDocument(this.document);
  }

  private editorDiagnostics(current: LinkedProject | undefined, source = this.document?.getText() ?? ""): readonly LanguageDiagnostic[] {
    if (!this.isQueryDocument()) {
      return current?.diagnostics ?? [];
    }
    return analyzeQuery(source, { sourceName: this.sourceName(current) }).diagnostics;
  }

  private queryScopeState(current: LinkedProject | undefined): WebviewQueryScopeState {
    if (!this.isQueryDocument() || current === undefined) {
      return { enabled: this.isQueryDocument(), sources: [], contexts: [] };
    }
    const contexts = this.queryScopeContexts(current);
    const sourceTypes = new Map(contexts.map((context) => [context.sourceIdentity, context.typeName]));
    const sources = current.sources
      .filter((source) => source.sourceName.toLocaleLowerCase().endsWith(".ai") && current.sourceUris.has(source.sourceName))
      .map((source) => ({
        value: source.sourceName,
        label: source.sourceName,
        ...(sourceTypes.get(source.sourceName) === undefined ? {} : { typeName: sourceTypes.get(source.sourceName) }),
      }));
    return resolveQueryScopeState(true, sources, contexts, {
      tab: this.queryScopeTab,
      context: this.queryScopeContext,
    });
  }

  private async selectQueryScope(variable: "tab" | "context", value: string): Promise<void> {
    const current = this.project.current;
    if (!this.isQueryDocument() || current === undefined) return;
    const selection = selectQueryScope(
      this.queryScopeState(current),
      this.queryScopeContexts(current),
      { tab: this.queryScopeTab, context: this.queryScopeContext },
      variable,
      value,
    );
    if (selection === undefined) return;
    this.queryScopeTab = selection.tab;
    this.queryScopeContext = selection.context;
    await this.postQueryScope(current);
    const input = this.renderInput(current, this.diagram.queryState().query);
    if (input !== undefined) {
      if (this.readDiagramDiffSession() !== undefined) await this.renderCurrentDiagramDiff();
      else await this.diagram.refresh(input);
    }
  }

  private queryScopeContexts(current: LinkedProject): readonly QueryScopeContextChoice[] {
    return current.result.contexts
      .filter((context) => context.synthetic !== true)
      .map((context) => ({
        value: context.id,
        label: context.id,
        sourceIdentity: context.sourceIdentity,
        ...(context.type === undefined ? {} : { typeName: context.type }),
      }));
  }

  private renderInput(current: LinkedProject, query: string): DiagramRenderInput | undefined {
    const sourceName = this.sourceName(current);
    const base = {
      current,
      sourceName,
      source: this.sourceText(current, sourceName),
      fileName: this.fileName(),
      blockOnLinkerErrors: true,
    };
    if (!this.isQueryDocument()) return base;
    const scope = this.queryScopeState(current);
    const variables = analyzeQuery(query).referencedVariables;
    if ((variables.includes("tab") && scope.tab === undefined)
        || (variables.includes("context") && scope.context === undefined)) return undefined;
    return { ...base, queryScope: { tab: scope.tab, context: scope.context } };
  }
}

async function previewView(
  project: ProjectModel,
  view: DiagramView,
  query = viewQueries[view],
  forceEnvironmentPicker = false,
): Promise<void> {
  if (activeWorkbenchEditor !== undefined) {
    await activeWorkbenchEditor.render(view, query, forceEnvironmentPicker);
    return;
  }
  if (activePreview !== undefined) {
    await activePreview.render(view, query, forceEnvironmentPicker);
    return;
  }
  await project.refresh(`preview:${view}`);
  const preview = currentPreview();
  if (preview !== undefined) {
    await preview.render(view, query);
    return;
  }
  await previewDiagram(project, view, query);
}

function currentPreview(): PreviewSession | undefined {
  return activePreview;
}

async function previewDiagram(
  project: ProjectModel,
  initialView: DiagramView = "c1",
  initialQuery = viewQueries[initialView],
  document = activeInsightDocument(),
  silent = false,
): Promise<void> {
  const current = project.current;
  if (current === undefined || document === undefined || !isInsightDocument(document)) {
    if (!silent) {
      void vscode.window.showWarningMessage("Open an Insight .ai file before previewing a diagram.");
    }
    return;
  }
  if (current.diagnostics.some((diagnostic) => (diagnostic.level ?? "ERROR") === "ERROR")) {
    if (!silent) {
      void vscode.window.showErrorMessage("Fix linker errors before rendering a diagram.");
    }
    return;
  }
  const sourceName = sourceNameForUri(current.root, document.uri);
  const preview = new PreviewSession(current, document, sourceName);
  await preview.show(initialView, initialQuery);
}

class PreviewSession {
  private panel: vscode.WebviewPanel | undefined;
  private readonly diagram: DiagramSession<DiagramRenderInput, DiagramView, PreviewState>;

  constructor(
    private current: LinkedProject,
    private active: vscode.TextDocument,
    private sourceName: string,
  ) {
    this.diagram = createDiagramSession({ view: "c1", query: viewQueries.c1 }, {
      publishPreview: async (state) => {
        if (this.panel !== undefined) {
          this.panel.title = `Archinsight: ${state.contextId}`;
          await this.postState(state);
        }
      },
      requestPng: async (svg) => {
        if (this.panel === undefined) {
          throw new Error("Preview is not open");
        }
        await this.panel.webview.postMessage({ command: "exportPng", svg });
      },
    }, (message) => output.appendLine(message));
  }

  async show(initialView: DiagramView, initialQuery: string): Promise<void> {
    const status = await this.diagram.render(this.renderInput(), { view: initialView, query: initialQuery });
    const state = this.diagram.previewState();
    if (status !== "rendered" || state === undefined) {
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      "archinsightPreview",
      `Archinsight: ${state.contextId}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    activePreview = this;
    previewSessions.add(this);
    this.panel.onDidDispose(() => {
      if (activePreview === this) {
        activePreview = undefined;
      }
      previewSessions.delete(this);
      this.diagram.dispose("Preview closed");
    });
    this.panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.visible) {
        activePreview = this;
      }
    });
    this.panel.webview.onDidReceiveMessage((value: unknown) => {
      const message = validatedWebviewMessage(parsePreviewWebviewToHostMessage, value, "preview");
      if (message === undefined) return;
      if (message.command === "ready") {
        void this.postState();
        return;
      }
      if (message.command === "png") {
        this.diagram.resolvePng(message.dataUrl);
      }
    });
    this.panel.webview.html = previewHtml();
  }

  async render(view: DiagramView, query = viewQueries[view], forceEnvironmentPicker = false): Promise<void> {
    if (this.panel === undefined) {
      return;
    }
    await this.diagram.render(this.renderInput(), { view, query, forceEnvironmentPicker });
  }

  async refreshFromProject(current: LinkedProject | undefined): Promise<void> {
    if (current === undefined || this.diagram.previewState() === undefined || this.panel === undefined) {
      return;
    }
    this.current = current;
    await this.diagram.refresh(this.renderInput());
  }

  async refreshTheme(): Promise<void> {
    await this.diagram.refreshGraph(this.panel === undefined ? undefined : this.renderInput());
  }

  async setActiveDocument(document: vscode.TextDocument): Promise<void> {
    if (this.panel === undefined || !isInside(this.current.root, document.uri)) {
      return;
    }
    const sourceName = sourceNameForUri(this.current.root, document.uri);
    if (sourceName === this.sourceName) {
      return;
    }
    this.active = document;
    this.sourceName = sourceName;
    if (this.diagram.previewState() !== undefined) {
      await this.diagram.refresh(this.renderInput());
    }
  }

  async editQuery(): Promise<void> {
    const state = this.diagram.previewState();
    if (state === undefined) {
      return;
    }
    const query = await vscode.window.showInputBox({
      title: "Archinsight query",
      prompt: "Edit current graph query",
      value: state.query,
      ignoreFocusOut: true,
    });
    if (query !== undefined) {
      await this.render(state.view, query);
    }
  }

  async download(kind: DiagramArtifactKind): Promise<void> {
    await this.diagram.download(kind);
  }

  private async postState(state = this.diagram.previewState()): Promise<void> {
    if (this.panel !== undefined && state !== undefined) {
      await this.panel.webview.postMessage({ command: "preview", state });
    }
  }

  private sourceText(): string {
    return this.current.sources.find((item) => item.sourceName === this.sourceName)?.source ?? this.active.getText();
  }

  private renderInput(): DiagramRenderInput {
    return {
      current: this.current,
      sourceName: this.sourceName,
      source: this.sourceText(),
      fileName: path.basename(this.active.uri.fsPath),
      blockOnLinkerErrors: false,
    };
  }
}

function controlsHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = webviewNonce();
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", "controls.js"));
  const cssUris = webviewCssUris(webview, extensionUri)
    .map((uri) => `<link rel="stylesheet" href="${uri}">`)
    .join("\n");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; worker-src ${webview.cspSource} blob:; font-src ${webview.cspSource};">
    ${cssUris}
  </head>
  <body>
    <div id="app"></div>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}

function workbenchEditorBundleHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = webviewNonce();
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", "workbench.js"));
  const cssUris = webviewCssUris(webview, extensionUri)
    .map((uri) => `<link rel="stylesheet" href="${uri}">`)
    .join("\n");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; worker-src ${webview.cspSource} blob:; font-src ${webview.cspSource};">
    ${cssUris}
  </head>
  <body>
    <div id="app"></div>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}

function webviewCssUris(webview: vscode.Webview, extensionUri: vscode.Uri): vscode.Uri[] {
  const assets = vscode.Uri.joinPath(extensionUri, "dist", "webview", "assets");
  try {
    return fs.readdirSync(assets.fsPath)
      .filter((file) => file.endsWith(".css"))
      .sort()
      .map((file) => webview.asWebviewUri(vscode.Uri.joinPath(assets, file)));
  } catch {
    return [];
  }
}

function workbenchEditorHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  return workbenchEditorBundleHtml(webview, extensionUri);
}

function webviewNonce(): string {
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
}

async function downloadActiveSource(): Promise<void> {
  const active = activeInsightDocument();
  if (active === undefined || !isInsightDocument(active)) {
    void vscode.window.showWarningMessage("Open an Insight .ai file before downloading source.");
    return;
  }
  await saveBytes(fileNameWithExtension(path.basename(active.uri.fsPath), ".ai"), Buffer.from(active.getText(), "utf8"));
}

function activeInsightDocument(): vscode.TextDocument | undefined {
  const document = vscode.window.activeTextEditor?.document;
  return document !== undefined && isInsightDocument(document) ? document : undefined;
}

function fullDocumentRange(document: vscode.TextDocument): vscode.Range {
  const lastLine = document.lineAt(Math.max(0, document.lineCount - 1));
  return new vscode.Range(new vscode.Position(0, 0), lastLine.range.end);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAiqDocument(document: vscode.TextDocument): boolean {
  return document.languageId === "archinsight-query" || document.uri.fsPath.endsWith(".aiq");
}

function vscodeDiagnostic(diagnostic: LanguageDiagnostic): vscode.Diagnostic {
  const item = new vscode.Diagnostic(diagnosticRange(diagnostic), diagnostic.message, severity(diagnostic.level));
  item.code = diagnostic.code;
  item.source = "insight";
  return item;
}

function diagnosticRange(diagnostic: LanguageDiagnostic): vscode.Range {
  const lineIndex = Math.max(0, diagnostic.line - 1);
  const columnIndex = Math.max(0, diagnostic.column - 1);
  if (diagnostic.endLine !== undefined && diagnostic.endColumn !== undefined) {
    return new vscode.Range(
      lineIndex,
      columnIndex,
      Math.max(0, diagnostic.endLine - 1),
      Math.max(columnIndex + 1, diagnostic.endColumn - 1),
    );
  }
  const start = new vscode.Position(lineIndex, columnIndex);
  return new vscode.Range(start, start.translate(0, 1));
}

function severity(level: LanguageDiagnostic["level"]): vscode.DiagnosticSeverity {
  switch (level) {
    case "NOTE":
      return vscode.DiagnosticSeverity.Information;
    case "WARNING":
      return vscode.DiagnosticSeverity.Warning;
    case "ERROR":
    default:
      return vscode.DiagnosticSeverity.Error;
  }
}

function visibleIdentifiersForSource(result: LinkProjectResult, sourceName: string): ReadonlyMap<string, VisibleIdentifier> {
  const identifiers = new Map<string, VisibleIdentifier>();
  for (const item of result.imports) {
    if (item.sourceIdentity !== sourceName) {
      continue;
    }
    const target = result.elements.find((element) => element.id === item.target);
    identifiers.set(item.alias, {
      label: item.alias,
      type: target?.type,
      imported: true,
      ...(target === undefined ? {} : completionDocumentationProperty(result, target)),
    });
  }
  return identifiers;
}

function contextualIdentifiers(result: LinkProjectResult): readonly ContextualIdentifier[] {
  return result.elements
    .filter((element) => element.anonymous !== true && element.synthetic !== true)
    .map((element) => ({
      label: element.localId,
      type: element.type,
      contextId: element.context,
      ...completionDocumentationProperty(result, element),
    }));
}

function completionDocumentationProperty(
  result: LinkProjectResult,
  element: LinkedElement,
): Pick<VisibleIdentifier, "documentation"> | Record<string, never> {
  const documentation = elementCompletionDocumentation(element, result.presentations);
  return documentation === undefined ? {} : { documentation };
}

function completionKind(item: { readonly kind: CompletionKind; readonly imported?: boolean }): vscode.CompletionItemKind {
  switch (item.kind) {
    case "KEYWORD":
      return vscode.CompletionItemKind.Keyword;
    case "TYPE":
      return vscode.CompletionItemKind.Class;
    case "CONSTRUCTOR":
      return vscode.CompletionItemKind.Constructor;
    case "OPERATOR":
      return vscode.CompletionItemKind.Operator;
    case "ATTRIBUTE":
      return vscode.CompletionItemKind.Property;
    case "IDENTIFIER":
      return item.imported === true
        ? vscode.CompletionItemKind.Reference
        : vscode.CompletionItemKind.Variable;
    case "ENUM_VALUE":
      return vscode.CompletionItemKind.EnumMember;
    case "ANNOTATION":
      return vscode.CompletionItemKind.Function;
    case "NEWLINE":
      return vscode.CompletionItemKind.Snippet;
  }
}

function tokenVocabulary(_snapshot: LanguageSnapshot, _sources: readonly ProjectSource[]): InsightTokenVocabulary {
  return {};
}

function semanticSnapshotKey(snapshot: LanguageSnapshot): string {
  return [
    snapshot.schemaVersion,
    snapshot.types.length,
    snapshot.constructors.length,
    snapshot.operators.map((operator) => `${operator.spelling}/${operator.leftType ?? ""}/${operator.targetType}`).join("|"),
  ].join(":");
}

function semanticTokenIndex(type: SemanticTokenType): number {
  return semanticTokenTypes.indexOf(type);
}

function documentSymbolsForSource(project: LinkedProject, sourceName: string): vscode.DocumentSymbol[] {
  const childrenByParent = new Map<string, LinkedElement[]>();
  for (const element of project.result.elements) {
    if (element.parent === undefined || element.declaration?.sourceName !== sourceName) {
      continue;
    }
    const children = childrenByParent.get(element.parent) ?? [];
    children.push(element);
    childrenByParent.set(element.parent, children);
  }
  const rootElements = project.result.elements
    .filter((element) => element.declaration?.sourceName === sourceName && (element.parent === undefined || !childrenByParent.has(element.parent)))
    .map((element) => elementSymbol(element, childrenByParent));
  const contexts = project.result.contexts
    .filter((context) => context.declaration?.sourceName === sourceName)
    .map((context) => {
      const symbol = new vscode.DocumentSymbol(context.id, context.type, vscode.SymbolKind.Namespace, locationRange(context.declaration), locationRange(context.declaration));
      symbol.children.push(...rootElements);
      return symbol;
    });
  return contexts.length > 0 ? contexts : rootElements;
}

function elementSymbol(element: LinkedElement, childrenByParent: ReadonlyMap<string, readonly LinkedElement[]>): vscode.DocumentSymbol {
  const symbol = new vscode.DocumentSymbol(
    element.localId,
    element.type,
    vscode.SymbolKind.Object,
    locationRange(element.declaration),
    locationRange(element.declaration),
  );
  symbol.children.push(...(childrenByParent.get(element.id) ?? []).map((child) => elementSymbol(child, childrenByParent)));
  return symbol;
}

function typeTree(
  project: LinkedProject,
  includeLanguageTypes: boolean,
  includeOperators: boolean,
): StructureNode[] {
  return filterTypeHierarchy(buildTypeHierarchy(project.snapshot), {
    includeLanguageTypes,
    includeOperators,
  }).map((type) => typeNode(project, type));
}

function typeNode(
  project: LinkedProject,
  type: TypeHierarchyNode,
): StructureNode {
  return {
    label: type.id,
    description: type.extends === undefined ? undefined : `extends ${type.extends}`,
    icon: type.operator ? "symbol-operator" : "symbol-class",
    iconColor: type.operator ? "symbolIcon.operatorForeground" : "symbolIcon.classForeground",
    kind: "type",
    location: projectStructureLocation(project, type.declaration),
    children: type.children.map((child) => typeNode(project, child)),
  };
}

function declarationTree(project: LinkedProject): StructureNode[] {
  return buildProjectStructure(project.result).contexts.map((context) => declarationNode(project, context));
}

function declarationNode(
  project: LinkedProject,
  declaration: ProjectStructureDeclaration,
): StructureNode {
  const context = declaration.kind === "context";
  const imported = declaration.kind === "import";
  return {
    label: declaration.id,
    description: imported ? `import ${declaration.type ?? ""}`.trim() : declaration.type,
    icon: context ? "symbol-namespace" : imported ? "symbol-reference" : "symbol-variable",
    iconColor: context
      ? "symbolIcon.namespaceForeground"
      : imported ? "symbolIcon.referenceForeground" : "symbolIcon.variableForeground",
    kind: declaration.kind,
    location: projectStructureLocation(project, declaration),
    children: declaration.children.map((child) => declarationNode(project, child)),
  };
}

function projectStructureLocation(
  project: LinkedProject,
  source: { readonly source: string; readonly line: number; readonly column: number } | undefined,
): vscode.Location | undefined {
  return source === undefined
    ? undefined
    : location(project, { sourceName: source.source, line: source.line, column: source.column });
}

function location(project: LinkedProject, source: { readonly sourceName: string; readonly line: number; readonly column: number } | undefined): vscode.Location | undefined {
  if (source === undefined) {
    return undefined;
  }
  if (coreSourceByName.has(source.sourceName)) {
    return sourceLocation(source);
  }
  const uri = project.sourceUris.get(source.sourceName);
  if (uri === undefined) {
    return undefined;
  }
  return new vscode.Location(uri, locationRange(source));
}

function sourceLocation(source: { readonly sourceName: string; readonly line: number; readonly column: number } | undefined): vscode.Location | undefined {
  if (source === undefined) {
    return undefined;
  }
  const uri = coreSourceByName.has(source.sourceName) ? coreSourceUriFor(source.sourceName) : undefined;
  return uri === undefined ? undefined : new vscode.Location(uri, locationRange(source));
}

function coreSourceUriFor(sourceName: string): vscode.Uri {
  return vscode.Uri.from({ scheme: coreSourceScheme, path: `/${sourceName}` });
}

function locationRange(source: { readonly line: number; readonly column: number } | undefined): vscode.Range {
  const position = new vscode.Position(Math.max(0, (source?.line ?? 1) - 1), Math.max(0, (source?.column ?? 1) - 1));
  return new vscode.Range(position, position.translate(0, 1));
}

function showLinkSummary(project: LinkedProject | undefined): void {
  if (project === undefined) {
    void vscode.window.showWarningMessage("No Archinsight project is open.");
    return;
  }
  const text = `Linker finished: ${summary(project.diagnostics)}`;
  output.appendLine(text);
  void vscode.window.showInformationMessage(text);
}

function summary(diagnostics: readonly LanguageDiagnostic[]): string {
  const counts = { errors: 0, warnings: 0, notes: 0 };
  for (const diagnostic of diagnostics) {
    switch (diagnostic.level) {
      case "WARNING":
        counts.warnings++;
        break;
      case "NOTE":
        counts.notes++;
        break;
      case "ERROR":
      default:
        counts.errors++;
        break;
    }
  }
  return `errors: ${counts.errors}, warnings: ${counts.warnings}, notes: ${counts.notes}`;
}

function hasErrors(diagnostics: readonly LanguageDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => (diagnostic.level ?? "ERROR") === "ERROR");
}

function letters(): string[] {
  return "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_".split("");
}
