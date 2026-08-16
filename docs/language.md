# The Insight Language

Insight is a typed language for describing software architecture. Its type system defines the vocabulary available to a project and the rules that connect that vocabulary into a coherent model. The same definitions guide the editor while a model is being written, drive validation when project sources are linked, and provide rendering metadata when the resulting graph is turned into a diagram.

Four concepts form the foundation of the language: types describe the shape of model values, constructors give those types a concrete syntax, attributes hold their data and children, and operators create typed relationships or other derived model values.

Insight is case-sensitive. `System`, `system`, and `SYSTEM` are different names, as are object identifiers such as `catalog` and `Catalog`. The spelling declared by the language or the project must be used consistently.

Declarations are resolved independently of their order. A model can refer to an object before or after its declaration, and definition files do not need to be arranged in dependency order. The usual visibility rules still apply: an object from another source file must be made visible through an explicit import when that boundary requires one.

## Definitions and architecture models

An Insight project contains two kinds of source files. Definition files establish the language available to the project. They contain declarations such as `define type`, `define operator`, `define enum of`, `define presentation`, `extend type`, `extend enum of`, and `extend presentation`. Architecture files use that language to create a model and begin with a `context` or `environment` declaration.

The two forms live in separate files. A framework file can define a project-specific `PublicApi` type:

```insight
define type PublicApi of Service
    constructor publicApi

    required Text owner
```

An architecture file can then use its constructor:

```insight
context commerce

system storefront
    publicApi catalog
        name = Product catalog API
        owner = Catalog team
```

This separation gives schema changes a clear home and keeps descriptions of concrete systems focused on the architecture itself. The linker reads all definition sources before validating the model, so their order and directory placement do not control where the vocabulary is available.

## Identifiers and names

Insight uses two identifier forms. Type names begin with an uppercase ASCII letter. Object identifiers, attribute names, enum values, and word-based constructors and operators begin with a lowercase ASCII letter. After the first character, both forms may contain letters, digits, and underscores:

```insight
define type PublicApiV2 of Service
    constructor publicApiV2

    required Text owning_team

context online_store2
```

Names cannot begin with a digit, contain spaces, or use punctuation other than `_`. Symbolic operators such as `->` and `~>` have their own operator syntax and are declared through operator constructors.

Language keywords have fixed meanings and are not available as ordinary names where their keyword role would make the source ambiguous. Choose identifiers that describe their architectural role rather than variants of words such as `define`, `type`, `context`, or `import`.

Case is part of every name. `PublicApi` is a type name, `publicApi` can be its constructor, and `public_api` is a separate identifier. References, imports, extensions, and queries must use the declared spelling.

### Context and environment sources

Every architecture file has one root scope. A logical architecture source begins with `context`:

```insight
context commerce
    name = Commerce

system storefront
    name = Storefront
```

The context gives the model a logical boundary and a namespace. Systems, actors, deployment profiles, and other compatible boundary elements declared by the source belong to that context. Other files can contribute to the same logical model by repeating the context identifier and extending or importing its elements.

An infrastructure inventory source begins with `environment`:

```insight
environment eu
    name = Europe
    region = eu-central

deployment production
    name = Production

    compute kubernetes
        name = Kubernetes cluster
```

The environment is the root scope for concrete deployments and infrastructure. Its identifier provides the namespace used when logical architecture refers to deployments from that environment. A project can define a specialized descendant of the built-in `Environment` type to declare organization-specific infrastructure slots. When there is one such subtype, the linker uses it for environment roots. When several subtypes exist, the named slots filled by the environment and its deployments identify the compatible schema; if they do not identify one subtype unambiguously, the root keeps the base `Environment` type and incompatible attributes are reported normally.

A source uses one root form. Context sources describe logical ownership and dependencies, while environment sources describe the physical inventory into which that architecture can be deployed. The linker combines both kinds of source into the same project model, allowing deployment profiles and projections to connect logical elements with concrete infrastructure.

## Types

A type defines a reusable schema. It can inherit from another type and add attributes of its own:

```insight
define type PublicApi of Service
    constructor publicApi

    required Text owner
    required Text protocol
    Text description
```

`PublicApi` inherits the schema of `Service`. It can therefore be used anywhere a `Service`, `Container`, or another ancestor type is accepted. Its own declaration adds three attributes that every tool can discover from the project type system.

Inheritance carries attributes and structural rules from the base type to its descendants. This allows a framework to introduce broad architectural concepts first and refine them into more specific project vocabulary. A project might derive several kinds of API, worker, database, or message broker while preserving the common rules of their base types.

Type names begin with an uppercase letter. They identify schema concepts such as `System`, `Service`, `PublicApi`, and `Environment`.

### Abstract types

A type can serve as an abstract base for a family of more specific types. An abstract type declares their shared attributes and inheritance position while leaving construction to its descendants:

```insight
define type Api of Service
    required Text owner
    required Text protocol

define type PublicApi of Api
    constructor publicApi

    required Text audience

define type InternalApi of Api
    constructor internalApi
```

`Api` has no constructor, so architecture sources have no direct syntax for creating an `Api` instance. Its two descendants provide concrete constructors and inherit the common `owner` and `protocol` contract. Code completion and the linker can still use `Api` as an expected type: both `PublicApi` and `InternalApi` are assignable to it.

Abstract types keep a framework hierarchy expressive without introducing generic instances into the model. They are useful for grouping related elements, defining shared child slots, collecting attributes used by queries, and attaching a presentation inherited by every concrete descendant. The built-in framework uses this pattern for types such as `SystemElement`, `ContainerElement`, and `BoundaryElement`.

For graph types derived from `Element` or `Edge`, a type with descendants may omit its constructor and act as their abstract base. A leaf graph type represents a construct that can appear directly in a model and must declare at least one constructor. Schema and value types outside the graph hierarchy may also exist without constructors when they are used only as type-level contracts.

## Constructors

A constructor is the word used to create a value of a type in an architecture model. The `publicApi` constructor from the previous definition makes the following declaration possible:

```insight
publicApi catalog
    name = Product catalog API
    owner = Catalog team
    protocol = HTTPS
```

Here, `publicApi` selects the `PublicApi` type and `catalog` gives the new element its identity. Constructor names begin with a lowercase letter. Ordinary type constructors belong to the project-wide language vocabulary, so their spelling must be unique.

A constructor may also supply default attribute values. Defaults are useful when every value created through a particular constructor shares a stable characteristic:

```insight
define type InternalApi of Service
    constructor internalApi
        exposure = internal

    required Text exposure
```

The default becomes part of every instance created with that constructor:

```insight
internalApi inventory
    name = Inventory API
```

The resulting `inventory` instance has `exposure = internal`. A constructor default satisfies a `required` attribute, so the model author does not need to repeat the assignment. An explicit value in the instance replaces the default when the constructor is designed to allow variation.

Operator constructors use the same mechanism. The built-in wire constructors, for example, assign their relationship model when the operator is invoked:

```insight
define operator SyncWire of Wire
    constructor -> Element
        on Element
        model = sync
```

Every relationship created with `->` therefore has `model = sync` without an assignment in the architecture model. Queries can use the resulting attribute to select a relationship category.

### Creating an object instance

An object declaration calls a constructor and creates one instance in the current context:

```insight
publicApi catalog
    name = Product catalog API
    owner = Catalog team
    protocol = HTTPS
```

The declaration starts with the constructor, followed by the object identifier. The indented body assigns attributes and may contain child objects accepted by the instance type. The resulting identity is stable within its context and can be referenced by relationships, imports, queries, and object extensions.

The parent schema determines whether an instance is valid at its current position. A declaration nested directly under a parent fills that parent's anonymous `_` list. A declaration inside a named block fills the corresponding named attribute.

### Full and shortened constructor forms

A named object attribute can be filled with the full constructor form. This form states both the constructor and the identity of the nested instance:

```insight
define type RuntimeConfig of Element
    constructor runtimeConfig

    required Text image

define type ManagedService of Service
    constructor managedService

    RuntimeConfig config
```

```insight
context commerce

system storefront
    managedService catalog
        name = Product catalog
        config:
            runtimeConfig catalog_runtime
                image = registry.example/catalog:1.4
```

The `config` attribute points to the explicitly named `catalog_runtime` instance. A full declaration can use `_` in place of the identifier when the nested object does not need to be addressed directly from another part of the model:

```insight
config:
    runtimeConfig _
        image = registry.example/catalog:1.4
```

When the attribute type resolves to exactly one compatible constructor, Insight also supports a shortened form. The constructor and anonymous identifier are inferred from the `config` attribute:

```insight
config:
    image = registry.example/catalog:1.4
```

All three forms create a `RuntimeConfig` instance. The named full form is appropriate when other parts of the model need to address the object by its identifier. The `_` form creates an anonymous instance with an internal identity managed by the linker. It remains part of the graph and can participate through its owning attribute, while model sources do not give it a public identifier for direct references. The anonymous full form keeps the constructor visible, while the shortened form keeps a simple single-object attribute compact. If no compatible constructor exists, or several constructors could fill the same attribute, the shortened form is ambiguous and the linker reports a diagnostic.

## Indentation and ownership

Insight uses indentation to delimit bodies and express ownership. One indentation level is four spaces. Every line indented beneath an object belongs to that object until the source returns to the object's indentation level:

```insight
system commerce
    name = Commerce Platform

    service catalog
        name = Product catalog

    service checkout
        name = Checkout
```

Both services belong to `commerce`. The `name` beneath `catalog` belongs only to `catalog`; returning from eight spaces to four closes the `catalog` body and starts its sibling `checkout`.

Named list and object attributes end with a colon and open their own indented body:

```insight
service storefront
    links:
        -> catalog
            technology = HTTPS
```

Here `links:` selects the `links` attribute, `-> catalog` creates an edge inside that list, and the deeper `technology` assignment belongs to the edge. Each additional indentation level therefore moves the reader into a more specific owner.

Indentation also controls multiline text values, as described in the next section.

## Text values

Insight text values are written directly after `=`. A single-line value continues to the end of the line:

```insight
service catalog
    name = Product catalog
    technology = Kotlin, PostgreSQL
```

Quotes are not required around the value. In an ordinary attribute assignment, single and double quotes are treated as part of the text, so `name = 'Product catalog'` stores the quote characters as well. This allows names, descriptions, URLs, punctuation, and spaces to be written naturally without an escape syntax.

A multiline value begins after `=` and continues on following lines indented one level deeper than the assignment:

```insight
service checkout
    description = Coordinates checkout and keeps payment provider details
        outside the storefront service.
        Retries recoverable failures before returning an error.
```

The stored value contains line breaks between the three lines. The indentation that marks the continuation is structural and does not become part of the text. Returning to the indentation of the assignment ends the value:

```insight
service checkout
    description = Coordinates checkout and keeps payment provider details
        outside the storefront service.
    technology = Kotlin
```

Here, `technology` is a new attribute of `checkout`. Continuation lines use exactly one additional four-space level, keeping the end of the text clear to both the reader and the parser.

## Attributes

Attributes describe the data and structure accepted by a type. A scalar attribute stores a value:

```insight
Text technology
```

A list attribute accepts several values of a declared type:

```insight
List of Wire links
```

Attributes can also contain nested model elements. The built-in `System` type, for example, has an anonymous list of containers:

```insight
List of Container _
```

The `_` name means that compatible child declarations can appear directly in the body of the parent. This is what allows a system to contain services and containers without an extra named wrapper:

```insight
system commerce
    service catalog
        name = Product catalog
```

### The underscore symbol

The `_` symbol has two closely related roles. In a type definition, it names the anonymous child list:

```insight
define type System of SystemElement
    required Text name
    List of Wire links
    List of Container _
```

A type can declare only one anonymous attribute. It must have the form `List of <Type> _` and must be the last attribute in the type body. These constraints keep direct child syntax unambiguous: after the named attributes have been considered, every compatible nested declaration has one well-defined destination.

In an architecture model, `_` can occupy the identifier position of a constructor call:

```insight
system commerce
    service _
        name = Internal maintenance service
```

This creates an anonymous `Service` instance in the system's anonymous container list. The linker assigns an internal identity so the object remains part of the project graph. The source model does not expose a stable identifier by which other declarations could address it in links, imports, or extensions, which makes this form suitable for nested objects that are meaningful only through their owner.

The same instance syntax can fill a named object attribute:

```insight
config:
    runtimeConfig _
        image = registry.example/catalog:1.4
```

In both positions, the type schema determines where the anonymous instance is stored. The underscore expresses the absence of a source-level identity; it does not remove the object from linking, validation, queries, or rendering.

The linker resolves every attribute against the effective type of its owner. It checks the attribute name, the expected value type, list membership, nested ownership, and inherited declarations. Scalar attributes have a single value and assigning one more than once is reported as an error.

### Required attributes

The `required` modifier states that every value of the type must provide an attribute, either explicitly or through a constructor default:

```insight
define type QueueConsumer of Service
    constructor queueConsumer

    required Text name
    required Text topic
```

Required attributes are part of the type contract. The linker checks them after declarations and extensions have been combined, so the rule also applies to inherited types and to elements assembled from more than one source.

Attributes without `required` are optional. Their absence leaves the value valid and allows presentations and queries to use the information when it is available.

## Enumerations

An enumeration defines a closed set of values for a type. The type gives the set a meaningful name, and `define enum of` lists the values accepted for it:

```insight
define type Criticality

define enum of Criticality
    low
    medium
    high
```

Enum values are lowercase identifiers and are case-sensitive. In this example, `high` is valid while `High` is a different spelling and is rejected.

The enum type can be used for a single attribute or as the element type of a list:

```insight
extend type Service
    required Criticality criticality
    List of Criticality supportedCriticalities
```

A single enum attribute uses the same assignment form as text. A list uses a named block with one value on each line:

```insight
service checkout
    name = Checkout

    criticality = high

    supportedCriticalities:
        low
        medium
```

Every value is checked against the enumeration declared for the expected type. This also applies to values supplied by constructors. An unknown value produces a diagnostic at its use.

A project can add values to an existing enumeration in a definition file:

```insight
extend enum of Criticality
    critical
```

The original enumeration must already be declared. Extensions contribute to the same value set, so the project can adapt a shared vocabulary without redefining it.

## Operators

An operator defines a typed operation in the model. Most commonly, operators create edges between architectural elements. Their declarations specify the produced type, the word or symbol used in source files, the accepted target type, and the owner types from which the operator may be invoked.

```insight
define operator HttpCall of Wire
    constructor calls Element
        on Element

    required Text protocol
```

This definition introduces the `calls` operator. It produces an `HttpCall`, which is assignable to the built-in `Wire` edge type. The operator accepts an `Element` as its target and can be invoked from an `Element`:

```insight
service storefront
    links:
        calls catalog
            protocol = HTTPS
```

Operator attributes describe the relationship created by an invocation. Required attributes are validated in the same way as attributes on ordinary elements. Operator inheritance can refine a general relationship family into synchronous, asynchronous, physical, or domain-specific connections while keeping shared attributes and presentation rules.

The type context determines where an operator is available. In the example above, `calls` produces a `Wire`, so it can appear in a list whose element type accepts `Wire`. The source and target must also satisfy the types declared by the constructor. An operator name may have several typed constructor variants when the same operation applies to different owners or targets. Together, these constraints let custom operators participate in completion, linking, queries, and rendering without special syntax rules for each operator name.

### TypeScript implementations

An operator invocation is a typed call from Insight into a TypeScript implementation. The Insight declaration defines the callable contract: the operator's result type, source and target constraints, attributes, constructor spelling, and defaults. TypeScript supplies the behavior executed when the linker materializes the invocation.

An operator can select its implementation by a string identifier:

```insight
define operator HttpCall of Wire
    constructor calls Element
        on Element

    implementation = "@insight/core.edge"

    required Text protocol
```

The `implementation` value is a lookup key in the application's operator implementation registry. When the linker encounters `calls catalog`, it resolves `@insight/core.edge` through that registry and invokes the corresponding TypeScript implementation with the normalized operator invocation, its resolved target, attributes, and type information. The current implementation contract can materialize a typed edge or accept a prefix element operation and can return diagnostics for an unsupported invocation.

Every operator needs an effective runtime implementation. Insight supplies defaults for the common cases: an operator assignable to `Edge` uses `@insight/core.edge`, and an operator assignable to `Element` uses `@insight/core.element`. Writing the identifier explicitly makes the dependency visible. Operators in another runtime domain require an explicit implementation identifier.

This mechanism is the language's extension point for behavior backed by arbitrary TypeScript code. The TypeScript code lives in the application and follows the operator implementation contract; the Insight source invokes it through its registered identifier. The result exposed to the linker remains constrained by that contract even though the implementation itself is application code.

Projects cannot currently provide their own TypeScript operator implementations. A project-defined operator can use the generic behavior for `Edge` or `Element`, while custom execution requires adding and registering an implementation in the Archinsight application code.

## Extending a type

`extend type` adds attributes to an existing type while preserving its original declaration:

```insight
extend type Service
    required Text owner
    Text repository
```

Extensions are useful when a project adopts a shared framework and needs to add organization-specific fields or child slots. The effective schema contains the original attributes, inherited attributes, and the attributes contributed by the extension.

Each type should have a single extension point in a project. Insight reports a warning when the same type is extended more than once and directs the author to keep its extensions in one definition file. This boundary keeps the effective schema discoverable: a reader can open one place to see everything the project adds to a framework type, and a change does not acquire hidden consequences through unrelated files.

Several additions to the same type belong in one `extend type` declaration. Constructors remain in the original type definition, while an extension concentrates the extra attributes that adapt the type for the project.

## Presentations

A presentation describes how values of a type are shown in diagrams. It connects model attributes to the textual parts of a rendered node or edge and provides visual properties for light themes, dark themes, and Graphviz output.

```insight
define presentation PublicApi
    header = name
    subtitle = protocol
    body = description

    light
        fill = "#438dd5"
        stroke = "#f4f4f4"
        text = "#f4f4f4"

    dark
        fill = "#5a189a"
        stroke = "#2e2e2e"
        text = "#f4f4f4"

    graphviz
        shape = box
        style = filled,rounded
```

The three built-in text fields contain attribute names:

- `header` selects the attribute used as the primary label.
- `subtitle` selects the attribute shown as secondary information.
- `body` selects the attribute used for the longer description.

The selected attributes must belong to the presented type or one of its descendants. When a value does not provide an optional selected attribute, that part of the label remains empty.

Presentation properties are grouped into three built-in sections:

- `light` contains colors used with the light theme.
- `dark` contains colors used with the dark theme.
- `graphviz` controls the shape and layout hints passed to diagram rendering.

The language recognizes the following section properties. The descriptions follow the corresponding Graphviz attributes. `fill`, `stroke`, and `text` are Archinsight theme names mapped to Graphviz's `fillcolor`, `color`, and `fontcolor`. `visible` is handled by Archinsight before the DOT source is rendered.

| Group | Property | Description |
| --- | --- | --- |
| Color and theme | `fill` | Sets the interior color of a node or cluster. Archinsight maps it to Graphviz [`fillcolor`](https://graphviz.org/docs/attrs/fillcolor/); a visible node fill generally also requires an appropriate `style`, such as `filled`. |
| Color and theme | `stroke` | Sets the drawing color used for node boundaries, cluster boundaries, and edges. Archinsight maps it to Graphviz [`color`](https://graphviz.org/docs/attrs/color/). |
| Color and theme | `text` | Sets the label text color. Archinsight maps it to Graphviz [`fontcolor`](https://graphviz.org/docs/attrs/fontcolor/). |
| Color and theme | `bgcolor` | Sets the background color of a graph or cluster. Graphviz accepts a color, a color list for a gradient, or `transparent`; see [`bgcolor`](https://graphviz.org/docs/attrs/bgcolor/). |
| Shape and style | `shape` | Selects the geometry used to draw a node, such as `box`, `ellipse`, or `plain`; see [`shape`](https://graphviz.org/docs/attrs/shape/). |
| Shape and style | `style` | Applies one or more appearance styles. Common values include `filled`, `rounded`, `dashed`, `dotted`, `solid`, `bold`, and `invis`, with availability depending on whether the target is a node, edge, or cluster; see [`style`](https://graphviz.org/docs/attrs/style/). |
| Shape and style | `width` | Sets the minimum node width in inches. Graphviz may enlarge the node to fit its label unless `fixedsize` is enabled; see [`width`](https://graphviz.org/docs/attrs/width/). |
| Shape and style | `height` | Sets the minimum node height in inches. Graphviz may enlarge the node to fit its label unless `fixedsize` is enabled; see [`height`](https://graphviz.org/docs/attrs/height/). |
| Graph layout | `rankdir` | Sets the direction in which ranks are laid out: `TB`, `BT`, `LR`, or `RL`; see [`rankdir`](https://graphviz.org/docs/attrs/rankdir/). |
| Graph layout | `overlap` | Determines whether node overlaps are retained and, for supported layout engines, how they are removed. Available algorithms and effects depend on the selected engine; see [`overlap`](https://graphviz.org/docs/attrs/overlap/). |
| Graph layout | `newrank` | Tells the `dot` engine to use one global ranking pass across clusters. This allows rank constraints to span cluster boundaries; see [`newrank`](https://graphviz.org/docs/attrs/newrank/). |
| Graph layout | `nodesep` | Sets the minimum separation in inches between adjacent nodes in the same rank when using `dot`; see [`nodesep`](https://graphviz.org/docs/attrs/nodesep/). |
| Graph layout | `ranksep` | Sets the desired separation in inches between consecutive ranks when using `dot`; see [`ranksep`](https://graphviz.org/docs/attrs/ranksep/). |
| Graph layout | `splines` | Controls whether edges are drawn and how they are routed. Supported forms include straight lines, polylines, orthogonal routes, curved arcs, and splines; see [`splines`](https://graphviz.org/docs/attrs/splines/). |
| Graph layout | `labelloc` | Sets the vertical position of graph, cluster, or node labels. Graph and cluster labels use `t` or `b`, while node labels also support `c`; see [`labelloc`](https://graphviz.org/docs/attrs/labelloc/). |
| Edge layout | `minlen` | Sets the minimum number of ranks crossed by an edge in the `dot` engine. Larger values push the connected nodes farther apart; see [`minlen`](https://graphviz.org/docs/attrs/minlen/). |
| Edge layout | `fontsize` | Sets label text size in points for graphs, clusters, nodes, or edges; see [`fontsize`](https://graphviz.org/docs/attrs/fontsize/). |
| Edge layout | `penwidth` | Sets line and curve width in points for node boundaries, cluster boundaries, and edges. It has no effect on text; see [`penwidth`](https://graphviz.org/docs/attrs/penwidth/). |
| Visibility | `visible` | Controls Archinsight rendering rather than a native Graphviz attribute. Setting it to `false` in the `graphviz` section removes elements of the presented type from the rendered graph. |

Presentations follow type inheritance. A derived type starts with the nearest presentation declared for one of its base types and overrides only the fields and section properties it declares itself. This makes broad visual conventions reusable while allowing a specialized type to change a label, color, shape, or edge style. An existing presentation can also be adjusted with `extend presentation`, which merges the supplied fields and section properties into its definition.
