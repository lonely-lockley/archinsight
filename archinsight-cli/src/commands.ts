import { readFile } from "node:fs/promises";
import path from "node:path";
import { AiqQueryError, discoverDeploymentEnvironments, renderGraphviz, type QueryParameterValue, type QueryResult } from "@insight/language";
import {
  outputFormat,
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
  renderSvg,
  writeOutput,
} from "./cli-output.js";
import {
  declaredDeploymentEnvironments,
  formatDeploymentEnvironments,
  loadProject,
  projectPath,
  selectedGraph,
  selectedQuery,
  selectedSource,
  type DeploymentEnvironmentEntry,
} from "./project-runtime.js";
import { installSkillPackage } from "./skill/skill-installer.js";
import { skillPackage } from "./skill/skill-package.js";

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
