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

Language-changing features must be delivered as a full product slice:

1. update grammar and regenerated parser sources;
2. update parser/syntax context, snapshot collection, linker/runtime semantics,
   and diagnostics;
3. update code completion for partial and incomplete editing states;
4. add tests for every affected stage;
5. update generated-agent skill guidance and examples;
6. update user-facing and developer-facing documentation.

If a layer does not apply, say why in the change summary.

## Type Extensions

Use `extend type` to patch an existing type schema with additional attributes,
child slots, or projection rules:

```insight
extend type Environment
    Compute compute
    Storage storage
```

Type extension is declarative and validated. It is not runtime code execution.
Extending the same type more than once is allowed but reported as a warning so
projects can avoid spreading one effective schema across too many files.

## Presentation Definitions

Use `define presentation` once to create visual defaults for a type:

```insight
define presentation Container
    header = name
    subtitle = technology
    body = description
```

Use `extend presentation` to patch an existing presentation:

```insight
extend presentation Container
    graphviz
        shape = box
```

Repeated `define presentation` blocks for the same target are diagnostics. This
keeps accidental duplicates separate from intentional overrides.

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

## License

Copyright 2021-2026 Alexey Zaytsev

Licensed under the Apache License, Version 2.0. See [LICENSE](../../LICENSE).
