# Core Language Sources

The `.core/*.ai` files bundled with this skill are the built-in Archinsight type
model. Read them when you need to know available constructors, attributes,
children, presentations, projections, or relationship operators.

Some agent file tools may classify `.ai` as Adobe Illustrator binary files and
refuse to open them. If that happens, read the bundled sources through the shell:

```shell
cat .core/core_operator.ai
sed -n '1,160p' .core/core_system.ai
```

## Reading Types

```insight
define type System of SystemElement
    constructor system
        kind = internal

    required Text name
    required Text kind
    Text technology
    Text description
    List of Wire links
    List of Container _
```

Interpretation:

- `define type System of SystemElement` means `System` inherits from
  `SystemElement`.
- `constructor system` means `system <id>` is valid syntax for that type.
- The constructor assigns `kind = internal`, so model authors do not repeat the
  built-in default on every system.
- `required Text name` means `name = ...` is required.
- `Text technology` means `technology = ...` is optional.
- `List of Wire links` enables a `links:` block whose children are wires.
- `List of Container _` means unnamed child containers can be nested here.

Users can define more types in project files. Always inspect project structure
and project framework files before assuming only core constructors exist.

## Built-in Code Extension Point

`core_code.ai` declares the constructorless `CodeElement` base type. It is
the only code-level ontology supplied by core. Project definitions derive
concrete types from it and provide their constructors, attributes,
presentations, relationships, and containment slots. Read
`references/c4-code.md` before adding those definitions or using the built-in
C4 query.

## Built-in Deployment Infrastructure

`core_deployment.ai` provides common infrastructure inventory types:

- `InfrastructureComponent`: optional `name`, `technology`,
  `description`, plus deployment references.
- `Storage` / constructor `storage`: for databases, buckets, volumes, and
  other stateful stores.
- `Broker` / constructor `broker`: a `NetworkConnection` specialization
  for message brokers and event buses; adds optional `address` and can carry
  a projected logical wire.
- `Compute` / constructor `compute`: for runtimes, clusters, nodes, and
  platforms; adds optional `address` and can contain nested infrastructure
  components in a `components:` block.
- `NetworkConnection` / constructor `networkConnection`: for infrastructure
  that carries a logical wire. Its projection may connect `$from` directly to
  `$to` or expand the relationship through relevant gateways and other
  first-order infrastructure.

Add slots either by extending the shared `Environment` type or by defining a
constructorless subtype. The extension gives every environment the same
contract. A subtype keeps a contract isolated and is inferred from the slot
names used by an environment's deployments.

Each environment source has one `environment <id>` header. Top-level
`deployment` declarations following that header are owned by the environment,
and each deployment fills the chosen slot contract with concrete instances.

The `runsOn` attribute on `InfrastructureComponent` points to one named
infrastructure instance. The target cannot be anonymous. By contrast,
`runsOn compute` inside a `DeploymentProfile` names the `compute` slot and
resolves a concrete target separately for every selected deployment.

## Reading Type Extensions

Project files can extend built-in or custom types:

```insight
extend type Environment
    Compute compute
    Storage storage
    Broker broker
```

Interpretation:

- this changes the `Environment` schema, not one concrete environment object;
- every `environment <id>` can now contain or reference the added slots;
- existing inherited attributes and child slots remain available;
- the project should keep all additions to `Environment` in this one
  extension;
- `archinsight structure . --format text` is the quickest way to inspect the
  effective type tree after extensions are applied.

Use a dedicated subtype instead when different environment families need
different slots:

```insight
define type ApplicationEnvironment of Environment
    Compute compute
    NetworkConnection network
```

The two forms are both valid but are not interchangeable: extending the base
type is global, while defining a subtype introduces an isolated schema.

Use `extend service checkout_api` or another constructor form only when you
intend to extend one graph object instance in a `context`. Use `extend type`
when you intend to change the available vocabulary/schema for all instances of
that type.

If validation reports `TYPE_EXTENDED_MULTIPLE_TIMES`, consolidate the
extensions into one framework/definitions file.

## Reading Relationship Operators

Core synchronous and asynchronous links are operators:

```insight
define type WireModel

define enum of WireModel
    sync
    async

define operator Wire of Edge
    Text technology
    Text description
    required WireModel model

    List of Edge deployment
    List of NetworkConnection uses

define operator SyncWire of Wire
    constructor -> Element
        on Element
        model = sync

    Text call

define operator AsyncWire of Wire
    constructor ~> Element
        on Element
        model = async

    Text via
```

Interpretation:

- `->` creates a synchronous `SyncWire`.
- `~>` creates an asynchronous `AsyncWire`.
- `technology`, `description`, `model`, `deployment`, and `uses` are
  common wire attributes.
- `call` is singular and belongs to `->`.
- `via` belongs to `~>`.
- `model` is a `WireModel` enum selected by the operator constructor. Do not
  assign or override it in architecture sources; use it for typed queries.

## Reading Presentations

```insight
define presentation Element
    header = name
    subtitle = technology
    body = description

    light
        fill = "#438dd5"

    graphviz
        shape = box
```

Presentations define durable visual defaults for rendered diagrams:

- `header`, `subtitle`, and `body` map model attributes into labels.
- `light` and `dark` define theme-specific colors.
- `externalLight` and `externalDark` declaratively override those colors when
  a view marks an element external; derived project types inherit them.
- `graphviz` carries renderer-specific layout/style hints.

Use `define presentation X` once when creating a presentation for a new type.
Use `extend presentation X` when changing a built-in or project presentation:

```insight
extend presentation AsyncWire
    header = technology
    subtitle = via
    body = description
```

Presentation extension is a merge, not a full replacement:

- omitted slots and section properties are inherited from the base type or
  existing presentation;
- assigning the same slot or section property overrides that one value;
- inherited `graphviz` settings such as `style = dashed` survive unless the
  extension overrides that property;
- repeated `define presentation X` is an error in current Archinsight.

Each label slot accepts exactly one attribute name. Do not use expressions,
lists, text templates, or concatenation in `header`, `subtitle`, or `body`.
`body = description via`, `body = description, via`, and
`body = description (via)` mean "look for an attribute with that exact text"
and will fail validation.

The renderer has three label slots: `header`, `subtitle`, and `body`.
If all three are already used, there is no built-in fourth line for additional
metadata. Choose the most important attribute for each slot or ask the user
whether they want a language/rendering change.

Default wire presentations are:

```insight
define presentation Wire
    header = technology
    body = description

define presentation SyncWire
    subtitle = call

define presentation AsyncWire
    subtitle = via

    graphviz
        style = dashed
```

This means relationship diagrams normally show technology, then `call` or
`via`, then description. To change that, extend `Wire`, `SyncWire`, or
`AsyncWire` and validate with `archinsight link . --format text`.

Do not copy presentation blocks into ordinary model files unless the user is
creating or changing visual vocabulary. Prefer semantic attributes on elements
and links.

## Reading Projections

Projection definitions describe how deployment/runtime information is projected
into renderable graph relationships. Use them when deployment diagrams are
involved or when a query uses projected relationships.

Rules of thumb:

- `projected` relationships are derived from model/deployment declarations.
- `derived` relationships are rolled up from lower-level links.
- A query decides which projected or derived edges are shown.
- If a projected edge is missing, inspect both the model declarations and the
  query selectors before changing source files.

## Safe Use by Agents

- Read core files as reference material; do not add them to the project model.
- Do not edit generated `.core/*.ai` files inside the skill.
- When uncertain about an attribute, validate with `archinsight link . --format text`.
- When uncertain about nesting, inspect `archinsight structure . --format text`.
