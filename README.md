# Archinsight

Archinsight is a toolkit for software architecture modelling as code. Models
written in the typed Insight language are linked into a project graph used for
validation, navigation, queries, and diagram generation.

The project includes a CLI, a VSCode extension, a generated skill for AI agents,
and a web viewer. They share one language core, so types, diagnostics, queries,
and rendering behave consistently across all four interfaces.

## Why Archinsight

- **Model with a type system.** Types describe required attributes,
  references, valid nesting, relationships, and deployment mappings. The linker
  checks those rules across the project, while editors and agents use the shared
  schema for completion and navigation.
- **Capture the vocabulary of an organization.** Teams can define their own
  types, constructors, operators, infrastructure capabilities, and visual
  conventions. Reviewed framework definitions then become reusable building
  blocks for every service model.
- **Trace logical dependencies through deployment.** Profiles map services to
  concrete deployments, and projections expand a logical dependency into the
  network or infrastructure path that implements it. Different environments
  can realize the same relationship in different ways.
- **Organize large models around ownership.** Contexts form explicit boundaries,
  imports record dependencies between them, and `extend` lets several sources
  contribute to one element. File and directory layout can evolve separately
  from the architecture.
- **Keep declarations readable as the schema grows.** Model values have stable
  names, and relationships are declared under their source element. Each
  declaration carries enough context to be read on its own, and every arrow
  remains attached to the element responsible for it.
- **Adapt a view to the question at hand.** The built-in C1, C2, C3, C4, and
  unfiltered views are graph queries over the linked model. Their query text can
  be adjusted to focus a diagram on the relevant elements and relationships.

## How the model works

Insight starts with C4-style concepts for contexts, systems, containers,
services, components, actors, and external systems. Projects can use the
built-in framework directly or extend it with concepts from their own technical
domain.

Every declaration has an identity and a set of named attributes. A constructor
selects its type, indentation establishes ownership, and a `links` block keeps
outgoing relationships with their source element:

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

Names such as `name` and `technology` are part of the declaration schema. This
keeps their meaning stable when a type gains new optional attributes and gives
language tooling an exact schema at the editing position.

Framework definitions add project-specific concepts and constraints:

```insight
define type PublicApi of Service
    constructor publicApi

    required Text owner
    required Text protocol

define presentation PublicApi
    subtitle = protocol
```

`PublicApi` inherits the service schema, adds two required attributes, and
receives its own constructor and presentation. The linker requires `owner` and
`protocol` on every `publicApi` declaration, and the completion engine offers
them while the model is being edited. Framework definitions can also introduce
typed references and lists, allowed children, relationship operators, and
projection rules.

The linker combines every `.ai` source into one project graph. A `context`
establishes a logical scope, `import` makes an element from another context
available, and `extend` contributes additional attributes, children, or
relationships to an existing declaration. Resolution follows logical
identities; file paths remain an organization detail.

Linked elements and relationships retain their source identity. A query can use
the selected file as its focus and include connected declarations from the rest
of the graph. This gives a small source file a useful local diagram while its
contents still participate in the complete context.

Archinsight provides built-in graph queries for C1, C2, C3, C4, and unfiltered
views. Each view exposes editable query text. The query language currently
supports a limited set of selection, filtering, optional matching, and grouping
operations. Queries run against the linked graph and can include its elements,
relationships, and deployment projections.

## Deployment modeling

Deployment is described in the same project as the logical architecture.
Infrastructure templates define typed compute, storage, broker, and network
capabilities. A context-owned deployment profile maps a logical element to
concrete deployments in one or more environments.

```insight
context storefront

deploymentProfile production_service
    appliesTo:
        production from eu

    runsOn compute
    uses observability

system commerce
    service orders
        deployment:
            uses production_service

        links:
            -> payment_provider
                deployment:
                    uses publicGateway

external system payment_provider
```

Profiles can be reused across services and configured at the point of use. The
linker rejects profiles that assign the same element to the same concrete
deployment more than once. Relationship deployment selects a typed network
capability, and projections connect logical dependencies to the infrastructure
that implements them.

This allows a project to keep the service model compact while infrastructure
templates hold the shared deployment conventions.

## CLI

The CLI is the local and automation interface for an Insight project. It links
and validates models, prints project structure, executes graph queries, renders
diagrams, and generates agent skills.

Install the CLI from npm:

```shell
npm install -g @archinsight/cli
archinsight --version
```

Run commands from a directory containing `.ai` files. The project directory
defaults to the current directory:

```shell
archinsight link .
archinsight structure .
archinsight render . --context storefront --view c2 --format svg --out architecture.svg
```

The [CLI reference](archinsight-cli/README.md) describes the query, render, and
output options.

## VSCode extension

The
[Archinsight VSCode extension](https://marketplace.visualstudio.com/items?itemName=archinsight.archinsight-vscode)
provides diagnostics, completion, semantic highlighting, project structure,
source navigation, and a source/diagram split editor. It supports the built-in
views, custom graph queries, and SVG, PNG, and DOT export.

Open a workspace containing `.ai` files and then open a model. The extension
embeds the language runtime for interactive editing and diagram preview. The CLI
adds command-line validation, CI integration, and AI-agent access.

## AI agent skill

The CLI can place an Insight skill directly into a project:

```shell
archinsight skill init . --target codex
```

Targets are available for `codex`, `claude`, and `generic`. The generated skill
contains the modeling workflow, language references, built-in framework
sources, query recipes, and examples. It instructs the agent to inspect the
existing project and validate changes through the CLI.

```shell
archinsight skill init . --target claude
archinsight skill init . --target generic
```

Restart a Codex or Claude session after generating its native skill so the new
skill is discovered.

## Web viewer

The SvelteKit web viewer presents linked projects in a browser using the same
language core and editor components. It provides an authenticated owner-scoped
application and an anonymous read-only playground containing one explicitly
published project.

## Repository

The main modules are documented separately:

- [CLI](archinsight-cli/README.md)
- [VSCode extension](archinsight-vscode/README.md)
- [Language core](packages/insight-language/README.md)
- [Web viewer](archinsight-web/README.md)
- [Renderer service](archinsight-renderer/README.md)

The language core lives in `packages/insight-language`. Built-in Insight
framework sources are stored under
`src/main/resources/com/github/lonelylockley/insight`. The CLI, extension, and
web viewer consume a generated snapshot of those sources.

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

## License

Copyright 2021-2026 Alexey Zaytsev

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
