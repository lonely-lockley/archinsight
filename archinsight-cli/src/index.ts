#!/usr/bin/env node

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import archy from "archy";
import { instance } from "@viz-js/viz";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
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
import { version } from "./version.js";

type Command = "link" | "render" | "query" | "structure" | "skill";
type SkillAction = "init";
type SkillTarget = "generic" | "codex" | "claude";
type OutputFormat = "text" | "json";
type RenderFormat = "dot" | "svg" | "json";
type DiagramView = "c1" | "c2" | "c3" | "c4" | "no-filter";

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

const noFilterQuery = `MATCH (element)
WHERE element.context = $context
OPTIONAL MATCH (element)-[link]->(targetElement)
GROUP BY element.parent
RETURN element, link, targetElement`;

const c1Query = `MATCH (system:SystemElement)
WHERE system.context = $context
OPTIONAL MATCH (system)-[realOutboundLink]->(externalSystem:SystemElement)
OPTIONAL MATCH (sourceSystem:SystemElement)-[realInboundLink]->(system)
OPTIONAL MATCH (system)-[rollupOutboundLink {derived}]->(rollupSystem:SystemElement)
OPTIONAL MATCH (rollupSourceSystem:SystemElement)-[rollupInboundLink {derived}]->(system)
GROUP BY system.parent
RETURN system, realOutboundLink, externalSystem, realInboundLink, sourceSystem, rollupOutboundLink, rollupSystem, rollupInboundLink, rollupSourceSystem`;

const c2Query = `MATCH (container:ContainerElement)
WHERE container.sourceIdentity = $tab
OPTIONAL MATCH (container)-[internalLink]->(targetContainer:ContainerElement)
OPTIONAL MATCH (container)-[rollupOutboundLink {derived}]->(rollupContainer:ContainerElement)
OPTIONAL MATCH (container)-[outboundLink]->(externalSystem:SystemElement)
WHERE externalSystem IS External
OPTIONAL MATCH (sourceSystem:SystemElement)-[inboundLink]->(container)
WHERE sourceSystem IS External
OPTIONAL MATCH (container)-[rollupExternalOutboundLink {derived}]->(rollupExternalSystem:SystemElement)
WHERE rollupExternalSystem IS External
OPTIONAL MATCH (rollupExternalSourceSystem:SystemElement)-[rollupExternalInboundLink {derived}]->(container)
WHERE rollupExternalSourceSystem IS External
GROUP BY container.parent
RETURN container, internalLink, targetContainer, rollupOutboundLink, rollupContainer, outboundLink, externalSystem, inboundLink, sourceSystem, rollupExternalOutboundLink, rollupExternalSystem, rollupExternalInboundLink, rollupExternalSourceSystem`;

const c3Query = `MATCH (container:ContainerElement)-[contains:CONTAINS]->(component:ComponentElement)
WHERE container.sourceIdentity = $tab
OPTIONAL MATCH (component)-[link]->(targetComponent:ComponentElement)
OPTIONAL MATCH (component)-[externalLink]->(externalSystem:SystemElement)
WHERE externalSystem IS External
OPTIONAL MATCH (externalSourceSystem:SystemElement)-[externalInboundLink]->(component)
WHERE externalSourceSystem IS External
OPTIONAL MATCH (component)-[rollupExternalLink {derived}]->(rollupExternalSystem:SystemElement)
WHERE rollupExternalSystem IS External
OPTIONAL MATCH (rollupExternalSourceSystem:SystemElement)-[rollupExternalInboundLink {derived}]->(component)
WHERE rollupExternalSourceSystem IS External
GROUP BY component.parent
RETURN component, link, targetComponent, externalLink, externalSystem, externalInboundLink, externalSourceSystem, rollupExternalLink, rollupExternalSystem, rollupExternalInboundLink, rollupExternalSourceSystem`;

const c4Query = `MATCH (node:Element)
WHERE node.sourceIdentity = $tab
  AND (node IS DeploymentElement OR node IS ContainerElement)
OPTIONAL MATCH ROLLUP (node)-[projectedLink {projected, sourceIdentity: $tab}]->(projectedTarget:Element)
WHERE projectedTarget IS DeploymentElement
   OR projectedTarget IS ContainerElement
   OR projectedTarget IS External
OPTIONAL MATCH (node)-[directDeploymentLink {sourceIdentity: $tab}]->(directDeploymentTarget:Element)
WHERE node IS DeploymentElement
  AND (directDeploymentTarget IS DeploymentElement OR directDeploymentTarget IS External)
GROUP BY node.runsOn
RETURN node, projectedLink, projectedTarget, directDeploymentLink, directDeploymentTarget`;

const viewQueries: Record<DiagramView, string> = {
  "no-filter": noFilterQuery,
  c1: c1Query,
  c2: c2Query,
  c3: c3Query,
  c4: c4Query,
};

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

  for (const file of skillPackage.files) {
    await writeGeneratedFile(path.join(outputRoot, file.path), file.content, args.force);
  }

  process.stdout.write(skillPackageSuccess(projectRoot, outputRoot, skillPackage, usesDefaultOutput));
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
    : await readFile(args.queryFile, "utf8");
  return selectGraph(project.result, scope, query);
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
      --force              Replace existing generated skill files.
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
      path: "references/syntax.md",
      content: genericSyntaxReference(),
    },
    {
      path: "references/layered-architecture.md",
      content: genericLayeredArchitectureReference(),
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
      path: "examples/layered-architecture.ai",
      content: genericLayeredArchitectureExample(),
    },
    {
      path: "examples/c2-containers.aiq",
      content: genericC2QueryExample(),
    },
  ];
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

function genericSkillGuide(): string {
  return `# Archinsight Agent Guide

Use this guide when creating or editing Insight \`.ai\` architecture models.

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

## Workflow

1. Read the existing \`.ai\` files before editing.
2. Preserve indentation and the project's existing naming style.
3. Model architecture from the outside inward: context, external actors/systems,
   systems, containers/services, components, and deployment details.
4. Prefer small, focused files connected by \`context\`, \`import\`, and \`extend\`.
5. Validate every Insight change with \`archinsight link . --format text\`.

## References

- Read \`references/syntax.md\` before writing unfamiliar Insight syntax.
- Read \`references/layered-architecture.md\` when decomposing a system across
  C1/C2/C3/C4-style layers.
- Read \`references/queries.md\` when writing custom diagram queries or \`.aiq\`
  files.
- Read \`references/validation.md\` before running checks, structure inspection,
  or rendering.
- Use \`examples/layered-architecture.ai\` as a compact valid model.
`;
}

function codexSkillGuide(): string {
  return `---
name: archinsight
description: Create, edit, validate, inspect, and render Archinsight Insight architecture-as-code models. Use when working with .ai Insight files, C4-style architecture models, system/container/component diagrams, deployment projections, or when the user asks to model software architecture with Archinsight.
---

# Archinsight

Use this skill when creating or editing Insight \`.ai\` architecture models.

Insight is its own typed architecture-as-code language. Do not infer its syntax
from YAML, Mermaid, PlantUML, Structurizr, or C4 DSL.

## Codex Usage Notes

Treat this \`SKILL.md\` as the entrypoint. Load reference files only when needed:

- Read \`references/syntax.md\` before writing unfamiliar Insight syntax.
- Read \`references/layered-architecture.md\` before decomposing a system across
  C1/C2/C3/C4-style layers.
- Read \`references/queries.md\` before writing custom diagram queries or \`.aiq\`
  files.
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

## Workflow

1. Read the existing \`.ai\` files before editing.
2. Preserve indentation and the project's existing naming style.
3. Model architecture from the outside inward: context, external actors/systems,
   systems, containers/services, components, and deployment details.
4. Prefer small, focused files connected by \`context\`, \`import\`, and \`extend\`.
5. Use \`archinsight structure . --format text\` before broad edits when the
   project shape is unclear.
6. Validate every Insight change with \`archinsight link . --format text\`.
7. If validation fails, fix the first real syntax/type/linking error before
   adding more model content.

## References

- Read \`references/syntax.md\` before writing unfamiliar Insight syntax.
- Read \`references/layered-architecture.md\` when decomposing a system across
  C1/C2/C3/C4-style layers.
- Read \`references/queries.md\` when writing custom diagram queries or \`.aiq\`
  files.
- Read \`references/validation.md\` before running checks, structure inspection,
  or rendering.
- Use \`examples/layered-architecture.ai\` as a compact valid model.
`;
}

function claudeSkillGuide(): string {
  return `---
name: archinsight
description: Create, edit, validate, inspect, and render Archinsight Insight architecture-as-code models. Use when working with .ai Insight files, C4-style architecture models, system/container/component diagrams, deployment projections, or when the user asks to model software architecture with Archinsight.
---

# Archinsight

Use this skill when creating or editing Insight \`.ai\` architecture models.

Insight is its own typed architecture-as-code language. Do not infer its syntax
from YAML, Mermaid, PlantUML, Structurizr, or C4 DSL.

## Claude Usage Notes

Treat this \`SKILL.md\` as the entrypoint. Load the reference files only when
they are needed:

- Read \`references/syntax.md\` before writing unfamiliar Insight syntax.
- Read \`references/layered-architecture.md\` before decomposing a system across
  C1/C2/C3/C4-style layers.
- Read \`references/queries.md\` before writing custom diagram queries or \`.aiq\`
  files.
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

## Workflow

1. Read the existing \`.ai\` files before editing.
2. Preserve indentation and the project's existing naming style.
3. Model architecture from the outside inward: context, external actors/systems,
   systems, containers/services, components, and deployment details.
4. Prefer small, focused files connected by \`context\`, \`import\`, and \`extend\`.
5. Use \`archinsight structure . --format text\` to inspect the current model
   before broad edits when the CLI is available.
6. Validate every Insight change with \`archinsight link . --format text\` when
   shell access is available; otherwise ask the user to run validation.
7. If validation fails, fix the first real syntax/type/linking error before
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

- Read \`references/syntax.md\` before writing unfamiliar Insight syntax.
- Read \`references/layered-architecture.md\` when decomposing a system across
  C1/C2/C3/C4-style layers.
- Read \`references/queries.md\` when writing custom diagram queries or \`.aiq\`
  files.
- Read \`references/validation.md\` before running checks, structure inspection,
  or rendering.
- Use \`examples/layered-architecture.ai\` as a compact valid model.
`;
}

function codexOpenAiYaml(): string {
  return `interface:
  display_name: "Archinsight"
  short_description: "Work with Insight architecture models"
  default_prompt: "Use $archinsight to model or validate Insight architecture-as-code files."

policy:
  allow_implicit_invocation: true
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
        description = Places an order
    ~> analytics
        technology = Kafka
        description = Publishes order events
\`\`\`

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

## Annotations

Annotations decorate the next declaration or link:

\`\`\`insight
@planned
external system warehouse
    name = Warehouse

links:
    @deprecated
    ~> legacy_erp
\`\`\`

Use presentation definitions for durable visual styling. Avoid adding new
Graphviz attributes directly unless the project already uses that convention.

## Custom Types

Projects can extend the language with typed vocabulary:

\`\`\`insight
define type Broker of InfrastructureComponent
    constructor broker
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

Start with the context, people, owned systems, and external dependencies.

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
which external systems matter.

## C2: Containers and Services

Nest deployable units under the owned system:

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
backend services. Add links that explain runtime collaboration.

## C3: Components

Put component details in a separate file with \`extend\` when the service becomes
interesting enough to decompose:

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

## C4 and Deployment

Use deployment profiles and infrastructure types when physical realization is
important:

\`\`\`insight
deploymentProfile production
    environments:
        eu

environment eu
    name = Europe
\`\`\`

Attach deployment details to systems, containers, services, or links only when
they clarify real runtime paths.

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

function genericValidationReference(): string {
  return `# Validation and Inspection

Run validation after every Insight edit:

\`\`\`shell
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
\`\`\`

Render a diagram when a context id is known:

\`\`\`shell
archinsight render . -c <context-id> -v c1 -f svg -o diagram.svg
archinsight render . -c <context-id> -v c2 -f svg -o diagram.svg
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

When a render command depends on the active file, pass \`--source <file>\`.

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

C1 usually selects systems in the selected context and rolls lower-level links
up to system-level relationships.

C2 usually selects \`ContainerElement\` nodes in \`$tab\`, returns direct internal
relationships, and includes external systems through optional/rollup matches.

C3 usually starts from \`(container:ContainerElement)-[:CONTAINS]->(component)\`
and returns component relationships.

C4 usually selects deployment and container nodes from \`$tab\`, uses
\`OPTIONAL MATCH ROLLUP\`, and returns projected relationships.

## Authoring Rules

- Start from the view question: context, containers, components, or deployment.
- Use domain variable names: \`system\`, \`container\`, \`component\`, \`externalSystem\`.
- Return every node and relationship alias needed for rendering.
- Add \`GROUP BY\` deliberately for diagrams with clusters.
- Validate query files with \`archinsight query\` before rendering.
- Keep custom queries in \`.aiq\` files when they are reused.
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
