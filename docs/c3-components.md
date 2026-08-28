# C3: Components

A C3 diagram opens containers and services to show the major parts that implement their behavior. Components describe architectural responsibilities inside a runtime unit: modules, subsystems, adapters, handlers, domain areas, or other parts whose collaboration is important to understand.

C3 stays above the level of classes and individual functions. A component earns a place in the model when it has a recognizable responsibility, participates in meaningful dependencies, or helps explain how work moves through its container.

## Components inside containers

A component belongs to the container or service in which it is declared:

```insight
service checkout
    name = Checkout

    component order_handler
        name = Order handler
        responsibility = Coordinates checkout requests

    component payment_adapter
        name = Payment adapter
        responsibility = Integrates with the payment provider
```

The parent establishes the component boundary. `order_handler` and `payment_adapter` are parts of `checkout`, and their identities remain qualified by the surrounding context like every other architecture element.

The default C3 view is centered on the selected tab. It finds the containers and services in that source scope, includes their components, and places each component inside its owning container boundary. Components contributed to those roots through `extend` belong to the same view.

Several containers may appear when the selected source describes more than one of them. The container boundaries let the reader see which dependencies stay inside one runtime unit and which cross into another.

Every container or service opened by the selected tab belongs to the same C3 focus. Components inside any of those boundaries are internal to the diagram. A relationship that leaves the focus ends at the nearest closed container or service and marks that endpoint as external to the view. This keeps the closed container's components opaque while preserving the direction and meaning of the original wire.

## Relationship ownership and direction

A component owns the wires declared in its `links` attribute. The owner becomes the source of the relationship, and the identifier after the operator becomes its target:

```insight
component order_handler
    name = Order handler
    links:
        -> payment_adapter
            description = Requests payment authorization
```

This declaration draws `order_handler → payment_adapter`. Moving the wire under `payment_adapter` would draw the opposite dependency. The placement of the declaration always establishes the source, for both `->` and `~>`.

At C3, a wire should explain collaboration between responsibilities. `description` records why the source needs the target, while `technology`, `call`, or `via` can identify the concrete interface when that detail helps the reader.

The default view also keeps explicitly external C1 elements opaque. The diagram shows the component that interacts with such an element without opening structure behind that endpoint.

## Relationships pushed to C2 and C1

Component relationships are lifted to broader owners when higher-level diagrams are built. A wire crossing two container boundaries becomes a derived relationship between those containers at C2. When the containers belong to different systems, the same dependency can be lifted again to their systems at C1.

For example, a dependency from `order_handler` in the `checkout` service to `catalog_reader` in the `catalog` service can produce:

```text
C3: order_handler → catalog_reader
C2: checkout → catalog
C1: commerce → catalog_system
```

The component declaration remains the source of truth. Its ownership and direction are preserved while each broader view replaces the endpoints with the nearest elements appropriate to that level.

Equivalent wires should usually be removed from C2 and C1 after the dependency has been modeled at C3. Repeating the relationship at several levels creates ambiguity about its authoritative declaration, can produce duplicate-looking arrows, and allows a broader edge to shadow the more precise component edge. A higher-level declaration remains appropriate when it describes a separate architectural interaction with no meaningful component owner.

Dependencies between components of the same container stay internal to that container. They are useful at C3 and do not need to become a self-referencing container or system relationship in broader views.

## Components and code

C4 can open a component further when the project needs to describe its code structure. Archinsight provides the abstract `CodeElement` base type for this purpose and leaves the concrete vocabulary to project definitions. A project can introduce modules, packages, layers, entry points, or other concepts that match the way its code is organized, then attach their instances to components through project-defined attributes.

Code modeling is optional. Components remain complete C3 elements when no `CodeElement` descendants are defined. See [C4: Code](c4-code.md) for the base type, the built-in view, and a complete example.

## Components and deployment

Components inherit the deployment attributes available to every `Element`. This allows a component to refer to infrastructure when its deployment behavior genuinely differs from the rest of its container.

Most deployment descriptions begin at C2 because a container or service is normally the deployed runtime unit. Its components share that placement. Component-level deployment information is useful for exceptions such as a separately hosted module, a component with its own infrastructure dependency, or a model in which the component represents an independently placed workload.

Component wires can also carry deployment information. The component containing the wire remains its logical source, and deployment projection describes the physical path around that relationship without changing its C3 direction.

## C3 entities

The built-in C3 vocabulary contains an abstract family type and one concrete component type.

| Entity | Constructor | Purpose |
| --- | --- | --- |
| `ComponentElement` | — | Abstract common type selected by C3 views. |
| `Component` | `component` | A part of a container or service with a distinct architectural responsibility. |

### `Component` attributes

| Name | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | `Text` | Yes | Human-readable component name. |
| `technology` | `Text` | No | Main implementation technology or framework. |
| `responsibility` | `Text` | No | Concise statement of the behavior owned by the component. It is used as the body of the built-in component presentation. |
| `description` | `Text` | No | Additional explanation that does not fit in the concise responsibility. |
| `links` | `List of Wire` | No | Outgoing relationships owned by the component. Each arrow starts at this component and points to the referenced target. |

### Deployment attributes inherited by components

| Name | Type | Required | Meaning |
| --- | --- | --- | --- |
| `deployment` | `List of Edge` | No | Deployment actions associated with the component. |
| `runsOn` | `InfrastructureComponent` | No | Infrastructure that hosts the component when it has a distinct placement. |
| `uses` | `List of InfrastructureComponent` | No | Infrastructure required specifically by the component. |

### C3 relationship attributes

C3 uses the same `Wire` family as C1 and C2. The component containing the wire owns it and forms the start of the arrow.

| Name | Type | Required | Applies to | Meaning |
| --- | --- | --- | --- | --- |
| `technology` | `Text` | No | `->`, `~>` | Protocol, library, transport, or integration technology. |
| `description` | `Text` | No | `->`, `~>` | Purpose of the component interaction. |
| `model` | `WireModel` | Yes, provided by constructor | `->`, `~>` | Enum value identifying the relationship as `sync` or `async` for queries. The built-in constructor supplies it. |
| `deployment` | `List of Edge` | No | `->`, `~>` | Deployment actions describing the physical realization of the wire. |
| `uses` | `List of NetworkConnection` | No | `->`, `~>` | Network capabilities used by the deployed relationship. |
| `call` | `Text` | No | `->` | Operation or interface invoked by a synchronous interaction. |
| `via` | `Text` | No | `~>` | Topic, channel, queue, or route used by an asynchronous interaction. |
