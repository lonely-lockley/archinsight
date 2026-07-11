# Archinsight

Archinsight brings architecture-as-code authoring for Insight `.ai` models into VSCode.

Insight is a typed language for describing software architecture as code. It is designed for C4-style models, but it stays close to readable architecture notes: named attributes, indentation, explicit relationships, imports, and project-wide checks. The extension links your workspace into a single architecture graph and uses that graph for diagnostics, navigation, queries, and diagram previews.

```insight
context example
    name = Example System

external actor user
    name = User
    technology = Web browser
    links:
        -> frontend from example

system application
    name = Application

    container frontend
        name = Frontend
        technology = SvelteKit, TypeScript
        links:
            -> backend

    service backend
        name = Backend API
        technology = Node.js, PostgreSQL
```

## What You Get

- `.ai` language support with syntax highlighting and semantic tokens.
- Smart completion from parser context, types, visible declarations, and imports.
- Workspace diagnostics for parser, linker, and type-system errors.
- A custom split editor with Insight source and live diagram preview side by side.
- Built-in view buttons for no-filter, C1, C2, C3, and C4-style queries.
- Editable query panel for custom graph queries.
- `Project Structure` tree for contexts, types, and declarations.
- Click-to-source navigation from structure and rendered diagram items.
- Download actions for source, SVG, PNG, and DOT.

The extension embeds the shared `@insight/language` runtime directly. It does not need a separate CLI process for diagnostics, completions, linking, querying, or rendering state.

AI agents need the CLI in addition to the VSCode extension. The extension helps
humans author and preview models inside VSCode; the CLI gives ChatGPT, Claude,
Codex, and CI workflows a stable command-line way to validate, inspect
structure, generate skills, and render diagrams.

## Getting Started

1. Open a workspace that contains one or more `.ai` files.
2. Open an `.ai` file. Archinsight opens the custom editor by default.
3. Use the top toolbar to switch between no-filter, C1, C2, C3, and C4 views.
4. Open the `Archinsight Query` panel to edit the active graph query.
5. Open `Project Structure` in Explorer to navigate declarations.

Useful commands are available from the Command Palette:

- `Archinsight: Link Project`
- `Archinsight: Preview Diagram`
- `Archinsight: Show Structure`
- `Archinsight: Check CLI`
- `Archinsight: Install CLI`
- `Archinsight: Generate Agent Skill`
- `Archinsight: Preview Diagram` view commands for no-filter, C1, C2, C3, and C4

## CLI and Agent Skills

Install the CLI separately when you want AI agents or shell workflows to work
with Insight models:

```shell
npm install -g @archinsight/cli@next
```

The extension never installs global npm packages silently. Use
`Archinsight: Check CLI` to verify that `archinsight` is available on `PATH`
and supports agent skill targets. Use `Archinsight: Install CLI` to open an
integrated terminal with the install/update command.

After the CLI is available, use `Archinsight: Generate Agent Skill` to run:

```shell
archinsight skill init . --target codex
```

The command lets you choose `codex`, `claude`, or `generic`. Generated skills
teach agents Insight syntax, project structure inspection, validation, queries,
and rendering. Without the CLI, an agent can read files, but it cannot reliably
validate or inspect the linked architecture graph.

## Editing

The custom editor keeps the source model and diagram preview in one tab. Diagnostics are shown both as VSCode Problems and inline editor markers. Completion works in ordinary VSCode editors and inside the custom editor.

On macOS, VSCode's default `Trigger Suggest` shortcuts are `Ctrl+Space` and `Cmd+I`. If `Ctrl+Space` is captured by macOS input-source switching, `Cmd+I` still opens suggestions.

## Insight Projects

Insight projects can be split across files with imports and extensions. The linker builds a project graph from the workspace sources, so diagnostics and diagrams are project-aware rather than limited to the active file.

The built-in framework includes common architecture concepts such as contexts, systems, containers, services, components, actors, external systems, relationships, and deployment-oriented projections. Deployment core also includes common infrastructure inventory types such as `compute`, `storage`, `broker`, and `networkConnection`; projects can extend environments with those slots and add their own typed architecture vocabulary.

## Development

```shell
npm --prefix archinsight-vscode install
npm --prefix archinsight-vscode run check
```

Create a local VSIX package:

```shell
npm --prefix archinsight-vscode run package
```

The package is written to:

```text
archinsight-vscode/dist/archinsight-vscode-<version>.vsix
```

Gradle also exposes:

```shell
./gradlew :archinsight-vscode:npmBuild
./gradlew :archinsight-vscode:npmCheck
```

The build emits extension host code and webview bundles under `dist/`.

## Architecture Notes

Extension host code lives in `src/extension.ts`.

Webview code lives in `src/webview/`.

The custom editor reuses shared Svelte editor components from `archinsight-web/src/lib` where that code is UI-level and not tied to hosted web state. The language core remains clean: no Monaco, VSCode, Svelte, REST, auth, or filesystem watcher APIs are allowed in `packages/insight-language`.

## License

Apache-2.0
