# Archinsight CLI

Command-line consumer of the headless Insight language core.

The CLI works against a local project directory. It scans `.ai` files
recursively, links the full project, then runs the requested command.

## Build

```shell
npm run build
```

Gradle also exposes:

```shell
./gradlew :archinsight-cli:npmBuild
./gradlew :archinsight-cli:npmCheck
```

The CLI version is generated from the Gradle project version into
`src/version.ts`.

## Usage

```shell
archinsight link [project-dir] [--format text|json] [--out file]
archinsight render [project-dir] -c <context> [-s <source>] [-v c1|c2|c3|c4|no-filter] [-q query.aiq] [-f dot|svg|json] [-o file]
archinsight query [project-dir] -c <context> [-s <source>] [-v c1|c2|c3|c4|no-filter] [-q query.aiq] [-f text|json] [-o file]
archinsight structure [project-dir] [--format text|json] [--out file]
```

Options:

- `project-dir` - project directory to scan recursively; defaults to the
  current directory.
- `-c, --context <id>` - context id for query/render.
- `-s, --source <file>` - selected source file for queries using `$tab`.
- `--tab <source>` - compatibility alias for `--source`.
- `-v, --view <name>` - built-in view: `c1`, `c2`, `c3`, `c4`, `no-filter`.
- `-q, --query <file>` - query file; overrides `--view`.
- `-f, --format <format>` - command output format.
- `-o, --out <file>` - write payload output to a file instead of stdout.
- `-t, --theme <theme>` - render theme; defaults to `light`.
- `-V, --version` - print version.
- `-h, --help` - print help.

## Output Contract

Payload output goes to stdout unless `--out` is supplied.

Diagnostics and status lines go to stderr as TSV:

```text
level<TAB>code<TAB>source<TAB>line<TAB>column<TAB>message
```

`render` runs link first. It writes a linker summary before rendering, then a
render success/failure status line.

Example:

```text
INFO	LINKER_FINISHED	-	0	0	Linker finished: errors: 0, warnings: 0, notes: 5
INFO	RENDER_FINISHED	-	0	0	Render finished: diagram rendered successfully
```
