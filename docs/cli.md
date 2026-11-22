# Archinsight CLI

The Archinsight CLI is the local and automation interface for Insight projects.
It validates models, inspects project structure, runs architecture queries,
renders diagrams, compares Git revisions, and performs common diagram actions
without opening the web editor.

## Installation

Install the CLI globally when the `archinsight` command should be available
across projects:

```shell
npm install -g @archinsight/cli
archinsight --version
```

For a repository that already manages Node.js developer tools, install it as a
project dependency instead:

```shell
npm install --save-dev @archinsight/cli
npm exec -- archinsight --version
```

Use the repository's existing package manager and lockfile. Run
`archinsight --help` or `npm exec -- archinsight --help` for the exact options
supported by the installed version.

## Project input

Every project command accepts a project directory. It defaults to the current
directory. Archinsight scans `.ai` files recursively and ignores hidden and
generated directories such as `.archinsight`, `node_modules`, `build`, and
`dist`.

```shell
archinsight link .
archinsight link path/to/project
```

A single `.ai` file can also be used as the input when only that source should
form the project:

```shell
archinsight link models/storefront.ai
```

## Typical workflow

Validate the complete model first:

```shell
archinsight link . --format text
```

Inspect its linked structure when selecting a source, context, or canonical
element id:

```shell
archinsight structure . --format text
```

Inspect the semantic graph before judging a rendered image:

```shell
archinsight query . --source models/storefront.ai --view c2 --format json
```

Render the same view when the selected graph is correct:

```shell
archinsight render . --source models/storefront.ai --view c2 \
  --format svg --out storefront.svg
```

## Commands

| Command | Purpose |
| --- | --- |
| `link` | Validate parsing, types, imports, references, operators, and linking. |
| `structure` | Print linked contexts, sources, types, elements, and relationships. |
| `query` | Run a built-in view or a project `.aiq` query and return graph or table data. |
| `render` | Export a selected diagram as text, JSON, DOT, SVG, or PNG. |
| `environments` | List all deployment environments or those relevant to one source. |
| `quick-action` | Run Drill down, Isolate, Deployment, Find path, or declaration lookup. |
| `diff` | Compare the same semantic diagram between two Git revisions. |
| `icons` | List or search the technology-icon catalogue. |
| `skill init` | Generate an Archinsight skill package for an AI agent. |

The [query documentation](graph-queries.md) describes built-in and custom
queries. [Diagram Quick Actions](diagram-quick-actions.md) explains the
temporary subdiagram actions, and [Building and Linking an Insight
Project](project-processing.md) explains what each validation stage means.

## Selecting diagram scope

Use `--source <file>` (`-s`) as the normal entry point for C2, C3, C4, and
deployment views. It supplies the active source and determines its context.

```shell
archinsight query . -s models/storefront.ai -v c3 --format json
```

Use `--context <id>` (`-c`) for a context-wide C1 or `no-filter` query when no
source is selected. If both options are present, they must identify the same
context.

Built-in views are selected with `--view <name>` (`-v`). A project-owned query
is selected with `--query <file>` (`-q`). These options are mutually exclusive:

```shell
archinsight query . -s models/storefront.ai -q reports/dependencies.aiq \
  --format json
```

For the `deployment-container` view, pass `--environment <id>` when the source
is relevant to more than one environment. `archinsight environments` reports
the available ids.

## Output

Use `--format` (`-f`) to select an output format and `--out` (`-o`) to write it
to a file. Without `--out`, payload output is written to standard output.

| Result | Formats |
| --- | --- |
| Diagnostics, structure, environments, icons | `text`, `json` |
| Graph query | `text`, `json` |
| Table query | `text`, `json`, `csv` |
| Diagram, diff, quick action | `text`, `json`, `dot`, `svg`, `png` |

Rendering follows the operating-system light or dark preference by default.
Use `--theme light` or `--theme dark` when output must be reproducible.

Diagnostics and progress remain on standard error so JSON, CSV, SVG, PNG, and
other payloads can be redirected or consumed by automation. A command exits
with a non-zero status when it cannot produce a valid requested result.

## Project analysis cache

Project analysis is cached in `.archinsight/cache` by default. No opt-in is
required. Repeated commands reuse unchanged work, while source changes refresh
the cached analysis.

The cache is local and disposable. Add it to `.gitignore`:

```gitignore
.archinsight/cache/
```

Removing the directory only makes the next command perform a cold analysis.
Unreadable, damaged, or incompatible cached data is ignored automatically.

Use `--no-cache` for one uncached run:

```shell
archinsight link . --no-cache
```

Use `--cache-dir <dir>` to select another location:

```shell
archinsight link . --cache-dir /tmp/archinsight-cache
```

`--no-cache` and `--cache-dir` are mutually exclusive. Cache failures do not
prevent the command from analyzing the project normally.

## Agent skills

Generate a skill package that matches the installed CLI version:

```shell
archinsight skill init . --target codex
archinsight skill init . --target claude
archinsight skill init . --target generic
```

The standard output directory depends on the target. Use `--out <dir>` for a
dedicated location. Replacing an existing generated package requires an
explicit `--force`; keep project-authored instructions outside that generated
directory.

