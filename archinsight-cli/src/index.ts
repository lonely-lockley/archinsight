#!/usr/bin/env node

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import archy from "archy";
import { instance } from "@viz-js/viz";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  coreSources,
  linkProject,
  renderGraphviz,
  selectGraph,
  type LanguageDiagnostic,
  type LanguageSnapshot,
  type LinkedElement,
  type LinkedImport,
  type LinkProjectResult,
  type ProjectSource,
  type QueryScope,
  type RenderGraph,
  type TypeDefinition,
} from "@insight/language";
import { BUILTIN_VIEW_QUERIES, type BuiltinDiagramView } from "./generated/builtin-view-queries.js";
import { version } from "./version.js";

type Command = "link" | "render" | "query" | "structure" | "skill";
type SkillAction = "init";
type SkillTarget = "generic" | "codex" | "claude";
type OutputFormat = "text" | "json";
type RenderFormat = "dot" | "svg" | "json";
type DiagramView = BuiltinDiagramView;

interface ParsedArgs {
  readonly command?: Command;
  readonly skillAction?: SkillAction;
  readonly input?: string;
  readonly context?: string;
  readonly tab?: string;
  readonly view?: DiagramView;
  readonly queryFile?: string;
  readonly output?: string;
  readonly format?: string;
  readonly theme?: string;
  readonly target?: string;
  readonly help: boolean;
  readonly version: boolean;
  readonly force: boolean;
}

interface LoadedProject {
  readonly root: string;
  readonly sources: readonly ProjectSource[];
  readonly snapshot: LanguageSnapshot;
  readonly result: LinkProjectResult;
  readonly diagnostics: readonly LanguageDiagnostic[];
}

interface GeneratedFile {
  readonly path: string;
  readonly content: string;
}

interface SkillPackage {
  readonly target: SkillTarget;
  readonly defaultOutput: string;
  readonly entrypoint: string;
  readonly installedByDefault: boolean;
  readonly files: readonly GeneratedFile[];
}

const hiddenStructureTypes = new Set(["List", "Nothing", "Text", "text"]);
const viewQueries: Record<DiagramView, string> = BUILTIN_VIEW_QUERIES;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.version) {
    process.stdout.write(`${version}\n`);
    return;
  }
  if (args.help || args.command === undefined) {
    process.stdout.write(helpText());
    return;
  }

  switch (args.command) {
    case "link":
      await runLink(args);
      return;
    case "render":
      await runRender(args);
      return;
    case "query":
      await runQuery(args);
      return;
    case "structure":
      await runStructure(args);
      return;
    case "skill":
      await runSkill(args);
      return;
  }
}

async function runLink(args: ParsedArgs): Promise<void> {
  const project = await loadProject(projectPath(args));
  const format = outputFormat(args.format, "text");
  if (format === "json") {
    await writeOutput(args.output, JSON.stringify({
      diagnostics: project.diagnostics,
      summary: diagnosticSummary(project.diagnostics),
    }, null, 2));
    process.stderr.write(linkerFinishedLine(project.diagnostics));
  } else {
    const report = formatDiagnostics(project.diagnostics) + linkerFinishedLine(project.diagnostics);
    if (args.output === undefined || args.output === "-") {
      process.stderr.write(report);
    } else {
      await writeOutput(args.output, report);
      process.stderr.write(linkerFinishedLine(project.diagnostics));
    }
  }
  exitWithDiagnostics(project.diagnostics);
}

async function runRender(args: ParsedArgs): Promise<void> {
  const project = await loadProject(projectPath(args));
  process.stderr.write(formatDiagnostics(project.diagnostics));
  process.stderr.write(linkerFinishedLine(project.diagnostics));
  if (hasErrors(project.diagnostics)) {
    process.stderr.write(renderFinishedLine(false, "diagram was not rendered because the project has errors"));
    process.exitCode = 1;
    return;
  }
  try {
    const graph = await selectedGraph(project, args);
    const dot = renderGraphviz(project.result, graph, args.theme ?? "light");
    const format = renderFormat(args.format, "dot");
    if (format === "dot") {
      await writeOutput(args.output, dot);
      process.stderr.write(renderFinishedLine(true, "diagram rendered successfully"));
      return;
    }
    if (format === "json") {
      await writeOutput(args.output, JSON.stringify({ graph, dot }, null, 2));
      process.stderr.write(renderFinishedLine(true, "diagram rendered successfully"));
      return;
    }
    await writeOutput(args.output, await renderSvg(dot));
    process.stderr.write(renderFinishedLine(true, "diagram rendered successfully"));
  } catch (error) {
    process.stderr.write(renderFinishedLine(false, error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}

async function runQuery(args: ParsedArgs): Promise<void> {
  const project = await loadProject(projectPath(args));
  if (hasErrors(project.diagnostics)) {
    process.stderr.write(formatDiagnostics(project.diagnostics));
    process.exitCode = 1;
    return;
  }
  const graph = await selectedGraph(project, args);
  const format = outputFormat(args.format, "json");
  if (format === "json") {
    await writeOutput(args.output, JSON.stringify(graph, null, 2));
    return;
  }
  await writeOutput(args.output, formatGraph(graph));
}

async function runStructure(args: ParsedArgs): Promise<void> {
  const project = await loadProject(projectPath(args));
  if (hasErrors(project.diagnostics)) {
    process.stderr.write(formatDiagnostics(project.diagnostics));
    process.exitCode = 1;
    return;
  }
  const structure = projectStructure(project.result, project.snapshot);
  const format = outputFormat(args.format, "text");
  if (format === "json") {
    await writeOutput(args.output, JSON.stringify(structure, null, 2));
    return;
  }
  await writeOutput(args.output, formatStructure(structure));
}

async function runSkill(args: ParsedArgs): Promise<void> {
  if (args.skillAction !== "init") {
    throw new CliError("Usage: archinsight skill init [project-dir] [--target generic|codex|claude] [--out dir] [--force]");
  }
  const target = skillTarget(args.target);
  switch (target) {
    case "generic":
      await runSkillInit(args, genericSkillPackage());
      return;
    case "codex":
      await runSkillInit(args, codexSkillPackage());
      return;
    case "claude":
      await runSkillInit(args, claudeSkillPackage());
      return;
  }
}

async function runSkillInit(args: ParsedArgs, skillPackage: SkillPackage): Promise<void> {
  const projectRoot = path.resolve(projectPath(args));
  const usesDefaultOutput = args.output === undefined;
  const outputRoot = path.resolve(projectRoot, args.output ?? skillPackage.defaultOutput);

  if (args.force && await exists(outputRoot)) {
    assertSafeSkillOutputRoot(projectRoot, outputRoot);
    await rm(outputRoot, { recursive: true, force: true });
  }

  for (const file of skillPackage.files) {
    await writeGeneratedFile(path.join(outputRoot, file.path), file.content, args.force);
  }

  process.stdout.write(skillPackageSuccess(projectRoot, outputRoot, skillPackage, usesDefaultOutput));
}

function assertSafeSkillOutputRoot(projectRoot: string, outputRoot: string): void {
  if (outputRoot === path.parse(outputRoot).root || outputRoot === process.cwd() || outputRoot === projectRoot) {
    throw new CliError(`Refusing to delete unsafe skill output directory '${outputRoot}'. Choose a dedicated --out directory.`);
  }
  const projectRelativeToOutput = path.relative(outputRoot, projectRoot);
  if (projectRelativeToOutput !== "" && !projectRelativeToOutput.startsWith("..") && !path.isAbsolute(projectRelativeToOutput)) {
    throw new CliError(`Refusing to delete skill output directory '${outputRoot}' because it contains the project root.`);
  }
}

async function loadProject(input: string): Promise<LoadedProject> {
  const root = path.resolve(input);
  const sources = await readSources(root);
  if (sources.length === 0) {
    throw new CliError(`No .ai sources found under '${input}'`);
  }
  const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
  const result = linkProject({
    snapshot: snapshot.snapshot,
    sources,
  });
  return {
    root,
    sources,
    snapshot: snapshot.snapshot,
    result,
    diagnostics: [...snapshot.diagnostics, ...result.diagnostics],
  };
}

async function selectedGraph(project: LoadedProject, args: ParsedArgs): Promise<RenderGraph> {
  const context = args.context ?? firstContext(project);
  const tab = selectedSource(project, args.tab);
  const scope: QueryScope = { context, tab };
  const query = args.queryFile === undefined
    ? viewQueries[args.view ?? "c1"]
    : await readQueryFile(project.root, args.queryFile);
  return selectGraph(project.result, scope, query);
}

async function readQueryFile(projectRoot: string, queryFile: string): Promise<string> {
  const file = path.isAbsolute(queryFile) ? queryFile : path.resolve(projectRoot, queryFile);
  return readFile(file, "utf8");
}

function projectPath(args: ParsedArgs): string {
  return args.input ?? ".";
}

function firstContext(project: LoadedProject): string {
  const context = project.result.contexts[0]?.id;
  if (context === undefined) {
    throw new CliError("No context found; pass --context explicitly after fixing diagnostics");
  }
  return context;
}

function firstTab(project: LoadedProject): string {
  return project.sources[0]?.sourceName ?? "";
}

function selectedSource(project: LoadedProject, source: string | undefined): string {
  if (source === undefined) {
    return firstTab(project);
  }
  const normalized = normalizeSourceName(project.root, source);
  if (project.sources.some((item) => item.sourceName === normalized)) {
    return normalized;
  }
  throw new CliError(`Source '${source}' is not part of project '${project.root}'`);
}

function normalizeSourceName(root: string, source: string): string {
  const value = path.isAbsolute(source) ? path.relative(root, source) : source;
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

async function readSources(root: string): Promise<ProjectSource[]> {
  const info = await stat(root);
  if (info.isFile()) {
    return [{
      sourceName: path.basename(root),
      source: await readFile(root, "utf8"),
    }];
  }
  if (!info.isDirectory()) {
    throw new CliError(`Path is not a file or directory: ${root}`);
  }
  const files = await sourceFiles(root);
  return Promise.all(files.map(async (file) => ({
    sourceName: path.relative(root, file).split(path.sep).join("/"),
    source: await readFile(file, "utf8"),
  })));
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (isIgnoredSourceDirectory(entry.name)) {
        continue;
      }
      result.push(...await sourceFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".ai")) {
      result.push(entryPath);
    }
  }
  return result.sort((left, right) => left.localeCompare(right));
}

function isIgnoredSourceDirectory(name: string): boolean {
  return name.startsWith(".") || name === "node_modules" || name === "build" || name === "dist";
}

async function renderSvg(dot: string): Promise<string> {
  const viz = await instance();
  const result = viz.render(dot, { format: "svg", engine: "dot" });
  if (result.status === "failure") {
    throw new CliError(result.errors.map((error) => error.message).filter(Boolean).join("\n") || "Graphviz render failed");
  }
  return result.output;
}

function projectStructure(result: LinkProjectResult, snapshot: LanguageSnapshot): StructureTree {
  const childrenByParent = new Map<string, LinkedElement[]>();
  for (const element of result.elements) {
    if (element.anonymous || element.parent === undefined) {
      continue;
    }
    const children = childrenByParent.get(element.parent) ?? [];
    children.push(element);
    childrenByParent.set(element.parent, children);
  }
  const importsBySource = new Map<string, LinkedImport[]>();
  for (const item of result.imports) {
    const imports = importsBySource.get(item.sourceIdentity) ?? [];
    imports.push(item);
    importsBySource.set(item.sourceIdentity, imports);
  }
  const elementsById = new Map(result.elements.map((element) => [element.id, element]));
  return {
    schemaVersion: "project-structure.v1",
    types: buildTypeTree(snapshot),
    contexts: result.contexts.map((context) => ({
      id: context.id,
      kind: "context",
      type: context.type,
      source: context.declaration?.sourceName ?? context.sourceIdentity,
      line: context.declaration?.line ?? 1,
      column: context.declaration?.column ?? 1,
      children: [
        ...(importsBySource.get(context.sourceIdentity) ?? []).map((item) => importNode(item, elementsById)),
        ...elementNodes(
          result.elements.filter((element) => element.context === context.id && element.parent === undefined && !element.anonymous),
          childrenByParent,
        ),
      ],
    })),
  };
}

function buildTypeTree(snapshot: LanguageSnapshot): TypeStructureNode[] {
  const types = snapshot.types
    .filter((type) => !hiddenStructureTypes.has(type.name))
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
    .map((type) => typeNode(type, childrenByBase));
}

function typeNode(type: TypeDefinition, childrenByBase: ReadonlyMap<string, readonly TypeDefinition[]>): TypeStructureNode {
  return {
    id: type.name,
    kind: "type",
    extends: type.baseType,
    children: (childrenByBase.get(type.name) ?? []).map((child) => typeNode(child, childrenByBase)),
  };
}

function elementNodes(elements: readonly LinkedElement[], childrenByParent: ReadonlyMap<string, readonly LinkedElement[]>): StructureNode[] {
  return elements.map((element) => ({
    id: element.localId,
    kind: "element",
    type: element.type,
    source: element.declaration?.sourceName ?? element.sourceIdentity,
    line: element.declaration?.line ?? 1,
    column: element.declaration?.column ?? 1,
    children: elementNodes(childrenByParent.get(element.id) ?? [], childrenByParent),
  }));
}

function importNode(item: LinkedImport, elementsById: ReadonlyMap<string, LinkedElement>): StructureNode {
  return {
    id: item.alias,
    kind: "import",
    type: elementsById.get(item.target)?.type ?? "import",
    source: item.declaration?.sourceName ?? item.sourceIdentity,
    line: item.declaration?.line ?? 1,
    column: item.declaration?.column ?? 1,
    children: [],
  };
}

function formatStructure(structure: StructureTree): string {
  return `${[
    archy({
      label: "types",
      nodes: structure.types.map(typeArchyNode),
    }),
    archy({
      label: "declarations",
      nodes: structure.contexts.map(structureArchyNode),
    }),
  ].join("\n")}\n`;
}

function typeArchyNode(node: TypeStructureNode): ArchyNode {
  return {
    label: node.extends === undefined ? node.id : `${node.id} extends ${node.extends}`,
    nodes: node.children.map(typeArchyNode),
  };
}

function structureArchyNode(node: StructureNode): ArchyNode {
  return {
    label: structureLabel(node),
    nodes: node.children.map(structureArchyNode),
  };
}

function structureLabel(node: StructureNode): string {
  return `${node.kind} ${node.type} ${node.id} (${node.source}:${node.line}:${node.column})`;
}

function formatDiagnostics(diagnostics: readonly LanguageDiagnostic[]): string {
  if (diagnostics.length === 0) {
    return "OK\t-\t-\t0\t0\tNo diagnostics\n";
  }
  return diagnostics.map((diagnostic) => [
    diagnostic.level ?? "ERROR",
    diagnostic.code,
    diagnostic.sourceName,
    String(diagnostic.line),
    String(diagnostic.column),
    diagnostic.message.replaceAll(/\s+/g, " ").trim(),
  ].join("\t")).join("\n") + "\n";
}

function linkerFinishedLine(diagnostics: readonly LanguageDiagnostic[]): string {
  const summary = diagnosticSummary(diagnostics);
  return [
    "INFO",
    "LINKER_FINISHED",
    "-",
    "0",
    "0",
    `Linker finished: errors: ${summary.ERROR}, warnings: ${summary.WARNING}, notes: ${summary.NOTE}`,
  ].join("\t") + "\n";
}

function renderFinishedLine(success: boolean, message: string): string {
  return [
    success ? "INFO" : "ERROR",
    success ? "RENDER_FINISHED" : "RENDER_FAILED",
    "-",
    "0",
    "0",
    success ? "Render finished: diagram rendered successfully" : `Render failed: ${message.replaceAll(/\s+/g, " ").trim()}`,
  ].join("\t") + "\n";
}

function formatGraph(graph: RenderGraph): string {
  return [
    `context\t${graph.context}`,
    `elements\t${Object.keys(graph.elements).length}`,
    `edges\t${graph.edges.length}`,
    `groups\t${graph.groups.length}`,
    "",
  ].join("\n");
}

function diagnosticSummary(diagnostics: readonly LanguageDiagnostic[]): Record<string, number> {
  const summary: Record<string, number> = { ERROR: 0, WARNING: 0, NOTE: 0 };
  for (const diagnostic of diagnostics) {
    summary[diagnostic.level ?? "ERROR"] = (summary[diagnostic.level ?? "ERROR"] ?? 0) + 1;
  }
  return summary;
}

function hasErrors(diagnostics: readonly LanguageDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR");
}

function exitWithDiagnostics(diagnostics: readonly LanguageDiagnostic[]): void {
  process.exitCode = hasErrors(diagnostics) ? 1 : 0;
}

async function writeOutput(file: string | undefined, content: string): Promise<void> {
  if (file === undefined || file === "-") {
    process.stdout.write(content);
    return;
  }
  await mkdir(path.dirname(path.resolve(file)), { recursive: true });
  await writeFile(file, content);
}

async function writeGeneratedFile(file: string, content: string, force: boolean): Promise<void> {
  if (!force && await exists(file)) {
    throw new CliError(`Refusing to overwrite '${file}'. Pass --force to replace generated agent files.`);
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const options: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--version" || arg === "-V") {
      options.version = true;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    const key = optionKey(arg);
    if (key !== undefined) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new CliError(`Option '${arg}' expects a value`);
      }
      options[key] = value;
      index++;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new CliError(`Unknown option '${arg}'`);
    }
    positional.push(arg);
  }
  return {
    command: command(positional[0]),
    skillAction: skillAction(positional[0], positional[1]),
    input: inputPath(positional),
    context: stringOption(options.context),
    tab: stringOption(options.tab),
    view: viewOption(options.view),
    queryFile: stringOption(options.query),
    output: stringOption(options.output),
    format: stringOption(options.format),
    theme: stringOption(options.theme),
    target: stringOption(options.target),
    help: options.help === true,
    version: options.version === true,
    force: options.force === true,
  };
}

function optionKey(arg: string): string | undefined {
  return ({
    "--context": "context",
    "-c": "context",
    "--source": "tab",
    "--tab": "tab",
    "-s": "tab",
    "--view": "view",
    "-v": "view",
    "--query": "query",
    "-q": "query",
    "--out": "output",
    "-o": "output",
    "--format": "format",
    "-f": "format",
    "--theme": "theme",
    "-t": "theme",
    "--target": "target",
  } as Record<string, string | undefined>)[arg];
}

function command(value: string | undefined): Command | undefined {
  if (value === "link" || value === "render" || value === "query" || value === "structure" || value === "skill") {
    return value;
  }
  if (value === undefined) {
    return undefined;
  }
  throw new CliError(`Unknown command '${value}'`);
}

function skillAction(commandValue: string | undefined, value: string | undefined): SkillAction | undefined {
  if (commandValue !== "skill") {
    return undefined;
  }
  if (value === "init") {
    return value;
  }
  if (value === undefined) {
    return undefined;
  }
  throw new CliError(`Unknown skill command '${value}'`);
}

function inputPath(positional: readonly string[]): string | undefined {
  return positional[0] === "skill" ? positional[2] : positional[1];
}

function skillTarget(value: string | undefined): SkillTarget {
  if (value === undefined || value === "generic") {
    return "generic";
  }
  if (value === "codex" || value === "claude") {
    return value;
  }
  throw new CliError(`Unknown skill target '${value}'`);
}

function viewOption(value: unknown): DiagramView | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "c1" || value === "c2" || value === "c3" || value === "c4" || value === "no-filter") {
    return value;
  }
  throw new CliError(`Unknown view '${String(value)}'`);
}

function outputFormat(value: string | undefined, fallback: OutputFormat): OutputFormat {
  if (value === undefined) {
    return fallback;
  }
  if (value === "text" || value === "json") {
    return value;
  }
  throw new CliError(`Unsupported format '${value}'`);
}

function renderFormat(value: string | undefined, fallback: RenderFormat): RenderFormat {
  if (value === undefined) {
    return fallback;
  }
  if (value === "dot" || value === "svg" || value === "json") {
    return value;
  }
  throw new CliError(`Unsupported render format '${value}'`);
}

function stringOption(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function displayPath(from: string, target: string): string {
  const relative = path.relative(from, target);
  if (relative === "") {
    return ".";
  }
  return relative.startsWith("..") || path.isAbsolute(relative) ? target : relative;
}

function helpText(): string {
  return `Archinsight CLI ${version}

Usage:
  archinsight link [project-dir] [--format text|json] [--out file]
  archinsight render [project-dir] -c <context> [-s <source>] [-v c1|c2|c3|c4|no-filter] [-q query.aiq] [-f dot|svg|json] [-o file]
  archinsight query [project-dir] -c <context> [-s <source>] [-v c1|c2|c3|c4|no-filter] [-q query.aiq] [-f text|json] [-o file]
  archinsight structure [project-dir] [--format text|json] [--out file]
  archinsight skill init [project-dir] [--target generic|codex|claude] [--out dir] [--force]

Options:
  project-dir             Project directory to scan recursively, default: current directory.
  -c, --context <id>       Context id for query/render.
  -s, --source <file>      Selected project file for queries using $tab.
      --tab <source>       Backward-compatible alias for --source.
  -v, --view <name>        Built-in view: c1, c2, c3, c4, no-filter.
  -q, --query <file>       Query file; overrides --view.
  -f, --format <format>    Output format.
  -o, --out <file>         Write output to file instead of stdout; for skill init, write the guide directory.
  -t, --theme <theme>      Render theme, default: light.
      --target <target>    Skill target: generic, codex, or claude.
      --force              Delete and recreate the generated skill directory.
  -V, --version            Print version.
  -h, --help               Show help.

Diagnostics text format is TSV:
  level<TAB>code<TAB>source<TAB>line<TAB>column<TAB>message
`;
}

function genericSkillPackage(): SkillPackage {
  return {
    target: "generic",
    defaultOutput: ".archinsight/agent",
    entrypoint: "archinsight.md",
    installedByDefault: false,
    files: [
      {
        path: "archinsight.md",
        content: genericSkillGuide(),
      },
      ...sharedSkillFiles(),
    ],
  };
}

function codexSkillPackage(): SkillPackage {
  return {
    target: "codex",
    defaultOutput: ".codex/skills/archinsight",
    entrypoint: "SKILL.md",
    installedByDefault: true,
    files: [
      {
        path: "SKILL.md",
        content: codexSkillGuide(),
      },
      {
        path: "agents/openai.yaml",
        content: codexOpenAiYaml(),
      },
      ...sharedSkillFiles(),
    ],
  };
}

function claudeSkillPackage(): SkillPackage {
  return {
    target: "claude",
    defaultOutput: ".claude/skills/archinsight",
    entrypoint: "SKILL.md",
    installedByDefault: true,
    files: [
      {
        path: "SKILL.md",
        content: claudeSkillGuide(),
      },
      ...sharedSkillFiles(),
    ],
  };
}

function sharedSkillFiles(): readonly GeneratedFile[] {
  return [
    {
      path: "references/modeling.md",
      content: genericModelingReference(),
    },
    {
      path: "references/syntax.md",
      content: genericSyntaxReference(),
    },
    {
      path: "references/layered-architecture.md",
      content: genericLayeredArchitectureReference(),
    },
    {
      path: "references/c1-context.md",
      content: genericC1ContextReference(),
    },
    {
      path: "references/c2-containers.md",
      content: genericC2ContainersReference(),
    },
    {
      path: "references/c3-components.md",
      content: genericC3ComponentsReference(),
    },
    {
      path: "references/c4-deployment.md",
      content: genericC4DeploymentReference(),
    },
    {
      path: "references/scaling.md",
      content: genericScalingReference(),
    },
    {
      path: "references/project-structure.md",
      content: genericProjectStructureReference(),
    },
    {
      path: "references/core.md",
      content: genericCoreReference(),
    },
    {
      path: "references/validation.md",
      content: genericValidationReference(),
    },
    {
      path: "references/queries.md",
      content: genericQueriesReference(),
    },
    {
      path: "references/query-recipes.md",
      content: genericQueryRecipesReference(),
    },
    {
      path: "examples/layered-architecture.ai",
      content: genericLayeredArchitectureExample(),
    },
    {
      path: "examples/c1-context.ai",
      content: genericC1ContextExample(),
    },
    {
      path: "examples/c2-containers.ai",
      content: genericC2ContainersExample(),
    },
    {
      path: "examples/c3-components.ai",
      content: genericC3ComponentsExample(),
    },
    {
      path: "examples/c4-deployment-framework.ai",
      content: genericC4DeploymentFrameworkExample(),
    },
    {
      path: "examples/c4-deployment-infrastructure.ai",
      content: genericC4DeploymentInfrastructureExample(),
    },
    {
      path: "examples/c4-deployment.ai",
      content: genericC4DeploymentExample(),
    },
    ...genericC4PrivateGatewayExampleFiles(),
    ...genericC4ReplicatedKafkaExampleFiles(),
    {
      path: "examples/c2-containers.aiq",
      content: genericC2QueryExample(),
    },
    {
      path: "examples/builtin-views/no-filter.aiq",
      content: viewQueries["no-filter"],
    },
    {
      path: "examples/builtin-views/c1.aiq",
      content: viewQueries.c1,
    },
    {
      path: "examples/builtin-views/c2.aiq",
      content: viewQueries.c2,
    },
    {
      path: "examples/builtin-views/c3.aiq",
      content: viewQueries.c3,
    },
    {
      path: "examples/builtin-views/c4.aiq",
      content: viewQueries.c4,
    },
    ...coreSkillFiles(),
  ];
}

function coreSkillFiles(): readonly GeneratedFile[] {
  return coreSources.map((source) => ({
    path: `.core/${source.sourceName.replaceAll("\\", "/").replace(/^\.\//, "")}`,
    content: source.source.endsWith("\n") ? source.source : `${source.source}\n`,
  }));
}

function skillPackageSuccess(
  projectRoot: string,
  outputRoot: string,
  skillPackage: SkillPackage,
  usesDefaultOutput: boolean,
): string {
  const lines = [
    `Generated ${skillPackage.target} Archinsight agent guide: ${displayPath(process.cwd(), outputRoot)}`,
    "",
  ];
  if (skillPackage.target === "generic") {
    lines.push("Next steps:");
    lines.push(`  1. Share ${displayPath(projectRoot, path.join(outputRoot, skillPackage.entrypoint))} with your AI agent.`);
    lines.push("  2. Ask the agent to validate Insight edits with: archinsight link . --format text");
    lines.push("  3. Keep project-specific conventions near the generated guide or pass them in the prompt.");
  } else if (skillPackage.installedByDefault && usesDefaultOutput) {
    lines.push(`Notice: restart the ${skillPackage.target} session so the Archinsight skill is discovered.`);
  } else if (skillPackage.target === "codex") {
    lines.push("Next steps:");
    lines.push(`  1. Install or copy ${displayPath(projectRoot, outputRoot)} as the archinsight skill in your Codex skills directory.`);
    lines.push("  2. Invoke it explicitly as $archinsight when editing Insight .ai models.");
    lines.push("  3. Ask Codex to validate Insight edits with: archinsight link . --format text");
  } else {
    lines.push("Next steps:");
    lines.push(`  1. Import or copy ${displayPath(projectRoot, outputRoot)} into your Claude skill runtime.`);
    lines.push("  2. Ask Claude to use the Archinsight skill before editing Insight .ai models.");
    lines.push("  3. Validate Insight edits with: archinsight link . --format text");
  }
  lines.push("");
  return lines.join("\n");
}

function skillTaskModesGuide(): string {
  return `## Task modes

Choose one mode before acting:

- **Analyze:** stay read-only. Inspect sources, run \`structure\`, \`link\`, and
  the relevant query/render, then separate model, linker, query, and layout
  findings with evidence.
- **Repair:** reproduce the defect first. For a visual defect, request the
  current image or rendered output when it is not available. Make the smallest
  model or query change and validate the same path again.
- **Build or rebuild:** perform discovery before editing, then model from the
  outside inward and validate after each architectural layer.
- **Extend or migrate:** inventory existing ids, imports, edges, and view scope;
  preserve stable identities and compare the linked/rendered result before and
  after each focused change.

Before any build, rebuild, or migration edit, inspect the supplied context and
ask one short, non-repetitive discovery message. Ask only for missing facts that
could materially change the model: existing descriptions, diagrams or documents,
unclear boundaries and flows, and relevant deployment constraints. Do not use a
questionnaire or ask about the audience by default. If the request already
answers everything, only invite the user to share any existing artifacts before
proceeding. Use supplied material as the source of truth; do not invent missing
architecture.
`;
}

function genericSkillGuide(): string {
  return `# Archinsight Agent Guide

Use this guide when creating, analyzing, repairing, or migrating Insight \`.ai\`
architecture models.

Insight is its own typed architecture-as-code language. Do not infer its syntax
from YAML, Mermaid, PlantUML, Structurizr, or C4 DSL.

## Required Tool

Use the Archinsight CLI as the validation source of truth:

\`\`\`shell
archinsight --help
archinsight link . --format text
\`\`\`

If \`archinsight\` is not available, ask the user to install or expose
\`@archinsight/cli\` before changing \`.ai\` files.

${skillTaskModesGuide()}

## Workflow

1. Read the existing \`.ai\` files before editing.
2. Preserve indentation and the project's existing naming style.
3. Model architecture from the outside inward: context, external actors/systems,
   systems, containers/services, components, and deployment details.
4. Do not ask about deployment depth until the task touches infrastructure,
   runtime placement, regions, brokers, gateways, storage, or deployment.
5. At that point, decide per system whether pragmatic mixed C2 or clean
   C4/deployment is appropriate. If modeling clean C4: attach placement/storage
   to elements, attach path infrastructure that needs \`$to\` to wires, and make
   pub/sub dependencies consumer-owned.
6. If a diagram becomes noisy, adjust scope/query before changing a correct
   graph model.
7. Prefer small, focused files connected by \`context\`, \`import\`, and \`extend\`.
8. Keep definition/framework files separate from model files that declare
   \`context <id>\`.
9. Validate every Insight change with \`archinsight link . --format text\`.

## References

- Read \`references/modeling.md\` before creating, migrating, or extending a
  model.
- Read \`references/syntax.md\` before writing unfamiliar Insight syntax.
- Read \`references/layered-architecture.md\` when decomposing a system across
  C1/C2/C3/C4-style layers.
- Read \`references/c1-context.md\` when adding or repairing system context
  models: actors, owned systems, external systems, and boundary choices.
- Read \`references/c2-containers.md\` when adding or repairing
  container/service-level C2 models for a selected system.
- Read \`references/c3-components.md\` when adding or repairing component-level
  C3 models for a selected container or service.
- Read \`references/c4-deployment.md\` when adding or repairing deployment/C4
  models, infrastructure inventories, environment-scoped infrastructure, or
  projection rules.
- Read \`references/scaling.md\` when splitting a repository into reusable
  framework, environment, profile, system, or deployment-view files.
- Read \`references/project-structure.md\` before searching for declarations,
  planning imports, or making broad edits.
- Read \`references/core.md\` and \`.core/*.ai\` when checking built-in types,
  attributes, presentations, or projections.
- Read \`references/queries.md\` when writing custom diagram queries or \`.aiq\`
  files.
- Read \`references/query-recipes.md\` when a built-in view hides an expected
  element/edge or needs customization.
- Read \`references/validation.md\` before running checks, structure inspection,
  or rendering.
- Use \`examples/layered-architecture.ai\` as a compact valid model.
`;
}

function codexSkillGuide(): string {
  return `---
name: archinsight
description: Create, edit, migrate, analyze, repair, validate, inspect, and render Archinsight Insight architecture-as-code models. Use when working with .ai Insight files, C4-style architecture models, system/container/component diagrams, deployment projections, or when the user asks to model or diagnose software architecture with Archinsight.
---

# Archinsight

Use this skill when creating, analyzing, repairing, or migrating Insight \`.ai\`
architecture models.

Insight is its own typed architecture-as-code language. Do not infer its syntax
from YAML, Mermaid, PlantUML, Structurizr, or C4 DSL.

## Codex Usage Notes

Treat this \`SKILL.md\` as the entrypoint. Load reference files only when needed:

- Read \`references/modeling.md\` before creating, migrating, or extending a
  model.
- Read \`references/syntax.md\` before writing unfamiliar Insight syntax.
- Read \`references/layered-architecture.md\` before decomposing a system across
  C1/C2/C3/C4-style layers.
- Read \`references/c1-context.md\` before adding or repairing system context
  models: actors, owned systems, external systems, and boundary choices.
- Read \`references/c2-containers.md\` before adding or repairing
  container/service-level C2 models for a selected system.
- Read \`references/c3-components.md\` before adding or repairing component-level
  C3 models for a selected container or service.
- Read \`references/c4-deployment.md\` before adding or repairing deployment/C4
  models, infrastructure inventories, environment-scoped infrastructure, or
  projection rules.
- Read \`references/scaling.md\` before splitting a repository into reusable
  framework, environment, profile, system, or deployment-view files.
- Read \`references/project-structure.md\` before searching for declarations,
  planning imports, or making broad edits.
- Read \`references/core.md\` and \`.core/*.ai\` before assuming available
  constructors, attributes, presentations, or projections.
- Read \`references/queries.md\` before writing custom diagram queries or \`.aiq\`
  files.
- Read \`references/query-recipes.md\` before customizing a built-in view or
  explaining why an expected element/edge is hidden.
- Read \`references/validation.md\` before running checks, structure inspection,
  or rendering commands.

Use Codex shell access to validate changes when available. Do not silently
install global npm packages or change machine configuration. If \`archinsight\`
is missing, ask the user whether they want to install or expose
\`@archinsight/cli\`.

## Required Tool

Use the Archinsight CLI as the validation source of truth:

\`\`\`shell
archinsight --help
archinsight link . --format text
\`\`\`

If \`archinsight\` is not available, ask the user to install or expose
\`@archinsight/cli\` before changing \`.ai\` files.

${skillTaskModesGuide()}

## Workflow

1. Read the existing \`.ai\` files before editing.
2. Preserve indentation and the project's existing naming style.
3. Model architecture from the outside inward: context, external actors/systems,
   systems, containers/services, components, and deployment details.
4. Do not ask about deployment depth until the task touches infrastructure,
   runtime placement, regions, brokers, gateways, storage, or deployment.
5. At that point, decide per system whether pragmatic mixed C2 or clean
   C4/deployment is appropriate. If modeling clean C4: attach placement/storage
   to elements, attach path infrastructure that needs \`$to\` to wires, and make
   pub/sub dependencies consumer-owned.
6. If a diagram becomes noisy, adjust scope/query before changing a correct
   graph model.
7. Prefer small, focused files connected by \`context\`, \`import\`, and \`extend\`.
8. Keep definition/framework files separate from model files that declare
   \`context <id>\`.
9. Use \`archinsight structure . --format text\` before broad edits when the
   project shape is unclear.
10. Validate every Insight change with \`archinsight link . --format text\`.
11. If validation fails, fix the first real syntax/type/linking error before
   adding more model content.

## References

- Read \`references/modeling.md\` before creating, migrating, or extending a
  model.
- Read \`references/syntax.md\` before writing unfamiliar Insight syntax.
- Read \`references/layered-architecture.md\` when decomposing a system across
  C1/C2/C3/C4-style layers.
- Read \`references/c1-context.md\` when adding or repairing system context
  models: actors, owned systems, external systems, and boundary choices.
- Read \`references/c2-containers.md\` when adding or repairing
  container/service-level C2 models for a selected system.
- Read \`references/c3-components.md\` when adding or repairing component-level
  C3 models for a selected container or service.
- Read \`references/c4-deployment.md\` when adding or repairing deployment/C4
  models, infrastructure inventories, environment-scoped infrastructure, or
  projection rules.
- Read \`references/scaling.md\` when splitting a repository into reusable
  framework, environment, profile, system, or deployment-view files.
- Read \`references/project-structure.md\` before searching for declarations,
  planning imports, or making broad edits.
- Read \`references/core.md\` and \`.core/*.ai\` when checking built-in types,
  attributes, presentations, or projections.
- Read \`references/queries.md\` when writing custom diagram queries or \`.aiq\`
  files.
- Read \`references/query-recipes.md\` when a built-in view hides an expected
  element/edge or needs customization.
- Read \`references/validation.md\` before running checks, structure inspection,
  or rendering.
- Use \`examples/layered-architecture.ai\` as a compact valid model.
`;
}

function claudeSkillGuide(): string {
  return `---
name: archinsight
description: Create, edit, migrate, analyze, repair, validate, inspect, and render Archinsight Insight architecture-as-code models. Use when working with .ai Insight files, C4-style architecture models, system/container/component diagrams, deployment projections, or when the user asks to model or diagnose software architecture with Archinsight.
---

# Archinsight

Use this skill when creating, analyzing, repairing, or migrating Insight \`.ai\`
architecture models.

Insight is its own typed architecture-as-code language. Do not infer its syntax
from YAML, Mermaid, PlantUML, Structurizr, or C4 DSL.

## Claude Usage Notes

Treat this \`SKILL.md\` as the entrypoint. Load the reference files only when
they are needed:

- Read \`references/modeling.md\` before creating, migrating, or extending a
  model.
- Read \`references/syntax.md\` before writing unfamiliar Insight syntax.
- Read \`references/layered-architecture.md\` before decomposing a system across
  C1/C2/C3/C4-style layers.
- Read \`references/c1-context.md\` before adding or repairing system context
  models: actors, owned systems, external systems, and boundary choices.
- Read \`references/c2-containers.md\` before adding or repairing
  container/service-level C2 models for a selected system.
- Read \`references/c3-components.md\` before adding or repairing component-level
  C3 models for a selected container or service.
- Read \`references/c4-deployment.md\` before adding or repairing deployment/C4
  models, infrastructure inventories, environment-scoped infrastructure, or
  projection rules.
- Read \`references/scaling.md\` before splitting a repository into reusable
  framework, environment, profile, system, or deployment-view files.
- Read \`references/project-structure.md\` before searching for declarations,
  planning imports, or making broad edits.
- Read \`references/core.md\` and \`.core/*.ai\` before assuming available
  constructors, attributes, presentations, or projections.
- Read \`references/queries.md\` before writing custom diagram queries or \`.aiq\`
  files.
- Read \`references/query-recipes.md\` before customizing a built-in view or
  explaining why an expected element/edge is hidden.
- Read \`references/validation.md\` before asking the user to run validation,
  structure inspection, or rendering commands.

When Claude has direct shell access, run validation yourself. When Claude is
embedded in an editor without shell access, ask the user to run the exact command
and paste the output. Do not silently install npm packages or change machine
configuration.

## Required Tool

Use the Archinsight CLI as the validation source of truth:

\`\`\`shell
archinsight --help
archinsight link . --format text
\`\`\`

If \`archinsight\` is not available in Claude's environment, ask the user to
install or expose \`@archinsight/cli\` before changing \`.ai\` files.

${skillTaskModesGuide()}

## Workflow

1. Read the existing \`.ai\` files before editing.
2. Preserve indentation and the project's existing naming style.
3. Model architecture from the outside inward: context, external actors/systems,
   systems, containers/services, components, and deployment details.
4. Do not ask about deployment depth until the task touches infrastructure,
   runtime placement, regions, brokers, gateways, storage, or deployment.
5. At that point, decide per system whether pragmatic mixed C2 or clean
   C4/deployment is appropriate. If modeling clean C4: attach placement/storage
   to elements, attach path infrastructure that needs \`$to\` to wires, and make
   pub/sub dependencies consumer-owned.
6. If a diagram becomes noisy, adjust scope/query before changing a correct
   graph model.
7. Prefer small, focused files connected by \`context\`, \`import\`, and \`extend\`.
8. Keep definition/framework files separate from model files that declare
   \`context <id>\`.
9. Use \`archinsight structure . --format text\` to inspect the current model
   before broad edits when the CLI is available.
10. Validate every Insight change with \`archinsight link . --format text\` when
   shell access is available; otherwise ask the user to run validation.
11. If validation fails, fix the first real syntax/type/linking error before
   adding more model content.

## Communication

When shell access is unavailable, give the user short copy-pasteable commands:

\`\`\`shell
archinsight link . --format text
archinsight structure . --format text
\`\`\`

If rendering is needed, ask for the context id and source file when they are not
obvious:

\`\`\`shell
archinsight render . -c <context-id> -s <source.ai> -v c2 -f svg -o diagram.svg
\`\`\`

Report diagnostics by source, line, column, and message. Avoid rewriting large
sections of Insight unless the existing layering is already understood.

## References

- Read \`references/modeling.md\` before creating, migrating, or extending a
  model.
- Read \`references/syntax.md\` before writing unfamiliar Insight syntax.
- Read \`references/layered-architecture.md\` when decomposing a system across
  C1/C2/C3/C4-style layers.
- Read \`references/c1-context.md\` when adding or repairing system context
  models: actors, owned systems, external systems, and boundary choices.
- Read \`references/c2-containers.md\` when adding or repairing
  container/service-level C2 models for a selected system.
- Read \`references/c3-components.md\` when adding or repairing component-level
  C3 models for a selected container or service.
- Read \`references/c4-deployment.md\` when adding or repairing deployment/C4
  models, infrastructure inventories, environment-scoped infrastructure, or
  projection rules.
- Read \`references/scaling.md\` when splitting a repository into reusable
  framework, environment, profile, system, or deployment-view files.
- Read \`references/project-structure.md\` before searching for declarations,
  planning imports, or making broad edits.
- Read \`references/core.md\` and \`.core/*.ai\` when checking built-in types,
  attributes, presentations, or projections.
- Read \`references/queries.md\` when writing custom diagram queries or \`.aiq\`
  files.
- Read \`references/query-recipes.md\` when a built-in view hides an expected
  element/edge or needs customization.
- Read \`references/validation.md\` before running checks, structure inspection,
  or rendering.
- Use \`examples/layered-architecture.ai\` as a compact valid model.
`;
}

function codexOpenAiYaml(): string {
  return `interface:
  display_name: "Archinsight"
  short_description: "Work with Insight architecture models"
  default_prompt: "Use $archinsight to model, analyze, repair, or validate Insight architecture-as-code files."

policy:
  allow_implicit_invocation: true
`;
}

function genericModelingReference(): string {
  return `# Modeling Guidance

Insight syntax is small; most mistakes are modeling mistakes. Decide the view
question before changing files.

## Separate Definitions From Model Sources

Keep language/framework definitions separate from graph model files.

- Definition/framework files contain \`define type\`, \`define operator\`,
  \`define presentation\`, \`extend type\`, \`extend enum of\`, and
  \`extend presentation\`.
- Model files declare \`context <id>\` and create graph objects with
  constructors such as \`system\`, \`service\`, \`component\`, \`environment\`,
  or \`deploymentProfile\`.

Do not mix definition declarations and \`context\` declarations in one source
file. Put shared vocabulary in a framework file, then put concrete contexts,
systems, environments, profiles, and links in model files. This keeps schema
changes reviewable and avoids source-level syntax failures.

## Model Source Granularity

Default to one primary owned system per model source file: the system you are
about to detail with containers, services, components, and deployment
relationships. This keeps the selected source file useful as a C2/C3/C4 view
scope and avoids accidental mega-files.

Do not create one file per external actor or external system. Shared external
dependencies are usually better modeled once in a reusable external context, or
in a few external contexts grouped by meaning such as \`external_platforms\`,
\`partners\`, or \`regulators\`. Import those shared declarations from system
files that need them.

If a user asks for deeper splitting, use \`extend <object>\` files for the
detail being extracted. For example, keep the main service file readable and put
large per-service component sets in a small utility subdirectory for that
context.

## Projections Are Bottom-Up

Built-in C1/C2/C3/C4 views are selected from the linked model. They are not
separate diagrams to author by hand.

- C1 is context-oriented and can aggregate lower-level relationships upward.
- C2, C3, and C4 are usually scoped by the selected source file through
  \`--source\` / \`$tab\`.
- A file often has one focal system, container, or deployment slice for the view
  it is meant to render, but the exact scope is determined by the query used for
  visualization.
- Do not try to reconstruct a deeper view from a broader one. C1 carries too
  little information to recreate C2/C3 details.

If an element is missing from a C2/C3/C4 render, first check the query, selected
source file, and relationship level before assuming the model is wrong.

## Keep Relationship Levels Deliberate

Avoid mixing system-level links with leaf-level links in the same view question.
For C2/C3-style views, prefer links between the actual leaves being shown:
containers, services, components, actors, or opaque external systems.

Allowed cross-level links depend on the query and type model. A common C2 pattern
is a current-system container/service linking to an external system. Owned
\`system\` elements are usually aggregate nodes for C1, not C2 leaves.

## Externality Depends on Scope

Do not blindly turn every peer into \`external system\`.

- A system can be external to the current system but still owned in the current
  context.
- A system can be external to the current context, such as a vendor, regulator,
  or platform outside the modeled boundary.
- Reusable outside systems can live in a separate context and be imported where
  needed.
- Imported relationships and the linked model can determine external relations;
  use validation and structure inspection instead of duplicating declarations.

Choose the boundary first: current system, current context, or outside context.
Then choose \`system\`, \`external system\`, or an import.

## Let the Type Tree Decide Nesting

Do not memorize only built-in entity names. Users can extend the language with
custom types.

Use \`archinsight structure . --format text\` and \`.core/*.ai\` to inspect the
type hierarchy:

- \`Context\` contains \`BoundaryElement\`.
- Built-in actors and systems are \`SystemElement\` / \`BoundaryElement\` types,
  so they live at context level.
- Built-in containers/services live under systems because \`System\` declares
  \`List of Container _\`.
- Components live where the relevant container/service type allows them.
- Custom project types can change the available constructors and allowed child
  slots; inspect them before writing.

If a nested declaration fails type checking, fix the type/ownership model rather
than forcing a link or inventing a wrapper element.

## Choose Infrastructure Depth Per System

Do not force every project into C4/deployment on the first pass. Most modeling
work can proceed through C1-C3 without asking about deployment depth. When the
task first touches infrastructure, runtime placement, regions, compute, brokers,
gateways, storage, or deployment, ask the user or infer from the repository
whether the affected system needs a pragmatic mixed C2 view or a clean
C4/deployment model.

Pragmatic mixed C2 is fast: model databases, brokers, gateways, or secret stores
next to services when the user wants a quick single-environment diagram. The
cost is that C2 now mixes logical containers with infrastructure, and C4 is
effectively absent for that system.

Clean C4 keeps C2 logical and moves physical realization into concrete
deployments, context-owned deployment profiles, inventory slots, and projection
rules. This is more work up front, but it supports many-to-many deployment: one
logical service can target several concrete deployments whose infrastructure
differs by stage, region, provider, or organizational boundary.

This choice is per-system, not global. A critical system can use clean C4 while
peripheral systems stay pragmatic in C2. Starting cheap is acceptable, but know
that upgrading mixed C2 infrastructure into clean C4 is a migration, not just an
extra attribute.

## Eventing

Use \`~>\` for asynchronous relationships. Model one async wire per meaningful
topic or event flow between real producer and consumer elements.

For pub/sub, make the dependency consumer-owned:

- The producer/source declares the event topic as part of its contract, but does
  not maintain a manual list of subscribers.
- The consumer declares \`~> producer\` with \`via = <topic>\`, because the
  consumer depends on the producer's event contract.
- To answer "who depends on this event?", query the graph for incoming async
  dependencies instead of editing a subscriber list on the producer.

Do not invent a broker node just to make the diagram look familiar. If the
chosen style is clean C4 and the broker is deployment infrastructure, model it
in deployment/C4. If the chosen style is pragmatic mixed C2, a broker-like node
can be acceptable, but document that the view mixes levels. If the producer or
consumer is not known, leave a gap and report it instead of fabricating an
element.

## No Fabricated Elements

Every element should have a real architectural referent. If a relationship has
no legitimate endpoint in scope, flag the uncertainty and ask for the missing
boundary or owner.
`;
}

function genericSyntaxReference(): string {
  return `# Insight Syntax Reference

## Files and Contexts

Every model starts with a context:

\`\`\`insight
context ecommerce
    name = E-commerce Platform
\`\`\`

Use indentation to define ownership. Children belong to the nearest less-indented
parent.

## Common Elements

Use built-in constructors for C4-style architecture:

\`\`\`insight
external actor customer
    name = Customer
    technology = Web browser

system storefront
    name = Storefront
    technology = SvelteKit, TypeScript

    container web_app
        name = Web app
        technology = SvelteKit

    service catalog_api
        name = Catalog API
        technology = Node.js, PostgreSQL
\`\`\`

Useful built-ins include:

- \`context\` for a bounded architecture model.
- \`external actor\` and \`external system\` for dependencies outside the owned system.
- \`system\` for major systems in a context.
- \`container\` for deployable or executable units.
- \`service\` for backend/container services.
- \`component\` for internals of a selected container or service.

Built-in nesting follows the core type tree, not the English noun. For example,
actors and systems are context-level because their base type is a boundary
element, while containers are allowed under systems because the \`System\` type
declares a container child slot. For custom project types, inspect
\`archinsight structure . --format text\` and \`.core/*.ai\` before nesting.

## Graph Objects and Constructors

Insight models a graph. Each object declaration calls a type constructor and
creates one graph object instance in the current context:

\`\`\`insight
system storefront
    name = Storefront

service checkout_api
    name = Checkout API
\`\`\`

Here \`system\` and \`service\` are constructors; \`storefront\` and
\`checkout_api\` are object ids. Relationships under \`links:\` create graph
edges between existing object ids.

Definition files are different from model files. They declare vocabulary:
\`define type\`, \`define operator\`, \`define presentation\`, \`extend type\`,
\`extend enum of\`, and \`extend presentation\`. Model files usually start with
\`context <id>\` and then create graph object instances with constructors.

Do not mix these source forms in one file. A framework/definitions file should
contain only vocabulary/schema declarations. A model file should declare a
\`context <id>\` and graph object instances. If both are needed, create two
files and validate the whole project.

## Type Definitions and Extensions

Use \`define type\` to create a new graph/value type. Use \`extend type\` to add
attributes or child slots to an existing type. Projection rules belong to
concrete infrastructure instances, not to type definitions.

\`\`\`insight
define type Queue of InfrastructureComponent
    constructor queue

    required Text name

extend type Environment
    Queue queue
\`\`\`

Type extension is a schema merge:

- new attributes and child slots become available everywhere that type is used;
- inherited attributes from base types remain available;
- if a later type extension declares the same attribute name, the later
  declaration wins for that attribute;
- type inheritance still controls assignability and nesting.

Extending the same type more than once is allowed but reported as a warning.
Prefer one definition file for each type's extensions so the effective schema is
easy to inspect and review.

After changing a type definition, run \`archinsight structure . --format text\`
to see the updated type tree and available constructors.

## Attributes

Attributes are named and typed:

\`\`\`insight
name = Checkout API
technology = Kotlin, PostgreSQL
description = Handles cart pricing, order placement, and payment orchestration
\`\`\`

Long text can continue on indented following lines:

\`\`\`insight
description = Handles checkout orchestration and keeps payment provider details
    outside the storefront.
\`\`\`

## Relationships

Put relationships under \`links:\`.

\`\`\`insight
links:
    -> checkout_api
        technology = HTTPS, JSON
        call = POST /checkout
        description = Places an order
    ~> order_events
        technology = Kafka
        via = orders.created
        description = Consumes order events
\`\`\`

\`call\` is singular and belongs to synchronous \`->\` links. \`via\` belongs to
asynchronous \`~>\` links. Do not write \`calls\`.

Use \`from <context-id>\` when linking to an imported element from another
context:

\`\`\`insight
import payments from context external_systems

links:
    -> payments from external_systems
\`\`\`

## Imports and Extensions

Split larger models across files by repeating the context id and extending
existing elements:

\`\`\`insight
context ecommerce

extend service checkout_api
    component payment_adapter
        name = Payment adapter
        technology = HTTP client
\`\`\`

Use imports for elements from another context:

\`\`\`insight
import stripe from context external_systems
\`\`\`

There are three different \`extend\` forms. Do not mix them up:

- \`extend service checkout_api\` extends an existing graph object instance in a
  context. It adds attributes, children, or links to that object.
- \`extend type Environment\` extends the schema/type definition. It adds
  attributes or child slots to the type, not to one object instance.
- \`extend presentation Wire\` extends visual defaults for a type. It updates
  label slots, theme sections, or Graphviz settings for rendering.

Use \`define type\` / \`define presentation\` only when creating new vocabulary.
Use \`extend type\` / \`extend presentation\` when patching existing vocabulary.
Repeating \`define presentation X\` for an existing presentation is a diagnostic
in current Archinsight.

## Comments and Notes

Use \`#\` for ordinary comments when you want to leave guidance for humans or
agents without changing the model:

\`\`\`insight
# This file owns the checkout bounded context.
context checkout

system checkout_platform
    # Keep logical services here; deployment inventory belongs in C4 files.
    name = Checkout Platform
\`\`\`

A \`#\` after an element or relationship line is an inline note. Notes are
stored in the linked graph and can be rendered as note nodes near the element or
edge:

\`\`\`insight
context checkout

system checkout_platform
    name = Checkout Platform

    container api # Public API owned by the checkout team
        name = Checkout API
        links:
            -> payment_gateway # PCI-sensitive request path
                technology = HTTPS
                call = POST /payments

external system payment_gateway
    name = Payment gateway
\`\`\`

Use comments for authoring hints that should stay invisible in diagrams. Use
notes for architecture remarks that should travel with the model and help
readers understand a specific element or relationship.

## Annotations

Annotations decorate the next declaration or relationship. Put each annotation
on its own line immediately before the target:

\`\`\`insight
context fulfillment

system fulfillment_platform
    name = Fulfillment Platform

    @planned
    container fulfillment_adapter
        name = Fulfillment adapter
        links:
            @deprecated(replace after ERP migration)
            ~> legacy_erp # scheduled for removal

external system legacy_erp
    name = Legacy ERP
\`\`\`

Available annotations:

- \`@planned\` marks an element or relationship as planned or not fully
  implemented yet. The default Graphviz renderer highlights it in green.
- \`@deprecated\` marks an element or relationship as legacy or scheduled for
  removal. Add optional text in parentheses when the replacement or reason is
  useful. The default Graphviz renderer highlights it in red.

Annotations can be stacked and are preserved on projected relationships, so a
C4 projection can still show that the original logical relationship was planned
or deprecated. Annotations cannot decorate assignments; use a comment above the
assignment when you only need a local authoring hint.

## Presentation Syntax

A presentation maps model attributes to up to three label slots:
\`header\`, \`subtitle\`, and \`body\`.

\`\`\`insight
extend presentation SyncWire
    header = technology
    subtitle = call
    body = description
\`\`\`

Each slot value is exactly one attribute name declared on the presented type or
one of its descendants. It is not an expression, list, string template, or
concatenation. These are invalid:

\`\`\`insight
body = description via
body = description, via
body = description (via)
\`\`\`

If the same slot is assigned twice in one effective presentation, the last
assignment wins. Slots are not additive, so one slot cannot show both
\`description\` and \`via\` unless the language/renderer later gains a compound
label feature.

## Custom Types

Projects can extend the language with typed vocabulary:

\`\`\`insight
define type Cache of InfrastructureComponent
    constructor cache
\`\`\`

When adding custom types, follow the existing framework files and validate
immediately. Do not invent constructors without checking whether the project
already defines the needed type.
`;
}

function genericLayeredArchitectureReference(): string {
  return `# Modeling Architecture by Layers

Describe architecture from broad intent to implementation detail. Keep every
layer useful on its own.

## C1: System Context

Start with the context, people, owned systems, and external dependencies. Read
\`references/c1-context.md\` before writing a real C1 model.

\`\`\`insight
context ecommerce
    name = E-commerce Platform

external actor customer
    name = Customer
    technology = Web browser
    links:
        -> storefront

external system payment_provider
    name = Payment Provider
    technology = HTTPS API

system storefront
    name = Storefront
    technology = Web app
\`\`\`

At this layer, avoid implementation details. Explain who uses the system and
which external dependencies matter. Whether a peer is an owned \`system\`, an
\`external system\`, or an imported declaration depends on the modeled boundary.

## C2: Containers and Services

Nest deployable units under the owned system. Read
\`references/c2-containers.md\` before writing a real C2 model.

\`\`\`insight
system storefront
    name = Storefront

    container web_app
        name = Web app
        technology = SvelteKit, TypeScript
        links:
            -> checkout_api

    service checkout_api
        name = Checkout API
        technology = Node.js, PostgreSQL
        links:
            -> payment_provider from ecommerce
\`\`\`

Use \`container\` for applications or deployable units. Use \`service\` for
backend services. Add links that explain runtime collaboration. A C2 file often
focuses one system, but the actual visualization scope is set by the query and
the selected source file.

## C3: Components

Put component details in a separate file with \`extend\` when a container or
service becomes interesting enough to decompose. Read
\`references/c3-components.md\` before writing a real C3 model.

\`\`\`insight
context ecommerce

extend service checkout_api
    component order_controller
        name = Order controller
        technology = REST
        responsibility = Accepts checkout requests and returns order status
        links:
            -> payment_client

    component payment_client
        name = Payment client
        technology = HTTP client
        responsibility = Calls the external payment provider
\`\`\`

Components should describe responsibilities, not every class or function.
As with C2, a C3 file often focuses one container or service, but custom queries
can intentionally choose a different scope.

## C4 and Deployment

Use deployment profiles and infrastructure types when physical realization is
important. Read \`references/c4-deployment.md\` before writing a real C4 model.

\`\`\`insight
environment eu
    name = Europe

deployment production
    name = Production
\`\`\`

\`\`\`insight
context application

deploymentProfile production_service
    appliesTo:
        production from eu
\`\`\`

Attach deployment details to systems, containers, services, components, or links
only when they clarify real runtime paths. Prefer attaching deployment to C2
containers/services when possible because C2 is usually the most representative
logical runtime boundary.

C4/deployment files often focus one deployment slice. The rendered scope is
defined by the query, projection selectors, and selected source file.

## Layering Rules

- Model stable concepts first; avoid coding transient implementation details.
- Keep identifiers short, lowercase, and stable.
- Prefer \`name\` for display names and ids for references.
- Use \`description\` for why a thing exists.
- Use \`technology\` for concrete technical choices.
- Use \`responsibility\` for components.
- Split files by layer or subsystem once a file becomes hard to scan.
- Validate after each layer before adding the next.
`;
}

function genericC1ContextReference(): string {
  return `# C1 System Context

Use this reference only for C1 work: modeling a bounded context, its users,
owned systems, external systems, and high-level relationships.

## What C1 Answers

A C1 view answers: "What system are we discussing, who uses it, and which
outside systems does it depend on?"

Do not include containers, services, components, databases, queues, or runtime
nodes unless the project deliberately treats them as context-level systems. C1
is about boundaries and responsibilities, not implementation structure.

## C1 Workflow

1. Name the bounded \`context <id>\`.
2. Add external actors that initiate or consume behavior.
3. Add owned \`system\` declarations inside the modeled boundary.
4. Add \`external system\` declarations for dependencies outside the boundary.
5. Add high-level links that explain business or capability flow.
6. Validate with \`archinsight link . --format text\`.
7. Render with \`archinsight render . -c <context-id> -v c1 -f svg -o c1.svg\`.

## Boundary Choices

Choose the modeled boundary before choosing constructors.

- Use \`system\` for systems owned inside the current context.
- Use \`external system\` for systems outside the current context boundary.
- Use \`external actor\` for people, roles, teams, or external automation that
  interacts with the system from outside.
- Use \`import <id> from context <context-id>\` when a reusable outside system is
  declared in another context.

Externality is relative. A system can be external to the current system but
still owned in the same context. A vendor platform or regulator is usually
external to the context.

## Basic C1 Pattern

\`\`\`insight
context commerce
    name = Commerce Platform

external actor shopper
    name = Shopper
    technology = Browser
    description = Browses products and places orders
    links:
        -> storefront
            description = Shops and checks out

external actor support_agent
    name = Support agent
    technology = Back-office browser
    description = Helps customers investigate orders
    links:
        -> order_admin
            description = Looks up order state and customer communication

external system payment_provider
    name = Payment Provider
    technology = HTTPS API
    description = Authorizes card payments

system storefront
    name = Storefront
    technology = Web application
    description = Lets shoppers browse products and place orders
    links:
        -> payment_provider
            technology = HTTPS
            description = Requests payment authorization

system order_admin
    name = Order Admin
    technology = Internal web application
    description = Lets support staff inspect and manage orders
    links:
        -> storefront
            description = Reads customer order data
\`\`\`

## Owned Peer Pattern

Do not make every peer \`external system\`. If two systems are owned inside the
same architecture boundary, keep both as \`system\` and link them:

\`\`\`insight
context company_platform
    name = Company Platform

system fintech
    name = Fintech
    description = Payment and account capabilities

system compliance
    name = Compliance
    description = Compliance rules, audit, and reporting
    links:
        -> fintech
            description = Reads transactions for screening and reporting
\`\`\`

Here \`fintech\` can be outside the compliance team boundary, but it is not
outside the company platform context. Use the context boundary, not team
ownership alone, to decide \`system\` vs \`external system\`.

## Reusable External Context Pattern

When the same outside dependency appears in many contexts, declare it once and
import it:

\`\`\`insight
context external_platforms

external system stripe
    name = Stripe
    technology = HTTPS API
    description = External payment platform
\`\`\`

\`\`\`insight
context commerce

import stripe from context external_platforms

system storefront
    name = Storefront
    links:
        -> stripe from external_platforms
            technology = HTTPS
            description = Requests payment authorization
\`\`\`

Use imports for shared declarations; do not duplicate the same vendor system in
every context unless the project intentionally wants separate local identities.

## C1 Links

Links should be high-level and readable:

\`\`\`insight
links:
    -> storefront
        description = Places orders
\`\`\`

Add \`technology\`, \`call\`, or \`via\` only when the detail is stable and useful
at context level. Prefer capability language over endpoint trivia.

Use \`~>\` for meaningful asynchronous context flows:

\`\`\`insight
external system analytics_platform
    name = Analytics Platform
    links:
        ~> storefront
            technology = Kafka
            via = order.completed
            description = Consumes completed order events from Storefront
\`\`\`

## What Not To Put In C1

- Internal containers such as \`web_app\`, \`api\`, or \`worker\`.
- Components, classes, packages, screens, handlers, or repositories.
- Databases, queues, pods, nodes, gateways, or regions unless modeled as
  context-level systems.
- Low-level calls between internals.
- Placeholder systems invented only to make the diagram symmetric.

## Common C1 Mistakes

- Treating a peer owned in the same context as \`external system\`.
- Duplicating imported external systems instead of importing the shared
  declaration.
- Adding implementation details that belong to C2/C3/C4.
- Drawing a relationship without naming what capability or dependency it means.
- Choosing constructors before deciding the context boundary.

## Validation Commands

\`\`\`shell
archinsight structure . --format text
archinsight link . --format text
archinsight render . -c commerce -v c1 -f svg -o commerce-c1.svg
\`\`\`

Use \`examples/c1-context.ai\` as a compact valid C1 model when syntax is
unclear.
`;
}

function genericC2ContainersReference(): string {
  return `# C2 Containers and Services

Use this reference only for C2 work: decomposing one selected owned system into
deployable containers, backend services, and their runtime collaborations.

## What C2 Answers

A C2 view answers: "Inside this system, which deployable or executable units
exist, what technologies do they use, and how do they collaborate?"

Prefer one focal system per C2 source file. The built-in C2 view is scoped by
the selected source file, so a C2 file should usually contain the selected
\`system <id>\` declaration or an \`extend system <id>\` block with its
containers/services.

## C2 Purity vs Pragmatic Infrastructure

The clean C2 answer is logical: deployable containers/services and how they
collaborate. In that mode, databases, brokers, gateways, vaults, compute, and
regions belong to C4/deployment.

Archinsight does not force that choice. For a quick or single-environment model,
it is acceptable to put simple infrastructure-like runtime nodes into C2 when
the user wants speed over strict layer separation. Be explicit about the
tradeoff: the C2 view becomes mixed, C4 is not really modeled for that system,
and many-to-many deployment across different environments will not be available
until the model is migrated to clean C4.

Choose this per system. Do not make the whole repository clean or mixed just
because one system needs that style.

## C2 Workflow

1. Run \`archinsight structure . --format text\` to find the exact system id,
   existing containers/services, and external declarations.
2. Create or edit a C2 file in the same \`context <id>\`.
3. Import external systems from other contexts when needed.
4. Add \`container\` declarations for deployable applications or executables.
5. Add \`service\` declarations for backend services or service-like runtime
   units.
6. Add runtime links between containers/services and real external systems.
7. Validate with \`archinsight link . --format text\`.
8. Render with \`archinsight render . -c <context-id> -s <c2-file.ai> -v c2 -f svg -o c2.svg\`.

## File Split Pattern

Keep C1 focused on the system boundary:

\`\`\`insight
context commerce
    name = Commerce Platform

external system payment_provider
    name = Payment Provider
    technology = HTTPS API

system storefront
    name = Storefront
    technology = Commerce system
    description = Lets shoppers browse products and place orders
\`\`\`

Put C2 details in a system file:

\`\`\`insight
context commerce

extend system storefront
    container web_app
        name = Web app
        technology = SvelteKit, TypeScript
        description = Renders product pages and checkout screens
        links:
            -> checkout_api
                technology = HTTPS, JSON
                call = POST /checkout
                description = Starts checkout and shows order status

    service checkout_api
        name = Checkout API
        technology = Kotlin, PostgreSQL
        description = Prices carts, creates orders, and coordinates payment
        links:
            -> payment_provider
                technology = HTTPS
                call = POST /payments/authorizations
                description = Requests payment authorization
\`\`\`

## Frontend and Backend Pattern

Use \`container\` for applications and executables that have an addressable
runtime boundary:

\`\`\`insight
container web_app
    name = Web app
    technology = SvelteKit, TypeScript
    description = Browser-facing application for customers
\`\`\`

Use \`service\` for backend services and service-like runtime units:

\`\`\`insight
service checkout_api
    name = Checkout API
    technology = Kotlin, PostgreSQL
    description = Coordinates checkout and payment authorization
\`\`\`

Do not turn every library, package, or class into a C2 node. Those belong to C3
only when they become stable architectural responsibilities.

## External System Pattern

For an external dependency declared in the same context:

\`\`\`insight
external system payment_provider
    name = Payment Provider
    technology = HTTPS API

system storefront
    name = Storefront

    service checkout_api
        name = Checkout API
        links:
            -> payment_provider
                technology = HTTPS
                call = POST /payments/authorizations
\`\`\`

For a dependency declared in another context, import it:

\`\`\`insight
context commerce

import stripe from context external_platforms

extend system storefront
    service checkout_api
        name = Checkout API
        links:
            -> stripe from external_platforms
                technology = HTTPS
                call = POST /payments/authorizations
\`\`\`

Do not copy an outside system into the current context just to satisfy a link.
Import the real declaration when it is shared.

## Async and Eventing Pattern

Use \`~>\` for meaningful asynchronous dependencies. For pub/sub, declare the
wire on the consumer, pointing at the producer/source whose topic contract it
depends on:

\`\`\`insight
external system analytics_platform
    name = Analytics Platform
    technology = Kafka consumer
    links:
        ~> checkout_api
            technology = Kafka
            via = checkout.completed
            description = Consumes completed checkout events

service checkout_api
    name = Checkout API
    description = Publishes checkout.completed as an event contract
\`\`\`

Do not list consumers under the producer just to answer "who listens to this
topic?" That answer belongs in a query over incoming async dependencies.

Do not add a broker node just to make an event diagram look familiar. In clean
C2, a broker is usually deployment/C4 infrastructure unless the project defines
it as a runtime system or service in the selected view. In pragmatic mixed C2,
adding a broker can be acceptable for a quick view, but it means the diagram is
no longer strictly logical C2.

## C2 Link Details

Use link attributes to make runtime collaboration understandable:

\`\`\`insight
links:
    -> checkout_api
        technology = HTTPS, JSON
        call = POST /checkout
        description = Starts checkout and returns order status
\`\`\`

\`call\` is singular. Use \`via\` for async topics or channels. Keep endpoint
details at C2 only when they clarify the architecture; otherwise use a plain
\`description\`.

## What Not To Put In C2

- Components, classes, handlers, repositories, or UI widgets.
- Deployment nodes, pods, regions, network gateways, or secret stores in clean
  C2. Include them only when the user intentionally wants pragmatic mixed C2 or
  the project models them as C2 runtime systems.
- Database tables and internal schemas.
- One-off scripts or build-time tools unless they are real runtime units.
- Duplicate links already represented at a lower C3 level unless the C2 view is
  intentionally showing the rollup.

## Common C2 Mistakes

- Adding C2 nodes directly under \`context\` instead of under a \`system\`.
- Modeling infrastructure in C2 without deciding that the system is using the
  pragmatic mixed-C2 style.
- Mixing C2 container/service links with C3 component links in the same source
  file without a clear view goal.
- Forgetting \`--source <c2-file.ai>\` when rendering C2.
- Making every peer an \`external system\` instead of deciding whether it is
  owned in the current context.

## Validation Commands

\`\`\`shell
archinsight structure . --format text
archinsight link . --format text
archinsight render . -c commerce -s storefront-containers.ai -v c2 -f svg -o storefront-c2.svg
\`\`\`

Use \`examples/c2-containers.ai\` as a compact valid C2 model when syntax is
unclear.
`;
}

function genericC3ComponentsReference(): string {
  return `# C3 Components

Use this reference only for C3 work: decomposing one selected container or
service into internal components and their collaborations.

## What C3 Answers

A C3 view answers: "Inside this container/service, what named responsibilities
collaborate to deliver its behavior?"

Prefer one focal container or service per C3 source file. The built-in C3 view
is scoped by the selected source file, so the C3 file should usually contain an
\`extend container <id>\` or \`extend service <id>\` block for the focal element.

Do not model every class, function, method, or package. A component should be a
stable architectural responsibility that is useful in a diagram and review.

## C3 Workflow

1. Run \`archinsight structure . --format text\` to find the exact container or
   service id, available constructors, and existing imports.
2. Create or edit a C3 file in the same \`context <id>\`.
3. Import elements from other contexts only when the component links to them.
4. Use \`extend container <id>\` or \`extend service <id>\`.
5. Add \`component\` declarations with \`name\`, \`technology\`, and
   \`responsibility\`.
6. Add links between components and to real external endpoints.
7. Validate with \`archinsight link . --format text\`.
8. Render with \`archinsight render . -c <context-id> -s <c3-file.ai> -v c3 -f svg -o c3.svg\`.

## File Split Pattern

Keep the C2 declaration small:

\`\`\`insight
context commerce
    name = Commerce Platform

external system payment_provider
    name = Payment Provider
    technology = HTTPS API

system storefront
    name = Storefront

    service checkout_api
        name = Checkout API
        technology = Kotlin, PostgreSQL
        description = Handles cart pricing, order placement, and payment orchestration
\`\`\`

Put component details in a C3 file:

\`\`\`insight
context commerce

extend service checkout_api
    component checkout_controller
        name = Checkout controller
        technology = REST controller
        responsibility = Accepts checkout requests and returns order status
        links:
            -> checkout_service

    component checkout_service
        name = Checkout service
        technology = Kotlin
        responsibility = Coordinates pricing, payment authorization, and order creation
        links:
            -> payment_gateway
            -> order_repository

    component payment_gateway
        name = Payment gateway
        technology = HTTP client
        responsibility = Translates internal payment commands to provider API calls
        links:
            -> payment_provider
                technology = HTTPS
                call = POST /payments/authorizations
                description = Authorizes customer payment

    component order_repository
        name = Order repository
        technology = SQL
        responsibility = Persists order state and checkout audit records
\`\`\`

## Frontend Container Pattern

Use C3 for UI responsibilities when the frontend container has distinct
architectural parts:

\`\`\`insight
context commerce

extend container web_app
    component route_shell
        name = Route shell
        technology = SvelteKit routing
        responsibility = Owns route loading, authenticated layout, and page composition
        links:
            -> checkout_page
            -> session_store

    component checkout_page
        name = Checkout page
        technology = Svelte
        responsibility = Collects checkout input and presents order progress
        links:
            -> api_client

    component session_store
        name = Session store
        technology = Browser storage
        responsibility = Keeps current user and session state for client-side decisions

    component api_client
        name = API client
        technology = Fetch, JSON
        responsibility = Wraps backend API calls and maps transport errors to UI state
        links:
            -> checkout_api
                technology = HTTPS, JSON
                call = POST /checkout
\`\`\`

This is useful when frontend structure affects architecture. If the frontend is
only a thin page with no meaningful internal decisions, leave it at C2.

## Backend Service Pattern

Use C3 to separate adapters, orchestration, domain logic, persistence, and
integration boundaries:

\`\`\`insight
context commerce

extend service inventory_api
    component inventory_resource
        name = Inventory resource
        technology = REST
        responsibility = Exposes stock reservations and availability endpoints
        links:
            -> reservation_service

    component reservation_service
        name = Reservation service
        technology = Java
        responsibility = Applies reservation rules and coordinates stock updates
        links:
            -> inventory_policy
            -> reservation_repository

    component inventory_policy
        name = Inventory policy
        technology = Java
        responsibility = Decides whether stock can be promised to an order

    component reservation_repository
        name = Reservation repository
        technology = SQL
        responsibility = Stores reservation state and idempotency keys

    component stock_projection
        name = Stock projection
        technology = Kafka consumer
        responsibility = Maintains a stock read model from reservation events
        links:
            ~> reservation_service
                technology = Kafka
                via = inventory.reserved
                description = Consumes successful reservation events
\`\`\`

Use \`->\` for synchronous calls and \`~>\` for asynchronous flows. Use singular
\`call\` for the synchronous operation and \`via\` for the asynchronous topic,
queue, or channel. For pub/sub, put the async link on the consumer and point it
at the producer/source whose event contract it consumes.

## Imported Boundary Pattern

When a component links to an element from another context, import it and use
\`from <context-id>\` on the link target:

\`\`\`insight
context commerce

import fraud_api from context risk_platform

extend service checkout_api
    component risk_adapter
        name = Risk adapter
        technology = HTTP client
        responsibility = Requests fraud decisions before payment authorization
        links:
            -> fraud_api from risk_platform
                technology = HTTPS
                call = POST /risk/decisions
                description = Requests checkout risk decision
\`\`\`

Do not copy an imported system into the current context just to make the C3
diagram render. Import the real declaration and validate the link.

## Component Naming

Prefer names that reveal responsibility:

- \`checkout_controller\`, \`checkout_service\`, \`payment_gateway\`
- \`reservation_policy\`, \`reservation_repository\`, \`inventory_events\`
- \`route_shell\`, \`checkout_page\`, \`api_client\`

Avoid names that are only implementation trivia:

- \`utils\`, \`helpers\`, \`module1\`, \`manager\`
- individual classes unless the class is the architectural boundary
- framework-generated files or folders

## Responsibility Boundaries

A good C3 component has at least one of these:

- a distinct external adapter;
- a domain or orchestration responsibility;
- a persistence boundary;
- an asynchronous producer or consumer role;
- a security, policy, parsing, rendering, or transformation responsibility;
- a UI composition, state, or backend API boundary that affects architecture.

If a component cannot be described without mentioning code organization only,
leave it out or ask for a more architectural boundary.

## Links in C3

Links should explain runtime collaboration inside the focal container/service.

Use internal component links:

\`\`\`insight
links:
    -> checkout_service
\`\`\`

Add call details when they matter:

\`\`\`insight
links:
    -> payment_gateway
        call = authorize(paymentCommand)
        description = Requests payment authorization
\`\`\`

Use async details for events:

\`\`\`insight
links:
    ~> reservation_service
        via = inventory.reserved
        description = Consumes reservation completion events
\`\`\`

Do not add a broker as a component unless the broker is actually part of the
focal container/service. Shared brokers, queues, gateways, and runtime placement
usually belong to deployment/C4 or infrastructure modeling.

## Common C3 Mistakes

- Writing C3 components under a \`system\` instead of under a container/service
  unless the project type model explicitly allows that.
- Creating one C3 file for every class or package.
- Linking to an external element without importing it when it lives in another
  context.
- Forgetting \`--source <c3-file.ai>\` when rendering C3.
- Mixing C2 container links and C3 component links in one view question.
- Keeping a broad container/service link and an equivalent lower-level component
  link without deciding which level should own the relationship.
- Inventing components to satisfy a diagram shape instead of describing real
  responsibilities.

## Validation Commands

\`\`\`shell
archinsight structure . --format text
archinsight link . --format text
archinsight render . -c commerce -s checkout_components.ai -v c3 -f svg -o checkout-c3.svg
\`\`\`

Use \`examples/c3-components.ai\` as a compact valid C3 model when syntax is
unclear.
`;
}

function genericC4DeploymentReference(): string {
  return `# C4 Deployment and Infrastructure

Use clean C4 when the model must explain where logical elements run and which
physical infrastructure realizes their dependencies. Keep C1-C3 logical;
deployment inventory and projections supply the physical view.

## Model

There are four distinct concepts:

1. \`Environment\` owns one or more named \`Deployment\` objects, such as
   \`test\` and \`production\`.
2. A concrete \`Deployment\` fills infrastructure slots defined by the
   environment type.
3. A context-owned \`DeploymentProfile\` maps logical elements to concrete
   deployments with \`appliesTo\` and supplies reusable \`runsOn\` / \`uses\`
   actions.
4. A logical wire uses only a \`NetworkConnection\` slot. The linker resolves
   that slot in deployments selected by the wire endpoints and applies the
   concrete network instance's projection.

Do not put application deployment profiles in environment inventory files.
Environment files own concrete infrastructure. The application context owns
the profiles that decide where its systems, containers, and services run.

## Framework and inventory

Define the available slots on an environment type:

\`\`\`insight
define type ApplicationEnvironment of Environment
    Compute compute
    Storage storage
    Monitoring observability
    PublicGateway publicGateway
    NetworkConnection network
    Egress egress

define type PublicGateway of NetworkConnection
    constructor publicGateway
    required InfrastructureComponent loadBalancer

define type Egress of NetworkConnection
    constructor egress
\`\`\`

Fill those slots inside concrete deployments:

\`\`\`insight
environment eu
    name = Europe

deployment production
    compute:
        compute kubernetes
            name = Kubernetes

    storage:
        storage postgres
            name = PostgreSQL
            projection:
                source $from originalLink target $this

    publicGateway:
        publicGateway public_edge
            name = Public ingress
            loadBalancer:
                infrastructureComponent load_balancer
                    name = Load balancer
            projection:
                source $from originalLink target loadBalancer
                target loadBalancer connectTo target $to

    network:
        networkConnection service_network
            name = Service network
            projection:
                source $from originalLink target $to
\`\`\`

An explicit object id may differ from the slot name: \`public_edge\` still fills
the \`publicGateway\` slot of \`eu/production\`.

## Context-owned deployment profiles

Declare profiles in the logical context and reference concrete deployments with
the standard anonymous-import syntax:

\`\`\`insight
context shop

deploymentProfile production_service
    appliesTo:
        production from eu
        production from us

    runsOn compute
    uses observability

deploymentProfile test_service
    appliesTo:
        test from eu

    runsOn compute
\`\`\`

\`appliesTo\` is required and contains \`Deployment\` references, not environment
references. The full identity is the pair of environment context and deployment
id. Therefore \`production from eu\` and \`test from eu\` are different targets.

Apply profiles only to logical elements:

\`\`\`insight
service checkout
    name = Checkout
    deployment:
        uses production_service
\`\`\`

Several profiles may be applied to one element only when their concrete
deployment sets are disjoint. Applying two profiles that both contain
\`production from eu\` is an error. Profiles may share the same environment when
they select different deployments, such as \`test\` and \`production\`.

Profile slot actions resolve independently in every concrete deployment from
\`appliesTo\`. A missing \`runsOn compute\` or element-level \`uses storage\` slot
is an error because the selected deployment cannot realize the profile.

Infrastructure is copy-on-write. A plain \`uses storage\` reuses the concrete
deployment instance. Nested overrides create a local clone:

\`\`\`insight
deployment:
    uses production_service
    uses storage
        description = jdbc:postgresql://orders/app
\`\`\`

## Wire deployment

A wire deployment accepts \`uses\` of \`NetworkConnection\` descendants only:

\`\`\`insight
external actor customer
    links:
        -> frontend
            deployment:
                uses publicGateway

service frontend
    deployment:
        uses production_service
    links:
        -> checkout
            deployment:
                uses network
\`\`\`

Do not attach \`DeploymentProfile\`, \`runsOn\`, \`Storage\`, \`Compute\`, or another
non-network infrastructure type to a wire. In particular, ingress, egress,
service-mesh, VPN, and broker paths used by wires must inherit
\`NetworkConnection\`.

For each relevant concrete deployment, the linker checks the requested slot:

- when the deployment provides a compatible network instance, its projection
  is applied to the logical relationship;
- when that deployment does not fill the slot, it is skipped;
- when the slot resolves to a non-network type or several ambiguous values,
  linking fails.

This makes public exposure deployment-specific. A logical user-to-service link
can project through \`publicGateway\` in production and have no physical ingress
path in test without creating a fake wire profile.

Components inherit effective deployments from their nearest deployed logical
ancestor, normally a container or service. Put profiles on independently
deployable C2 elements unless a C3 component truly has distinct placement.

## Projection execution semantics

Projection rules belong to concrete infrastructure instances because paths can
differ between deployments and operator overrides can clone instances. Do not
declare them on infrastructure types.

A projection is activated in one of two contexts:

- element deployment: \`uses\` or \`runsOn\` projects a single logical element;
  \`$from\` is that element and \`$to\` is not available;
- wire deployment: \`uses <network-slot>\` projects one logical relationship;
  \`$from\` and \`$to\` are its logical source and target.

Using \`$to\` in a projection reached from an element is an error. Use an
element projection for dependencies such as service-to-storage:

\`\`\`insight
storage postgres
    projection:
        source $from originalLink target $this
\`\`\`

Use these terms inside a projection:

- \`$from\` and \`$to\`: logical relationship endpoints;
- \`$this\`: the concrete infrastructure instance owning the projection;
- an attribute name such as \`cdn\` or \`loadBalancer\`: the value of that slot
  on \`$this\`. Use the slot name even when the nested object's id is different.

\`originalLink\` and \`connectTo\` have different jobs:

- \`originalLink\` substitutes one physical hop for the original logical
  relationship. On a wire it preserves the logical operator, relationship
  attributes, and annotations; attributes written on the projection rule
  override carried values for that hop.
- \`connectTo\` creates a new physical \`connectTo\` edge. It uses only the
  attributes written on that projection rule; relationship annotations are
  still retained for traceability.

The leading \`source\` or \`target\` on a projection term is its placement on the
logical source or target side. It controls ownership/source scoping; it does not
reverse the edge. The left term is always the physical edge source and the right
term is its target. For example, this line points from the gateway to the
logical caller even though their placements are target and source:

\`\`\`insight
target $this connectTo source $from
\`\`\`

Projection lines are declarative independent edges, not imperative steps. Form
a path by repeating the same term at adjacent ends; branch by using one term in
several rules:

\`\`\`insight
projection:
    source $from originalLink target cdn
    target cdn connectTo target loadBalancer
        technology = HTTPS
    target loadBalancer connectTo target $to
        technology = HTTPS
\`\`\`

This projects an incoming logical wire as \`$from -> cdn -> loadBalancer -> $to\`.
Only the first hop keeps the original logical operator and its attributes.

For a wire, the linker evaluates the union of effective deployments of both
endpoints. An undeployed external actor therefore still uses the target
service's deployments. For each deployment, the named network slot is resolved
and its concrete instance projection is applied; a deployment without that slot
is skipped.

## Diagram scope and scale

Each concrete deployment is an independent physical scope. Profiles from many
systems may refer to the same deployment, producing one shared deployment view.
If several regions are physically identical and separate diagrams add no value,
model one intentional global environment/deployment and record its region list
as project-specific metadata. Large deployment graphs should be narrowed by
query, context, source identity, domain, or team instead of corrupting the model
to make a picture smaller.

## Validation

Run:

\`\`\`shell
archinsight link . --format text
archinsight render . -c <context> -s <source.ai> -v c4 -f svg -o c4.svg
\`\`\`

Treat missing slots, overlapping profile deployments, non-network wire uses,
and ambiguous references as model errors. If a physical arrow is absent, check
the endpoint profiles, their \`appliesTo\` deployments, the requested network
slot, and the concrete instance projection in that order.
`;
}

function genericScalingReference(): string {
  return `# Scaling an Archinsight Repository

Use this reference when a project grows beyond one or two files and you need to
reuse definitions, environments, deployment profiles, or systems without
duplicating them.

## Repository Shape

Prefer one shared framework per repository:

- one definitions/framework area for environment types, custom infrastructure
  types, and presentation tweaks;
- source files grouped by context directories when the repository is large;
- model files that usually focus on one primary owned system being detailed;
- one or more inventory files for concrete \`environment <id>\` instances and
  their env-local infrastructure;
- shared external contexts for external actors and systems reused by many
  systems;
- context-owned deployment profile files that map logical elements to concrete
  deployments;
- wire deployment that names network slots directly, without call profiles.

Do not copy the same environment or infrastructure type definitions into every
system file. Keep concrete inventory in environment files and keep each
application's deployment profiles in its logical context.

## Framework Once, Use Everywhere

A typical deployment framework file contains only shared vocabulary: type
definitions, type extensions, and presentation overrides. Do
not mix \`define type\` / \`extend type\` declarations and \`context\`
declarations in the same source file.

\`\`\`insight
define type PublicGateway of NetworkConnection
    constructor publicGateway
    required InfrastructureComponent cdn
    required InfrastructureComponent loadBalancer

extend type Environment
    Compute compute
    Storage storage
    Broker broker
    PublicGateway publicGateway
    NetworkConnection network
\`\`\`

Concrete environment files contain inventory and instance-level projections:

\`\`\`insight
environment prod_eu
    name = Production EU

deployment production
    compute:
        compute ecs
            name = ECS
            technology = AWS ECS
    broker:
        broker kafka
            name = Kafka
            technology = MSK
            address = kafka.prod.eu.internal
            projection:
                source $from originalLink source $this
                target $to connectTo target $this
\`\`\`

\`\`\`insight
context commerce

deploymentProfile regional_service
    appliesTo:
        production from prod_eu

    runsOn compute
\`\`\`

System files in the same logical context should import the context-owned profile
when it is declared in a different source identity. Wires name compatible
\`NetworkConnection\` slots directly.

## System Files and External Contexts

The default model file is centered on one owned system:

\`\`\`text
commerce/
    checkout.ai
    catalog.ai
    fulfillment.ai
external/
    platforms.ai
    regulators.ai
\`\`\`

\`commerce/checkout.ai\` would declare \`context commerce\`, the
\`system checkout\` focal object, and the containers/services/components needed
to explain checkout. \`commerce/catalog.ai\` would do the same for catalog.

Shared external actors and systems should not be copied into every system file.
Put them in one external context, or a few semantically grouped external
contexts:

\`\`\`insight
context external_platforms

external system stripe
    name = Stripe

external system sendgrid
    name = SendGrid
\`\`\`

Then import them where needed:

\`\`\`insight
context commerce

import stripe from context external_platforms

system checkout
    links:
        -> stripe from external_platforms
\`\`\`

Avoid making a separate file for every external actor or vendor unless the
external dependency itself has substantial reusable structure. A small number of
well-named external contexts gives all repository systems one shared vocabulary
for outside dependencies.

When a system file becomes too large, split details by extending the focal
object in utility subdirectories:

\`\`\`text
commerce/
    checkout.ai
    checkout-components/
        pricing.ai
        payment.ai
        inventory.ai
\`\`\`

Those files should repeat the same \`context commerce\`, explicitly import the
object being extended when it lives in another source file, and use
\`extend service checkout_api\`, \`extend container web_app\`, or another object
extension to add focused details.

## Same-Context Cross-File Imports

Insight resolves unqualified ids in this order: declarations in the same source
file, explicit imports in the same source file, then it reports an error if the
same id exists only in another source file of the same context.

That means splitting one context across files still requires imports:

\`\`\`insight
context services

deploymentProfile eu_service
    appliesTo:
        production from eu
\`\`\`

\`\`\`insight
context services

import eu_service from context services

system checkout
    name = Checkout
    deployment:
        uses eu_service
\`\`\`

This is intentional. If a file is extracted, removed, or not included in the
project, the linker should fail with an explicit identifier/import diagnostic
instead of silently binding to whatever remains in the context.

## Inline from Context

When a relationship target is declared outside the current source file, prefer
an explicit context qualifier on the link target:

\`\`\`insight
context commerce

import payments from context external_systems

system checkout
    name = Checkout
    links:
        -> payments from external_systems
            technology = HTTPS
            call = POST /payments
\`\`\`

The \`import <id> from context <context-id>\` line documents the dependency and
makes the id available for attributes such as profiles and environment slots.
The inline \`from <context-id>\` on a link target states which context owns the
linked element. Use the same pattern for same-context cross-file links when the
source has been split and ambiguity matters:

\`\`\`insight
context services

import inventory_api from context services

system checkout_api
    links:
        -> inventory_api from services
            technology = HTTPS
            call = GET /inventory
\`\`\`

This explicitness is useful during refactors: if the source file holding
\`inventory_api\` disappears, validation points at the missing declaration
instead of creating a hidden dependency on file layout.

## C4 Multi-File Pattern

For C4, keep these responsibilities separate:

- framework file: type extensions, infra constructors, presentation/projection
  definitions;
- environment inventory files: concrete deployments and instance projections;
- logical context files: deployment profiles with \`appliesTo\` references and
  the relationships whose network paths should render.

When rendering C4 with \`-s <source.ai>\`, remember that source/tab scoping is
part of the view. Put the view-driving logical relationships in the selected
source file, or render from the source file that owns those relationships. Keep
imported framework and inventory reusable, but validate the rendered C4 output
after moving traffic relationships across files:

\`\`\`shell
archinsight link . --format text
archinsight render . -c deployment_shop -s c4-deployment.ai -v c4 -f svg -o deployment-c4.svg
\`\`\`

If projected infrastructure edges disappear after a split, first check whether
the selected \`-s\` file still contains the source logical relationship or an
intended imported deployment-view relationship. Do not fix that by duplicating
infrastructure nodes; fix the source selection or the file boundary.

## Practical Workflow

1. Run \`archinsight structure . --format text\`.
2. Identify contexts, source files, and declaration ids before editing.
3. Move shared vocabulary into one framework file.
4. Group model files by context directory when the repository is large.
5. Keep each ordinary system file focused on one owned system being detailed.
6. Put external actors/systems in shared external contexts, not one file per
   external element.
7. Keep concrete deployments in environment files; put deployment profiles in
   the logical context that owns the deployed elements.
8. Add explicit imports for every cross-file dependency, including same-context
   dependencies.
9. Add inline \`from <context-id>\` on relationship targets that live outside
   the current source file.
10. Validate with \`archinsight link . --format text\`.
11. Render important C1/C2/C3/C4 views with explicit \`-c\`, \`-s\`, and \`-v\`
   options.
`;
}

function genericProjectStructureReference(): string {
  return `# Project Structure Workflow

Use \`archinsight structure\` before broad edits, imports, or declaration lookup.
Do not start with raw grep when you need to know what the linked project
contains.

## Source File Classes

Keep source files in one role:

- definition/framework files: \`define type\`, \`define operator\`,
  \`define presentation\`, \`extend type\`, \`extend enum of\`, and
  \`extend presentation\`;
- model files: \`context <id>\`, imports, graph object declarations,
  relationships, environments, and deployment profiles.

Do not mix definition/framework declarations with \`context <id>\` in one file.
When a model needs custom vocabulary, add or edit a framework file first, then
use the resulting constructors and attributes from model files.

## Directory and File Granularity

For larger repositories, group model files by context directory. Inside a
context directory, default to one primary owned system per ordinary model file:
the system that will be detailed by containers, services, components, links, and
deployment information.

External actors and systems are different. Put reusable outside dependencies in
one external context or a few semantically grouped external contexts. Do not
create a separate file for every external actor or vendor unless that external
dependency has real internal structure to model.

If a system needs further splitting, create a utility subdirectory for focused
\`extend <object>\` files, such as per-service component files. Import the
extended object explicitly when it is declared in another source file. Keep the
main system file as the readable entry point.

## Commands

Human-readable overview:

\`\`\`shell
archinsight structure . --format text
\`\`\`

Machine-readable tree:

\`\`\`shell
archinsight structure . --format json
\`\`\`

The structure output includes:

- the type hierarchy, including project-defined custom types;
- context ids;
- declaration ids and resolved types;
- source file, line, and column for each declaration;
- nesting under contexts and parent elements.

## Declaration Lookup

When you need an element for a link or import:

1. Run \`archinsight structure . --format text\`.
2. Find the relevant context and declaration id in the declarations tree.
3. Check the source location shown in parentheses.
4. Open that source file for surrounding attributes and relationships.
5. Validate after editing with \`archinsight link . --format text\`.

Use \`--format json\` when you need exact source locations for many ids or when
the text tree is too large.

## Imports

Before adding an import, find the declaration's context in structure output. A
cross-context link uses the target id and context id:

\`\`\`insight
import payments from context external_systems

links:
    -> payments from external_systems
\`\`\`

Imports are also required when a declaration lives in another source file of the
same context:

\`\`\`insight
context services

import eu_service from context services

system checkout_api
    deployment:
        uses eu_service
\`\`\`

The explicit import is intentional. If the source file that declared
\`eu_service\` is removed or excluded, validation should fail with a clear
missing import/identifier diagnostic instead of depending on hidden file layout.

For links, \`from <context-id>\` on the target is an inline context qualifier:

\`\`\`insight
links:
    -> inventory_api from services
\`\`\`

Use it when the relationship target is owned by another context or another
source file whose context ownership should remain visible at the call site.

Do not guess context ids from filenames. Filenames, context ids, and element ids
can differ.

## Type and Constructor Lookup

The type tree tells you where custom elements can be nested. If a constructor or
attribute is unfamiliar:

1. Inspect \`archinsight structure . --format text\` for project custom types.
2. Inspect \`.core/*.ai\` for built-in types.
3. Validate a small edit before applying the pattern widely.

Use grep only after structure has identified the likely source file or type. Raw
grep is a fallback for surrounding comments and prose, not the source of truth
for project declarations.
`;
}

function genericCoreReference(): string {
  return `# Core Language Sources

The \`.core/*.ai\` files bundled with this skill are the built-in Archinsight type
model. Read them when you need to know available constructors, attributes,
children, presentations, projections, or relationship operators.

Some agent file tools may classify \`.ai\` as Adobe Illustrator binary files and
refuse to open them. If that happens, read the bundled sources through the shell:

\`\`\`shell
cat .core/core_operator.ai
sed -n '1,160p' .core/core_system.ai
\`\`\`

## Reading Types

\`\`\`insight
define type System of SystemElement
    constructor system

    required Text name
    Text technology
    List of Wire links
    List of Container _
\`\`\`

Interpretation:

- \`define type System of SystemElement\` means \`System\` inherits from
  \`SystemElement\`.
- \`constructor system\` means \`system <id>\` is valid syntax for that type.
- \`required Text name\` means \`name = ...\` is required.
- \`Text technology\` means \`technology = ...\` is optional.
- \`List of Wire links\` enables a \`links:\` block whose children are wires.
- \`List of Container _\` means unnamed child containers can be nested here.

Users can define more types in project files. Always inspect project structure
and project framework files before assuming only core constructors exist.

## Built-in Deployment Infrastructure

\`core_deployment.ai\` provides common infrastructure inventory types:

- \`InfrastructureComponent\`: optional \`name\`, \`technology\`,
  \`description\`, plus deployment references.
- \`Storage\` / constructor \`storage\`: for databases, buckets, volumes, and
  other stateful stores.
- \`Broker\` / constructor \`broker\`: for message brokers and event buses;
  adds optional \`address\`.
- \`Compute\` / constructor \`compute\`: for runtimes, clusters, nodes, and
  platforms; adds optional \`address\` and can contain nested infrastructure
  components in a \`components:\` block.
- \`NetworkConnection\` / constructor \`networkConnection\`: for a direct
  network hop that projects \`$from -> $to\` on deployment views.

Extend \`Environment\` with slots for these types, then fill each concrete
\`environment <id>\` with env-local instances.

## Reading Type Extensions

Project files can extend built-in or custom types:

\`\`\`insight
extend type Environment
    Compute compute
    Storage storage
    Broker broker
\`\`\`

Interpretation:

- this changes the \`Environment\` schema, not one concrete environment object;
- every \`environment <id>\` can now contain or reference the added slots;
- existing inherited attributes and child slots remain available;
- later declarations with the same attribute name override that attribute
  definition;
- multiple \`extend type Environment\` blocks are allowed but produce a warning;
- \`archinsight structure . --format text\` is the quickest way to inspect the
  effective type tree after extensions are applied.

Use \`extend service checkout_api\` or another constructor form only when you
intend to extend one graph object instance in a \`context\`. Use \`extend type\`
when you intend to change the available vocabulary/schema for all instances of
that type.

Keep repeated type extensions in one framework/definitions file when possible.
If validation reports \`TYPE_EXTENDED_MULTIPLE_TIMES\`, consolidate the
extensions or confirm with the user that the split is intentional.

## Reading Relationship Operators

Core synchronous and asynchronous links are operators:

\`\`\`insight
define operator Wire of Edge
    Text technology
    Text description
    required Text model
    DeploymentProfile deployment

define operator SyncWire of Wire
    constructor -> Element
        on Element
        model = sync

    Text call

define operator AsyncWire of Wire
    constructor ~> Element
        on Element
        model = async

    Text via
\`\`\`

Interpretation:

- \`->\` creates a synchronous \`SyncWire\`.
- \`~>\` creates an asynchronous \`AsyncWire\`.
- \`technology\`, \`description\`, and \`deployment\` are common wire attributes.
- \`call\` is singular and belongs to \`->\`.
- \`via\` belongs to \`~>\`.
- \`model\` is set by the operator constructor; do not author it manually unless
  the project explicitly uses that convention.

## Reading Presentations

\`\`\`insight
define presentation Element
    header = name
    subtitle = technology
    body = description

    light
        fill = "#438dd5"

    graphviz
        shape = box
\`\`\`

Presentations define durable visual defaults for rendered diagrams:

- \`header\`, \`subtitle\`, and \`body\` map model attributes into labels.
- \`light\` and \`dark\` define theme-specific colors.
- \`graphviz\` carries renderer-specific layout/style hints.

Use \`define presentation X\` once when creating a presentation for a new type.
Use \`extend presentation X\` when changing a built-in or project presentation:

\`\`\`insight
extend presentation AsyncWire
    header = technology
    subtitle = via
    body = description
\`\`\`

Presentation extension is a merge, not a full replacement:

- omitted slots and section properties are inherited from the base type or
  existing presentation;
- assigning the same slot or section property overrides that one value;
- inherited \`graphviz\` settings such as \`style = dashed\` survive unless the
  extension overrides that property;
- repeated \`define presentation X\` is an error in current Archinsight.

Each label slot accepts exactly one attribute name. Do not use expressions,
lists, text templates, or concatenation in \`header\`, \`subtitle\`, or \`body\`.
\`body = description via\`, \`body = description, via\`, and
\`body = description (via)\` mean "look for an attribute with that exact text"
and will fail validation.

The renderer has three label slots: \`header\`, \`subtitle\`, and \`body\`.
If all three are already used, there is no built-in fourth line for additional
metadata. Choose the most important attribute for each slot or ask the user
whether they want a language/rendering change.

Default wire presentations are:

\`\`\`insight
define presentation Wire
    header = technology
    body = description

define presentation SyncWire
    subtitle = call

define presentation AsyncWire
    subtitle = via

    graphviz
        style = dashed
\`\`\`

This means relationship diagrams normally show technology, then \`call\` or
\`via\`, then description. To change that, extend \`Wire\`, \`SyncWire\`, or
\`AsyncWire\` and validate with \`archinsight link . --format text\`.

Do not copy presentation blocks into ordinary model files unless the user is
creating or changing visual vocabulary. Prefer semantic attributes on elements
and links.

## Reading Projections

Projection definitions describe how deployment/runtime information is projected
into renderable graph relationships. Use them when C4/deployment diagrams are
involved or when a query uses projected relationships.

Rules of thumb:

- \`projected\` relationships are derived from model/deployment declarations.
- \`derived\` relationships are rolled up from lower-level links.
- A query decides which projected or derived edges are shown.
- If a projected edge is missing, inspect both the model declarations and the
  query selectors before changing source files.

## Safe Use by Agents

- Read core files as reference material; do not add them to the project model.
- Do not edit generated \`.core/*.ai\` files inside the skill.
- When uncertain about an attribute, validate with \`archinsight link . --format text\`.
- When uncertain about nesting, inspect \`archinsight structure . --format text\`.
`;
}

function genericValidationReference(): string {
  return `# Validation and Inspection

Run validation after every Insight edit:

\`\`\`shell
archinsight --version
archinsight link . --format text
\`\`\`

The text output is TSV:

\`\`\`text
level<TAB>code<TAB>source<TAB>line<TAB>column<TAB>message
\`\`\`

Treat \`ERROR\` as blocking. \`WARNING\` and \`NOTE\` can still be useful design
feedback.

Inspect project structure:

\`\`\`shell
archinsight structure . --format text
archinsight structure . --format json
\`\`\`

Render a diagram when a context id is known:

\`\`\`shell
archinsight render . -c <context-id> -v c1 -f svg -o diagram.svg
archinsight render . -c <context-id> -s <source.ai> -v c2 -f svg -o diagram.svg
archinsight render . -c <context-id> -s <source.ai> -v c3 -f svg -o diagram.svg
archinsight render . -c <context-id> -s <source.ai> -v c4 -f svg -o diagram.svg
\`\`\`

Run a custom query from a file:

\`\`\`shell
archinsight query . -c <context-id> -s <source.ai> -q query.aiq -f text
archinsight render . -c <context-id> -s <source.ai> -q query.aiq -f svg -o diagram.svg
\`\`\`

Useful built-in views:

- \`c1\` for system context.
- \`c2\` for containers/services in the selected source.
- \`c3\` for components in the selected source.
- \`c4\` for deployment-oriented views.
- \`no-filter\` for the full context.

C2, C3, C4, and custom queries often depend on the active file. Pass
\`--source <file>\` / \`-s <file>\` whenever the query uses \`$tab\`; otherwise
the CLI may choose the first source and render a valid but wrong view.

If the CLI is missing, do not silently install it. Ask the user to install or
expose \`@archinsight/cli\`.
`;
}

function genericQueriesReference(): string {
  return `# Insight Query Reference

Insight diagram queries use a small Cypher-style subset evaluated in memory.
Use queries to select which linked model elements and relationships appear in a
diagram.

## CLI Shape

\`\`\`shell
archinsight query . -c <context-id> -s <source.ai> -q query.aiq -f text
archinsight render . -c <context-id> -s <source.ai> -q query.aiq -f svg -o diagram.svg
\`\`\`

The scope variables are:

- \`$context\` - selected context id from \`--context\`.
- \`$tab\` - selected source identity from \`--source\` / \`--tab\`.

Pass \`--source\` when a query uses \`$tab\`.

Path handling:

- \`--source\` / \`-s\` is a source name inside the project and is resolved
  relative to \`project-dir\`.
- \`--query\` / \`-q\` is also resolved relative to \`project-dir\` when it is a
  relative path.

Prefer paths relative to the project root:

\`\`\`shell
archinsight query path/to/project -c shop -s models/storefront.ai -q queries/c2.aiq -f text
\`\`\`

## Query Shape

Supported clauses:

\`\`\`cypher
MATCH ...
OPTIONAL MATCH ...
WHERE ...
GROUP BY ...
RETURN ...
\`\`\`

\`MATCH\` clauses come first. \`GROUP BY\` is optional and appears before
\`RETURN\`. \`RETURN\` must list the aliases that should be rendered.

## Node Patterns

Select all nodes:

\`\`\`cypher
MATCH (element)
WHERE element.context = $context
RETURN element
\`\`\`

Select by type label:

\`\`\`cypher
MATCH (service:Service)
WHERE service.context = $context
RETURN service
\`\`\`

Labels are case-sensitive and match Insight types such as \`System\`,
\`Container\`, \`Service\`, \`Component\`, \`ExternalSystem\`, and
\`DeploymentElement\`.

Use properties in patterns for exact matches:

\`\`\`cypher
MATCH (service:Service {id: 'checkout_api', context: $context})
RETURN service
\`\`\`

## Relationships

Select real relationships:

\`\`\`cypher
MATCH (source)-[link]->(target)
WHERE source.context = $context
RETURN source, link, target
\`\`\`

Use \`OPTIONAL MATCH\` when nodes should still appear even if a relationship is
missing:

\`\`\`cypher
MATCH (container:ContainerElement)
WHERE container.sourceIdentity = $tab
OPTIONAL MATCH (container)-[link]->(target)
RETURN container, link, target
\`\`\`

Relationship aliases must be returned for edges to render.

## Filtering

Supported filters include:

\`\`\`cypher
WHERE node.context = $context
WHERE node.sourceIdentity = $tab
WHERE node IS External
WHERE NOT node IS DeploymentElement
WHERE edge.projected = 'true'
WHERE node.id IN ['api', 'web_app']
WHERE node.technology CONTAINS 'PostgreSQL'
WHERE node.type <> 'Context'
WHERE node.context = $context AND NOT node IS External
\`\`\`

Use single quotes for string literals.

## Relationship Selectors

Relationship selectors are boolean flags inside relationship braces:

\`\`\`cypher
OPTIONAL MATCH (node)-[derivedLink {derived}]->(target)
OPTIONAL MATCH (node)-[projectedLink {projected}]->(target)
OPTIONAL MATCH ROLLUP (node)-[rollupLink {derived}]->(target)
\`\`\`

Use \`{derived}\` for rolled-up edges from child relationships. Use
\`{projected}\` for deployment/projected edges.

## Grouping

\`GROUP BY\` controls diagram clusters. Group by parent for C2/C3 style views:

\`\`\`cypher
MATCH (container:ContainerElement)
WHERE container.sourceIdentity = $tab
OPTIONAL MATCH (container)-[link]->(target)
GROUP BY container.parent
RETURN container, link, target
\`\`\`

For deployment views, grouping by a typed reference attribute is valid:

\`\`\`cypher
MATCH (node:Element)
WHERE node.sourceIdentity = $tab
OPTIONAL MATCH ROLLUP (node)-[projectedLink {projected, sourceIdentity: $tab}]->(target)
GROUP BY node.runsOn
RETURN node, projectedLink, target
\`\`\`

Do not rely on implicit Graphviz clustering. Put grouping in the query when the
diagram needs stable layout.

## Built-In View Patterns

Exact built-in query sources are bundled in:

\`\`\`text
examples/builtin-views/no-filter.aiq
examples/builtin-views/c1.aiq
examples/builtin-views/c2.aiq
examples/builtin-views/c3.aiq
examples/builtin-views/c4.aiq
\`\`\`

C1 usually selects systems in the selected context and rolls lower-level links
up to system-level relationships.

C2 usually selects \`ContainerElement\` nodes in \`$tab\`, returns direct internal
relationships, and includes external systems through optional/rollup matches.

C3 usually starts from \`(container:ContainerElement)-[:CONTAINS]->(component)\`
and returns component relationships.

C4 usually selects deployment and container nodes from \`$tab\`, uses
\`OPTIONAL MATCH ROLLUP\`, and returns projected relationships.

When a built-in view is close but hides the wrong thing, read
\`references/query-recipes.md\`, copy the nearest built-in \`.aiq\`, and change
the filter or grouping deliberately.

## Authoring Rules

- Start from the view question: context, containers, components, or deployment.
- Use domain variable names: \`system\`, \`container\`, \`component\`, \`externalSystem\`.
- Return every node and relationship alias needed for rendering.
- Add \`GROUP BY\` deliberately for diagrams with clusters.
- Validate query files with \`archinsight query\` before rendering.
- Keep custom queries in \`.aiq\` files when they are reused.
`;
}

function genericQueryRecipesReference(): string {
  return `# Query Recipes and Built-In View Customization

Use this reference when a built-in C1/C2/C3/C4 view is close but not quite right:
an expected element is hidden, a relationship is missing, infrastructure is too
noisy, or the diagram needs a different scope.

## Start From Built-In Queries

The generated skill includes exact built-in view queries:

\`\`\`text
examples/builtin-views/no-filter.aiq
examples/builtin-views/c1.aiq
examples/builtin-views/c2.aiq
examples/builtin-views/c3.aiq
examples/builtin-views/c4.aiq
\`\`\`

Before inventing a query from scratch, open the nearest built-in query, copy it
to the project, and make the smallest change.

\`\`\`shell
archinsight query . -c <context-id> -s <source.ai> -q queries/custom.aiq -f text
archinsight render . -c <context-id> -s <source.ai> -q queries/custom.aiq -f svg -o custom.svg
\`\`\`

Use \`references/queries.md\` for syntax details. Use this file for common
customization patterns.

## When To Customize

Write or adjust a \`.aiq\` query when:

- the built-in view hides a node or edge that exists in \`archinsight link\`;
- the source/tab scope is right but the view intentionally filters out a type;
- C4 should include actors, vendors, or a special deployment path;
- the diagram should show only one layer, one flow, or one relationship class;
- grouping needs to change, such as grouping by parent instead of \`runsOn\`.

Do not compensate for a view filter by duplicating model elements. First inspect
the built-in query and decide whether the model or the query owns the behavior.

## Graph Is Not The Picture

The linked model can have correct fan-in to one broker, gateway, load balancer,
producer, or shared runtime node. A crowded diagram means the current view is too
broad or not aggregated enough; it does not automatically mean the model is
wrong.

When the graph is right but the picture is noisy:

- narrow \`-s <source.ai>\` to the file that owns the view;
- copy the nearest \`examples/builtin-views/*.aiq\` query;
- filter to the layer, flow, or relationship class the user asked for;
- change \`GROUP BY\` to cluster by parent, runtime placement, or another useful
  attribute.

Do not duplicate infrastructure or invert dependencies only to make one render
look cleaner.

## Diagnose A Missing Element

1. Validate the model:

\`\`\`shell
archinsight link . --format text
\`\`\`

2. Inspect declarations and source identities:

\`\`\`shell
archinsight structure . --format text
\`\`\`

3. Run the built-in query text explicitly:

\`\`\`shell
archinsight query . -c <context-id> -s <source.ai> -q examples/builtin-views/c4.aiq -f text
\`\`\`

4. Check the query filters:

- \`node.sourceIdentity = $tab\` means the node must be declared in the selected
  source file.
- \`node IS DeploymentElement\` hides actors and ordinary logical elements.
- \`{projected}\` means only derived deployment projection edges are selected.
- \`{derived}\` means only rolled-up relationships are selected.
- \`sourceIdentity: $tab\` on an edge means the relationship/projection must come
  from the selected source.
- The built-in C4 view also returns target-side incoming projection aliases:
  \`incomingProjectedLink\`, \`incomingProjectedSource\`,
  \`incomingProjectedOriginLink\`, and \`incomingProjectedOrigin\`. Keep them when
  the target system owns an ingress gateway.

## Include External Actors In C4

The built-in C4 query focuses on deployment/container nodes. If a deployment
diagram needs the external actor that starts the traffic path, copy
\`examples/builtin-views/c4.aiq\` and widen the node and projected target filters:

\`\`\`cypher
MATCH (node:Element)
WHERE node.sourceIdentity = $tab
  AND (node IS DeploymentElement OR node IS ContainerElement OR node IS Actor)
OPTIONAL MATCH ROLLUP (node)-[projectedLink {projected, sourceIdentity: $tab}]->(projectedTarget:Element)
WHERE projectedTarget IS DeploymentElement
   OR projectedTarget IS ContainerElement
   OR projectedTarget IS External
   OR projectedTarget IS Actor
OPTIONAL MATCH (node)-[directDeploymentLink {sourceIdentity: $tab}]->(directDeploymentTarget:Element)
WHERE node IS DeploymentElement
  AND (directDeploymentTarget IS DeploymentElement OR directDeploymentTarget IS External)
OPTIONAL MATCH (incomingProjectedSource:Element)-[incomingProjectedLink {projected}]->(node)
WHERE (incomingProjectedSource IS DeploymentElement
   OR incomingProjectedSource IS ContainerElement
   OR incomingProjectedSource IS External)
  AND incomingProjectedSource.id <> node.id
OPTIONAL MATCH ROLLUP (incomingProjectedOrigin:Element)-[incomingProjectedOriginLink {projected}]->(incomingProjectedSource)
WHERE (incomingProjectedOrigin IS DeploymentElement
   OR incomingProjectedOrigin IS ContainerElement
   OR incomingProjectedOrigin IS External)
  AND incomingProjectedOrigin.id <> incomingProjectedSource.id
GROUP BY node.runsOn
RETURN node, projectedLink, projectedTarget, directDeploymentLink, directDeploymentTarget, incomingProjectedLink, incomingProjectedSource, incomingProjectedOriginLink, incomingProjectedOrigin
\`\`\`

If the actor is declared in another source file, either render from that source
or relax the \`node.sourceIdentity = $tab\` condition intentionally.

## Show Only Async Flows

Use edge attributes when the question is about relationship kind:

\`\`\`cypher
MATCH (source:Element)-[link]->(target:Element)
WHERE source.context = $context
  AND link.model = 'async'
GROUP BY source.parent
RETURN source, link, target
\`\`\`

This is useful for event-stream, broker, queue, or notification diagrams. Add
\`source.sourceIdentity = $tab\` when the query should stay scoped to one file.

## Hide Deployment Infrastructure

When a C4-oriented source file is too noisy and you only need logical containers
or services, select logical container elements and direct logical relationships:

\`\`\`cypher
MATCH (node:ContainerElement)
WHERE node.sourceIdentity = $tab
OPTIONAL MATCH (node)-[link]->(target:ContainerElement)
GROUP BY node.parent
RETURN node, link, target
\`\`\`

This is intentionally closer to C2 than C4. Use it when deployment annotations
exist in the file but the diagram question is still logical.

## Show Projected Edges Across Split Files

The built-in C4 query restricts projected edges to \`sourceIdentity: $tab\`. That
is usually correct for a focused deployment-view source file, but it can hide
projected edges when traffic relationships were split across files.

Copy \`examples/builtin-views/c4.aiq\` and relax only the projected edge selector:

\`\`\`cypher
MATCH (node:Element)
WHERE node.sourceIdentity = $tab
  AND (node IS DeploymentElement OR node IS ContainerElement)
OPTIONAL MATCH ROLLUP (node)-[projectedLink {projected}]->(projectedTarget:Element)
WHERE projectedTarget IS DeploymentElement
   OR projectedTarget IS ContainerElement
   OR projectedTarget IS External
OPTIONAL MATCH (node)-[directDeploymentLink {sourceIdentity: $tab}]->(directDeploymentTarget:Element)
WHERE node IS DeploymentElement
  AND (directDeploymentTarget IS DeploymentElement OR directDeploymentTarget IS External)
GROUP BY node.runsOn
RETURN node, projectedLink, projectedTarget, directDeploymentLink, directDeploymentTarget
\`\`\`

Use this deliberately. Removing the source filter can bring in projections from
other view files, so validate the result with \`archinsight query\` before
rendering.

## Change Grouping

Grouping controls visual clusters. If C4 grouping by \`runsOn\` is not helpful,
try grouping by parent:

\`\`\`cypher
MATCH (node:Element)
WHERE node.sourceIdentity = $tab
  AND (node IS DeploymentElement OR node IS ContainerElement)
OPTIONAL MATCH ROLLUP (node)-[projectedLink {projected, sourceIdentity: $tab}]->(projectedTarget:Element)
WHERE projectedTarget IS DeploymentElement
   OR projectedTarget IS ContainerElement
   OR projectedTarget IS External
GROUP BY node.parent
RETURN node, projectedLink, projectedTarget
\`\`\`

Use \`GROUP BY node.runsOn\` for deployment placement; use \`GROUP BY node.parent\`
for logical ownership. If you still need target-owned ingress paths, start from
\`examples/builtin-views/c4.aiq\` and change only the \`GROUP BY\` expression so
the incoming projection aliases stay in the \`RETURN\`.

## Working Rule

If a diagram looks wrong but \`archinsight link\` is clean, inspect the selected
source, built-in query, and returned aliases before changing the model. Many
display issues are query scope issues, not schema or linker bugs.
`;
}

function genericLayeredArchitectureExample(): string {
  return `context shop
    name = Shop Platform

external actor shopper
    name = Shopper
    technology = Browser
    description = Browses products and places orders
    links:
        -> storefront

external system payment_provider
    name = Payment Provider
    technology = HTTPS API
    description = Authorizes card payments

system storefront
    name = Storefront
    technology = Web application
    description = Customer-facing commerce experience

    container web_app
        name = Web app
        technology = SvelteKit, TypeScript
        description = Renders product pages and checkout screens
        links:
            -> checkout_api
                technology = HTTPS, JSON
                description = Starts checkout and shows order status

    service checkout_api
        name = Checkout API
        technology = Node.js, PostgreSQL
        description = Prices carts, creates orders, and coordinates payment
        links:
            -> payment_provider
                technology = HTTPS, JSON
                description = Requests payment authorization

        component order_controller
            name = Order controller
            technology = REST
            responsibility = Accepts checkout requests and returns order status
            links:
                -> payment_client

        component payment_client
            name = Payment client
            technology = HTTP client
            responsibility = Calls the payment provider and normalizes errors
`;
}

function genericC1ContextExample(): string {
  return `context customer_portal
    name = Customer Portal

external actor customer
    name = Customer
    technology = Browser, mobile app
    description = Manages account details and service requests
    links:
        -> portal
            description = Views account state and submits requests

external actor support_agent
    name = Support agent
    technology = Back-office browser
    description = Helps customers resolve account and service issues
    links:
        -> service_console
            description = Reviews account state and updates service requests

external system identity_provider
    name = Identity Provider
    technology = OIDC
    description = Authenticates customers and support staff

external system notification_platform
    name = Notification Platform
    technology = Email, SMS
    description = Sends customer notifications

system portal
    name = Portal
    technology = Web application
    description = Customer-facing self-service experience
    links:
        -> identity_provider
            technology = OIDC
            description = Authenticates customers
        -> notification_platform
            technology = HTTPS
            description = Sends request status notifications

system service_console
    name = Service Console
    technology = Internal web application
    description = Support-facing account and request management
    links:
        -> portal
            description = Reads customer account and request state
        -> identity_provider
            technology = OIDC
            description = Authenticates support staff
`;
}

function genericC2ContainersExample(): string {
  return `context fulfillment
    name = Fulfillment Platform

external actor warehouse_operator
    name = Warehouse operator
    technology = Browser
    description = Picks, packs, and ships orders
    links:
        -> warehouse_ui
            description = Processes pick, pack, and ship work

external system carrier_api
    name = Carrier API
    technology = HTTPS API
    description = Books shipments and returns tracking updates

external system notification_platform
    name = Notification Platform
    technology = HTTPS API
    description = Sends shipment notifications to customers

system fulfillment
    name = Fulfillment
    technology = Fulfillment system
    description = Coordinates packing, shipping, and customer shipment updates

    container warehouse_ui
        name = Warehouse UI
        technology = React, TypeScript
        description = Guides warehouse operators through pick, pack, and ship flows
        links:
            -> fulfillment_api
                technology = HTTPS, JSON
                call = POST /shipments
                description = Creates and updates shipment work

    service fulfillment_api
        name = Fulfillment API
        technology = Kotlin, PostgreSQL
        description = Owns fulfillment workflow state and carrier integration
        links:
            -> carrier_api
                technology = HTTPS
                call = POST /labels
                description = Buys shipment labels
            -> notification_worker
                description = Enqueues shipment notification work

    service notification_worker
        name = Notification Worker
        technology = Node.js worker
        description = Sends asynchronous shipment notifications
        links:
            -> notification_platform
                technology = HTTPS
                call = POST /messages
                description = Sends shipment status notifications
`;
}

function genericC3ComponentsExample(): string {
  return `context commerce
    name = Commerce Platform

external actor shopper
    name = Shopper
    technology = Browser
    links:
        -> web_app

external system payment_provider
    name = Payment Provider
    technology = HTTPS API

external system analytics_platform
    name = Analytics Platform
    technology = Kafka consumer
    links:
        ~> checkout_api
            technology = Kafka
            via = checkout.completed
            description = Consumes completed checkout events

system storefront
    name = Storefront
    technology = Commerce system

    container web_app
        name = Web app
        technology = SvelteKit, TypeScript
        description = Presents checkout screens and calls the backend API

        component checkout_page
            name = Checkout page
            technology = Svelte
            responsibility = Collects checkout details and shows order progress
            links:
                -> api_client

        component api_client
            name = API client
            technology = Fetch, JSON
            responsibility = Wraps backend calls and maps transport errors to UI state
            links:
                -> checkout_api
                    technology = HTTPS, JSON
                    call = POST /checkout

    service checkout_api
        name = Checkout API
        technology = Kotlin, PostgreSQL
        description = Prices carts, creates orders, and coordinates payment
        component checkout_controller
            name = Checkout controller
            technology = REST controller
            responsibility = Accepts checkout requests and returns order status
            links:
                -> checkout_service

        component checkout_service
            name = Checkout service
            technology = Kotlin
            responsibility = Coordinates pricing, payment authorization, and order creation
            links:
                -> payment_gateway
                    call = authorize(paymentCommand)
                    description = Requests payment authorization
                -> order_repository

        component payment_gateway
            name = Payment gateway
            technology = HTTP client
            responsibility = Translates internal payment commands to provider API calls
            links:
                -> payment_provider
                    technology = HTTPS
                    call = POST /payments/authorizations
                    description = Authorizes customer payment

        component order_repository
            name = Order repository
            technology = SQL
            responsibility = Stores order state and checkout audit records

        component checkout_projection
            name = Checkout projection
            technology = Kafka consumer
            responsibility = Maintains an internal checkout read model from events
            links:
                ~> checkout_service
                    technology = Kafka
                    via = checkout.completed
                    description = Consumes checkout completion events
`;
}

function genericC4DeploymentFrameworkExample(): string {
  return `extend type Environment
    ServiceProvider cloud
    Compute compute
    Storage storage
    Monitoring observability
    PublicGateway publicGateway
    NetworkConnection network
    Egress egress

define type ServiceProvider of InfrastructureComponent
    constructor serviceProvider

define type PublicGateway of NetworkConnection
    constructor publicGateway
    required InfrastructureComponent cdn
    required InfrastructureComponent loadBalancer

define type Egress of NetworkConnection
    constructor egress

define type Monitoring of InfrastructureComponent
    constructor monitoring
    required InfrastructureComponent display
`;
}

function genericC4DeploymentInfrastructureExample(): string {
  return `environment eu
    name = Europe

deployment production
    cloud:
        serviceProvider aws
            name = AWS

    compute:
        compute kubernetes
            name = Kubernetes
            runsOn:
                aws

    storage:
        storage postgres
            name = PostgreSQL
            runsOn:
                aws
            projection:
                source $from originalLink target $this

    publicGateway:
        publicGateway public_edge
            name = Public ingress
            cdn:
                infrastructureComponent cloudfront
                    name = CloudFront
                    runsOn:
                        aws
            loadBalancer:
                infrastructureComponent alb
                    name = Application Load Balancer
                    runsOn:
                        aws
            projection:
                source $from originalLink target cdn
                target cdn connectTo target loadBalancer
                    technology = HTTPS
                target loadBalancer connectTo target $to
                    technology = HTTPS

    network:
        networkConnection service_network
            name = Service network
            runsOn:
                kubernetes
            projection:
                source $from originalLink target $to

    egress:
        egress outbound
            name = Outbound network
            runsOn:
                kubernetes
            projection:
                source $from originalLink target $to

    observability:
        monitoring telemetry
            name = OpenTelemetry Collector
            runsOn:
                kubernetes
            display:
                infrastructureComponent grafana
                    name = Grafana Cloud
            projection:
                target $this connectTo source $from
                target $this connectTo target display
`;
}

function genericC4DeploymentExample(): string {
  return `context deployment_shop
    name = Deployment Shop

deploymentProfile production_service
    appliesTo:
        production from eu

    runsOn compute
    uses observability

deploymentProfile production_stateful_service
    appliesTo:
        production from eu

    runsOn compute
    uses storage
    uses observability

external actor shopper
    name = Shopper
    technology = Browser
    links:
        -> web_app
            deployment:
                uses publicGateway

external system payment_provider
    name = Payment Provider
    technology = HTTPS API

system storefront
    name = Storefront

    container web_app
        name = Web app
        technology = SvelteKit
        deployment:
            uses production_service
        links:
            -> checkout_api
                deployment:
                    uses network

    service checkout_api
        name = Checkout API
        technology = Kotlin, PostgreSQL
        deployment:
            uses production_stateful_service
        links:
            -> payment_provider
                deployment:
                    uses egress
`;
}

function genericC4PrivateGatewayExampleFiles(): readonly GeneratedFile[] {
  return [
    {
      path: "examples/c4-private-gateway/deployment-framework.ai",
      content: `define type PrivateGateway of NetworkConnection
    constructor privateGateway

define type DirectNetwork of NetworkConnection
    constructor directNetwork

define type PrivateGatewayEnvironment of Environment
    Compute compute
    DirectNetwork network
    PrivateGateway privateGateway
`,
    },
    {
      path: "examples/c4-private-gateway/source-infra.ai",
      content: `environment source_env
    name = Source Environment

deployment production
    compute:
        name = Source Compute

    network:
        name = Source Network
        projection:
            source $from originalLink target $to
`,
    },
    {
      path: "examples/c4-private-gateway/target-infra.ai",
      content: `environment target_env
    name = Target Environment

deployment production
    compute:
        name = Target Compute

    privateGateway:
        name = Target Private Gateway
        projection:
            source $from originalLink target $this
            target $this connectTo target $to
                technology = HTTPS
`,
    },
    {
      path: "examples/c4-private-gateway/source-system.ai",
      content: `context services

import target from context services
import payment from context external

deploymentProfile source_profile
    appliesTo:
        production from source_env

    runsOn compute

system source_system
    name = Source System

    service caller
        name = Caller
        deployment:
            uses source_profile
        links:
            -> target from services
                technology = HTTPS
                call = GET /private
                deployment:
                    uses privateGateway
            -> payment from external
                technology = HTTPS
                deployment:
                    uses network
`,
    },
    {
      path: "examples/c4-private-gateway/target-system.ai",
      content: `context services

deploymentProfile target_profile
    appliesTo:
        production from target_env

    runsOn compute

system target_system
    name = Target System

    service target
        name = Target
        deployment:
            uses target_profile
`,
    },
    {
      path: "examples/c4-private-gateway/external.ai",
      content: `context external

external system payment
    name = Payment Provider
`,
    },
  ];
}

function genericC4ReplicatedKafkaExampleFiles(): readonly GeneratedFile[] {
  return [
    {
      path: "examples/c4-replicated-kafka/deployment-framework.ai",
      content: `define type ReplicatedBroker of NetworkConnection
    constructor replicatedBroker
    required InfrastructureComponent peer

define type ReplicatedBrokerEnvironment of Environment
    Compute compute
    ReplicatedBroker broker
`,
    },
    {
      path: "examples/c4-replicated-kafka/env-c.ai",
      content: `environment env_c
    name = Environment C

deployment production
    compute:
        name = Compute C

    broker:
        replicatedBroker kafka_c
            name = Kafka C
            technology = Kafka
            peer:
                kafka_d from env_d
            projection:
                source $from originalLink target $this
                target $this replicateFrom target peer
                target peer connectTo target $to
`,
    },
    {
      path: "examples/c4-replicated-kafka/env-d.ai",
      content: `environment env_d
    name = Environment D

deployment production
    compute:
        name = Compute D

    broker:
        replicatedBroker kafka_d
            name = Kafka D
            technology = Kafka
            peer:
                kafka_c from env_c
            projection:
                source $from originalLink target $this
                target $this replicateFrom target peer
                target peer connectTo target $to
`,
    },
    {
      path: "examples/c4-replicated-kafka/c.ai",
      content: `context system_c

import d from context system_d

deploymentProfile c_profile
    appliesTo:
        production from env_c

    runsOn compute

system c
    name = System C
    deployment:
        uses c_profile
    links:
        ~> d
            technology = Kafka
            via = c.events
            deployment:
                uses broker
`,
    },
    {
      path: "examples/c4-replicated-kafka/d.ai",
      content: `context system_d

import c from context system_c

deploymentProfile d_profile
    appliesTo:
        production from env_d

    runsOn compute

system d
    name = System D
    deployment:
        uses d_profile
    links:
        ~> c
            technology = Kafka
            via = d.events
            deployment:
                uses broker
`,
    },
  ];
}

function genericC2QueryExample(): string {
  return `MATCH (container:ContainerElement)
WHERE container.sourceIdentity = $tab
OPTIONAL MATCH (container)-[internalLink]->(targetContainer:ContainerElement)
OPTIONAL MATCH (container)-[outboundLink]->(externalSystem:SystemElement)
WHERE externalSystem IS External
OPTIONAL MATCH (sourceSystem:SystemElement)-[inboundLink]->(container)
WHERE sourceSystem IS External
GROUP BY container.parent
RETURN container, internalLink, targetContainer, outboundLink, externalSystem, inboundLink, sourceSystem
`;
}

interface StructureTree {
  readonly schemaVersion: "project-structure.v1";
  readonly types: readonly TypeStructureNode[];
  readonly contexts: readonly StructureNode[];
}

interface TypeStructureNode {
  readonly id: string;
  readonly kind: "type";
  readonly extends?: string;
  readonly children: readonly TypeStructureNode[];
}

interface StructureNode {
  readonly id: string;
  readonly kind: string;
  readonly type: string;
  readonly source: string;
  readonly line: number;
  readonly column: number;
  readonly children: readonly StructureNode[];
}

interface ArchyNode {
  readonly label: string;
  readonly nodes: ArchyNode[];
}

class CliError extends Error {
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`ERROR\tCLI\t-\t0\t0\t${message.replaceAll(/\s+/g, " ").trim()}\n`);
  process.exitCode = 1;
});
