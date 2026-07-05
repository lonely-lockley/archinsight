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

type Command = "link" | "render" | "query" | "structure";
type OutputFormat = "text" | "json";
type RenderFormat = "dot" | "svg" | "json";
type DiagramView = "c1" | "c2" | "c3" | "c4" | "no-filter";

interface ParsedArgs {
  readonly command?: Command;
  readonly input?: string;
  readonly context?: string;
  readonly tab?: string;
  readonly view?: DiagramView;
  readonly queryFile?: string;
  readonly output?: string;
  readonly format?: string;
  readonly theme?: string;
  readonly help: boolean;
  readonly version: boolean;
}

interface LoadedProject {
  readonly root: string;
  readonly sources: readonly ProjectSource[];
  readonly snapshot: LanguageSnapshot;
  readonly result: LinkProjectResult;
  readonly diagnostics: readonly LanguageDiagnostic[];
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
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "build") {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...await sourceFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".ai")) {
      result.push(entryPath);
    }
  }
  return result.sort((left, right) => left.localeCompare(right));
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
    input: positional[1],
    context: stringOption(options.context),
    tab: stringOption(options.tab),
    view: viewOption(options.view),
    queryFile: stringOption(options.query),
    output: stringOption(options.output),
    format: stringOption(options.format),
    theme: stringOption(options.theme),
    help: options.help === true,
    version: options.version === true,
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
  } as Record<string, string | undefined>)[arg];
}

function command(value: string | undefined): Command | undefined {
  if (value === "link" || value === "render" || value === "query" || value === "structure") {
    return value;
  }
  if (value === undefined) {
    return undefined;
  }
  throw new CliError(`Unknown command '${value}'`);
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

function helpText(): string {
  return `Archinsight CLI ${version}

Usage:
  archinsight link [project-dir] [--format text|json] [--out file]
  archinsight render [project-dir] -c <context> [-s <source>] [-v c1|c2|c3|c4|no-filter] [-q query.aiq] [-f dot|svg|json] [-o file]
  archinsight query [project-dir] -c <context> [-s <source>] [-v c1|c2|c3|c4|no-filter] [-q query.aiq] [-f text|json] [-o file]
  archinsight structure [project-dir] [--format text|json] [--out file]

Options:
  project-dir             Project directory to scan recursively, default: current directory.
  -c, --context <id>       Context id for query/render.
  -s, --source <file>      Selected project file for queries using $tab.
      --tab <source>       Backward-compatible alias for --source.
  -v, --view <name>        Built-in view: c1, c2, c3, c4, no-filter.
  -q, --query <file>       Query file; overrides --view.
  -f, --format <format>    Output format.
  -o, --out <file>         Write output to file instead of stdout.
  -t, --theme <theme>      Render theme, default: light.
  -V, --version            Print version.
  -h, --help               Show help.

Diagnostics text format is TSV:
  level<TAB>code<TAB>source<TAB>line<TAB>column<TAB>message
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
  readonly nodes: readonly ArchyNode[];
}

class CliError extends Error {
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`ERROR\tCLI\t-\t0\t0\t${message.replaceAll(/\s+/g, " ").trim()}\n`);
  process.exitCode = 1;
});
