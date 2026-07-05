# Insight Language

Headless TypeScript language core for Insight editors, CLI tooling, and the
VSCode extension.

This package intentionally keeps the ANTLR runtime behind a small adapter. The completion engine consumes a stable `SyntaxContext`, typed `FileContext`, and project `LanguageSnapshot`. This TypeScript package is the active source of truth for the language.

The package owns:

- parser/runtime facade contracts;
- syntax-aware completion candidate generation;
- authoritative project linking;
- object-extension materialization;
- deployment validation;
- indexed graph/query result construction;
- render model and DOT generation;
- language-service facade for consumers.

It does not own backend repository/auth/storage behavior, Monaco adapters, VS Code adapters, Svelte state, browser tabs, REST resources, or filesystem watch strategy.

Completion candidates must be derived from parser rule context, typed context, and visible declarations/imports. Do not add source-shape shortcuts such as checking whether a line "looks like" a special construct.

## ANTLR adapter

`AntlrInsightSyntaxProvider` is intentionally structural. The generated `antlr4ng` wrapper should:

1. run the lexer/parser;
2. collect tokens and syntax errors, including expected token sets;
3. pass `tree`, `tokens`, `ruleNames`, and a token-name resolver into `createParsedInsightFile`;
4. keep all direct `antlr4ng` imports outside completion logic.

This isolates runtime-specific recovery behavior from candidate generation.

## Runtime Contracts

`npm run test:runtime` runs the current TypeScript language checks:

1. regenerate grammar and sync `core.ai`;
2. compile the TypeScript runtime;
3. verify core snapshot expectations;
4. run completion golden fixtures;
5. run parser failure handling;
6. run language contract fixtures.

Add new language-core behavior to contract fixtures first, then implement the TypeScript runtime slice until the contract passes.

## Consumers

Active consumers:

- `archinsight-cli` loads `.ai` files from a local project directory, links the
  whole project, runs queries, prints structure, and renders DOT/SVG.
- `archinsight-vscode` embeds this package directly for diagnostics,
  completions, structure, query/render state, and live preview. It must not call
  the CLI for core language work.
- `archinsight-web` uses this package in browser/server adapters for Monaco,
  API responses, repository overlays, and diagram rendering.

Consumer adapters may translate language results into Monaco markers, VSCode
diagnostics/completions, Svelte state, CLI stdout/stderr, or HTTP DTOs. Those
translations must stay outside this package.

## Core Framework Source

The canonical built-in framework file is:

```text
src/main/resources/com/github/lonelylockley/insight/core.ai
```

The generated TypeScript snapshot is:

```text
packages/insight-language/src/generated/core-source.ts
```

Run `npm run sync:core` after editing `core.ai`. Do not hand-edit the generated
snapshot.
