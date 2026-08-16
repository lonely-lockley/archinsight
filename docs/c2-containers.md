# C2: Containers and Services

A C2 diagram opens one or more systems and shows their main logical runtime units: applications, services, and processes that collaborate to provide the system's behavior. A model that does not describe deployment in detail may also represent supporting resources such as a database or broker as C2 containers. When a detailed deployment model is planned, those infrastructure elements are better placed at C4, while C2 remains focused on the logical parts of the system that use them.

## Containers and services

`Container` and `Service` represent the same architectural level. Both are selected as `ContainerElement`, can own components, participate in relationships, and connect the logical model to deployment infrastructure.

The two constructors provide a choice of vocabulary. `container` is the general C4 term for an executable or deployable unit. `service` is useful when the element has an independently understandable service responsibility, such as a backend service, an API, or a platform capability:

```insight
system commerce
    name = Commerce

    container storefront
        name = Storefront application
        technology = React

    service catalog
        name = Product catalog
        technology = Kotlin
```

This distinction helps the source describe intent without introducing another diagram level. A service remains a container in the type system and appears beside other containers in the same C2 view.

## The C2 view

The default C2 view is centered on the selected tab. It includes the containers and services whose root declaration belongs to that tab, together with content added to those roots through `extend`. Elements are grouped under their owning systems so that the diagram preserves the system boundaries around them.

The view shows relationships between C2 elements and their relationships with external systems. Connections to internal systems are normally expressed through the containers that take part in the interaction, giving the reader a more precise picture than a system-level arrow alone.

Components remain folded into their container at C2. Their relationships can still contribute to the view: when a component-level dependency crosses container boundaries, it can be lifted to the containers that own its endpoints.

## Relationship ownership and direction

A wire belongs to the element under which it is declared. That element is the source of the relationship, and the element written after the operator is its target:

```insight
service checkout
    name = Checkout
    links:
        -> catalog
            description = Reads product information
```

Here, `checkout` owns the dependency and the diagram draws `checkout → catalog`. Placing the same declaration under `catalog` would draw `catalog → checkout`. The operator describes the interaction style, while the declaration position establishes its direction.

The same rule applies to asynchronous wires:

```insight
service checkout
    links:
        ~> order_events
            description = Publishes completed orders
            via = orders.completed
```

The arrow starts at `checkout` because `checkout` owns the wire. `~>` changes the relationship to asynchronous and gives it the corresponding presentation; it does not reverse the source and target.

## Relationships pushed to C1

Relationships declared at C2 are lifted to the systems that own their endpoints when a C1 diagram is built. A dependency from `checkout` inside the `commerce` system to `payments_api` inside the `payments` system produces a derived `commerce → payments` relationship at C1.

This makes the C2 declaration the best source of truth when the real dependency belongs to a particular container or service. The C1 view receives the broader interaction automatically and the C2 view retains its precise endpoints.

Once a relationship is described at C2, the equivalent C1 relationship should usually be removed. Keeping both declarations gives the model two accounts of the same dependency. It may produce duplicate-looking arrows, create ambiguity about which declaration owns the meaningful attributes, and cause the system-level edge to shadow the lower-level edge. Archinsight reports this shadowing so the broader declaration can be removed and the relationship can flow upward from its most precise level.

A separate C1 relationship remains useful when it expresses a genuinely different system-level interaction that has no more precise owner below it.

## Connecting C2 to deployment

C2 is where logical architecture begins to connect naturally to deployment. Containers and services are the units that run on compute resources, use infrastructure, and are assigned to deployment profiles. Their logical wires can also be mapped onto network connections and physical paths.

Deployment information can be attached to an element:

```insight
service catalog
    name = Product catalog

    deployment:
        uses production_service
```

The selected profile supplies the deployment environment together with values such as `runsOn` and `uses`. These values connect the service to the compute, storage, broker, or other infrastructure that supports it.

A wire has its own deployment information because the path between two deployed elements may require infrastructure of its own. A logical dependency can use a network connection, gateway, broker, or another physical route without changing the logical source and target of the wire.

This creates two related deployment paths:

- element deployment places a container or service onto infrastructure and records the infrastructure it uses;
- edge deployment explains how a logical wire is carried through infrastructure between its deployed endpoints.

The C2 model remains the logical description. Deployment views expand these declarations into physical elements and projected relationships.

## C2 entities

The C2 vocabulary contains one abstract type and two concrete types at the same modeling level.

| Entity | Constructor | Purpose |
| --- | --- | --- |
| `ContainerElement` | — | Abstract common type selected by C2 views. |
| `Container` | `container` | General executable or deployable unit inside a system. |
| `Service` | `service` | A container described specifically as a service or independently understandable capability. |

### `Container` attributes

| Name | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | `Text` | No | Human-readable name shown on the diagram. |
| `technology` | `Text` | No | Main implementation technology or runtime. |
| `description` | `Text` | No | Responsibility of the container within its system. |
| `links` | `List of Wire` | No | Outgoing relationships owned by the container. Each arrow starts at this container and points to the referenced target. |
| `_` | `List of Component` | No | Anonymous list of components owned by the container and shown at C3. |

### `Service` attributes

`Service` inherits every `Container` attribute and strengthens the `name` contract:

| Name | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | `Text` | Yes | Human-readable service name. |
| `technology` | `Text` | No | Main implementation technology or runtime. |
| `description` | `Text` | No | Responsibility provided by the service. |
| `links` | `List of Wire` | No | Outgoing relationships owned by the service. Each arrow starts at this service and points to the referenced target. |
| `_` | `List of Component` | No | Anonymous list of components owned by the service and shown at C3. |

### Deployment attributes inherited by C2 elements

All `Element` descendants receive the built-in deployment attributes, so they are available on both containers and services.

| Name | Type | Required | Meaning |
| --- | --- | --- | --- |
| `deployment` | `List of Edge` | No | Deployment actions, commonly the selection of a `DeploymentProfile` through `uses`. |
| `runsOn` | `InfrastructureComponent` | No | Infrastructure that hosts the deployed element. |
| `uses` | `List of InfrastructureComponent` | No | Storage, brokers, network resources, or other infrastructure required by the element. |

### C2 relationship attributes

The C2 level uses the same `Wire` family as C1. The declaration owner is always the source of the wire.

| Name | Type | Required | Applies to | Meaning |
| --- | --- | --- | --- | --- |
| `technology` | `Text` | No | `->`, `~>` | Protocol, transport, or integration technology. |
| `description` | `Text` | No | `->`, `~>` | Purpose of the interaction. |
| `model` | `WireModel` | Yes, provided by constructor | `->`, `~>` | Enum value identifying the relationship as `sync` or `async` for queries. The built-in constructor supplies it. |
| `deployment` | `List of Edge` | No | `->`, `~>` | Deployment actions that describe the physical realization of the wire. |
| `uses` | `List of NetworkConnection` | No | `->`, `~>` | Network capabilities used by the deployed relationship. |
| `call` | `Text` | No | `->` | Operation or interface invoked by a synchronous interaction. |
| `via` | `Text` | No | `~>` | Topic, channel, queue, or route used by an asynchronous interaction. |
