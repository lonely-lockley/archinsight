# Archinsight

Archinsight is an architecture-as-code toolkit built around the Insight language.

Insight is a domain-specific language for describing software architecture as code. It is based on the C4 model and allows a user to describe architecture from a system-level view down to individual components inside a selected service. The Insight language core links these descriptions into a single project graph and uses that graph for checks, queries, navigation, and diagram generation.

The language is designed to read like an architecture note. It uses named descriptive attributes, natural component nesting, and explicit relationships to express the technical details that matter for the model. The syntax is based on indentation, so a small model can be written without much ceremony.

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
        technology = Quarkus, PostgreSQL
```

Insight is a strictly typed language. The built-in framework provides common architecture concepts for C4-style models, and projects can extend it with their own concepts when the architecture needs a more specific vocabulary. This allows a larger team to work with shared architecture concepts captured directly in the model.

The language supports:

* C4-style modeling with contexts, systems, containers, services, components, actors, and external systems
* Strict typing for model elements, attributes, references, constructors, and language extensions
* User-defined types for organization-specific architecture concepts
* Named attributes and natural nesting for readable source files
* Imports and extensions for splitting large models across files and contexts
* Query-driven diagram generation from the linked project graph using a Cypher-style query language
* Graphviz rendering with model metadata for navigation and editor integration
* Deployment modeling that connects logical relationships to deployment capabilities via projections

Deployment can be modeled together with the logical architecture. A relationship between two services can be connected to the deployment capability that realizes it: a public gateway, private route, egress path, load balancer, storage dependency, service mesh, or another infrastructure concept defined by the project.

The current codebase is a TypeScript workspace built around a shared headless language core. The web editor, CLI, and VSCode extension all use the same `@insight/language` package for parsing, linking, diagnostics, completions, queries, and Graphviz output.

## Components

- [Web editor](archinsight-web/README.md) - SvelteKit application with repository APIs, Monaco editing, authentication, and browser-side diagram rendering.
- [CLI](archinsight-cli/README.md) - local command-line tool for linking, querying, rendering, and inspecting `.ai` projects.
- [VSCode extension](archinsight-vscode/README.md) - native editor support, diagnostics, completions, structure view, and diagram preview.
- [Language core](packages/insight-language/README.md) - shared TypeScript parser/runtime, linker, query engine, completion engine, and Graphviz renderer.
- [Renderer service](archinsight-renderer/README.md) - hardened DOT-to-SVG/PNG service for server-side rendering paths.

## Repository Layout

```text
archinsight-web/         SvelteKit web app and HTTP API
archinsight-cli/         Node.js CLI
archinsight-vscode/      VSCode extension and webviews
archinsight-renderer/    Optional server-side render service
packages/insight-language/
                         Shared TypeScript Insight language core
src/main/resources/com/github/lonelylockley/insight/
                         Built-in Insight framework sources
```

## Development

Install dependencies per package, then use the package scripts or Gradle wrapper tasks. The most useful checks are:

```shell
npm --prefix packages/insight-language run test:runtime
npm --prefix archinsight-web run check
npm --prefix archinsight-web run test:server
npm --prefix archinsight-web run test:security
npm --prefix archinsight-cli run check
npm --prefix archinsight-vscode run check
npm --prefix archinsight-renderer test
```

Gradle exposes wrapper tasks for the application packages:

```shell
./gradlew :archinsight-web:npmCheck
./gradlew :archinsight-cli:npmCheck
./gradlew :archinsight-vscode:npmCheck
./gradlew :archinsight-renderer:test
```

Editing the built-in framework files under `src/main/resources/.../insight/` requires regenerating the TypeScript snapshot:

```shell
npm --prefix packages/insight-language run sync:core
```

Generated outputs such as `.svelte-kit/`, `dist/`, package build directories, generated ANTLR sources, and `archinsight-cli/src/version.ts` are intentionally ignored.

## License

Copyright 2021-2026 Alexey Zaytsev

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
