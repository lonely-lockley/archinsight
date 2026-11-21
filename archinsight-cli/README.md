# Archinsight CLI

Command-line interface for local Insight projects.

The CLI scans `.ai` files recursively, builds the project language snapshot,
links the full model, and then runs link, structure, query, render, diff, or
deterministic diagram quick-action commands.
It embeds `@insight/language` directly and does not call the web app.

## Commands

```shell
archinsight link [project-dir] [--format text|json] [--out file]
archinsight structure [project-dir] [--format text|json] [--out file]
archinsight query [project-dir] [-s <source>] [-c <context>] [-v c1|c2|c3|c4|deployment-system|deployment-container|deployment|no-filter] [-e <environment>] [-q <query.aiq>] [--param name=<json>] [--params file.json] [-f text|json|csv] [-o file]
archinsight render [project-dir] [-s <source>] [-c <context>] [-v c1|c2|c3|c4|deployment-system|deployment-container|deployment|no-filter] [-e <environment>] [-q <query.aiq>] [-f text|json|dot|svg|png] [-o file]
archinsight diff [project-dir] --from <commit> --to <commit> [-s <source>] [-c <context>] [-v c1|c2|c3|c4|deployment-system|deployment-container|deployment|no-filter] [-e <environment>] [-q <query.aiq>] [--param name=<json>] [--params file.json] [-f text|json|dot|svg|png] [-o file]
archinsight environments [project-dir] [-s <source>] [--format text|json] [--out file]
archinsight quick-action drill-down [project-dir] --element <id> [-f text|json|dot|svg|png] [-o file]
archinsight quick-action isolate [project-dir] --element <id> [-v <view>] [-s <source>] [-c <context>] [-f text|json|dot|svg|png] [-o file]
archinsight quick-action deployment [project-dir] --element <id> [-e <environment>] [-f text|json|dot|svg|png] [-o file]
archinsight quick-action find-path [project-dir] --from <id> --to <id> [-v <view>] [-s <source>] [-c <context>] [-e <environment>] [-f text|json|dot|svg|png] [-o file]
archinsight quick-action declaration [project-dir] --element <id> [-f text|json|dot|svg|png] [-o file]
archinsight skill init [project-dir] [--target generic|codex|claude] [--out dir] [--force]
```

`project-dir` defaults to the current directory.

## Common Options

- `-s, --source <file>` - selected model file. It supplies `$tab` and determines
  the context for the diagram.
- `-c, --context <id>` - explicit context for context-wide execution without a
  source. When both options are present, the context must match the selected
  file.
- `--tab <source>` - compatibility alias for `--source`.
- `-v, --view <name>` - built-in view: `c1`, `c2`, `c3`, `c4`, `deployment-system`, `deployment-container`, `deployment`, `no-filter`.
- `-e, --environment <id>` - environment selected for `deployment-container`. It may be omitted when the source reaches exactly one environment.
- `--element <id>` - canonical element id for Drill down, Isolate, Deployment, or Go to
  declaration.
- `--from <value>` and `--to <value>` - ordered source and target ids for Find
  path, or the earlier and later git revisions for `diff`.
- `-q, --query <file>` - custom query file; mutually exclusive with `--view`;
  relative paths are resolved from `project-dir`.
- `--param <name=json>` - query parameter; repeat for multiple parameters.
- `--params <file>` - query parameters from a JSON object.
- `--max-expansions <n>` - maximum candidate and edge checks during query execution.
- `--max-rows <n>` - maximum rows materialized by one query stage.
- `--max-values <n>` - maximum collected values and materialized path parts.
- `--max-output-bytes <n>` - maximum serialized query result size.
- `--timeout-ms <n>` - query execution deadline after linking.
- `-f, --format <format>` - command output format.
- `-o, --out <file>` - write payload output to a file instead of stdout.
- `-t, --theme <system|light|dark>` - render theme. It follows the operating
  system by default and falls back to `light` when the preference is unavailable.
  Use an explicit theme for reproducible CI output.
- `--target <target>` - skill target for `skill init`: `generic`, `codex`, or `claude`.
- `--force` - replace the complete generated skill directory after the new
  package has been generated successfully.
- `-V, --version` - print version.
- `-h, --help` - print help.

Output formats follow the kind of result:

| Commands | Formats |
| --- | --- |
| `link`, `structure`, `environments`, `icons` | `text`, `json` |
| `query` | `text`, `json`, `csv` for tables; `text`, `json` for graphs |
| `render`, `diff`, every `quick-action` | `text`, `json`, `dot`, `svg`, `png` |

Use `render --query <file.aiq>` when a graph-returning custom query must be
exported as DOT, SVG, or PNG. Table-returning queries are data rather than
diagrams and remain available through `query` as text, JSON, or CSV.

SVG and PNG rendering automatically include technology icons resolved from the
model's `technology` attribute or explicit `@icon(...)` annotation. See
[Annotations](https://github.com/lonely-lockley/archinsight/blob/master/docs/annotations.md#icon)
for selection and override rules.

List every valid annotation id with `archinsight icons`. Search ids and labels
with `archinsight icons <search>`; both forms accept `--format text|json`.

## Visual Diff Between Git Revisions

`diff` links the project independently at two commits, selects the same view in
both models, and compares the resulting diagram graphs. This makes projected or
rolled-up relationships visible at every place where the selected view changes,
regardless of the source file that declared the underlying relationship.

```shell
archinsight diff . \
  --from main~1 --to main \
  --source models/storefront.ai --view c2 \
  --format svg --out architecture-diff.svg
```

Added elements and relationships are green, removed ones are red, and changed
ones are yellow. Unchanged graph content remains in its ordinary presentation.
Element identity is its canonical linked id. Relationships are matched by their
rendered endpoints and semantic content, so a source line shift alone does not
create a false removal and addition.

The default format is DOT. SVG and PNG produce a ready-to-view diagram; text
prints counts by change kind followed by one line for every added, removed, or
changed element, edge, and group. JSON returns `diagram-diff.v1` together with an
`attributed-diagram-diff.v1` result: stable change ids, semantic source origins,
Git blame commits/authors for changed entries, attribution diagnostics, both
revisions, and the styled DOT source. Exact source ranges are used when the
linked model provides them; otherwise attribution explicitly reports its
declaration-level fallback. `project-dir` must be inside a git worktree, but the
command reads both models directly from git objects and does not modify the
working tree.

A custom `--query` is evaluated unchanged against both revisions and is read
from the current working tree. Supply its graph-query parameters with repeated
`--param name=<json>` options or one `--params file.json` object; the same
validated values are used for both revisions. Use this when the comparison
itself should stay fixed while the model moves between commits. As with
`render`, `--query` and `--view` are mutually exclusive.

If an explicitly selected source exists in only one revision, the missing side
is compared with an empty graph and stderr reports `DIFF_SOURCE_MISSING`. The
warning keeps the absent scope from looking like a silent empty result. Check
for a rename or move with `git log --follow -- <source>` or a context-scoped
diff before interpreting it as a complete source addition or removal.

## Diagram Scope

The selected source is the normal entry point for a diagram. C2, C3, C4, D1,
D2, and the legacy Deployment view are source-centric and require `--source`
when the project contains several `.ai` files. If `project-dir` points directly
to one `.ai` file, that file is selected automatically.

C1 uses the context declared by the selected source and opens that context
boundary completely. It can also run without a source when `--context <id>` is
provided. `no-filter` follows the same context-wide rule.

The CLI validates explicit scope. An unknown context is an error, and a context
that differs from the one declared by `--source` is a conflict rather than an
override. A custom query that uses `$tab` requires a source. A custom query that
uses `$context` receives it from the selected source or from an explicit
`--context`.

D1 selects every environment relevant to the source and does not accept
`--environment`. D2 selects one environment. The CLI chooses it automatically
when exactly one is relevant and otherwise lists the available environments and
requires `--environment <id>`.

## Diagram Quick Actions

The CLI provides the same common actions as the diagram UI:

```shell
archinsight quick-action drill-down . --element shop --format json
archinsight quick-action isolate . --element shop/api --format json
archinsight quick-action deployment . --element shop/api --environment eu --format json
archinsight quick-action find-path . --from shop/user --to external/google --view c2 --source shop.ai --format json
archinsight quick-action declaration . --element shop/api --format json
```

The element arguments are canonical linked ids. Resolve them with
`archinsight structure . --format text|json` or read them from query JSON;
display titles are not accepted as substitutes.

JSON is the default and uses schema `diagram-quick-action.v1`. Drill down opens
the next architecture level. Isolate shows the selected element and its direct
connections. Deployment shows the element in one environment. Find path shows
a route from `--from` to `--to`; when no route is found, JSON reports
`pathFound: false`. Declaration returns the source file, line, and column.

Find path never treats edges as undirected. `--from A --to B` and
`--from B --to A` are separate requests and may produce different results. To
reverse the search, swap the two arguments explicitly.

Every quick action also supports text, DOT, SVG, and PNG. Write binary output to a
file:

```shell
archinsight quick-action find-path . \
  --from shop/user --to external/google \
  --format png --out user-to-google.png
```

For graphical formats, Declaration produces a one-element subdiagram while
JSON also includes the source coordinates.

Use custom AIQ when the analysis needs predicates, aggregation, tables,
unbounded traversal without a fixed target, or a reusable project-owned view.

The ordinary `render` command supports the same diagram output formats. This
also applies when `render` executes a custom graph-returning `.aiq` query:

```shell
archinsight render . --query views/dependencies.aiq --format png --out dependencies.png
```

## Custom Query Files

Keep reusable project queries in `.aiq` files. Place them under `views/` with a
descriptive name unless you intentionally choose another location:

```text
views/
    dependencies.aiq
    c2.aiq
```

Run a custom query or render its result by passing the file explicitly:

```shell
archinsight query . -s models/storefront.ai -q views/dependencies.aiq --format json
archinsight render . -s models/storefront.ai -q views/dependencies.aiq --format svg --out dependencies.svg
```

Use `--context` instead of `--source` when the query needs `$context` but does
not use `$tab`. Relative query paths are resolved from `project-dir`.

The web workspace discovers `.aiq` files recursively by basename. A name such
as `dependencies.aiq` creates a custom view. Reserved filenames `no-filter.aiq`,
`c1.aiq`, `c2.aiq`, `c3.aiq`, `c4.aiq`, `deployment-system.aiq`,
`deployment-container.aiq`, and `deployment.aiq` override the corresponding
web view. Discovery skips hidden directories, `node_modules`, `build`, and
`dist`, so generated agent-skill examples are not project queries. Other
directories do not affect identity or precedence, so duplicate basenames
conflict.

CLI execution is explicit: it does not discover these files and does not apply
filename-based overrides. `-q views/c2.aiq` runs that file as a standalone
query, while `-v c2` runs the C2 query bundled with the CLI. `--query` and
`--view` are mutually exclusive; combining them is a CLI error.

## Environment Discovery

List every declared environment without parsing model sources:

```shell
archinsight environments . --format json
```

Add a source to return only the environments relevant to that source's D2
diagram:

```shell
archinsight environments . --source storefront.ai --format json
```

The JSON response has a versioned, automation-friendly shape:

```json
{
  "schemaVersion": "deployment-environments.v1",
  "source": "storefront.ai",
  "environments": [
    {
      "id": "eu_west",
      "name": "Europe West",
      "source": "infrastructure/eu-west.ai"
    }
  ]
}
```

The top-level `source` is `null` for the complete project inventory. Each
environment entry contains the model source that declares its infrastructure.
Text output contains one tab-separated `id`, `name`, and source path per line.

## Examples

Link a project and print diagnostics:

```shell
npm --prefix archinsight-cli run build
node archinsight-cli/build/index.js link examples/layered-architecture.ai --format text
```

Render DOT from a model file using the C2 built-in query:

```shell
node archinsight-cli/build/index.js render examples/layered-architecture.ai -v c2 -f dot
```

Inspect one environment at container deployment detail:

```shell
archinsight environments . -s storefront.ai --format json
archinsight query . -s storefront.ai -v deployment-container --environment eu_west --format json
```

Generate a portable AI-agent guide for an Insight project:

```shell
archinsight skill init --target generic
```

The generic target writes a runtime-neutral guide:

```text
.archinsight/agent/
    archinsight.md
    references/
        cli.md
        quick-actions.md
        modeling.md
        importing-models.md
        syntax.md
        layered-architecture.md
        c1-context.md
        c2-containers.md
        c3-components.md
        c4-code.md
        deployment.md
        deployment-projections.md
        scaling.md
        project-structure.md
        core.md
        analysis.md
        queries.md
        custom-views.md
        query-recipes.md
        validation.md
    .core/
        *.ai
    examples/
        layered-architecture.ai
        c1-context.ai
        c2-containers.ai
        c2-file-split/
            context.ai
            storefront.ai
        c3-components.ai
        c3-file-split/
            system.ai
            checkout-components.ai
            web-components.ai
        c4-code/
            definitions.ai
            model.ai
        deployment-framework.ai
        deployment-infrastructure.ai
        deployment.ai
        deployment-projections/
            gateway/
            storage/
            broker/
            egress/
            monitoring/
        deployment-private-gateway/
            deployment-framework.ai
            source-infra.ai
            source-system.ai
            target-infra.ai
            target-system.ai
            external.ai
        c2-containers.aiq
        builtin-views/
            no-filter.aiq
            c1.aiq
            c2.aiq
            c3.aiq
            c4.aiq
            deployment-system.aiq
            deployment-container.aiq
            deployment.aiq
        queries/
            async-topic-dependencies.aiq
            async-topics.aiq
            deployment-internal-actors.aiq
            direct-authored-dependencies.aiq
            direct-service-dependencies.aiq
            impact.aiq
            inventory.aiq
            kafka-service-dependencies.aiq
            kafka-topics.aiq
            no-incoming-dependencies.aiq
            shortest-path.aiq
            sync-impact.aiq
            system-async-consumers.aiq
            system-impact.aiq
            type-summary.aiq
```

Codex and Claude targets package the same Insight reference directly into the
native skill folders:

```shell
archinsight skill init --target codex
archinsight skill init --target claude
```

```text
.codex/skills/archinsight/
    SKILL.md
    agents/openai.yaml
    references/
    examples/

.claude/skills/archinsight/
    SKILL.md
    references/
    examples/
```

After generating a Codex or Claude skill into the default location, restart the
agent session so the skill is discovered. Pass `--out <dir>` to write the same
package somewhere else.

The guide records the exact CLI version that generated it and tells agents to regenerate the package when that version differs, treat `archinsight` as the validation source of truth,
avoid guessing Insight syntax from other architecture DSLs, inspect project
structure before broad edits or imports, read bundled core language sources for
built-in types/presentations/projections, describe systems layer by layer, and
write custom `.aiq` diagram queries with the supported Cypher-style subset.
Dedicated references cover semantic import from C4-oriented DSLs, diagrams,
inventories, and prose, plus read-only analysis through structure inspection
and focused AIQ table reports. It uses graph-query JSON only when a question
cannot be expressed faithfully in AIQ or an unexpected result needs diagnosis.
For deployment and query changes it requires `query --format json` semantic
inspection before rendering. The JSON reference distinguishes selected graph
endpoints, underlying linked edges, and logical projection origins.
The bundled C4 reference explains the constructorless `CodeElement` extension
point, project-defined code vocabularies, component containment, and the
minimal built-in query that selects code elements from the current semantic
tab.
The bundled deployment reference explains context-owned profiles with
`appliesTo: <deployment> from <environment>`, element placement through those
profiles, and wire-level `uses` restricted to `NetworkConnection` descendants.
Its examples also cover projection rules for storage and physical network paths.

## Output Contract

Payload output goes to stdout unless `--out` is supplied.

Diagnostics and status lines go to stderr as TSV:

```text
level<TAB>code<TAB>source<TAB>line<TAB>column<TAB>message
```

`render` runs link first. It writes a linker summary before rendering, then a
render success/failure status line.

```text
INFO	LINKER_FINISHED	-	0	0	Linker finished: errors: 0, warnings: 0, notes: 5
INFO	RENDER_FINISHED	-	0	0	Render finished: diagram rendered successfully
```

## Build and Check

```shell
npm --prefix archinsight-cli run check
```

Gradle also exposes:

```shell
./gradlew :archinsight-cli:npmBuild
./gradlew :archinsight-cli:npmCheck
```

The CLI version is generated from the Gradle project version into
`src/version.ts`. That file is generated and should not be committed.

## Package and Publish

The npm package publishes the bundled CLI from `build/`. The TypeScript language
core is bundled into the CLI artifact; `@viz-js/viz` and `@resvg/resvg-js`
remain external runtime dependencies for SVG and PNG rendering.

Prepare and inspect the package:

```shell
npm --prefix archinsight-cli run check
npm --prefix archinsight-cli run pack:dry
```

Publish to npm:

```shell
npm --prefix archinsight-cli run publish:npm
```

Before publishing, update `gradle.ext.archinsightVersion` in the root
`settings.gradle`, run the Gradle build to synchronize package manifests and
locks, commit those changes, and make sure the working tree is clean.

## License

Copyright 2021-2026 Alexey Zaytsev

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
