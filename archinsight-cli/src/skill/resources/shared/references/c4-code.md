# C4 Code

Use C4 when the task needs to explain the implementation structure inside one
or more components. Archinsight intentionally does not prescribe whether that
structure consists of modules, packages, namespaces, classes, functions,
schemas, or another project vocabulary.

## Determine the Modeling Vocabulary

Inspect project definitions and existing C4 sources before asking questions. If
the repository already defines `CodeElement` descendants and containment slots
that cover the task, infer the intended entity kinds from that vocabulary and
reuse it without asking the user to choose again.

Ask the user which code entity kinds they want only when creating a new C4 Code
layer or when the requested work requires new entity kinds or containment rules
beyond the existing vocabulary. Do not ask when the current request already
makes that choice. This decision cannot be inferred from implementation source
alone because a new or expanded Code vocabulary is user-defined by design.

## Core Contract

`CodeElement` is a constructorless subtype of `Element`. Project definitions
derive concrete code types from it and supply their constructors, attributes,
relationships, presentations, and containment rules. Do not instantiate
`CodeElement` directly and do not assume a code ontology that the project has
not defined.

Keep code types and extensions in a definitions source. A minimal framework can
derive a module type and make code elements anonymous children of components:

```insight
define type Module of CodeElement
    constructor module

    required Text name
    Text responsibility
    List of Wire links
    List of CodeElement children

extend type Component
    List of CodeElement _
```

The anonymous list allows code declarations to appear directly below a
component without a `code:` wrapper. It must be the component type's only
anonymous list and the final attribute in this extension. Use a named slot only
when that wrapper conveys useful structure in the project's chosen vocabulary.

`CodeElement` is separate from `ComponentElement`. This keeps code objects out
of C3 unless a custom query intentionally combines both levels.

A code type named for a schema represents a logical or source-controlled code
artifact. A deployed database, volume, or bucket is physical infrastructure and
uses `Storage` in the Deployment model. Do not use a code-level schema as a
substitute for its physical storage instance, or model the storage instance as
code.

## Built-In View

The built-in `c4` query selects every `CodeElement` whose
`sourceIdentity` belongs to `$tab`, including code contributed to roots from
that tab through `extend`. It returns direct relationships between code
elements and groups them by immediate parent. A relationship can bring its
target code element into the result from outside the selected tab.

All components opened by the tab form one focus. Code inside any of them is
internal. A relationship leaving that focus is folded to the nearest closed
component, which is shown as external without exposing its code elements.

The query does not infer classes, packages, or nesting from source paths. Read
the project's definitions and actual containment slots before editing a C4
model. Copy `examples/builtin-views/c4.aiq` only when the project needs a
different type filter or grouping rule.

## Workflow

1. Inspect existing definitions for `CodeElement` descendants and component
   containment slots.
2. Reuse the existing vocabulary when it covers the requested model.
3. If the project has no Code layer or the task requires extending its
   vocabulary, ask the user which new entity kinds and containment rules they
   want unless the request already specifies them.
4. Define only the confirmed additions, keeping the definition source separate
   from context sources.
5. Place code instances under the component slots provided by that framework.
6. Preserve relationship ownership: the code object containing a wire is its
   source, and the referenced object is its target.
7. Prefer responsibilities, stable interfaces, and important dependencies over
   an inventory of every declaration.
8. Validate the full project, then inspect the exact C4 graph:

```shell
archinsight link . --format text
archinsight query . -s <code-source.ai> -v c4 --format json
archinsight render . -s <code-source.ai> -v c4 -f svg -o code.svg
```

Use the self-contained `examples/c4-code` project when the syntax for a code
framework or model is unclear. Deployment is a separate view family selected
with `--view deployment-system` or `--view deployment-container`; never use C4 as an alias for Deployment.
