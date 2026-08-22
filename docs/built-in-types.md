# Built-in Archinsight Types

An Insight project describes architecture as a typed graph. Architectural objects become graph nodes, relationships become directed graph edges, and containment records how detailed objects belong to broader architectural boundaries. Types provide the schema that determines which objects and relationships can enter that graph.

Archinsight starts with a small set of basic types and builds its C4 vocabulary on top of them. The basic types describe graph nodes, relationships, text, collections, and supporting values. The core library then defines systems, containers, components, deployment objects, and the operators that connect them.

## Runtime types

Runtime types form the common foundation on which the core library and reusable frameworks define their architectural vocabulary.

### `Element`

`Element` is the root type for architectural graph nodes. A concrete type derived from `Element` represents something that can have an identity, belong to a context, participate in containment, carry attributes, and appear as the source or target of a relationship.

The core library attaches the default element presentation to this type:

```insight
define presentation Element
    header = name
    subtitle = technology
    body = description
```

Presentations and queries can therefore work with `Element` when they need to address architectural nodes as a group. A relationship whose target type is `Element` can point to any concrete descendant, including a system, service, component, actor, or infrastructure component.

`Element` itself has no constructor. Concrete descendants provide the source-level words used to create graph nodes.

### `Edge`

`Edge` is the root type for directed relationships in the architecture graph. Edge instances are created through operators. They have a source, a target, an operator type, attributes, source location, and optional presentation metadata.

The base presentation for `Edge` supplies shared label and line settings. More specific edge families inherit from it and can add attributes or change their appearance. The built-in `Wire` family, for example, adds technology, description, deployment, and infrastructure information while preserving the graph relationship semantics supplied by `Edge`.

Edges are anonymous graph values. Their identity comes from the source declaration, operator invocation, target, and occurrence rather than from an object identifier written after a constructor.

### `Nothing`

`Nothing` represents the absence of a value type. It has no constructor and does not create anything in an architecture model. Most projects never need to use it directly.

### `List`

`List` represents a repeated attribute. It is normally parameterized with the type accepted by the list:

```insight
List of Wire links
List of Container _
```

The first declaration creates a named `links:` block containing `Wire` descendants. The second creates the anonymous child slot through which compatible containers can be nested directly in their owner. `List` is structural model data and has no standalone constructor.

### `Text`

`Text` is the scalar type used for names, descriptions, technologies, addresses, identifiers stored as data, and other textual attributes:

```insight
required Text name
Text description
```

The runtime recognizes both `Text` and the lowercase `text` spelling. Framework definitions use `Text` as the conventional public spelling. Text values remain attributes of their owner and do not become graph nodes.

### `TypeSlotReference`

`TypeSlotReference` lets deployment descriptions refer to an infrastructure slot declared by an environment type. In expressions such as `runsOn compute` and `uses storage`, the names `compute` and `storage` identify the kind of infrastructure required by the logical element. A concrete environment later supplies the value for that slot.

Slot references guide deployment mapping and do not appear as nodes or relationships in a diagram.

## Types outside `Element` and `Edge`

A type can exist outside both graph hierarchies when it describes supporting data rather than an architectural node or relationship. Its attributes still participate in inheritance and validation, and other types can refer to it.

Deriving from `Element` gives a type the standard role of an architecture node. It can fill attributes that expect an element, take part in relationships, inherit element presentations, and participate naturally in architecture queries. Deriving from `Edge` gives a type the corresponding relationship behavior.

An ordinary constructor on a type outside these hierarchies still creates an object that may appear in broad graph queries, but the object does not satisfy the normal `Element` or `Edge` contracts. Architectural nodes should therefore derive from `Element`, and relationships should derive from `Edge`. Types outside these hierarchies are best kept for supporting values with a clearly defined purpose, such as `TypeSlotReference`.

## The core C4 type library

The core library is written in Insight itself. Its definitions use the runtime types to provide a ready-made architecture vocabulary, while projects remain free to derive more specific types or extend selected schemas.

The hierarchy follows the progression from broad architectural context to deployable structure:

```text
Element
├── BoundaryElement
│   ├── SystemElement
│   │   ├── Actor
│   │   │   └── ExternalActor
│   │   └── System
│   │       └── ExternalSystem
│   └── DeploymentElement
│       ├── InfrastructureComponent
│       │   ├── Storage
│       │   ├── Broker
│       │   ├── Compute
│       │   └── NetworkConnection
│       ├── DeploymentProfile
│       ├── Environment
│       └── Deployment
├── ContainerElement
│   └── Container
│       └── Service
└── ComponentElement
    └── Component
```

The structural base types `BoundaryElement`, `SystemElement`, `ContainerElement`, `ComponentElement`, and `DeploymentElement` are abstract. They organize assignability and shared rules while their concrete descendants provide constructors.

The inheritance tree combines classification with placement constraints. `BoundaryElement` is the marker type for elements that may appear directly inside a `Context`. `SystemElement` and `DeploymentElement` derive from it, so their concrete descendants are valid context members. `ContainerElement` and `ComponentElement` remain separate branches under `Element`, which prevents containers and components from being placed at context level.

The rest of the C4 containment path is expressed by typed attributes on each owner. `System` accepts `Container`, and `Container` accepts `Component`. This division lets inheritance answer whether a value belongs to a broad architectural family while owner attributes decide where that value may be nested.

### Context and boundaries

`Context` is the root of an architecture model source. Its `context` constructor is expressed through the structural declaration at the beginning of a model file:

```insight
context commerce
    name = Commerce
```

A context owns an anonymous list of `BoundaryElement` values. This slot admits high-level systems, actors, deployment profiles, and other compatible boundary-level concepts. Environment inventories use their own `environment` root source form rather than being nested inside a context file. Every element contained by a context receives a context-qualified identity.

`Context` is a structural exception to the ordinary `Element` hierarchy. It forms the root boundary that owns the architectural elements declared in the source.

`BoundaryElement` has no constructor or attributes of its own. Its purpose is to form a type-safe gate around the context body. Using `Element` for the anonymous context list would allow every graph node, including containers and components, to appear at the top level. A framework author can introduce another context-level concept by deriving it from `BoundaryElement`; types intended for a narrower owner derive from `Element` through another branch and are exposed through that owner's attributes.

### C1: actors and systems

`SystemElement` groups the concepts used in a system-context view. Its concrete descendants are `Actor` and `System`.

An `Actor` represents a person, role, or external participant interacting with the modeled architecture. It provides the `actor` constructor, requires `name` and `kind`, and can own outgoing `Wire` relationships.

A `System` represents a major software system within the context. It provides the `system` constructor, requires `name` and `kind`, can own outgoing wires, and contains an anonymous list of `Container` values.

The ordinary constructors set `kind = internal`. The prefix operators `external actor` and `external system` create the corresponding external variants and set `kind = external`:

```insight
external actor customer
    name = Customer

external system payment_provider
    name = Payment provider
```

Externality is interpreted relative to a view and its boundary. The explicit external constructors provide a stable modeling signal and a distinct presentation for dependencies outside the owned architecture.

### C2: containers and services

`ContainerElement` is the abstract base for container-level concepts. `Container` is its concrete graph type and represents an executable or deployable unit such as an application, data store process, or runtime service. It provides the `container` constructor, carries descriptive attributes, owns outgoing wires, and contains components through its anonymous child list.

`Service` derives from `Container` and provides the `service` constructor. It preserves container behavior while offering a vocabulary suited to independently understandable backend or platform services. The core schema requires a service name.

Because `Service` is assignable to `Container`, both constructors can fill the anonymous container list of a `System`:

```insight
system commerce
    container storefront
        name = Storefront application

    service catalog
        name = Product catalog
```

### C3: components

`ComponentElement` is the abstract base for component-level concepts. `Component` provides the `component` constructor and represents an internal part of a container or service with a distinct responsibility.

Components require a name and can record technology, responsibility, and description. They also own outgoing wires, which allows a C3 view to show dependencies between components or from a component to a broader architectural element.

```insight
service catalog
    name = Product catalog

    component search_index
        name = Search index adapter
        responsibility = Maintains the searchable product projection
```

### Deployment

`DeploymentElement` is the abstract boundary-level base for deployment concepts. The deployment library also extends every `Element` with attributes for deployment references, runtime placement, and infrastructure usage. Logical systems, containers, services, and components can therefore be connected to their physical realization without changing their logical type.

`Environment` represents a deployment scope such as a region, account, cluster estate, or operational environment. It has a name and optional region and owns deployment elements. Projects commonly derive an organization-specific environment type and add typed infrastructure slots such as compute, storage, gateways, or brokers.

`Deployment` represents a concrete deployment within an environment. It can contain further deployment elements and fill the infrastructure slots declared by the environment framework.

An environment source uses exactly one environment as its root scope and declares one or more concrete deployments within that scope:

```insight
environment eu
    name = Europe
    region = eu-central

deployment production
    name = Production

    compute kubernetes
        name = Kubernetes cluster
```

`InfrastructureComponent` is the base concrete type for physical or managed infrastructure. It can describe its technology, contain other infrastructure components, refer to a runtime parent through `runsOn`, and carry projection rules that translate logical dependencies into physical paths. Its `runsOn:` attribute stores a typed reference to a concrete named infrastructure instance, so an anonymous `_` object cannot be its target. The similarly spelled `runsOn compute` invocation in a `DeploymentProfile` names an environment slot and resolves a concrete instance for each selected deployment.

The core library provides several specialized infrastructure types:

- `Compute` represents runtimes, hosts, clusters, and execution platforms. It can contain named infrastructure components.
- `Storage` represents databases, buckets, volumes, and other stateful resources. Its default presentation uses a cylinder.
- `Broker` represents message brokers and event infrastructure and adds an optional address.
- `NetworkConnection` represents a network capability used to project a logical relationship into a physical route. It participates in projection while remaining hidden from the default rendered diagram.

`DeploymentProfile` maps logical elements to one or more concrete deployments through its required `appliesTo` list. Reusable `runsOn` and `uses` invocations describe the environment capabilities required by the mapped element. The profile supplies deployment instructions and is hidden by its default presentation.

`ProjectionTerm`, `SourceProjectionTerm`, and `TargetProjectionTerm` describe the steps used to turn a logical dependency into a physical path. They can refer to the logical endpoints, the current infrastructure component, its attributes, or a slot supplied by the environment. These terms guide projection and are not rendered as architecture elements.

Together, these types keep logical architecture and deployment inventory in one linked model. C1, C2, and C3 views can follow the logical hierarchy, while Deployment queries include the concrete infrastructure and projected physical relationships relevant to the selected deployment scope.

## Built-in edge types

### `WireModel`

`WireModel` is a core enum describing the interaction model of a logical wire:

| Value | Meaning | Constructor |
| --- | --- | --- |
| `sync` | A synchronous interaction in which the source directly invokes the target. | `->` |
| `async` | An asynchronous interaction carried through a topic, channel, queue, or similar mechanism. | `~>` |

The `model` attribute on `Wire` has type `WireModel`. Each built-in wire constructor supplies the corresponding value, so architecture models do not assign it manually. Queries can use `model` to select synchronous or asynchronous relationships without depending on their concrete edge type.

### Edge hierarchy

The edge hierarchy begins with the runtime `Edge` type and is refined by operators in the core library:

```text
Edge
├── Wire
│   ├── SyncWire
│   └── AsyncWire
├── DeploymentProfileUse
├── InfrastructureUse
├── InfrastructurePlacement
└── PhysicalWire
    ├── ConnectTo
    ├── ReplicateFrom
    └── OriginalLink
```

`Wire` is the abstract base for logical architectural dependencies. It carries `technology`, `description`, a required `WireModel` attribute named `model`, deployment references, and the network capabilities used by deployment projection. `WireModel` is an enum containing `sync` and `async`. The concrete wire constructors provide the value, making it available for queries without requiring a manual assignment.

`SyncWire` is created with `->` and receives `model = sync`. Its optional `call` attribute can record the operation or interface being invoked. `AsyncWire` is created with `~>` and receives `model = async`; its optional `via` attribute can identify a topic, channel, queue, or other asynchronous route. Model authors leave `model` to these constructor defaults. The default presentation draws asynchronous wires with a dashed line.

```insight
service checkout
    links:
        -> payment_provider
            technology = HTTPS
            call = POST /payments

        ~> order_events
            technology = Kafka
            via = orders.created
```

`PhysicalWire` is the base for relationships produced by deployment projection. `ConnectTo` represents a physical connection, `ReplicateFrom` represents replication, and `OriginalLink` preserves the logical relationship inside an expanded physical path. These edge types let a deployment view show how one logical wire is realized through gateways, brokers, storage, and network components.

The deployment capability operators also have typed declarations in the edge family. `DeploymentProfileUse` associates an element with a deployment profile through `uses`. `InfrastructureUse` records infrastructure or network capabilities required by an element, profile, or logical wire. `InfrastructurePlacement` places an element or profile on an infrastructure component through `runsOn`. Together they connect the logical model with its deployment environment.

### Ownership and direction

A relationship is declared under the element that owns the outgoing dependency. That element becomes the edge source, and the identifier following the operator becomes its target:

```insight
service checkout
    links:
        -> payment_provider
```

This declaration creates the directed edge `checkout → payment_provider`. It belongs to `checkout` and to the source file containing the declaration. Moving the same line under `payment_provider` would create a different edge with the opposite direction.

Ownership records architectural responsibility. A service that initiates a synchronous call owns its `->` relationship. For asynchronous dependencies, the element whose operation depends on the channel owns the `~>` relationship. In a publish-and-subscribe flow this usually means describing each consumer's dependency on the relevant event route, which keeps the relationship attached to the component that must be changed when that dependency changes.

Both `->` and `~>` preserve the same source-to-target orientation. The asynchronous operator changes the relationship type and presentation while retaining the direction in which the dependency is established. Attributes indented beneath the invocation belong to that edge rather than to either endpoint.

The source-to-target orientation also applies to named physical operators. An invocation such as `replicateFrom primary` is owned by the current element and creates an outgoing typed relationship toward `primary`; the operator name explains the domain meaning of that direction. Projection rules can assemble several such directed edges into a path, and every resulting edge keeps explicit source and target identities.

This ownership model gives every relationship one authoritative declaration. Queries can follow outgoing and incoming dependencies independently, and broader logical views can roll a child relationship up to the appropriate owners without losing its original direction.
