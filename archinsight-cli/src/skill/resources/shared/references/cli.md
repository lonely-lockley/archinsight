# Archinsight CLI

The generated skill uses the Archinsight CLI as its parser, linker, query
runtime, renderer, and validation authority. This file is the complete
agent-facing command reference bundled with the skill.

## Check the Installed Runtime

Check the available command before editing:

```shell
archinsight --version
archinsight --help
```

Do not silently install or update the CLI. Package installation changes the
developer environment or the project's dependency manifest and lockfile. Use an
existing installation when possible; otherwise ask the user to authorize the
appropriate installation method.

The generated reference matches the CLI version recorded in the skill. When
the installed version differs, trust `archinsight --help` for its option surface
and regenerate the skill before making language-sensitive changes.

## Project Input

Project commands accept a project directory, which defaults to the current
directory. The CLI discovers `.ai` files recursively and ignores hidden and
generated directories. Pass one `.ai` file instead when that file alone should
form the project.

```shell
archinsight link . --format text
archinsight link path/to/project --format text
archinsight link models/storefront.ai --format text
```

Use paths from the repository root when possible. Do not assemble a substitute
project by concatenating sources or parsing imports yourself.

## Command Reference

| Command | Agent use |
| --- | --- |
| `link` | Validate parsing, types, imports, references, operators, and linking before reporting success. |
| `structure` | Discover contexts, sources, types, canonical element ids, and relationships from the linked project. |
| `query` | Inspect a built-in view or execute a project `.aiq` graph/table query. |
| `render` | Produce text, JSON, DOT, SVG, or PNG from a graph-returning view. |
| `environments` | Discover all deployment environments or those relevant to one source. |
| `quick-action` | Run Drill down, Isolate, Deployment, Find path, or declaration lookup without inventing an AIQ query. |
| `diff` | Compare one semantic diagram scope between two Git revisions. |
| `icons` | List or search valid technology-icon ids. |
| `skill init` | Generate or deliberately replace an agent skill package. |

```shell
archinsight link [project-dir] [--format text|json] [--out file]
archinsight structure [project-dir] [--format text|json] [--out file]
archinsight query [project-dir] [-s source.ai] [-c context] [-v view | -q query.aiq] [-e environment] [--param name=json] [--params file.json] [-f text|json|csv] [-o file]
archinsight render [project-dir] [-s source.ai] [-c context] [-v view | -q query.aiq] [-e environment] [-t system|light|dark] [-f text|json|dot|svg|png] [-o file]
archinsight environments [project-dir] [-s source.ai] [--format text|json] [--out file]
archinsight quick-action <drill-down|isolate|deployment|find-path|declaration> [project-dir] [options]
archinsight diff [project-dir] --from revision --to revision [-s source.ai] [-c context] [-v view | -q query.aiq] [-e environment] [-f text|json|dot|svg|png] [-o file]
archinsight icons [search] [--format text|json]
archinsight skill init [project-dir] --target <codex|claude|generic> [--out dir] [--force]
```

Current-project analysis commands also accept `--no-cache` or
`--cache-dir <dir>`. Query execution can be bounded with `--max-expansions`,
`--max-rows`, `--max-values`, `--max-output-bytes`, and `--timeout-ms`; every
limit must be a positive integer.

Use `link` after every Insight edit. Use `structure` rather than text searches
when a command needs a canonical id. For a visual defect, inspect `query`
JSON before `render` so graph-selection problems remain separate from layout or
image problems.

## Output and Failure Contract

Payload output goes to stdout unless `--out <file>` is supplied. Diagnostics,
progress, and completion records go to stderr, so JSON, CSV, SVG, PNG, and other
payloads can be consumed without scraping logs. `link --format text` is a
validation report and writes that report to stderr.

Use `--format` explicitly when the result is consumed by another tool. Graph
queries support text and JSON; table queries support text, JSON, and CSV;
diagram-producing commands support text, JSON, DOT, SVG, and PNG. `--out`
replaces its destination atomically after successful execution.

A non-zero exit means the requested result was not produced successfully. Do
not infer success from an output file left by an earlier run. Report linker
diagnostics with their source and location, and address the first underlying
error before interpreting downstream query or render output.

## Project Analysis Cache

Project analysis commands use `.archinsight/cache` by default. Leave the cache
enabled for normal agent workflows: repeated `link`, `structure`, `query`,
`render`, `environments`, and `quick-action` calls can reuse unchanged work.
The CLI detects source-content changes and refreshes the stored analysis.

Treat the directory as disposable generated data. Do not inspect or edit cache
files, use them as architecture evidence, or include them in a commit. Ensure
`.archinsight/cache/` is ignored when maintaining the repository.

Use `--no-cache` only for an intentional cold run or to reproduce a suspected
cache problem. Use `--cache-dir <dir>` when the task requires an explicit
alternate location; the two options are mutually exclusive. Do not delete or
rewrite cache files to repair an ordinary command failure. A damaged,
incomplete, or incompatible cache is ignored automatically. If cached and
uncached runs produce different semantic results from the same sources, report
the discrepancy as a CLI defect.

## Project-Local Installation and Updates

Prefer a project-local dependency when the repository already manages Node.js
developer tools this way. Respect its package manager and lockfile. For an npm
project, the user can install or update the current release with:

```shell
npm install --save-dev @archinsight/cli@latest
npm exec -- archinsight --version
```

Use the equivalent command for pnpm or Yarn when that package manager owns the
repository. Do not introduce a second lockfile merely to install Archinsight.

## Global Installation and Updates

A user who wants the `archinsight` command available across projects can
install or update it globally:

```shell
npm install -g @archinsight/cli@latest
archinsight --version
```

Global installation is a user-level machine change. Suggest it as an option;
run it only when the user explicitly authorizes that installation scope.

## Generate a New Skill Package

Choose the target used by the agent runtime:

```shell
archinsight skill init . --target codex
archinsight skill init . --target claude
archinsight skill init . --target generic
```

Without `--out`, these commands use the target's standard directory. A normal
`skill init` requires that the complete output directory does not exist. If it
does exist, the CLI reports `Refusing to initialize skill because output
directory ... already exists` before writing any generated file.

## Regenerate an Existing Skill Package

Use `--force` only for deliberate replacement of a generated package:

```shell
archinsight skill init . --target codex --force
```

The CLI generates the complete new package in a temporary sibling directory
before replacing the target. `--force` removes everything under the target
directory, including files not generated by the current release. Inspect the
resolved target first and keep project-authored instructions outside that
generated directory. Use `--out <dedicated-directory>` when the standard path
is not appropriate.

Never update a generated skill by running plain `skill init` repeatedly or by
copying only the files that happen to be missing. Regenerate the entire package
with the installed CLI, then restart the agent session when its runtime discovers
skills only at startup.

## Deterministic Quick Actions

For a one-off element neighborhood, deployment projection, directed path, or
declaration lookup, use `archinsight quick-action` instead of writing a custom
AIQ filter. Read `references/quick-actions.md` for the exact commands and output
contract. JSON uses schema `diagram-quick-action.v1`; every action can also
produce text, DOT, SVG, or PNG output for subdiagram delivery.

Resolve `--element`, `--from`, and `--to` as canonical ids through `structure`
or query JSON. When the user requests an artifact, write the requested format
with `--out` and return the file rather than reimplementing the selector or
capturing the interactive UI.

## Versioned Diagram Diff

Compare one semantic diagram scope between explicit Git revisions without
checking either revision out:

```shell
archinsight diff . --from <baseline> --to <target> \
  --source <source.ai> --view c2 --format text
```

For a custom graph-returning query, replace `--view` with `--query` and pass its
string or string-list parameters with repeated `--param name=<json>` options or
one `--params file.json` object. The CLI validates one parameter map and applies
it unchanged to both revisions.

Text output prints the summary followed by one line for every added, removed,
or changed element, edge, and group. JSON includes `diagram-diff.v1` and
`attributed-diagram-diff.v1`; DOT, SVG, and PNG preserve the status styling. If
the selected source exists in only one revision, the missing side is compared
with an empty graph and stderr reports `DIFF_SOURCE_MISSING`. Before interpreting
that result as a source addition or removal, check for a rename or move with
`git log --follow -- <source>` or repeat the diff with a stable context scope.

## Query and Render Scope

Use the model source as the normal diagram entry point:

```shell
archinsight query . -s <source.ai> -v c2 --format json
archinsight render . -s <source.ai> -v c2 -f svg -o diagram.svg
archinsight render . -s <source.ai> -v c2 -f png -o diagram.png
```

`render` follows the operating-system light/dark preference by default. Pass
`--theme light` or `--theme dark` for reproducible output in CI or agent runs;
`--theme system` explicitly restores automatic selection. If the system
preference cannot be read, rendering uses the light theme without failing.
Every diagram render accepts `text`, `json`, `dot`, `svg`, or `png`, including
custom graph-returning `.aiq` queries. Use `--out` for SVG and PNG artifacts.

The selected source supplies `$tab` and determines `$context`. C2, C3, C4,
D1 (`deployment-system`), D2 (`deployment-container`), and the legacy
Deployment view require a source when a project contains several model files.
When the command input is one `.ai` file, the CLI selects it automatically.

C1 opens the complete context boundary declared by the selected source. For a
context-wide C1 or `no-filter` query without a source, pass
`--context <context-id>` instead. If both `--source` and `--context` are
present, they must resolve to the same context; the context does not override
the source.

A custom query file is mutually exclusive with `--view`. Pass it by
project-relative path and omit `--view`:

```shell
archinsight query . -s <source.ai> -q views/<name>.aiq --format json
archinsight render . -s <source.ai> -q views/<name>.aiq --format svg --out diagram.svg
```

Pass `--source` when the query uses `$tab`; the same source also supplies
`$context`. A query that uses only `$context` may use an explicit `--context`
without a source. The CLI does not discover `.aiq` files or activate a web
built-in override by basename. Read `references/custom-views.md` before adding
a reusable project query.

Analytical queries end with `RETURN TABLE`. JSON is the default versioned
result; CSV and text are also available:

```shell
archinsight query . -q reports/topics.aiq --param 'technology="Kafka"' --format json
archinsight query . -q reports/topics.aiq --params params.json --format csv --out topics.csv
```

JSON preserves cell types and distinguishes null from an empty string. CSV
uses an empty field for null and JSON text for list/record/path cells. It uses
CRLF records and quote doubling, but does not neutralize spreadsheet formulas.

Repeat `--param name=<json>` for scalar or list values. `--params` reads a JSON
object relative to the current working directory. Do not supply `$context` or
`$tab`; they are reserved for query scope. Missing, unused, duplicate, and
invalid parameter values fail before output is written. `--out` uses atomic
replacement, so an execution failure does not leave a partial report.

For plain graph-returning queries, user parameters are limited to strings and
lists of strings. The broader JSON value set is available to analytical
`RETURN TABLE` queries.

Resource controls are `--max-expansions`, `--max-rows`, `--max-values`,
`--max-output-bytes`, and `--timeout-ms`; every value must be a positive integer.
`render` rejects table results, and `--format csv` rejects graph results.

D1 spans every environment relevant to the selected source and rejects
`--environment`. D2 selects the only relevant environment automatically. If
several are relevant, pass one of the ids reported by the CLI with
`--environment <id>`.

Discover environments through the linked model instead of parsing Insight
sources:

```shell
archinsight environments . --format json
archinsight environments . -s <source.ai> --format json
```

The first command returns every declared environment. The source-scoped command
returns exactly the environments relevant to that source's D2 view. Its JSON
uses schema `deployment-environments.v1` and contains the selected `source`
plus `environments` entries with `id`, optional `name`, and the source file
that declares the environment. Use this command before choosing D2
`--environment`; do not scan source text to reconstruct the list.
