import * as vscode from "vscode";
import * as fs from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import {
  coreLanguageSnapshot,
  coreSource,
  coreSources,
  discoverDeploymentEnvironments,
  insightSemanticTokenModifiers,
  insightSemanticTokenTypes,
  InsightLanguageService,
  renderGraphviz,
  semanticHighlightInsight,
  selectGraph,
  type CompletionKind,
  type LanguageDiagnostic,
  type LanguageSnapshot,
  type LinkedElement,
  type LinkedImport,
  type LinkProjectResult,
  type ProjectSource,
  type TypeDefinition,
  type VisibleIdentifier,
} from "@insight/language";
import { BUILTIN_VIEW_QUERIES, type BuiltinDiagramView } from "./generated/builtin-view-queries.js";

type DiagramView = BuiltinDiagramView;
type AgentSkillTarget = "generic" | "codex" | "claude";

interface PreviewState {
  readonly view: DiagramView;
  readonly query: string;
  readonly environment?: string;
  readonly contextId: string;
  readonly sourceName: string;
  readonly fileName: string;
  readonly source: string;
  readonly svg?: string;
  readonly dot?: string;
  readonly error?: string;
}

interface DiagramQueryState {
  readonly view: DiagramView;
  readonly query: string;
  readonly environment?: string;
}

type PreviewMessage =
  | { readonly command: "ready" }
  | { readonly command: "png"; readonly dataUrl: string };

type ControlsMessage =
  | { readonly command: "ready" }
  | { readonly command: "render"; readonly view: DiagramView; readonly query: string }
  | { readonly command: "clipboardRead"; readonly requestId: number }
  | { readonly command: "clipboardWrite"; readonly text: string };

type WorkbenchEditorMessage =
  | { readonly command: "ready" }
  | { readonly command: "sourceChanged"; readonly source: string }
  | { readonly command: "render"; readonly view: DiagramView; readonly query: string }
  | { readonly command: "selectDeploymentEnvironment" }
  | { readonly command: "refresh" }
  | { readonly command: "download"; readonly kind: "source" | "svg" | "png" | "dot" }
  | { readonly command: "editQuery"; readonly view: DiagramView; readonly query: string }
  | { readonly command: "png"; readonly dataUrl: string }
  | { readonly command: "complete"; readonly requestId: number; readonly sourceName: string; readonly source: string; readonly cursorOffset: number }
  | { readonly command: "clipboardRead"; readonly requestId: number }
  | { readonly command: "clipboardWrite"; readonly text: string }
  | { readonly command: "openDeclaration"; readonly declaration: { readonly source: string; readonly line: number; readonly column: number } };

type WorkbenchEditorIncomingMessage =
  | { readonly command: "reveal"; readonly line: number; readonly column: number }
  | { readonly command: "clipboardText"; readonly requestId: number; readonly text: string };

interface LinkedProject {
  readonly root: vscode.Uri;
  readonly sources: readonly ProjectSource[];
  readonly sourceUris: ReadonlyMap<string, vscode.Uri>;
  readonly snapshot: LanguageSnapshot;
  readonly result: LinkProjectResult;
  readonly diagnostics: readonly LanguageDiagnostic[];
  readonly tokenVocabulary: InsightTokenVocabulary;
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
let activePreview: PreviewSession | undefined;
let activeWorkbenchEditor: ArchinsightWorkbenchEditorSession | undefined;
const archinsightEditorViewType = "archinsight.editor";
const archinsightCoreEditorViewType = "archinsight.coreEditor";
const coreSourceScheme = "archinsight-core";
const coreSourceName = coreSources.some((source) => source.sourceName === "core.ai") ? "core.ai" : coreSources[0]?.sourceName ?? "core.ai";
const coreSourceByName = new Map(coreSources.map((source) => [source.sourceName, source.source]));
const coreSourceUri = vscode.Uri.from({ scheme: coreSourceScheme, path: `/${coreSourceName}` });

const languageTypeNames = new Set(coreLanguageSnapshot.types.map((type) => type.name));
const viewQueries: Record<DiagramView, string> = BUILTIN_VIEW_QUERIES;

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("archinsight");
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

  context.subscriptions.push(
    output,
    diagnostics,
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
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (isInsightDocument(event.document)) {
        project.scheduleRefresh();
      }
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (isInsightDocument(document)) {
        project.scheduleRefresh();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor !== undefined && isInsightDocument(editor.document)) {
        void activePreview?.setActiveDocument(editor.document);
      }
    }),
  );

  project.onDidChange(() => {
    structure.refresh();
    void workbenchEditor.refreshFromProject(project.current);
    if (activePreview !== undefined) {
      void activePreview.refreshFromProject(project.current);
    }
  });
  void project.refresh("activation");
}

export function deactivate(): void {
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

class ProjectModel {
  private readonly listeners = new Set<() => void>();
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  current: LinkedProject | undefined;

  constructor(private readonly diagnostics: vscode.DiagnosticCollection) {
  }

  onDidChange(listener: () => void): vscode.Disposable {
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
    const root = workspaceRoot();
    if (root === undefined) {
      this.current = undefined;
      this.diagnostics.clear();
      this.fire();
      return;
    }
    try {
      const sources = await readWorkspaceSources(root);
      const snapshot = service.buildSnapshot(
        sources.map((source) => ({ sourceName: source.sourceName, source: source.source })),
        [coreLanguageSnapshot],
      );
      const result = service.link({ sources, snapshot: snapshot.snapshot });
      const project: LinkedProject = {
        root,
        sources,
        sourceUris: sourceUris(root, sources),
        snapshot: snapshot.snapshot,
        result,
        diagnostics: uniqueDiagnostics([...result.diagnostics, ...snapshot.diagnostics]),
        tokenVocabulary: tokenVocabulary(snapshot.snapshot, sources),
      };
      this.current = project;
      this.updateDiagnostics(project);
      output.appendLine(`Linker finished (${reason}): ${summary(project.diagnostics)}`);
      this.fire();
    } catch (error) {
      output.appendLine(`Linker failed (${reason}): ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private updateDiagnostics(project: LinkedProject): void {
    const grouped = new Map<string, vscode.Diagnostic[]>();
    for (const diagnostic of project.diagnostics) {
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
    for (const listener of this.listeners) {
      listener();
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
      contextIds: current === undefined ? [] : [...new Set(current.result.contexts.map((context) => context.id))],
    });
    return result.items.map((item) => {
      const completion = new vscode.CompletionItem(item.label, completionKind(item));
      completion.insertText = item.insertText;
      completion.range = new vscode.Range(
        document.positionAt(result.replacementStartOffset),
        document.positionAt(result.replacementEndOffset),
      );
      completion.detail = completionDetail(item);
      completion.sortText = `${completionSortBucket(item.kind)}:${item.label}`;
      return completion;
    });
  }
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
        semanticTokenModifierBits(token.modifiers),
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
    return filterStructureNodes(roots, this.filterQuery);
  }

  private syncFilterContexts(): void {
    void vscode.commands.executeCommand("setContext", "archinsight.structure.showLanguageTypes", this.showLanguageTypes);
    void vscode.commands.executeCommand("setContext", "archinsight.structure.showOperators", this.showOperators);
    void vscode.commands.executeCommand("setContext", "archinsight.structure.showIdentifiers", this.showIdentifiers);
  }
}

function filterStructureNodes(nodes: readonly StructureNode[], query: string): StructureNode[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length === 0) {
    return [...nodes];
  }
  return nodes.flatMap((node) => filterStructureNode(node, normalized));
}

function filterStructureNode(node: StructureNode, query: string): StructureNode[] {
  if (matchesStructureNode(node, query)) {
    return [node];
  }
  const children = node.children.flatMap((child) => filterStructureNode(child, query));
  return children.length === 0 ? [] : [{ ...node, children }];
}

function matchesStructureNode(node: StructureNode, query: string): boolean {
  return [
    node.label,
    node.description ?? "",
    node.kind,
  ].some((value) => value.toLocaleLowerCase().includes(query));
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
    view.webview.onDidReceiveMessage((message: ControlsMessage) => {
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
    const sessionUri = document?.uri ?? virtualDocument?.uri;
    const pendingState = sessionUri === undefined ? undefined : this.pendingInitialStates.get(sessionUri.toString());
    if (sessionUri !== undefined) {
      this.pendingInitialStates.delete(sessionUri.toString());
    }
    const session = new ArchinsightWorkbenchEditorSession(
      this.project,
      this.extensionUri,
      this.controls,
      document,
      panel,
      (location, state) => this.openLocation(location, state),
      virtualDocument,
      initialState ?? pendingState,
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
      }
    });
    await session.open();
    void pinActiveArchinsightPreviewTab();
    return session;
  }

  async refreshFromProject(current: LinkedProject | undefined): Promise<void> {
    await Promise.all([...this.sessions].map((session) => session.refreshFromProject(current)));
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
  private state: PreviewState | undefined;
  private view: DiagramView;
  private query: string;
  private environment: string | undefined;
  private disposed = false;
  private applyingEdit = false;
  private renderGeneration = 0;
  private lastSource: string | undefined;
  private webviewReady = false;
  private pendingReveal: vscode.Position | undefined;
  private pngResolve: ((value: Uint8Array) => void) | undefined;
  private pngReject: ((reason?: unknown) => void) | undefined;

  constructor(
    private readonly project: ProjectModel,
    private readonly extensionUri: vscode.Uri,
    private readonly controls: ArchinsightControlsProvider,
    private readonly document: vscode.TextDocument | undefined,
    private readonly panel: vscode.WebviewPanel,
    private readonly openLocation: (location: vscode.Location, state?: DiagramQueryState) => Promise<void>,
    private readonly virtualDocument?: VirtualWorkbenchDocument,
    initialState?: DiagramQueryState,
  ) {
    this.view = initialState?.view ?? "c1";
    this.query = initialState?.query ?? viewQueries.c1;
    this.environment = initialState?.environment;
  }

  currentView(): DiagramView {
    return this.view;
  }

  currentQuery(): string {
    return this.query;
  }

  currentEnvironment(): string | undefined {
    return this.environment;
  }

  isActive(): boolean {
    return this.panel.active;
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
    this.panel.webview.onDidReceiveMessage((message: WorkbenchEditorMessage) => {
      void this.handleMessage(message);
    });
    await this.project.refresh("custom-editor");
  }

  dispose(): void {
    this.disposed = true;
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
    await this.postDiagnostics(current?.diagnostics ?? []);
    if (current === undefined) {
      return;
    }
    if (this.view === "deployment-container") {
      const selection = await chooseDeploymentEnvironment(current, sourceName, this.environment, false);
      this.environment = selection.cancelled ? undefined : selection.environment;
    }
    const hasErrors = current.diagnostics.some((diagnostic) => (diagnostic.level ?? "ERROR") === "ERROR");
    if (hasErrors) {
      this.state = {
        view: this.view,
        query: this.query,
        ...(this.environment === undefined ? {} : { environment: this.environment }),
        contextId: "-",
        sourceName,
        fileName: this.fileName(),
        source,
        error: "Fix linker errors before rendering a diagram.",
      };
      this.panel.title = this.panelTitle(this.state.fileName);
      await this.postPreview(this.state);
      return;
    }
    const generation = ++this.renderGeneration;
    const state = await previewState(current, sourceName, source, this.fileName(), this.view, this.query, this.environment);
    if (generation !== this.renderGeneration || this.disposed) {
      return;
    }
    this.state = state;
    this.panel.title = this.panelTitle(state.fileName);
    await this.postPreview(state);
  }

  async render(
    view: DiagramView,
    query = viewQueries[view],
    forceEnvironmentPicker = false,
    requestedEnvironment: string | undefined = this.environment,
  ): Promise<void> {
    if (view === "deployment-container" && this.project.current !== undefined) {
      const selection = await chooseDeploymentEnvironment(
        this.project.current,
        this.sourceName(this.project.current),
        requestedEnvironment,
        forceEnvironmentPicker,
      );
      if (selection.cancelled) {
        await this.panel.webview.postMessage({ command: "query", view: this.view, query: this.query, environment: this.environment });
        return;
      }
      this.environment = selection.environment;
    }
    this.view = view;
    this.query = query;
    await this.controls.sync(this.view, this.query);
    await this.refreshFromProject(this.project.current);
    await this.panel.webview.postMessage({ command: "query", view: this.view, query: this.query, environment: this.environment });
  }

  private async handleMessage(message: WorkbenchEditorMessage): Promise<void> {
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
      return;
    }
    if (message.command === "render") {
      await this.render(message.view, message.query);
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
      this.view = message.view;
      this.query = message.query;
      await this.controls.focus(this.view, this.query);
      return;
    }
    if (message.command === "png") {
      this.resolvePng(message.dataUrl);
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
    if (message.command === "openDeclaration") {
      await this.openDeclaration(message.declaration);
    }
  }

  private async postSource(): Promise<void> {
    const sourceName = this.sourceName(this.project.current);
    this.lastSource = this.sourceText(this.project.current, sourceName);
    await this.panel.webview.postMessage({
      command: "source",
      source: this.lastSource,
      sourceName,
      fileName: this.fileName(),
      view: this.view,
      query: this.query,
      environment: this.environment,
      queries: viewQueries,
      diagnostics: this.project.current?.diagnostics ?? [],
      symbols: this.project.current?.snapshot ?? coreLanguageSnapshot,
      readOnly: this.isReadOnly(),
    });
  }

  private async postDiagnostics(diagnostics: readonly LanguageDiagnostic[]): Promise<void> {
    await this.panel.webview.postMessage({ command: "diagnostics", diagnostics });
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
    } satisfies WorkbenchEditorIncomingMessage);
  }

  private async complete(requestId: number, sourceName: string, source: string, cursorOffset: number): Promise<void> {
    const current = this.project.current;
    const result = service.complete({
      sourceName,
      source,
      cursorOffset,
      snapshot: current?.snapshot ?? coreLanguageSnapshot,
      indexedIdentifiers: current === undefined ? new Map() : visibleIdentifiersForSource(current.result, sourceName),
      contextIds: current === undefined ? [] : [...new Set(current.result.contexts.map((context) => context.id))],
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
        imported: item.imported,
      })),
    });
  }

  private async openDeclaration(declaration: { readonly source: string; readonly line: number; readonly column: number }): Promise<void> {
    const current = this.project.current;
    if (current === undefined) {
      return;
    }
    const queryState = { view: this.view, query: this.query, environment: this.environment };
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
    } satisfies WorkbenchEditorIncomingMessage);
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

  async download(kind: "source" | "svg" | "png" | "dot"): Promise<void> {
    const state = this.state;
    if (kind === "source") {
      await saveBytes(fileNameWithExtension(this.fileName(), ".ai"), Buffer.from(this.sourceText(this.project.current, this.sourceName(this.project.current)), "utf8"));
      return;
    }
    if (state === undefined) {
      void vscode.window.showWarningMessage("No rendered diagram is available.");
      return;
    }
    if (kind === "svg") {
      if (state.svg === undefined) {
        void vscode.window.showWarningMessage("No rendered SVG is available.");
        return;
      }
      await saveBytes(fileNameWithExtension(state.fileName, ".svg"), Buffer.from(state.svg, "utf8"));
      return;
    }
    if (kind === "dot") {
      if (state.dot === undefined) {
        void vscode.window.showWarningMessage("No rendered DOT is available.");
        return;
      }
      await saveBytes(fileNameWithExtension(state.fileName, ".dot"), Buffer.from(state.dot, "utf8"));
      return;
    }
    if (state.svg === undefined) {
      void vscode.window.showWarningMessage("No rendered diagram is available.");
      return;
    }
    await saveBytes(fileNameWithExtension(state.fileName, ".png"), await this.exportPng(state.svg));
  }

  private async exportPng(svg: string): Promise<Uint8Array> {
    this.pngReject?.(new Error("PNG export was superseded"));
    const result = new Promise<Uint8Array>((resolve, reject) => {
      this.pngResolve = resolve;
      this.pngReject = reject;
    });
    await this.panel.webview.postMessage({ command: "exportPng", svg });
    return result;
  }

  private resolvePng(dataUrl: string): void {
    const data = /^data:image\/png;base64,(.+)$/.exec(dataUrl)?.[1];
    if (data === undefined) {
      this.pngReject?.(new Error("PNG export failed"));
    } else {
      this.pngResolve?.(Buffer.from(data, "base64"));
    }
    this.pngResolve = undefined;
    this.pngReject = undefined;
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
}

interface DeploymentEnvironmentSelection {
  readonly environment?: string;
  readonly cancelled: boolean;
}

async function chooseDeploymentEnvironment(
  current: LinkedProject,
  sourceName: string,
  selected: string | undefined,
  forcePicker: boolean,
): Promise<DeploymentEnvironmentSelection> {
  const context = current.result.contexts.find((candidate) => candidate.sourceIdentity === sourceName);
  const environments = discoverDeploymentEnvironments(current.result, { context: context?.id, tab: sourceName });
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
  private state: PreviewState | undefined;
  private pngResolve: ((value: Uint8Array) => void) | undefined;
  private pngReject: ((reason?: unknown) => void) | undefined;
  private renderGeneration = 0;
  private environment: string | undefined;

  constructor(
    private current: LinkedProject,
    private active: vscode.TextDocument,
    private sourceName: string,
  ) {
  }

  async show(initialView: DiagramView, initialQuery: string): Promise<void> {
    if (initialView === "deployment-container") {
      const selection = await chooseDeploymentEnvironment(this.current, this.sourceName, this.environment, false);
      if (selection.cancelled) {
        return;
      }
      this.environment = selection.environment;
    }
    this.state = await previewState(
      this.current,
      this.sourceName,
      this.sourceText(),
      path.basename(this.active.uri.fsPath),
      initialView,
      initialQuery,
      this.environment,
    );
    this.panel = vscode.window.createWebviewPanel(
      "archinsightPreview",
      `Archinsight: ${this.state.contextId}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    activePreview = this;
    this.panel.onDidDispose(() => {
      if (activePreview === this) {
        activePreview = undefined;
      }
      this.pngReject?.(new Error("Preview closed"));
    });
    this.panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.visible) {
        activePreview = this;
      }
    });
    this.panel.webview.onDidReceiveMessage((message: PreviewMessage) => {
      if (message.command === "ready") {
        void this.postState();
        return;
      }
      if (message.command === "png") {
        this.resolvePng(message.dataUrl);
      }
    });
    this.panel.webview.html = previewHtml(this.panel.webview);
  }

  async render(view: DiagramView, query = viewQueries[view], forceEnvironmentPicker = false): Promise<void> {
    if (this.panel === undefined) {
      return;
    }
    if (view === "deployment-container") {
      const selection = await chooseDeploymentEnvironment(this.current, this.sourceName, this.environment, forceEnvironmentPicker);
      if (selection.cancelled) {
        return;
      }
      this.environment = selection.environment;
    }
    const generation = ++this.renderGeneration;
    const state = await previewState(
      this.current,
      this.sourceName,
      this.sourceText(),
      path.basename(this.active.uri.fsPath),
      view,
      query,
      this.environment,
    );
    if (generation !== this.renderGeneration) {
      return;
    }
    this.state = state;
    this.panel.title = `Archinsight: ${state.contextId}`;
    await this.postState();
  }

  async refreshFromProject(current: LinkedProject | undefined): Promise<void> {
    const state = this.state;
    if (current === undefined || state === undefined || this.panel === undefined) {
      return;
    }
    this.current = current;
    await this.render(state.view, state.query);
  }

  async setActiveDocument(document: vscode.TextDocument): Promise<void> {
    if (this.panel === undefined || !isInside(this.current.root, document.uri)) {
      return;
    }
    const sourceName = sourceNameForUri(this.current.root, document.uri);
    if (sourceName === this.sourceName) {
      return;
    }
    const state = this.state;
    this.active = document;
    this.sourceName = sourceName;
    if (state !== undefined) {
      await this.render(state.view, state.query);
    }
  }

  async editQuery(): Promise<void> {
    const state = this.state;
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

  async download(kind: "source" | "svg" | "png" | "dot"): Promise<void> {
    const state = this.state;
    if (state === undefined) {
      return;
    }
    if (kind === "source") {
      await saveBytes(fileNameWithExtension(state.fileName, ".ai"), Buffer.from(state.source, "utf8"));
      return;
    }
    if (kind === "svg") {
      if (state.svg === undefined) {
        void vscode.window.showWarningMessage("No rendered SVG is available.");
        return;
      }
      await saveBytes(fileNameWithExtension(state.fileName, ".svg"), Buffer.from(state.svg, "utf8"));
      return;
    }
    if (kind === "dot") {
      if (state.dot === undefined) {
        void vscode.window.showWarningMessage("No rendered DOT is available.");
        return;
      }
      await saveBytes(fileNameWithExtension(state.fileName, ".dot"), Buffer.from(state.dot, "utf8"));
      return;
    }
    if (state.svg === undefined || this.panel === undefined) {
      void vscode.window.showWarningMessage("No rendered diagram is available.");
      return;
    }
    await saveBytes(fileNameWithExtension(state.fileName, ".png"), await this.exportPng(state.svg));
  }

  private async postState(): Promise<void> {
    if (this.panel !== undefined && this.state !== undefined) {
      await this.panel.webview.postMessage({ command: "preview", state: this.state });
    }
  }

  private async exportPng(svg: string): Promise<Uint8Array> {
    if (this.panel === undefined) {
      throw new Error("Preview is not open");
    }
    this.pngReject?.(new Error("PNG export was superseded"));
    const result = new Promise<Uint8Array>((resolve, reject) => {
      this.pngResolve = resolve;
      this.pngReject = reject;
    });
    await this.panel.webview.postMessage({ command: "exportPng", svg });
    return result;
  }

  private resolvePng(dataUrl: string): void {
    const data = /^data:image\/png;base64,(.+)$/.exec(dataUrl)?.[1];
    if (data === undefined) {
      this.pngReject?.(new Error("PNG export failed"));
    } else {
      this.pngResolve?.(Buffer.from(data, "base64"));
    }
    this.pngResolve = undefined;
    this.pngReject = undefined;
  }

  private sourceText(): string {
    return this.current.sources.find((item) => item.sourceName === this.sourceName)?.source ?? this.active.getText();
  }
}

async function previewState(
  current: LinkedProject,
  sourceName: string,
  source: string,
  fileName: string,
  view: DiagramView,
  query: string,
  environment?: string,
): Promise<PreviewState> {
  const context = current.result.contexts.find((candidate) => candidate.sourceIdentity === sourceName);
  try {
    if (view === "deployment-container" && environment === undefined) {
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
    const dot = renderGraphviz(current.result, graph, vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? "dark" : "light");
    const svg = await renderSvg(dot);
    output.appendLine("Render finished: diagram rendered successfully");
    return {
      view,
      query,
      ...(environment === undefined ? {} : { environment }),
      contextId: context?.id ?? "-",
      sourceName,
      fileName,
      source,
      dot,
      svg,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`Render failed: ${message}`);
    return {
      view,
      query,
      ...(environment === undefined ? {} : { environment }),
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
  const result = viz.render(dot, { format: "svg", engine: "dot" });
  if (result.status === "failure") {
    throw new Error(result.errors.map((error) => error.message).filter(Boolean).join("\n") || "Graphviz render failed");
  }
  return makeGraphvizBackgroundsTransparent(result.output);
}

function makeGraphvizBackgroundsTransparent(svg: string): string {
  return svg.replace(/<g\b[^>]*\bclass="(graph|cluster)"[^>]*>[\s\S]*?<polygon\b[^>]*>/g, (match, groupClass: string) => {
    const polygonStart = match.lastIndexOf("<polygon");
    if (polygonStart < 0) {
      return match;
    }
    const beforePolygon = match.slice(0, polygonStart);
    const polygon = match.slice(polygonStart);
    const transparentPolygon = groupClass === "graph"
      ? setSvgAttribute(setSvgAttribute(polygon, "fill", "transparent"), "stroke", "transparent")
      : setSvgAttribute(polygon, "fill", "transparent");
    return `${beforePolygon}${transparentPolygon}`;
  });
}

function setSvgAttribute(tag: string, name: string, value: string): string {
  const attribute = new RegExp(`\\s${name}=(["']).*?\\1`);
  if (attribute.test(tag)) {
    return tag.replace(attribute, ` ${name}="${value}"`);
  }
  return tag.replace(/\/?>$/, (end) => ` ${name}="${value}"${end}`);
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

function previewHtml(webview: vscode.Webview): string {
  const nonce = webviewNonce();
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <style>
      body {
        min-width: 0;
        height: 100vh;
        margin: 0;
        background: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
        font-family: var(--vscode-font-family);
      }

      .preview {
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        box-sizing: border-box;
        overflow: auto;
        padding: 16px;
      }

      .preview svg {
        max-width: 100%;
        height: auto;
        display: block;
        margin: 0 auto;
      }

      .error {
        margin: 16px;
        padding: 12px;
        border: 1px solid var(--vscode-inputValidation-errorBorder);
        border-radius: 4px;
        background: var(--vscode-inputValidation-errorBackground);
        color: var(--vscode-inputValidation-errorForeground);
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <main id="preview" class="preview"></main>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const preview = document.getElementById("preview");
      let state;

      window.addEventListener("message", (event) => {
        if (event.data?.command === "preview") {
          state = event.data.state;
          render();
          return;
        }
        if (event.data?.command === "exportPng") {
          void exportPng(event.data.svg);
        }
      });

      function render() {
        if (state?.error !== undefined) {
          preview.innerHTML = "";
          const error = document.createElement("section");
          error.className = "error";
          error.textContent = state.error;
          preview.append(error);
          return;
        }
        preview.innerHTML = state?.svg ?? "";
      }

      async function exportPng(svg) {
        const image = new Image();
        const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || 1;
        canvas.height = image.naturalHeight || 1;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL("image/png");
        vscode.postMessage({ command: "png", dataUrl });
      }

      vscode.postMessage({ command: "ready" });
    </script>
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function webviewNonce(): string {
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
}

function fileNameWithExtension(fileName: string, extension: string): string {
  return fileName.replace(/\.ai$/i, "") + extension;
}

async function saveBytes(fileName: string, content: Uint8Array): Promise<void> {
  const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(fileName) });
  if (uri === undefined) {
    return;
  }
  await vscode.workspace.fs.writeFile(uri, content);
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

async function readWorkspaceSources(root: vscode.Uri): Promise<ProjectSource[]> {
  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(root, "**/*.ai"),
    "{**/node_modules/**,**/.*/**,**/build/**,**/dist/**}",
  );
  const sources = new Map<string, ProjectSource>();
  for (const uri of files.sort((left, right) => left.fsPath.localeCompare(right.fsPath))) {
    const sourceName = sourceNameForUri(root, uri);
    if (isIgnoredSource(sourceName)) {
      continue;
    }
    sources.set(sourceName, {
      sourceName,
      source: Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8"),
    });
  }
  for (const document of vscode.workspace.textDocuments) {
    if (isInsightDocument(document) && isInside(root, document.uri)) {
      const sourceName = sourceNameForUri(root, document.uri);
      if (isIgnoredSource(sourceName)) {
        continue;
      }
      sources.set(sourceName, { sourceName, source: document.getText() });
    }
  }
  return [...sources.values()];
}

function sourceUris(root: vscode.Uri, sources: readonly ProjectSource[]): ReadonlyMap<string, vscode.Uri> {
  return new Map(sources.map((source) => [source.sourceName, vscode.Uri.joinPath(root, ...source.sourceName.split("/"))]));
}

function workspaceRoot(): vscode.Uri | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

function sourceNameForUri(root: vscode.Uri, uri: vscode.Uri): string {
  return path.relative(root.fsPath, uri.fsPath).replaceAll("\\", "/").replace(/^\.\//, "");
}

function isIgnoredSource(sourceName: string): boolean {
  const directories = sourceName.split("/").slice(0, -1);
  return directories.some((directory) => (
    directory.startsWith(".")
    || directory === "node_modules"
    || directory === "build"
    || directory === "dist"
  ));
}

function isInside(root: vscode.Uri, uri: vscode.Uri): boolean {
  if (uri.scheme !== "file") {
    return false;
  }
  const relative = path.relative(root.fsPath, uri.fsPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isInsightDocument(document: vscode.TextDocument): boolean {
  return document.languageId === "insight" || document.uri.fsPath.endsWith(".ai");
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
    identifiers.set(item.alias, { label: item.alias, type: target?.type, imported: true });
  }
  return identifiers;
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

function completionDetail(item: { readonly kind: CompletionKind; readonly imported?: boolean }): string {
  return item.kind === "IDENTIFIER" && item.imported === true ? "imported identifier" : item.kind;
}

function completionSortBucket(kind: CompletionKind): string {
  switch (kind) {
    case "KEYWORD":
      return "0";
    case "CONSTRUCTOR":
      return "1";
    case "OPERATOR":
      return "2";
    case "ATTRIBUTE":
      return "3";
    case "IDENTIFIER":
      return "4";
    case "ENUM_VALUE":
      return "5";
    case "TYPE":
      return "6";
    case "ANNOTATION":
      return "7";
    case "NEWLINE":
      return "8";
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

function semanticTokenModifierBits(modifiers: readonly SemanticTokenModifier[] | undefined): number {
  return (modifiers ?? []).reduce((bits, modifier) => bits | (1 << semanticTokenModifiers.indexOf(modifier)), 0);
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
  const snapshot = project.snapshot;
  const allTypes = [...snapshot.types];
  const allTypesByName = new Map(allTypes.map((type) => [type.name, type]));
  const operatorTypes = new Set(snapshot.operators.map((operator) => operator.ownerType));
  const types = allTypes
    .filter((type) => {
      if (!languageTypeNames.has(type.name)) {
        return true;
      }
      return isOperatorType(type, allTypesByName, operatorTypes)
        ? includeOperators
        : includeLanguageTypes;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const knownTypes = new Set(types.map((type) => type.name));
  const childrenByBase = new Map<string, TypeDefinition[]>();
  for (const type of types) {
    if (type.baseType === undefined || !knownTypes.has(type.baseType)) {
      continue;
    }
    const children = childrenByBase.get(type.baseType) ?? [];
    children.push(type);
    childrenByBase.set(type.baseType, children);
  }
  return types
    .filter((type) => type.baseType === undefined || !knownTypes.has(type.baseType))
    .map((type) => typeNode(project, type, childrenByBase, allTypesByName, operatorTypes));
}

function typeNode(
  project: LinkedProject,
  type: TypeDefinition,
  childrenByBase: ReadonlyMap<string, readonly TypeDefinition[]>,
  allTypesByName: ReadonlyMap<string, TypeDefinition>,
  operatorTypes: ReadonlySet<string>,
): StructureNode {
  const operator = isOperatorType(type, allTypesByName, operatorTypes);
  return {
    label: type.name,
    description: type.baseType === undefined ? undefined : `extends ${type.baseType}`,
    icon: operator ? "symbol-operator" : "symbol-class",
    iconColor: operator ? "symbolIcon.operatorForeground" : "symbolIcon.classForeground",
    kind: "type",
    location: location(project, type.declaration),
    children: (childrenByBase.get(type.name) ?? []).map((child) => typeNode(project, child, childrenByBase, allTypesByName, operatorTypes)),
  };
}

function isOperatorType(
  type: TypeDefinition,
  typeByName: ReadonlyMap<string, TypeDefinition>,
  operatorTypes: ReadonlySet<string>,
): boolean {
  let current: TypeDefinition | undefined = type;
  while (current !== undefined) {
    if (operatorTypes.has(current.name)) {
      return true;
    }
    current = current.baseType === undefined ? undefined : typeByName.get(current.baseType);
  }
  return false;
}

function declarationTree(project: LinkedProject): StructureNode[] {
  const childrenByParent = new Map<string, LinkedElement[]>();
  for (const element of project.result.elements) {
    if (element.anonymous || element.parent === undefined) {
      continue;
    }
    const children = childrenByParent.get(element.parent) ?? [];
    children.push(element);
    childrenByParent.set(element.parent, children);
  }
  const importsBySource = new Map<string, LinkedImport[]>();
  for (const item of project.result.imports) {
    const imports = importsBySource.get(item.sourceIdentity) ?? [];
    imports.push(item);
    importsBySource.set(item.sourceIdentity, imports);
  }
  const elementsById = new Map(project.result.elements.map((element) => [element.id, element]));
  return project.result.contexts.map((context) => ({
    label: context.id,
    description: context.type,
    icon: "symbol-namespace",
    iconColor: "symbolIcon.namespaceForeground",
    kind: "context",
    location: location(project, context.declaration),
    children: [
      ...(importsBySource.get(context.sourceIdentity) ?? []).map((item) => ({
        label: item.alias,
        description: `import ${elementsById.get(item.target)?.type ?? ""}`.trim(),
        icon: "symbol-reference",
        iconColor: "symbolIcon.referenceForeground",
        kind: "import" as const,
        location: location(project, item.declaration),
        children: [],
      })),
      ...project.result.elements
        .filter((element) => element.context === context.id && element.parent === undefined && !element.anonymous)
        .map((element) => declarationNode(project, element, childrenByParent)),
    ],
  }));
}

function declarationNode(
  project: LinkedProject,
  element: LinkedElement,
  childrenByParent: ReadonlyMap<string, readonly LinkedElement[]>,
): StructureNode {
  return {
    label: element.localId,
    description: element.type,
    icon: "symbol-variable",
    iconColor: "symbolIcon.variableForeground",
    kind: "element",
    location: location(project, element.declaration),
    children: (childrenByParent.get(element.id) ?? []).map((child) => declarationNode(project, child, childrenByParent)),
  };
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

function uniqueDiagnostics(diagnostics: readonly LanguageDiagnostic[]): readonly LanguageDiagnostic[] {
  const result: LanguageDiagnostic[] = [];
  const seen = new Set<string>();
  for (const diagnostic of diagnostics) {
    const key = diagnosticKey(diagnostic);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}

function diagnosticKey(diagnostic: LanguageDiagnostic): string {
  return [
    diagnostic.sourceName,
    diagnostic.level ?? "",
    diagnostic.code,
    diagnostic.message,
    diagnostic.line,
    diagnostic.column,
    diagnostic.endLine ?? "",
    diagnostic.endColumn ?? "",
  ].join("\0");
}

function letters(): string[] {
  return "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_".split("");
}
