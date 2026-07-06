# Archinsight VSCode Extension

Native VSCode support for Insight `.ai` architecture models.

The extension embeds `@insight/language` directly. It does not shell out to
`archinsight-cli` for diagnostics, completion, linking, query, or rendering
state.

## Features

- `.ai` language registration.
- TextMate syntax highlighting plus semantic tokens.
- Smart completion from parser rule context, typed context, visible
  declarations, and imports.
- Workspace-wide diagnostics through `DiagnosticCollection`.
- Custom Archinsight editor with code/diagram split view.
- Automatic diagram preview rendering.
- Built-in C1/C2/C3/C4/no-filter query buttons.
- Shared `Archinsight Query` bottom-panel query editor.
- `Project Structure` Explorer view with type/declaration trees.
- Click-to-declaration from structure and diagram nodes/edges.
- Download source, SVG, PNG, and DOT.

## Development

```shell
npm --prefix archinsight-vscode install
npm --prefix archinsight-vscode run check
```

Gradle also exposes:

```shell
./gradlew :archinsight-vscode:npmBuild
./gradlew :archinsight-vscode:npmCheck
```

The build emits extension host code and webview bundles under `dist/`.

## Package and Publish

Create a local `.vsix` package:

```shell
npm --prefix archinsight-vscode run package
```

The package is written to:

```text
archinsight-vscode/dist/archinsight-vscode-<version>.vsix
```

Publish to the Visual Studio Marketplace:

```shell
npm --prefix archinsight-vscode run publish:marketplace
```

`vsce publish` expects a marketplace publisher token in the environment or an
authenticated VSCE session. Before publishing, update the extension version in
`package.json`, commit the change, and make sure the working tree is clean.

## Architecture

Extension host code lives in:

```text
src/extension.ts
```

Webview code lives in:

```text
src/webview/
```

The custom editor reuses shared Svelte editor components from
`archinsight-web/src/lib` where that code is UI-level and not tied to hosted web
state. The language core remains clean: no Monaco, VSCode, Svelte, REST, auth,
or filesystem watcher APIs are allowed in `packages/insight-language`.

## Contributions

The extension contributes:

- Language id `insight` for `.ai` files.
- TextMate grammar from `syntaxes/insight.tmLanguage.json`.
- Custom editor `archinsight.editor` for `.ai` files.
- Commands for project linking, diagram preview, C1/C2/C3/C4/no-filter views,
  query editing, structure filtering, and downloads.
- Explorer view `Project Structure`.
- Panel view `Archinsight Query`.

## UI Notes

- The Explorer contributes `Project Structure`.
- The bottom panel contributes `Archinsight Query`.
- The custom editor owns live source editing and diagram preview in one tab.
- VSCode-native diagnostics and completion stay outside the webview.
- Breadcrumbs are disabled for `insight` documents by extension defaults to keep
  the custom editor header compact.
