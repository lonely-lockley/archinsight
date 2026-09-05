import {
  BUILTIN_VIEW_DEFINITIONS,
  BUILTIN_VIEW_IDS,
  resolveBuiltinView,
  type BuiltinDiagramView,
} from "@insight/language";
import { CliError } from "./cli-error.js";
import type { SkillTarget } from "./skill/skill-package.js";
import { version } from "./version.js";

export type Command = "link" | "render" | "query" | "structure" | "environments" | "skill";
type SkillAction = "init";
export type OutputFormat = "text" | "json";
export type RenderFormat = "dot" | "svg" | "json";
export type DiagramView = BuiltinDiagramView;

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
  readonly theme?: string;
  readonly target?: string;
  readonly help: boolean;
  readonly version: boolean;
  readonly force: boolean;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
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
    environment: stringOption(options.environment),
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

export function outputFormat(value: string | undefined, fallback: OutputFormat): OutputFormat {
  if (value === undefined) {
    return fallback;
  }
  if (value === "text" || value === "json") {
    return value;
  }
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

export function helpText(): string {
  const viewUsage = BUILTIN_VIEW_IDS.join("|");
  const viewList = BUILTIN_VIEW_DEFINITIONS.map((definition) => definition.id).join(", ");
  return `Archinsight CLI ${version}

Usage:
  archinsight link [project-dir] [--format text|json] [--out file]
  archinsight render [project-dir] [-s <source>] [-c <context>] [-v ${viewUsage}] [-e <environment>] [-q query.aiq] [-f dot|svg|json] [-o file]
  archinsight query [project-dir] [-s <source>] [-c <context>] [-v ${viewUsage}] [-e <environment>] [-q query.aiq] [-f text|json] [-o file]
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
  -q, --query <file>       Query file; overrides --view.
  -f, --format <format>    Output format.
  -o, --out <file>         Write output to file instead of stdout; for skill init, write the guide directory.
  -t, --theme <theme>      Render theme, default: light.
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
