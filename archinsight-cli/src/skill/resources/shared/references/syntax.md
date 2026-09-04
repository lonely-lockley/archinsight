# Insight Syntax Reference

Insight is case-sensitive. `System`, `system`, and `SYSTEM` are different
names. Declarations are resolved independently of their order, provided the
referenced value is visible in the current source through local declaration or
an explicit import.

## Files and Root Scopes

Logical model files start with a context:

```insight
context ecommerce
    name = E-commerce Platform
```

Infrastructure inventory files start with an environment:

```insight
environment eu
    name = Europe
```

Definitions, contexts, and environments are separate source roles. Never put
more than one of these roles in the same file.

An environment source has exactly one `environment <id>` header. Any
`deployment` declarations that follow are top-level declarations in the file,
but the linker attaches them to that environment. Put a second environment in a
second source file. One environment source may contain several deployments.

Use indentation to define ownership. Children belong to the nearest less-indented
parent.

## Identifiers

Type names begin with an uppercase ASCII letter. Object ids, attributes, enum
values, and word-based constructors and operators begin with a lowercase ASCII
letter. Later characters may be ASCII letters, digits, or underscores. Names
cannot begin with a digit or contain spaces.

`Text` is the built-in scalar type and follows the same uppercase type-name
rule. Lowercase `text` remains a valid attribute or presentation property name,
but it is not a type name.

Use every name with its declared case. Keep object ids stable because imports,
extensions, links, queries, and generated navigation refer to those identities.

## Common Elements

Use built-in constructors for the C1-C3 parts of a C4 architecture:

```insight
external actor customer
    name = Customer
    technology = Web browser

system storefront
    name = Storefront
    technology = SvelteKit, TypeScript

    container web_app
        name = Web app
        technology = SvelteKit

    service catalog_api
        name = Catalog API
        technology = Node.js, PostgreSQL
```

Useful built-ins include:

- `context` for a bounded architecture model.
- `external actor` and `external system` for dependencies outside the owned system.
- `system` for major systems in a context.
- `container` for deployable or executable units.
- `service` for backend/container services.
- `component` for internals of a selected container or service.

Core has no concrete constructor for the C4 Code level. It provides the
constructorless `CodeElement` base, while project definitions supply concrete
code types and their constructors. Read `references/c4-code.md` before adding
or instantiating code-level concepts.

Built-in nesting follows the core type tree, not the English noun. For example,
actors and systems are context-level because their base type is a boundary
element, while containers are allowed under systems because the `System` type
declares a container child slot. For custom project types, inspect
`archinsight structure . --format text` and `.core/*.ai` before nesting.

## Graph Objects and Constructors

Insight models a graph. Each object declaration calls a type constructor and
creates one graph object instance in the current context:

```insight
system storefront
    name = Storefront

service checkout_api
    name = Checkout API
```

Here `system` and `service` are constructors; `storefront` and
`checkout_api` are object ids. Relationships under `links:` create graph
edges between existing object ids.

Definition files are different from architecture files. They declare vocabulary:
`define type`, `define operator`, `define presentation`, `extend type`,
`define enum of`, `extend enum of`, and `extend presentation`. Architecture
files start with either `context <id>` or `environment <id>` and then create
graph object instances with constructors.

Do not mix these source forms in one file. A framework/definitions file should
contain only vocabulary/schema declarations. Keep each context or environment
in its own architecture source role. If definitions and instances are both
needed, create separate files and validate the whole project.

## Type Definitions and Extensions

Use `define type` to create a new graph/value type. Use `extend type` to add
attributes or child slots to an existing type. Projection rules belong to
concrete infrastructure instances, not to type definitions.

```insight
define type Queue of InfrastructureComponent
    constructor queue

    required Text name

extend type Environment
    Queue queue
```

Type extension is a schema merge:

- new attributes and child slots become available everywhere that type is used;
- inherited attributes from base types remain available;
- type inheritance still controls assignability and nesting.

Keep all additions to one type in one `extend type` declaration and one
definition file. The linker can combine several extensions for compatibility,
but reports a warning because a scattered effective schema is difficult to
inspect and review. An agent should consolidate them rather than create another
extension elsewhere.

There are two valid ways to define environment slots, with different scope:

- `extend type Environment` adds one project-wide slot schema to every
  environment.
- `define type ApplicationEnvironment of Environment` creates a distinct,
  constructorless environment schema. Environment declarations infer that
  subtype from its slot names when the match is unambiguous.

Use the base-type extension when every environment shares one contract. Use a
named subtype when the project needs isolated environment families. Do not
describe these forms as interchangeable.

After changing a type definition, run `archinsight structure . --format text`
to see the updated type tree and available constructors.

### Abstract types and constructors

A type without a constructor can serve as an abstract schema shared by concrete
descendants:

```insight
define type Api of Service
    required Text owner

define type PublicApi of Api
    constructor publicApi
```

Do not create a direct instance of a constructorless type. Use it as an expected
attribute type, query label, presentation base, or inheritance contract.

A constructor can provide defaults, including values of required attributes:

```insight
define type InternalApi of Service
    constructor internalApi
        exposure = internal

    required Text exposure
```

An explicit assignment on an instance replaces the constructor default.

### Object-valued attributes

A named object attribute supports a full named declaration, a full anonymous
declaration, or a shortened declaration whose constructor can be inferred:

```insight
config:
    runtimeConfig catalog_runtime

config:
    runtimeConfig _

config:
    image = registry.example/catalog:1.4
```

Use a named id when another declaration must reference the nested object. The
`_` form creates an anonymous instance. The shortened form infers both its
constructor and anonymous identity. A constructor declared directly by the
attribute type takes precedence over constructors inherited through descendant
types. Without a direct constructor, more than one compatible descendant makes
the shortened form ambiguous.

## Attributes

Attributes are named and typed:

```insight
name = Checkout API
technology = Kotlin, PostgreSQL
description = Handles cart pricing, order placement, and payment orchestration
```

Long text can continue on indented following lines:

```insight
description = Handles checkout orchestration and keeps payment provider details
    outside the storefront.
```

Prefix an attribute with `required` in a type definition when every instance
must supply it explicitly or through a constructor default. Scalar attributes
accept one value; assigning them twice is an error.

One type may declare one anonymous child attribute:

```insight
List of Component _
```

It must be the last attribute in the type body. Compatible child declarations
can then appear directly under the parent. The `_` symbol can also replace an
object id when no source-level reference to that instance is needed.

An anonymous instance cannot later be the target of `runsOn`, a typed
reference attribute, an import, or a relationship. Give the object a stable id
whenever another declaration must reference it. The linker reports
`ANONYMOUS_INSTANCE_NOT_REFERENCEABLE` when `_` is used as a reference
target.

## Enumerations

An enum uses a constructorless type as its closed value domain:

```insight
define type Criticality

define enum of Criticality
    low
    medium
    high
```

Use the enum type for scalar or list attributes. Values are case-sensitive and
must be declared by `define enum of` or `extend enum of`.

## Relationships

Put relationships under `links:`.

```insight
links:
    -> checkout_api
        technology = HTTPS, JSON
        call = POST /checkout
        description = Places an order
    ~> order_service
        technology = Kafka
        via = orders.created
        description = Consumes order events
```

`call` is singular and belongs to synchronous `->` links. `via` belongs to
asynchronous `~>` links. Do not write `calls`.

Use a named import when the same external declaration is referenced several
times:

```insight
import payments from context external_systems

links:
    -> payments
```

For a single reference, an inline `from <context-id>` qualifier is the
anonymous import form and does not require a separate named import:

```insight
links:
    -> payments from external_systems
```

## Imports and Extensions

Split larger models across files by repeating the context id and extending
existing elements:

```insight
context ecommerce

extend service checkout_api
    component payment_adapter
        name = Payment adapter
        technology = HTTP client
```

Use imports for elements from another context:

```insight
import stripe from context external_systems
```

There are three different `extend` forms. Do not mix them up:

- `extend service checkout_api` extends an existing graph object instance in a
  context. It adds attributes, children, or links to that object.
- `extend type Environment` extends the schema/type definition. It adds
  attributes or child slots to the type, not to one object instance.
- `extend presentation Wire` extends visual defaults for a type. It updates
  label slots, theme sections, or Graphviz settings for rendering.

Use `define type` / `define presentation` only when creating new vocabulary.
Use `extend type` / `extend presentation` when patching existing vocabulary.
Repeating `define presentation X` for an existing presentation is a diagnostic
in current Archinsight.

## Comments and Notes

Use `#` for ordinary comments when you want to leave guidance for humans or
agents without changing the model:

```insight
# This file owns the checkout bounded context.
context checkout

system checkout_platform
    # Keep logical services here; deployment inventory belongs in deployment files.
    name = Checkout Platform
```

A `#` after an element or relationship line is an inline note. Notes are
stored in the linked graph and can be rendered as note nodes near the element or
edge:

```insight
context checkout

system checkout_platform
    name = Checkout Platform

    container api # Public API owned by the checkout team
        name = Checkout API
        links:
            -> payment_gateway # PCI-sensitive request path
                technology = HTTPS
                call = POST /payments

external system payment_gateway
    name = Payment gateway
```

Use comments for authoring hints that should stay invisible in diagrams. Use
notes for architecture remarks that should travel with the model and help
readers understand a specific element or relationship.

On an attribute assignment, all text after `=` is the attribute value. A `#`
there does not start a comment; put the comment on its own line instead.

## Annotations

Annotations decorate the next declaration or relationship. Put each annotation
on its own line immediately before the target:

```insight
context fulfillment

system fulfillment_platform
    name = Fulfillment Platform

    @planned
    container fulfillment_adapter
        name = Fulfillment adapter
        links:
            @deprecated(replace after ERP migration)
            ~> legacy_erp # scheduled for removal

external system legacy_erp
    name = Legacy ERP
```

Available annotations:

- `@planned` marks an element or relationship as planned or not fully
  implemented yet. The default Graphviz renderer highlights it in green.
- `@deprecated` marks an element or relationship as legacy or scheduled for
  removal. Add optional text in parentheses when the replacement or reason is
  useful. The default Graphviz renderer highlights it in red.

Annotations can be stacked and are preserved on projected relationships, so a
Deployment projection can still show that the original logical relationship was planned
or deprecated. Annotations cannot decorate assignments; use a comment above the
assignment when you only need a local authoring hint.

If both lifecycle annotations are present, `@planned` has visual priority in
the current renderer. Prefer one lifecycle annotation so the declaration has
one clear state.

Legacy `@attribute(key=value)` applies raw Graphviz properties to one element
or relationship. It exists only for backward compatibility, is deprecated, and
may be removed in a future language version. Recognize it when maintaining old
models, but use typed presentations for new visual conventions.

## Presentation Syntax

A presentation maps model attributes to up to three label slots:
`header`, `subtitle`, and `body`.

```insight
extend presentation SyncWire
    header = technology
    subtitle = call
    body = description
```

Each slot value is exactly one attribute name declared on the presented type or
one of its descendants. It is not an expression, list, string template, or
concatenation. These are invalid:

```insight
body = description via
body = description, via
body = description (via)
```

If the same slot is assigned twice in one effective presentation, the last
assignment wins. Slots are not additive, so one slot cannot show both
`description` and `via` unless the language/renderer later gains a compound
label feature.

## Custom Types

Projects can extend the language with typed vocabulary:

```insight
define type Cache of InfrastructureComponent
    constructor cache
```

When adding custom types, follow the existing framework files and validate
immediately. Do not invent constructors without checking whether the project
already defines the needed type.

## Operator implementations

An Insight operator declaration is the typed call surface for a TypeScript
runtime implementation. Edge and element operators use the built-in
`@insight/core.edge` and `@insight/core.element` implementations unless an
explicit implementation is selected. Any other behavior requires a registered
TypeScript implementation in the application. A project cannot introduce new
arbitrary runtime behavior only by adding an Insight definition file.
