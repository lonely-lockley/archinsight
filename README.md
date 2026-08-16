# Archinsight

Archinsight is a toolkit for software architecture modelling as code. Models are written in the typed, extensible Insight language and linked into a semantic project graph used for validation, navigation, dependency analysis, queries, deployment projection, and diagram generation.

The project includes a CLI, a VSCode extension, a generated skill for AI agents, and a web viewer. The CLI, extension, and web viewer use the same language runtime, so types, diagnostics, queries, linking, and rendering behave consistently across interactive and automated workflows. Agent skills teach AI tools how to work with an Insight project and validate their changes through the same CLI and linker.

## Why Archinsight

- **Model with a type system.** Types describe required attributes, references, valid nesting, relationships, deployment mappings, and other structural rules. The linker checks those rules across the project, while editors and agents use the same schema for completion and navigation.

- **Capture the vocabulary of an organization.** Teams can define their own types, constructors, operators, infrastructure capabilities, enums, and visual conventions. Reviewed framework definitions become reusable architectural building blocks instead of loose tags or naming conventions.

- **Keep architecture facts separate from their representations.** The linked semantic graph is the authoritative model. C1, C2, C3, C4, source-focused, and custom views are derived from that graph rather than maintained as independent diagrams.

- **Trace logical dependencies through deployment.** Profiles map logical elements to concrete deployments, while projections expand logical dependencies into the network and infrastructure paths that implement them. Different environments can realize the same logical relationship in different ways without duplicating the logical model.

- **Make ownership and provenance explicit.** Contexts establish logical boundaries, source files remain explicit units of authorship, and imports record dependencies between source boundaries. `extend` allows several sources to contribute to one model object without losing where each contribution came from.

- **Scale the model independently from the repository layout.** Semantic identities come from contexts, environments, and model objects rather than file paths. Models can be reorganized, split, and extended without renaming the architecture they describe.

- **Derive views for the question at hand.** Graph queries can select architectural levels, source scopes, relationships, inherited types, derived dependencies, deployment projections, and visual groups. Built-in C1, C2, C3, C4, and unfiltered views are ordinary queries over the same linked model.

## Insight language and project model

Insight is the language used to define both architecture models and the frameworks that describe their vocabulary. The language documentation covers its type system, built-in architecture types, project structure, linker semantics, and graph query model:

- [The Insight Language](docs/language.md)
- [Comments and Notes](docs/comments-and-notes.md)
- [Annotations](docs/annotations.md)
- [Built-in Archinsight Types](docs/built-in-types.md)
- [Structuring an Insight Project](docs/project-structure.md)
- [Building and Linking an Insight Project](docs/project-processing.md)
- [Querying the Architecture Graph](docs/graph-queries.md)

The modeling guides follow the architecture from its logical context to its physical deployment:

- [C1: System Context](docs/c1-system.md)
- [C2: Containers and Services](docs/c2-containers.md)
- [C3: Components](docs/c3-components.md)
- [C4: Deployment](docs/c4-deployment.md)

A small project can begin with a single `storefront.ai` file:

```insight
context storefront
    name = Storefront

external actor customer
    name = Customer
    links:
        -> frontend

system commerce
    name = Commerce Platform

    container frontend
        name = Web application
        technology = SvelteKit, TypeScript
        links:
            -> orders

    service orders
        name = Orders API
        technology = Kotlin, PostgreSQL
```

A separate `framework.ai` file can introduce project-specific concepts and constraints:

```insight
define type PublicApi of Service
    constructor publicApi

    required Text owner
    required Text protocol

define presentation PublicApi
    subtitle = protocol
```

`PublicApi` inherits the service schema, adds two required attributes, and receives its own constructor and presentation. The linker requires `owner` and `protocol` on every `publicApi` declaration, while language tooling can discover the same schema for completion and navigation.

Insight keeps framework definitions separate from architecture models. A definitions file contains `define` and `extend type` declarations, while context declarations such as the `storefront` model live in their own files. Mixing definitions and a `context` in the same source file produces an error.

## Getting started

Install the CLI from npm:

```shell
npm install -g @archinsight/cli
archinsight --version
```

Create an empty project directory and save the `storefront.ai` model shown above. From that directory, run the linker to validate the model:

```shell
archinsight link .
```

Then render its container view to an SVG image:

```shell
archinsight render . --context storefront --source storefront.ai --view c2 --format svg --out architecture.svg
```

The resulting `architecture.svg` contains the systems, containers, services, and relationships selected by the built-in C2 query. You can now split the model across files, introduce definitions, or open the directory in the VSCode extension without changing its semantic identities.

## CLI

The CLI is the local and automation interface for an Insight project. It links and validates models, prints project structure, executes graph queries, renders diagrams, and generates agent skills.

The [CLI reference](archinsight-cli/README.md) describes the query, render, and output options.

## VSCode extension

The [Archinsight VSCode extension](https://marketplace.visualstudio.com/items?itemName=archinsight.archinsight-vscode) provides diagnostics, completion, semantic highlighting, project structure, source navigation, and a source/diagram split editor. It supports the built-in views, custom graph queries, and SVG, PNG, and DOT export.

Open a workspace containing `.ai` files and then open a model. The extension embeds the language runtime for interactive editing and diagram preview. The CLI adds command-line validation and CI integration using the same project semantics.

## AI agent skill

The CLI can place an Insight skill directly into a project:

```shell
archinsight skill init . --target codex
```

Targets are available for `codex`, `claude`, and `generic`. The generated skill contains the modeling workflow, language references, built-in framework sources, query recipes, and examples. It instructs the agent to inspect the existing project and validate changes through the CLI rather than approximating the language independently.

```shell
archinsight skill init . --target claude
archinsight skill init . --target generic
```

Restart a Codex or Claude session after generating its native skill so the new skill is discovered.

## Web viewer

The SvelteKit web viewer presents linked projects in a browser using the same language core and editor components. It provides an authenticated owner-scoped application and an anonymous read-only playground containing one explicitly published project.

## Repository

The main modules are documented separately:

- [CLI](archinsight-cli/README.md)
- [VSCode extension](archinsight-vscode/README.md)
- [Language core](packages/insight-language/README.md)
- [Web viewer](archinsight-web/README.md)
- [Optional renderer service](archinsight-renderer/README.md)

The language core lives in `packages/insight-language`. Built-in Insight framework sources are stored under `src/main/resources/com/github/lonelylockley/insight`. The CLI, extension, and web viewer consume a generated snapshot of those sources.

Useful development checks:

```shell
npm --prefix packages/insight-language run test:runtime
npm --prefix archinsight-cli run check
npm --prefix archinsight-vscode run check
npm --prefix archinsight-web run check
npm --prefix archinsight-web run test:server
npm --prefix archinsight-renderer test
```

After editing the built-in framework, regenerate the TypeScript snapshot:

```shell
npm --prefix packages/insight-language run sync:core
```

Build and verify every release artifact with Gradle:

```shell
./gradlew clean dist
```

The release includes the CLI package, VSCode extension, web distribution, and
versioned `editor-ui-<version>` and `renderer-<version>` container images. Image
versions come from `settings.gradle`. Override the registry/repository with
`-ParchinsightImageRepository=<repository>` and the web context root with
`-ParchinsightContextRoot=<path>` when required.

After authenticating to the container registry, publish the web and optional
renderer images with a multi-platform manifest:

```shell
./gradlew dockerPush
```

The published images target `linux/amd64` by default. Local `dockerBuild` tasks
still use the host architecture, so an Apple Silicon build remains runnable on
the development machine. Override the publication target with
`-ParchinsightDockerPlatforms=<platforms>` when required.

## License

Copyright 2021-2026 Alexey Zaytsev

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
