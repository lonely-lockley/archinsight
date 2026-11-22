import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AiqQueryError,
  deploymentEnvironmentsForElement,
  deploymentOccurrenceEnvironmentsForElement,
  deploymentFocusElementIds,
  diagramElementMetadata,
  diagramQuickActionMetadata,
  discoverDeploymentEnvironments,
  renderDiagramDiffGraphvizArtifact,
  renderGraphvizArtifact,
  selectDeploymentGraph,
  selectElementDrillDown,
  selectIsolatedElementGraph,
  selectPathGraph,
  type DiagramElementQuickActionMetadata,
  type DiagramDiff,
  type QueryParameterValue,
  type QueryResult,
  type RenderGraph,
} from "@insight/language";
import { openGitVersionedRepository } from "@archinsight/git";
import { searchTechnologyIcons, technologyIconCatalog } from "@archinsight/icons";
import {
  attributeVersionedDiagramDiff,
  buildVersionedDiagramDiff,
} from "@archinsight/workbench/versioned-diagram-diff-service";
import {
  outputFormat,
  quickActionOutputFormat,
  queryOutputFormat,
  renderFormat,
  skillTarget,
  type ParsedArgs,
} from "./cli-arguments.js";
import { CliError } from "./cli-error.js";
import {
  diagnosticSummary,
  exitWithDiagnostics,
  formatDiagnostics,
  formatGraph,
  formatQueryTableCsv,
  formatQueryTableText,
  formatStructure,
  hasErrors,
  linkerFinishedLine,
  projectStructure,
  renderFinishedLine,
  renderPng,
  renderSvg,
  writeBinaryOutput,
  writeOutput,
} from "./cli-output.js";
import {
  analyzeProjectSourcesAsync,
  declaredDeploymentEnvironments,
  formatDeploymentEnvironments,
  loadProject,
  projectHasSource,
  projectPath,
  selectedGraph,
  selectedBuiltinViewScope,
  selectedQuery,
  selectedSource,
  type DeploymentEnvironmentEntry,
  type LoadedProject,
} from "./project-runtime.js";
import { installSkillPackage } from "./skill/skill-installer.js";
import { skillPackage } from "./skill/skill-package.js";
import { resolveRenderTheme } from "./system-theme.js";

export async function runLink(args: ParsedArgs): Promise<void> {
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

export async function runRender(args: ParsedArgs): Promise<void> {
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
    const artifact = renderGraphvizArtifact(project.result, graph, await resolveRenderTheme(args.theme));
    const dot = artifact.dot;
    const format = renderFormat(args.format, "dot");
    if (format === "text") {
      await writeOutput(args.output, formatGraph(graph));
      process.stderr.write(renderFinishedLine(true, "diagram rendered successfully"));
      return;
    }
    if (format === "dot") {
      await writeOutput(args.output, dot);
      process.stderr.write(renderFinishedLine(true, "diagram rendered successfully"));
      return;
    }
    if (format === "json") {
      await writeOutput(args.output, JSON.stringify({ graph, ...artifact }, null, 2));
      process.stderr.write(renderFinishedLine(true, "diagram rendered successfully"));
      return;
    }
    const svg = await renderSvg(dot, artifact.icons);
    if (format === "svg") {
      await writeOutput(args.output, svg);
    } else {
      await writeBinaryOutput(args.output, renderPng(svg));
    }
    process.stderr.write(renderFinishedLine(true, "diagram rendered successfully"));
  } catch (error) {
    process.stderr.write(renderFinishedLine(false, error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}

export async function runDiff(args: ParsedArgs): Promise<void> {
  const from = requiredOption(args.from, "--from");
  const to = requiredOption(args.to, "--to");
  const root = projectPath(args);
  const signal = new AbortController().signal;
  const repository = await openGitVersionedRepository(root, signal);
  if (repository === undefined) throw new CliError(`Project path is not inside a Git repository: ${root}`, "GIT");
  const [beforeRevision, afterRevision] = await Promise.all([
    repository.resolveRevision(from, signal),
    repository.resolveRevision(to, signal),
  ]);
  const parameters = await queryParameters(args);
  let diagnostics: import("@insight/language").LanguageDiagnostic[] = [];
  const scopeWarnings: import("@insight/language").LanguageDiagnostic[] = [];
  let semantic;
  try {
    semantic = await buildVersionedDiagramDiff({
      repository,
      beforeRevision,
      afterRevision,
      signal,
      buildRevision: (sources) => analyzeProjectSourcesAsync(repository.projectRoot, sources),
      validateRevision: (project, side) => {
        diagnostics.push(...project.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          sourceName: `${side === "before" ? from : to}:${diagnostic.sourceName}`,
        })));
        if (hasErrors(project.diagnostics)) throw new Error(`The ${side} revision contains model errors`);
      },
      selectGraph: (project, side) => selectedRevisionGraph(
        project,
        args,
        parameters,
        side,
        side === "before" ? from : to,
        scopeWarnings,
      ),
    });
  } catch (cause) {
    if (diagnostics.length > 0 && hasErrors(diagnostics)) {
      process.stderr.write(formatDiagnostics(diagnostics));
      process.exitCode = 1;
      return;
    }
    throw cause;
  }
  if (hasErrors(diagnostics)) {
    process.stderr.write(formatDiagnostics(diagnostics));
    process.exitCode = 1;
    return;
  }
  const warnings = [
    ...diagnostics.filter((diagnostic) => diagnostic.level === "WARNING" || diagnostic.level === "NOTE"),
    ...scopeWarnings,
  ];
  if (warnings.length > 0) process.stderr.write(formatDiagnostics(warnings));
  const attributedDiff = await attributeVersionedDiagramDiff(repository, semantic, signal);
  const diff = semantic.diff;
  const artifact = renderDiagramDiffGraphvizArtifact(
    semantic.before.result,
    semantic.after.result,
    diff,
    await resolveRenderTheme(args.theme),
  );
  const dot = artifact.dot;
  const format = renderFormat(args.format, "dot");
  if (format === "text") {
    await writeOutput(args.output, formatDiagramDiff(diff, beforeRevision, afterRevision));
  } else if (format === "dot") {
    await writeOutput(args.output, dot);
  } else if (format === "json") {
    await writeOutput(args.output, JSON.stringify({
      revisions: { from: beforeRevision, to: afterRevision },
      diff,
      attributedDiff,
      ...artifact,
    }, null, 2));
  } else {
    const svg = await renderSvg(dot, artifact.icons);
    if (format === "svg") await writeOutput(args.output, svg);
    else await writeBinaryOutput(args.output, renderPng(svg));
  }
  process.stderr.write(renderFinishedLine(true, "diagram diff rendered successfully"));
}

async function selectedRevisionGraph(
  project: LoadedProject,
  args: ParsedArgs,
  parameters: Readonly<Record<string, QueryParameterValue>>,
  side: "before" | "after",
  revision: string,
  warnings: import("@insight/language").LanguageDiagnostic[],
): Promise<RenderGraph | undefined> {
  if (project.sources.length === 0) return undefined;
  if (args.tab !== undefined && !projectHasSource(project, args.tab)) {
    warnings.push({
      level: "WARNING",
      code: "DIFF_SOURCE_MISSING",
      sourceName: revision,
      line: 1,
      column: 1,
      message: `Source '${args.tab}' is absent from the ${side} revision; that side is compared as an empty graph`,
    });
    return undefined;
  }
  return selectedGraph(project, args, parameters);
}

function formatDiagramDiff(diff: DiagramDiff, from: string, to: string): string {
  const rows: string[][] = [
    ["from", from],
    ["to", to],
    ["context", `${diff.beforeContext} -> ${diff.afterContext}`],
  ];
  for (const category of ["elements", "edges", "groups"] as const) {
    const counts = diff.summary[category];
    rows.push([category, `added=${counts.added}\tremoved=${counts.removed}\tchanged=${counts.changed}\tunchanged=${counts.unchanged}`]);
  }
  for (const [id, entry] of Object.entries(diff.elements).sort(([left], [right]) => left.localeCompare(right))) {
    if (entry.status === "unchanged") continue;
    const element = entry.rendered;
    rows.push([
      "element",
      entry.status,
      id,
      element.type,
      element.attributes.name?.[0] ?? element.attributes.title?.[0] ?? element.localId,
    ]);
  }
  for (const entry of diff.edges) {
    if (entry.status === "unchanged") continue;
    const edge = entry.rendered;
    rows.push([
      "edge",
      entry.status,
      entry.key,
      `${edge.source} -> ${edge.target}`,
      edge.edge.attributes.technology?.[0] ?? "-",
    ]);
  }
  for (const [owner, entry] of Object.entries(diff.groups).sort(([left], [right]) => left.localeCompare(right))) {
    if (entry.status === "unchanged") continue;
    rows.push(["group", entry.status, owner, entry.rendered.elements.join(",")]);
  }
  return `${rows.map((row) => row.join("\t")).join("\n")}\n`;
}

export async function runQuery(args: ParsedArgs): Promise<void> {
  const project = await loadProject(projectPath(args));
  if (hasErrors(project.diagnostics)) {
    process.stderr.write(formatDiagnostics(project.diagnostics));
    process.exitCode = 1;
    return;
  }
  const warnings = project.diagnostics.filter((diagnostic) => diagnostic.level === "WARNING" || diagnostic.level === "NOTE");
  if (warnings.length > 0) process.stderr.write(formatDiagnostics(warnings));
  let result: QueryResult;
  try {
    result = await selectedQuery(project, args, await queryParameters(args));
  } catch (cause) {
    if (cause instanceof AiqQueryError) {
      throw new CliError(cause.detail, cause.code, args.queryFile ?? "<built-in-query>", cause.range.line, cause.range.column);
    }
    throw cause;
  }
  const format = queryOutputFormat(args.format, "json");
  if (result.kind === "table") {
    await writeOutput(args.output, format === "json"
      ? JSON.stringify(result, null, 2)
      : format === "csv" ? formatQueryTableCsv(result) : formatQueryTableText(result));
    return;
  }
  if (format === "csv") throw new CliError("CSV output is supported only for RETURN TABLE queries");
  if (format === "json") {
    await writeOutput(args.output, JSON.stringify(result.graph, null, 2));
    return;
  }
  await writeOutput(args.output, formatGraph(result.graph));
}

async function queryParameters(args: ParsedArgs): Promise<Readonly<Record<string, QueryParameterValue>>> {
  const values: Record<string, QueryParameterValue> = {};
  if (args.parametersFile !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path.resolve(args.parametersFile), "utf8"));
    } catch (error) {
      throw new CliError(`Cannot read query parameters '${args.parametersFile}': ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isPlainObject(parsed)) throw new CliError("--params must contain one JSON object");
    for (const [name, value] of Object.entries(parsed)) values[name] = queryParameterValue(name, value);
  }
  for (const assignment of args.parameters ?? []) {
    const separator = assignment.indexOf("=");
    if (separator <= 0) throw new CliError(`Invalid --param '${assignment}'; expected name=<JSON-value>`);
    const name = assignment.slice(0, separator);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new CliError(`Invalid query parameter name '${name}'`);
    if (Object.hasOwn(values, name)) throw new CliError(`Query parameter '$${name}' was supplied more than once`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(assignment.slice(separator + 1));
    } catch (error) {
      throw new CliError(`Invalid JSON value for query parameter '$${name}': ${error instanceof Error ? error.message : String(error)}`);
    }
    values[name] = queryParameterValue(name, parsed);
  }
  for (const reserved of ["context", "tab"]) {
    if (Object.hasOwn(values, reserved)) throw new CliError(`Query parameter '$${reserved}' is reserved for query scope`);
  }
  return values;
}

function queryParameterValue(name: string, value: unknown): QueryParameterValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => queryParameterValue(name, item));
  throw new CliError(`Query parameter '$${name}' must be null, boolean, finite number, string, or a list of those values`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function runStructure(args: ParsedArgs): Promise<void> {
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

export async function runEnvironments(args: ParsedArgs): Promise<void> {
  const project = await loadProject(projectPath(args));
  if (hasErrors(project.diagnostics)) {
    process.stderr.write(formatDiagnostics(project.diagnostics));
    process.exitCode = 1;
    return;
  }
  const source = args.tab === undefined
    ? undefined
    : selectedSource(project, args.tab, false, undefined);
  const declared = declaredDeploymentEnvironments(project.result);
  const declaredById = new Map(declared.map((environment) => [environment.id, environment]));
  const environments = source === undefined
    ? declared
    : discoverDeploymentEnvironments(project.result, { tab: source }).map((environment) => {
      const declaration = declaredById.get(environment.id);
      if (declaration === undefined) {
        throw new CliError(`Environment '${environment.id}' is relevant to '${source}' but has no environment declaration`);
      }
      const name = environment.name ?? declaration.name;
      return {
        id: environment.id,
        ...(name === undefined ? {} : { name }),
        source: declaration.source,
      };
    });
  const result: DeploymentEnvironmentList = {
    schemaVersion: "deployment-environments.v1",
    source: source ?? null,
    environments,
  };
  const format = outputFormat(args.format, "text");
  await writeOutput(args.output, format === "json"
    ? JSON.stringify(result, null, 2)
    : formatDeploymentEnvironments(result.environments));
}

export async function runIcons(args: ParsedArgs): Promise<void> {
  const query = args.iconQuery?.trim() ?? "";
  const icons = query.length === 0
    ? technologyIconCatalog()
    : searchTechnologyIcons(query, 100);
  const format = outputFormat(args.format, "text");
  await writeOutput(args.output, format === "json"
    ? JSON.stringify({
        schemaVersion: "technology-icon-catalog.v1",
        query: query.length === 0 ? null : query,
        icons,
      }, null, 2)
    : `${icons.map((icon) => `${icon.id}\t${icon.label}\t${icon.variant}`).join("\n")}${icons.length === 0 ? "" : "\n"}`);
}

export async function runQuickAction(args: ParsedArgs): Promise<void> {
  const action = args.quickAction;
  if (action === undefined) {
    throw new CliError("Usage: archinsight quick-action <drill-down|isolate|deployment|find-path|declaration> [project-dir] [options]");
  }
  validateQuickActionOptions(args);
  const project = await loadProject(projectPath(args));
  if (hasErrors(project.diagnostics)) {
    process.stderr.write(formatDiagnostics(project.diagnostics));
    process.exitCode = 1;
    return;
  }
  const warnings = project.diagnostics.filter((diagnostic) => diagnostic.level === "WARNING" || diagnostic.level === "NOTE");
  if (warnings.length > 0) process.stderr.write(formatDiagnostics(warnings));
  const format = quickActionOutputFormat(args.format, "json");

  if (action === "declaration") {
    const metadata = quickActionElement(project.result, requiredOption(args.element, "--element"));
    if (metadata.declaration === undefined) throw new CliError(`Element '${metadata.canonicalElementId}' has no declaration`);
    const element = project.result.elements.find((candidate) => candidate.id === metadata.canonicalElementId);
    if (element === undefined) throw new CliError(`Element '${metadata.canonicalElementId}' is not part of the linked project`);
    await writeQuickActionGraph(args, format, project.result, {
      context: element.context,
      elements: { [element.id]: element },
      edges: [],
      groups: [],
      externalElements: [],
    }, {
      schemaVersion: "diagram-quick-action.v1",
      action,
      element: quickActionElementReference(metadata),
      declaration: metadata.declaration,
    });
    return;
  }

  if (action === "isolate") {
    const metadata = quickActionElement(project.result, requiredOption(args.element, "--element"));
    if (!metadata.isolateEligible) throw new CliError(`Isolation is unavailable for element '${metadata.canonicalElementId}'`);
    const graph = selectIsolatedElementGraph(
      project.result,
      metadata.canonicalElementId,
      await selectedBuiltinViewScope(project, args),
    );
    await writeQuickActionGraph(args, format, project.result, graph, {
      schemaVersion: "diagram-quick-action.v1",
      action,
      element: quickActionElementReference(metadata),
    });
    return;
  }

  if (action === "drill-down") {
    const metadata = quickActionElement(project.result, requiredOption(args.element, "--element"));
    if (!metadata.hasChildren) throw new CliError(`Element '${metadata.canonicalElementId}' has no deeper logical level`);
    const graph = selectElementDrillDown(project.result, metadata.canonicalElementId);
    await writeQuickActionGraph(args, format, project.result, graph, {
      schemaVersion: "diagram-quick-action.v1",
      action,
      element: quickActionElementReference(metadata),
    });
    return;
  }

  if (action === "deployment") {
    const metadata = quickActionElement(project.result, requiredOption(args.element, "--element"));
    if (!metadata.hasDeployment) throw new CliError(`No deployment is available for '${metadata.canonicalElementId}'`);
    const environment = quickActionDeploymentEnvironment(project.result, metadata, args.environment);
    const graph = selectDeploymentGraph(project.result, metadata.canonicalElementId, environment);
    await writeQuickActionGraph(args, format, project.result, graph, {
      schemaVersion: "diagram-quick-action.v1",
      action,
      element: quickActionElementReference(metadata),
      environment,
      focusElementIds: deploymentFocusElementIds(project.result, metadata.canonicalElementId, graph),
    });
    return;
  }

  const source = quickActionElement(project.result, requiredOption(args.from, "--from"));
  const target = quickActionElement(project.result, requiredOption(args.to, "--to"));
  if (!source.pathEligible) throw new CliError(`Find path is unavailable for source '${source.canonicalElementId}'`);
  if (!target.pathEligible) throw new CliError(`Find path is unavailable for target '${target.canonicalElementId}'`);
  if (source.canonicalElementId === target.canonicalElementId) {
    throw new CliError("Find path source and target must be different elements");
  }
  if (args.environment !== undefined) {
    validateFindPathSourceEnvironment(project.result, source, args.environment);
  }
  const graph = selectPathGraph(
    project.result,
    source.canonicalElementId,
    target.canonicalElementId,
    await selectedBuiltinViewScope(project, args),
    args.environment === undefined ? undefined : {
      sourceEnvironment: args.environment,
    },
  );
  await writeQuickActionGraph(args, format, project.result, graph, {
    schemaVersion: "diagram-quick-action.v1",
    action,
    source: quickActionElementReference(source),
    target: quickActionElementReference(target),
    pathFound: graph.edges.length > 0,
    ...(args.environment === undefined ? {} : { environment: args.environment }),
  });
}

function validateFindPathSourceEnvironment(
  result: Parameters<typeof diagramQuickActionMetadata>[0],
  source: DiagramElementQuickActionMetadata,
  requested: string,
): void {
  const environments = deploymentOccurrenceEnvironmentsForElement(result, source.canonicalElementId);
  if (environments.some((environment) => environment.id === requested)) return;
  if (environments.length === 0) {
    throw new CliError(`No deployment is available for '${source.canonicalElementId}'`);
  }
  throw new CliError(`Environment '${requested}' is not available for '${source.canonicalElementId}'. Available environments: ${quickActionEnvironmentList(environments)}`);
}

function validateQuickActionOptions(args: ParsedArgs): void {
  if (args.queryFile !== undefined) throw new CliError("Quick actions do not accept --query; use --view for an optional built-in scope");
  if ((args.parameters?.length ?? 0) > 0 || args.parametersFile !== undefined) {
    throw new CliError("Quick actions do not accept query parameters");
  }
  if (args.quickAction === "drill-down" || args.quickAction === "isolate" || args.quickAction === "declaration" || args.quickAction === "deployment") {
    if (args.from !== undefined || args.to !== undefined) throw new CliError(`Quick action '${args.quickAction}' does not accept --from or --to`);
  }
  if (args.quickAction === "find-path" && args.element !== undefined) {
    throw new CliError("Quick action 'find-path' does not accept --element; use --from and --to");
  }
  if (args.quickAction === "drill-down" || args.quickAction === "declaration" || args.quickAction === "deployment") {
    if (args.view !== undefined || args.tab !== undefined || args.context !== undefined) {
      throw new CliError(`Quick action '${args.quickAction}' does not accept --view, --source, or --context`);
    }
  }
  if ((args.quickAction === "drill-down" || args.quickAction === "declaration") && args.environment !== undefined) {
    throw new CliError(`Quick action '${args.quickAction}' does not accept --environment`);
  }
  if ((args.quickAction === "isolate" || args.quickAction === "find-path")
      && args.view === undefined && (args.tab !== undefined || args.context !== undefined)) {
    throw new CliError("Quick-action scope options --source and --context require --view");
  }
  if (args.quickAction === "find-path" && args.environment !== undefined
      && args.view !== undefined && args.view !== "deployment-container") {
    throw new CliError("Find path --environment may be combined only with --view deployment-container or with no --view");
  }
}

function requiredOption(value: string | undefined, option: string): string {
  if (value === undefined) throw new CliError(`Quick action requires ${option} <id>`);
  return value;
}

function quickActionElement(result: Parameters<typeof diagramQuickActionMetadata>[0], elementId: string): DiagramElementQuickActionMetadata {
  const metadata = diagramElementMetadata(diagramQuickActionMetadata(result), elementId);
  if (metadata === undefined) throw new CliError(`Element '${elementId}' is not part of the linked project`);
  return metadata;
}

function quickActionElementReference(metadata: DiagramElementQuickActionMetadata): { readonly id: string; readonly title: string } {
  return { id: metadata.canonicalElementId, title: metadata.title };
}

function quickActionDeploymentEnvironment(
  result: Parameters<typeof diagramQuickActionMetadata>[0],
  metadata: DiagramElementQuickActionMetadata,
  requested: string | undefined,
): string {
  const environments = deploymentEnvironmentsForElement(result, metadata.canonicalElementId);
  if (requested !== undefined) {
    if (environments.some((candidate) => candidate.id === requested)) return requested;
    throw new CliError(`Environment '${requested}' is not available for '${metadata.canonicalElementId}'. Available environments: ${quickActionEnvironmentList(environments)}`);
  }
  if (environments.length === 1) return environments[0]!.id;
  if (environments.length === 0) throw new CliError(`No deployment is available for '${metadata.canonicalElementId}'`);
  throw new CliError(`Quick action 'deployment' requires --environment. Available environments: ${quickActionEnvironmentList(environments)}`);
}

function quickActionEnvironmentList(environments: readonly { readonly id: string; readonly name?: string }[]): string {
  return environments.map((environment) => environment.name === undefined || environment.name === environment.id
    ? environment.id
    : `${environment.id} (${environment.name})`).join(", ") || "none";
}

async function writeQuickActionGraph(
  args: ParsedArgs,
  format: ReturnType<typeof quickActionOutputFormat>,
  project: Parameters<typeof renderGraphvizArtifact>[0],
  graph: RenderGraph,
  metadata: Readonly<Record<string, unknown>>,
): Promise<void> {
  if (format === "json") {
    await writeOutput(args.output, JSON.stringify({ ...metadata, graph }, null, 2));
    return;
  }
  if (format === "text") {
    const header = Object.entries(metadata)
      .filter(([key]) => key !== "schemaVersion")
      .map(([key, value]) => `${key}\t${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
      .join("\n");
    await writeOutput(args.output, `${header}${header.length === 0 ? "" : "\n"}${formatGraph(graph)}`);
    return;
  }
  const artifact = renderGraphvizArtifact(project, graph, await resolveRenderTheme(args.theme));
  const dot = artifact.dot;
  if (format === "dot") {
    await writeOutput(args.output, dot);
    return;
  }
  const svg = await renderSvg(dot, artifact.icons);
  if (format === "svg") {
    await writeOutput(args.output, svg);
    return;
  }
  await writeBinaryOutput(args.output, renderPng(svg));
}

export async function runSkill(args: ParsedArgs): Promise<void> {
  if (args.skillAction !== "init") {
    throw new CliError("Usage: archinsight skill init [project-dir] [--target generic|codex|claude] [--out dir] [--force]");
  }
  const target = skillTarget(args.target);
  process.stdout.write(await installSkillPackage(skillPackage(target), {
    projectRoot: projectPath(args),
    output: args.output,
    force: args.force,
  }));
}

interface DeploymentEnvironmentList {
  readonly schemaVersion: "deployment-environments.v1";
  readonly source: string | null;
  readonly environments: readonly DeploymentEnvironmentEntry[];
}
