import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  BUILTIN_VIEW_DEFINITIONS,
  BUILTIN_VIEW_QUERIES,
  builtinViewDefinition,
  discoverDeploymentEnvironments,
  ProjectAnalysisSession,
  selectGraph,
  type LanguageDiagnostic,
  type LanguageSnapshot,
  type LinkProjectResult,
  type ProjectSource,
  type QueryScope,
  type RenderGraph,
} from "@insight/language";
import type { DiagramView, ParsedArgs } from "./cli-arguments.js";
import { CliError } from "./cli-error.js";

export interface LoadedProject {
  readonly root: string;
  readonly sources: readonly ProjectSource[];
  readonly snapshot: LanguageSnapshot;
  readonly result: LinkProjectResult;
  readonly diagnostics: readonly LanguageDiagnostic[];
}

export async function loadProject(input: string): Promise<LoadedProject> {
  const root = path.resolve(input);
  const sources = await readSources(root);
  if (sources.length === 0) {
    throw new CliError(`No .ai sources found under '${input}'`);
  }
  const analysis = ProjectAnalysisSession.create(sources).analysis();
  return {
    root,
    sources,
    snapshot: analysis.snapshotBuild.snapshot,
    result: analysis.result,
    diagnostics: analysis.diagnostics,
  };
}

export async function selectedGraph(project: LoadedProject, args: ParsedArgs): Promise<RenderGraph> {
  const view = args.queryFile === undefined ? args.view ?? "c1" : undefined;
  const query = args.queryFile === undefined
    ? BUILTIN_VIEW_QUERIES[view ?? "c1"]
    : await readQueryFile(project.root, args.queryFile);
  const queryNeedsTab = queryUsesVariable(query, "tab");
  const queryNeedsContext = queryUsesVariable(query, "context");
  const sourceRequired = (view !== undefined && builtinViewDefinition(view).sourceRequired) || queryNeedsTab;
  const tab = selectedSource(project, args.tab, sourceRequired, view);
  const contextRequired = (view !== undefined && builtinViewDefinition(view).contextRequired) || queryNeedsContext;
  const context = selectedContext(project, args.context, tab, contextRequired, view);
  const environment = deploymentEnvironmentOption(project, args, tab, view);
  const scope: QueryScope = {
    ...(context === undefined ? {} : { context }),
    ...(tab === undefined ? {} : { tab }),
    ...(view === undefined ? {} : { view }),
    ...(environment === undefined ? {} : { environment }),
  };
  return selectGraph(project.result, scope, query);
}

function deploymentEnvironmentOption(
  project: LoadedProject,
  args: ParsedArgs,
  tab: string | undefined,
  view: DiagramView | undefined,
): string | undefined {
  const definition = view === undefined ? undefined : builtinViewDefinition(view);
  if (definition?.environment !== "single-relevant") {
    if (args.environment !== undefined) {
      const supported = BUILTIN_VIEW_DEFINITIONS
        .filter((candidate) => candidate.environment === "single-relevant")
        .map((candidate) => `'${candidate.id}'`)
        .join(", ");
      throw new CliError(`Option '--environment' is supported only by the ${supported} view`);
    }
    return undefined;
  }
  if (tab === undefined) {
    throw new CliError(`View '${definition.id}' requires --source`);
  }
  const environments = discoverDeploymentEnvironments(project.result, { tab });
  if (args.environment !== undefined) {
    if (!environments.some((candidate) => candidate.id === args.environment)) {
      throw new CliError(`Environment '${args.environment}' is not relevant to '${tab}'. Available environments: ${environmentList(environments)}`);
    }
    return args.environment;
  }
  if (environments.length === 1) {
    return environments[0]!.id;
  }
  if (environments.length === 0) {
    throw new CliError(`No deployment environments are relevant to '${tab}'`);
  }
  throw new CliError(`View '${definition.id}' requires --environment. Available environments: ${environmentList(environments)}`);
}

function environmentList(environments: readonly { readonly id: string; readonly name?: string }[]): string {
  return environments.map((environment) =>
    environment.name === undefined || environment.name === environment.id
      ? environment.id
      : `${environment.id} (${environment.name})`
  ).join(", ") || "none";
}

export function declaredDeploymentEnvironments(result: LinkProjectResult): readonly DeploymentEnvironmentEntry[] {
  return result.elements
    .filter((element) => element.synthetic !== true
      && element.parent === undefined
      && (element.type === "Environment" || element.baseTypes.includes("Environment")))
    .map((element) => ({
      id: element.context,
      ...(element.attributes.name?.[0] === undefined ? {} : { name: element.attributes.name[0] }),
      source: element.sourceIdentity,
    }))
    .sort((left, right) =>
      (left.name ?? left.id).localeCompare(right.name ?? right.id) || left.id.localeCompare(right.id)
    );
}

export function formatDeploymentEnvironments(environments: readonly DeploymentEnvironmentEntry[]): string {
  if (environments.length === 0) {
    return "";
  }
  return `${environments.map((environment) =>
    `${environment.id}\t${environment.name ?? ""}\t${environment.source}`
  ).join("\n")}\n`;
}

async function readQueryFile(projectRoot: string, queryFile: string): Promise<string> {
  const file = path.isAbsolute(queryFile) ? queryFile : path.resolve(projectRoot, queryFile);
  return readFile(file, "utf8");
}

export function projectPath(args: ParsedArgs): string {
  return args.input ?? ".";
}

export function selectedSource(
  project: LoadedProject,
  source: string | undefined,
  required: boolean,
  view: DiagramView | undefined,
): string | undefined {
  if (source === undefined && project.sources.length === 1) {
    return project.sources[0]!.sourceName;
  }
  if (source === undefined) {
    if (required) {
      const subject = view === undefined ? "This query" : `View '${view}'`;
      throw new CliError(`${subject} requires --source because it is scoped to a model file`);
    }
    return undefined;
  }
  const normalized = normalizeSourceName(project.root, source);
  if (project.sources.some((item) => item.sourceName === normalized)) {
    return normalized;
  }
  throw new CliError(`Source '${source}' is not part of project '${project.root}'`);
}

function selectedContext(
  project: LoadedProject,
  explicitContext: string | undefined,
  source: string | undefined,
  required: boolean,
  view: DiagramView | undefined,
): string | undefined {
  const sourceContext = source === undefined
    ? undefined
    : project.result.contexts.find((context) => context.sourceIdentity === source);
  if (sourceContext?.synthetic === true && required) {
    throw new CliError(`Source '${source}' contains definitions and does not declare a renderable context or environment`);
  }
  if (view !== undefined && builtinViewDefinition(view).boundary?.scope === "context"
      && sourceContext !== undefined && sourceContext.type !== "Context") {
    throw new CliError(`Source '${source}' does not declare a logical context for the C1 view`);
  }

  const available = availableContextIds(project, view);
  if (explicitContext !== undefined && !available.includes(explicitContext)) {
    throw new CliError(`Context '${explicitContext}' is not declared. Available contexts: ${available.join(", ") || "none"}`);
  }
  if (explicitContext !== undefined && sourceContext?.synthetic !== true
      && sourceContext !== undefined && sourceContext.id !== explicitContext) {
    throw new CliError(`Context '${explicitContext}' conflicts with source '${source}', which declares context '${sourceContext.id}'`);
  }
  if (explicitContext !== undefined) {
    return explicitContext;
  }
  if (sourceContext?.synthetic !== true && sourceContext !== undefined) {
    return sourceContext.id;
  }
  if (!required) {
    return undefined;
  }
  if (available.length === 1) {
    return available[0];
  }
  throw new CliError(`Cannot infer context. Pass --source or --context. Available contexts: ${available.join(", ") || "none"}`);
}

function availableContextIds(project: LoadedProject, view: DiagramView | undefined): string[] {
  return [...new Set(project.result.contexts
    .filter((context) => context.synthetic !== true
      && (view === undefined || builtinViewDefinition(view).boundary?.scope !== "context" || context.type === "Context"))
    .map((context) => context.id))].sort();
}

function queryUsesVariable(query: string, variable: "context" | "tab"): boolean {
  return new RegExp(`\\$${variable}\\b`).test(query);
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

export interface DeploymentEnvironmentEntry {
  readonly id: string;
  readonly name?: string;
  readonly source: string;
}
