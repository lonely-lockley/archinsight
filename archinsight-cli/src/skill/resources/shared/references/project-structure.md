# Project Structure Workflow

Use `archinsight structure` before broad edits, imports, or declaration lookup.
Do not start with raw grep when you need to know what the linked project
contains.

## Source File Classes

Keep source files in one role:

- definition/framework files: `define type`, `define operator`,
  `define enum of`, `define presentation`, `extend type`,
  `extend enum of`, and `extend presentation`;
- context files: `context <id>`, imports, logical graph objects,
  relationships, object extensions, and deployment profiles;
- environment files: exactly one `environment <id>` header followed by its
  concrete deployments and infrastructure inventory.

Do not mix these three roles in one file. When a model needs custom vocabulary,
add or edit a framework file first, then use the resulting constructors and
attributes from context and environment files.

## Directory and File Granularity

For larger repositories, group model files by context directory. Inside a
context directory, default to one primary owned system per ordinary model file:
the system that will be detailed by containers, services, components, links, and
deployment information.

External actors and systems are different. Put reusable outside dependencies in
one external context or a few semantically grouped external contexts. Do not
create a separate file for every external actor or vendor unless that external
dependency has real internal structure to model.

If a system needs further splitting, create a utility subdirectory for focused
`extend <object>` files, such as per-service component files. An extension
target in the same context does not need an import; references used inside its
body do. Keep the main system file as the readable entry point.

## Commands

Human-readable overview:

```shell
archinsight structure . --format text
```

Machine-readable tree:

```shell
archinsight structure . --format json
```

The structure output includes:

- the type hierarchy, including project-defined custom types;
- context ids;
- declaration ids and resolved types;
- source file, line, and column for each declaration;
- nesting under contexts and parent elements.

## Declaration Lookup

When you need an element for a link or import:

1. Run `archinsight structure . --format text`.
2. Find the relevant context and declaration id in the declarations tree.
3. Check the source location shown in parentheses.
4. Open that source file for surrounding attributes and relationships.
5. Validate after editing with `archinsight link . --format text`.

Use `--format json` when you need exact source locations for many ids or when
the text tree is too large.

## Imports

Before adding an import, find the declaration's context in structure output. A
named import creates a reusable source-local binding:

```insight
import payments from context external_systems

links:
    -> payments
```

Imports are also required when a declaration lives in another source file of the
same context:

```insight
context services

import eu_service from context services

system checkout_api
    deployment:
        uses eu_service
```

The explicit import is intentional. If the source file that declared
`eu_service` is removed or excluded, validation should fail with a clear
missing import/identifier diagnostic instead of depending on hidden file layout.

For a one-off link, `from <context-id>` is the anonymous import form:

```insight
links:
    -> inventory_api from services
```

Use it when the relationship target is owned by another context or another
source file whose context ownership should remain visible at the call site.

Do not guess context ids from filenames. Filenames, context ids, and element ids
can differ.

## Type and Constructor Lookup

The type tree tells you where custom elements can be nested. If a constructor or
attribute is unfamiliar:

1. Inspect `archinsight structure . --format text` for project custom types.
2. Inspect `.core/*.ai` for built-in types.
3. Validate a small edit before applying the pattern widely.

Use grep only after structure has identified the likely source file or type. Raw
grep is a fallback for surrounding comments and prose, not the source of truth
for project declarations.
