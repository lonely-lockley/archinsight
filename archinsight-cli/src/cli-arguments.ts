import {
  BUILTIN_VIEW_DEFINITIONS,
  BUILTIN_VIEW_IDS,
  resolveBuiltinView,
  type BuiltinDiagramView,
  type RenderTheme,
} from "@insight/language";
import { CliError } from "./cli-error.js";
import type { SkillTarget } from "./skill/skill-package.js";
import { version } from "./version.js";

export type Command = "link" | "render" | "query" | "structure" | "environments" | "skill";
type SkillAction = "init";
export type OutputFormat = "text" | "json";
export type QueryOutputFormat = OutputFormat | "csv";
export type RenderFormat = "dot" | "svg" | "json";
export type DiagramView = BuiltinDiagramView;
export type ThemeOption = RenderTheme | "system";

export interface ParsedArgs {
  readonly command?: Command;
  readonly skillAction?: SkillAction;
  readonly input?: string;
  readonly context?: string;
  readonly tab?: string;
  readonly view?: DiagramView;
  readonly environment?: string;
  readonly queryFile?: string;
  readonly output?: string;
  readonly format?: string;
  readonly theme?: ThemeOption;
  readonly target?: string;
  readonly parameters?: readonly string[];
  readonly parametersFile?: string;
  readonly maxExpansions?: number;
  readonly maxRows?: number;
  readonly maxValues?: number;
  readonly maxOutputBytes?: number;
  readonly timeoutMs?: number;
  readonly help: boolean;
  readonly version: boolean;
  readonly force: boolean;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const options: Record<string, string | boolean> = {};
  const parameters: string[] = [];
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
      if (key === "param") parameters.push(value);
      else options[key] = value;
      index++;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new CliError(`Unknown option '${arg}'`);
    }
    positional.push(arg);
  }
  const parsed: ParsedArgs = {
    command: command(positional[0]),
    skillAction: skillAction(positional[0], positional[1]),
    input: inputPath(positional),
    context: stringOption(options.context),
    tab: stringOption(options.tab),
    view: viewOption(options.view),
    environment: stringOption(options.environment),
    queryFile: stringOption(options.query),
    output: stringOption(options.output),
    format: stringOption(options.format),
    theme: themeOption(options.theme),
    target: stringOption(options.target),
    parameters,
    parametersFile: stringOption(options.params),
    maxExpansions: positiveIntegerOption(options.maxExpansions, "--max-expansions"),
    maxRows: positiveIntegerOption(options.maxRows, "--max-rows"),
    maxValues: positiveIntegerOption(options.maxValues, "--max-values"),
    maxOutputBytes: positiveIntegerOption(options.maxOutputBytes, "--max-output-bytes"),
    timeoutMs: positiveIntegerOption(options.timeoutMs, "--timeout-ms"),
    help: options.help === true,
    version: options.version === true,
    force: options.force === true,
  };
  validateOptionCombinations(parsed);
  return parsed;
}

function validateOptionCombinations(args: ParsedArgs): void {
  if ((args.command === "query" || args.command === "render")
      && args.view !== undefined && args.queryFile !== undefined) {
    throw new CliError(`Options '--view' and '--query' are mutually exclusive for command '${args.command}'`);
  }
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
    "--environment": "environment",
    "-e": "environment",
    "--query": "query",
    "-q": "query",
    "--out": "output",
    "-o": "output",
    "--format": "format",
    "-f": "format",
    "--theme": "theme",
    "-t": "theme",
    "--target": "target",
    "--param": "param",
    "--params": "params",
    "--max-expansions": "maxExpansions",
    "--max-rows": "maxRows",
    "--max-values": "maxValues",
    "--max-output-bytes": "maxOutputBytes",
    "--timeout-ms": "timeoutMs",
  } as Record<string, string | undefined>)[arg];
}

function command(value: string | undefined): Command | undefined {
  if (value === "link" || value === "render" || value === "query" || value === "structure"
      || value === "environments" || value === "skill") {
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

export function skillTarget(value: string | undefined): SkillTarget {
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
  const definition = resolveBuiltinView(value);
  if (definition !== undefined) {
    return definition.id;
  }
  throw new CliError(`Unknown view '${String(value)}'`);
}

function themeOption(value: unknown): ThemeOption | undefined {
  if (value === undefined) return undefined;
  if (value === "system" || value === "light" || value === "dark") return value;
  throw new CliError(`Unsupported render theme '${String(value)}'; expected system, light, or dark`);
}

export function outputFormat(value: string | undefined, fallback: OutputFormat): OutputFormat {
  if (value === undefined) {
    return fallback;
  }
  if (value === "text" || value === "json") {
    return value;
  }
  throw new CliError(`Unsupported format '${value}'`);
}

export function queryOutputFormat(value: string | undefined, fallback: QueryOutputFormat): QueryOutputFormat {
  if (value === undefined) return fallback;
  if (value === "text" || value === "json" || value === "csv") return value;
  throw new CliError(`Unsupported format '${value}'`);
}

export function renderFormat(value: string | undefined, fallback: RenderFormat): RenderFormat {
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

function positiveIntegerOption(value: unknown, option: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new CliError(`Option '${option}' expects a positive integer`);
  return parsed;
}

export function helpText(): string {
  const viewUsage = BUILTIN_VIEW_IDS.join("|");
  const viewList = BUILTIN_VIEW_DEFINITIONS.map((definition) => definition.id).join(", ");
  return `Archinsight CLI ${version}

Usage:
  archinsight link [project-dir] [--format text|json] [--out file]
  archinsight render [project-dir] [-s <source>] [-c <context>] [-v ${viewUsage}] [-e <environment>] [-q query.aiq] [-f dot|svg|json] [-o file]
  archinsight query [project-dir] [-s <source>] [-c <context>] [-v ${viewUsage}] [-e <environment>] [-q query.aiq] [--param name=<json>] [--params file.json] [-f text|json|csv] [-o file]
  archinsight structure [project-dir] [--format text|json] [--out file]
  archinsight environments [project-dir] [-s <source>] [--format text|json] [--out file]
  archinsight skill init [project-dir] [--target generic|codex|claude] [--out dir] [--force]

Options:
  project-dir             Project directory to scan recursively, default: current directory.
  -s, --source <file>      Selected model file. Supplies $tab and infers its context.
  -c, --context <id>       Context for context-wide execution without --source; must match it when both are passed.
      --tab <source>       Backward-compatible alias for --source.
  -v, --view <name>        Built-in view: ${viewList}.
  -e, --environment <id>   Environment scope for deployment-container; optional when exactly one is relevant.
  -q, --query <file>       Query file; mutually exclusive with --view.
      --param <name=json>  Supply a query parameter; repeat for multiple parameters.
      --params <file>      Read query parameters from a JSON object.
      --max-expansions <n> Maximum candidate/edge checks during query execution.
      --max-rows <n>       Maximum rows materialized by one query stage.
      --max-values <n>     Maximum collected values and materialized path parts.
      --max-output-bytes <n> Maximum serialized result size.
      --timeout-ms <n>     Query execution deadline after linking.
  -f, --format <format>    Output format.
  -o, --out <file>         Write output to file instead of stdout; for skill init, write the guide directory.
  -t, --theme <theme>      Render theme: system, light, or dark; default: system.
      --target <target>    Skill target: generic, codex, or claude.
      --force              Replace the complete generated skill directory.
  -V, --version            Print version.
  -h, --help               Show help.

Scope:
  C1 and no-filter accept either --source or --context. C2-C4 and Deployment
  views require --source unless project-dir is one .ai file. Source-scoped
  commands infer context from that file. D2 additionally requires --environment
  when more than one environment is relevant.

Environment discovery:
  environments lists every declared environment. With --source, it returns only
  the environments relevant to that source for the D2 view.

Diagnostics text format is TSV:
  level<TAB>code<TAB>source<TAB>line<TAB>column<TAB>message
`;
}
