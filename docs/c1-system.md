# C1: System Context

A C1 diagram presents the architecture at the level of people and software systems. It establishes the subject of the model, the systems around it, and the interactions that connect them. Details inside a system belong to the following levels and remain folded into the system boundary here.

## Context boundary

Every C1 model is built around a context boundary. The boundary defines the architectural area described by a `context` and gives the elements inside it a shared namespace:

```insight
context commerce
    name = Commerce landscape

system storefront
    name = Storefront

system catalog
    name = Product catalog
```

The boundary may describe a product landscape, a business domain, or another area that is useful to examine as one whole. Systems and actors declared directly in the context become its C1 elements. Containers and components belong inside systems and are shown on more detailed diagrams.

The default C1 view selects the complete context boundary. Opening the diagram for `commerce` therefore shows every system and actor that belongs to that context, even when their declarations are split across several files. The view is scoped by the context identifier rather than by the current tab.

Imported systems and actors appear when they participate in the selected relationships. This keeps the boundary readable while preserving the surrounding systems and people needed to understand it.

Every system and actor inside the selected context is internal to the C1 view. A participating element owned by another context is shown as external to this diagram, even when its model declaration uses the ordinary `system` or `actor` constructor. An element declared with `external system` or `external actor` keeps its external presentation in every view.

## Relationships at C1

C1 relationships describe high-level interactions. They answer questions such as which system depends on another system, which actor uses a system, or which external platform participates in a business flow. Protocol details can be recorded when they help the reader, but the relationship should remain meaningful without knowledge of individual containers, endpoints, topics, or components.

A relationship declared directly between C1 elements appears as written:

```insight
system storefront
    name = Storefront
    links:
        -> catalog
            description = Reads product information
```

The element containing the wire owns the relationship and becomes its source. In this example, `storefront` owns the wire, so the arrow is drawn from `storefront` to `catalog`. Moving the declaration under `catalog` would reverse the dependency and produce `catalog → storefront`.

The default view can also lift a lower-level dependency to the systems that own its endpoints. If a container inside `storefront` calls a service inside `catalog`, the C1 diagram can show the resulting `storefront → catalog` relationship. This allows detailed models to support the system view without requiring every dependency to be repeated at C1.

Several low-level dependencies may be represented by the same pair of systems. The C1 diagram communicates the existence and overall meaning of their interaction; the C2 and C3 views provide the detail behind it.

## Actors and context ownership

An actor belongs to the context in which it is declared. This is convenient for a role that exists only within one modeled area:

```insight
context commerce

actor merchandiser
    name = Merchandiser
    description = Maintains the product catalog
```

A shared actor often participates in several contexts. Declaring a separate copy in each context creates several unrelated graph elements with the same human meaning. A clearer model places the actor in a dedicated external context and imports that single declaration wherever it is needed:

```insight
context shared_actors

external actor customer
    name = Customer
```

```insight
context commerce

import customer from context shared_actors
```

The imported actor keeps its original identity. Each context can then connect its own systems to the same actor, and navigation across the project leads back to one authoritative declaration.

## C1 entities

The C1 vocabulary is built around `Context`, the abstract `SystemElement` family, and its concrete actor and system types.

| Entity | Constructor | Purpose |
| --- | --- | --- |
| `Context` | `context` | Defines the boundary and namespace of the C1 model. |
| `SystemElement` | — | Abstract common type for actors and systems selected by C1 views. |
| `Actor` | `actor` | Represents a person, role, organization, or other participant interacting with software systems. |
| `ExternalActor` | `external actor` | Represents an actor owned outside the current architectural area. |
| `System` | `system` | Represents a software system as a single unit of responsibility. |
| `ExternalSystem` | `external system` | Represents a software system owned outside the current architectural area. |

`ExternalActor` and `ExternalSystem` share the attributes of their ordinary counterparts. Their constructors set `kind` to `external` and give them the external presentation used by the built-in views.

### `Context` attributes

| Name | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | `Text` | No | Human-readable name shown for the context boundary. |
| `_` | `List of BoundaryElement` | No | Anonymous list containing the systems, actors, and other boundary-level elements declared directly in the context. |

The context identifier is written after the `context` keyword and provides its stable project identity. It is separate from the optional display `name`.

### `Actor` and `ExternalActor` attributes

| Name | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | `Text` | Yes | Human-readable name of the person, role, organization, or participant. |
| `kind` | `Text` | Yes | Marks the actor as `internal` or `external`; the built-in constructors provide this value. |
| `technology` | `Text` | No | Additional classification shown as the actor subtitle when useful. |
| `description` | `Text` | No | Explains the actor's role in the modeled context. |
| `links` | `List of Wire` | No | Outgoing interactions owned by the actor. |

### `System` and `ExternalSystem` attributes

| Name | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | `Text` | Yes | Human-readable system name. |
| `kind` | `Text` | Yes | Marks the system as `internal` or `external`; the built-in constructors provide this value. |
| `technology` | `Text` | No | Main technology or platform when it is meaningful at system level. |
| `description` | `Text` | No | Describes the system's responsibility and place in the architecture. |
| `links` | `List of Wire` | No | Outgoing high-level dependencies owned by the system. |
| `_` | `List of Container` | No | Anonymous list of the system's containers and services, shown on C2 and more detailed views. |

## C1 relationship attributes

The built-in synchronous `->` and asynchronous `~>` operators create `Wire` relationships. The element containing the wire owns it and forms the start of the arrow. Both forms accept the shared wire attributes, and each adds one attribute suited to its interaction style.

| Name | Type | Required | Applies to | Meaning |
| --- | --- | --- | --- | --- |
| `technology` | `Text` | No | `->`, `~>` | Protocol, transport, or integration technology when it is useful at this level. |
| `description` | `Text` | No | `->`, `~>` | Human-readable meaning of the interaction. |
| `model` | `WireModel` | Yes, provided by constructor | `->`, `~>` | Enum value identifying the relationship as `sync` or `async` for queries. The built-in constructor supplies it. |
| `deployment` | `List of Edge` | No | `->`, `~>` | Deployment-specific relationships associated with the logical wire. |
| `uses` | `List of NetworkConnection` | No | `->`, `~>` | Network capabilities used when the relationship is projected onto infrastructure. |
| `call` | `Text` | No | `->` | Operation or interface invoked by a synchronous interaction. |
| `via` | `Text` | No | `~>` | Topic, channel, queue, or route used by an asynchronous interaction. |

At C1, `description` is usually the most valuable relationship attribute because it explains the architectural purpose of the interaction. `technology`, `call`, and `via` become more useful as the model moves toward container and component detail.
