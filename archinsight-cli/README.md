# Archinsight CLI

Command-line interface for local Insight projects.

The CLI scans `.ai` files recursively, builds the project language snapshot,
links the full model, and then runs link, structure, query, or render commands.
It embeds `@insight/language` directly and does not call the web app.

## Commands

```shell
archinsight link [project-dir] [--format text|json] [--out file]
archinsight structure [project-dir] [--format text|json] [--out file]
archinsight query [project-dir] -c <context> [-s <source>] [-v c1|c2|c3|c4|no-filter] [-q query.aiq] [-f text|json] [-o file]
archinsight render [project-dir] -c <context> [-s <source>] [-v c1|c2|c3|c4|no-filter] [-q query.aiq] [-f dot|svg|json] [-o file]
```

`project-dir` defaults to the current directory.

## Common Options

- `-c, --context <id>` - context id for query/render.
- `-s, --source <file>` - selected source file for queries using `$tab`.
- `--tab <source>` - compatibility alias for `--source`.
- `-v, --view <name>` - built-in view: `c1`, `c2`, `c3`, `c4`, `no-filter`.
- `-q, --query <file>` - custom query file; overrides `--view`.
- `-f, --format <format>` - command output format.
- `-o, --out <file>` - write payload output to a file instead of stdout.
- `-t, --theme <theme>` - render theme; defaults to `light`.
- `-V, --version` - print version.
- `-h, --help` - print help.

## Examples

Link a project and print diagnostics:

```shell
npm --prefix archinsight-cli run build
node archinsight-cli/build/index.js link examples --format text
```

Render DOT for a context using the C2 built-in query:

```shell
node archinsight-cli/build/index.js render examples -c demo -s main.ai -v c2 -f dot
```

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
core is bundled into the CLI artifact; `@viz-js/viz` remains an external runtime
dependency for SVG rendering.

Prepare and inspect the package:

```shell
npm --prefix archinsight-cli run check
npm --prefix archinsight-cli run pack:dry
```

Publish to npm:

```shell
npm --prefix archinsight-cli run publish:npm
```

Before publishing, update the package version in `package.json`, commit the
change, and make sure the working tree is clean.
