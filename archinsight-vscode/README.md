# Archinsight

Archinsight brings architecture-as-code authoring for Insight `.ai` models into Visual Studio Code.

Insight is a typed language for describing software architecture as code. It is designed for C4-style models, but it stays close to readable architecture notes: named attributes, indentation, explicit relationships, imports, and project-wide checks. The extension links your workspace into a single architecture graph and uses that graph for diagnostics, navigation, queries, and diagram previews.

A project can begin with a single `storefront.ai` file:

```insight
context storefront
    name = Storefront

external actor user
    name = User
    technology = Web browser
    links:
        -> frontend

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
- Smart completion from parser context, types, visible declarations, and imports, with constructor and presentation-derived documentation.
- Workspace diagnostics for parser, linker, and type-system errors.
- A custom split editor with Insight source and live diagram preview side by side.
- Built-in view buttons for no-filter, C1, C2, C3, C4, D1 system deployment,
  and D2 container deployment queries.
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

1. Install Archinsight from the Visual Studio Marketplace.
2. Open a workspace containing one or more `.ai` files, or create the
   `storefront.ai` example shown above.
3. Open the file. Archinsight uses its source-and-diagram editor by default.
4. Use the top toolbar to switch between no-filter, C1, C2, C3, C4, D1 system deployment, and D2 container deployment views. D2 automatically selects a single relevant environment or opens a native picker when several are available.
5. Open the `Archinsight Query` panel to inspect or edit the active graph query.
6. Open `Project Structure` in Explorer to navigate declarations.

Useful commands are available from the Command Palette:

- `Archinsight: Link Project`
- `Archinsight: Preview Diagram`
- `Archinsight: Show Structure`
- `Archinsight: Check CLI`
- `Archinsight: Install CLI`
- `Archinsight: Generate Agent Skill`
- `Archinsight: Preview Diagram` view commands for no-filter, C1, C2, C3, C4, D1 system deployment, and D2 container deployment

## CLI and Agent Skills

Install the CLI separately when you want AI agents or shell workflows to work
with Insight models:

```shell
npm install -g @archinsight/cli
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

## Documentation

The [documentation index](https://github.com/lonely-lockley/archinsight/blob/master/docs/index.md)
provides the complete reading order. Start with these guides when learning the
language or organizing a project:

- [The Insight Language](https://github.com/lonely-lockley/archinsight/blob/master/docs/language.md)
- [Comments and Notes](https://github.com/lonely-lockley/archinsight/blob/master/docs/comments-and-notes.md)
- [Annotations](https://github.com/lonely-lockley/archinsight/blob/master/docs/annotations.md)
- [Built-in Archinsight Types](https://github.com/lonely-lockley/archinsight/blob/master/docs/built-in-types.md)
- [Structuring an Insight Project](https://github.com/lonely-lockley/archinsight/blob/master/docs/project-structure.md)
- [Building and Linking an Insight Project](https://github.com/lonely-lockley/archinsight/blob/master/docs/project-processing.md)
- [Querying the Architecture Graph](https://github.com/lonely-lockley/archinsight/blob/master/docs/graph-queries.md)

The modeling guides explain each level and how relationships flow into broader
views:

- [C1: System Context](https://github.com/lonely-lockley/archinsight/blob/master/docs/c1-system.md)
- [C2: Containers and Services](https://github.com/lonely-lockley/archinsight/blob/master/docs/c2-containers.md)
- [C3: Components](https://github.com/lonely-lockley/archinsight/blob/master/docs/c3-components.md)
- [C4: Code](https://github.com/lonely-lockley/archinsight/blob/master/docs/c4-code.md)
- [Deployment](https://github.com/lonely-lockley/archinsight/blob/master/docs/deployment.md)

CLI commands and agent skill generation are covered by the
[CLI reference](https://github.com/lonely-lockley/archinsight/blob/master/archinsight-cli/README.md).

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

## License

Copyright 2021-2026 Alexey Zaytsev

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
