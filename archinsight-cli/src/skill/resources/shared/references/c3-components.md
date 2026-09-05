# C3 Components

Use this reference only for C3 work: decomposing one selected container or
service into internal components and their collaborations.

## What C3 Answers

A C3 view answers: "Inside this container/service, what named responsibilities
collaborate to deliver its behavior?"

Prefer one focal container or service per C3 source file. The built-in C3 view
is scoped by the selected source file, so the C3 file should usually contain an
`extend container <id>` or `extend service <id>` block for the focal element.

If the selected source opens several containers or services, components inside
all of them are internal to one diagram. A dependency leaving that set is
folded to the nearest closed container or service and shown as external to the
C3 view.

Do not model every class, function, method, or package. A component should be a
stable architectural responsibility that is useful in a diagram and review.

## C3 Workflow

1. Run `archinsight structure . --format text` to find the exact container or
   service id, available constructors, and existing imports.
2. Create or edit a C3 file in the same `context <id>`.
3. Import every referenced declaration owned by another source, including a
   declaration in another file of the same context.
4. Use `extend container <id>` or `extend service <id>`.
5. Add `component` declarations with `name`, `technology`, and
   `responsibility`.
6. Add links between components and to real external endpoints.
7. Validate with `archinsight link . --format text`.
8. Render with `archinsight render . -s <c3-file.ai> -v c3 -f svg -o c3.svg`.

## File Split Pattern

Keep the C2 declaration small:

```insight
context commerce
    name = Commerce Platform

external system payment_provider
    name = Payment Provider
    technology = HTTPS API

system storefront
    name = Storefront

    container web_app
        name = Web app
        technology = SvelteKit, TypeScript

    service checkout_api
        name = Checkout API
        technology = Kotlin, PostgreSQL
        description = Handles cart pricing, order placement, and payment orchestration
```

Put component details in a C3 file:

```insight
context commerce

import payment_provider from context commerce

extend service checkout_api
    component checkout_controller
        name = Checkout controller
        technology = REST controller
        responsibility = Accepts checkout requests and returns order status
        links:
            -> checkout_service

    component checkout_service
        name = Checkout service
        technology = Kotlin
        responsibility = Coordinates pricing, payment authorization, and order creation
        links:
            -> payment_gateway
            -> order_repository

    component payment_gateway
        name = Payment gateway
        technology = HTTP client
        responsibility = Translates internal payment commands to provider API calls
        links:
            -> payment_provider
                technology = HTTPS
                call = POST /payments/authorizations
                description = Authorizes customer payment

    component order_repository
        name = Order repository
        technology = SQL
        responsibility = Persists order state and checkout audit records
```

The extension target is resolved in the shared context without an import.
`payment_provider` is an ordinary cross-source reference and therefore has an
explicit same-context import.

## Frontend Container Pattern

Use C3 for UI responsibilities when the frontend container has distinct
architectural parts:

```insight
context commerce

import checkout_api from context commerce

extend container web_app
    component route_shell
        name = Route shell
        technology = SvelteKit routing
        responsibility = Owns route loading, authenticated layout, and page composition
        links:
            -> checkout_page
            -> session_store

    component checkout_page
        name = Checkout page
        technology = Svelte
        responsibility = Collects checkout input and presents order progress
        links:
            -> api_client

    component session_store
        name = Session store
        technology = Browser storage
        responsibility = Keeps current user and session state for client-side decisions

    component api_client
        name = API client
        technology = Fetch, JSON
        responsibility = Wraps backend API calls and maps transport errors to UI state
        links:
            -> checkout_api
                technology = HTTPS, JSON
                call = POST /checkout
```

Here `checkout_api` is declared in the system file, so the frontend component
file imports it before creating the cross-container link.

This is useful when frontend structure affects architecture. If the frontend is
only a thin page with no meaningful internal decisions, leave it at C2.

## Backend Service Pattern

Use C3 to separate adapters, orchestration, domain logic, persistence, and
integration boundaries:

```insight
context commerce

extend service inventory_api
    component inventory_resource
        name = Inventory resource
        technology = REST
        responsibility = Exposes stock reservations and availability endpoints
        links:
            -> reservation_service

    component reservation_service
        name = Reservation service
        technology = Java
        responsibility = Applies reservation rules and coordinates stock updates
        links:
            -> inventory_policy
            -> reservation_repository

    component inventory_policy
        name = Inventory policy
        technology = Java
        responsibility = Decides whether stock can be promised to an order

    component reservation_repository
        name = Reservation repository
        technology = SQL
        responsibility = Stores reservation state and idempotency keys

    component stock_projection
        name = Stock projection
        technology = Kafka consumer
        responsibility = Maintains a stock read model from reservation events
        links:
            ~> reservation_service
                technology = Kafka
                via = inventory.reserved
                description = Consumes successful reservation events
```

Use `->` for synchronous calls and `~>` for asynchronous flows. Use singular
`call` for the synchronous operation and `via` for the asynchronous topic,
queue, or channel. For pub/sub, put the async link on the consumer and point it
at the producer/source whose event contract it consumes.

## Imported Boundary Pattern

When a component links repeatedly to an element from another context, import it
once and use the local binding:

```insight
context commerce

import fraud_api from context risk_platform

extend service checkout_api
    component risk_adapter
        name = Risk adapter
        technology = HTTP client
        responsibility = Requests fraud decisions before payment authorization
        links:
            -> fraud_api
                technology = HTTPS
                call = POST /risk/decisions
                description = Requests checkout risk decision
```

Do not copy an imported system into the current context just to make the C3
diagram render. Import the real declaration and validate the link.

## Component Naming

Prefer names that reveal responsibility:

- `checkout_controller`, `checkout_service`, `payment_gateway`
- `reservation_policy`, `reservation_repository`, `inventory_events`
- `route_shell`, `checkout_page`, `api_client`

Avoid names that are only implementation trivia:

- `utils`, `helpers`, `module1`, `manager`
- individual classes unless the class is the architectural boundary
- framework-generated files or folders

## Responsibility Boundaries

A good C3 component has at least one of these:

- a distinct external adapter;
- a domain or orchestration responsibility;
- a persistence boundary;
- an asynchronous producer or consumer role;
- a security, policy, parsing, rendering, or transformation responsibility;
- a UI composition, state, or backend API boundary that affects architecture.

If a component cannot be described without mentioning code organization only,
leave it out or ask for a more architectural boundary.

## Links in C3

Links should explain runtime collaboration inside the focal container/service.
The component containing the wire owns it and becomes its source; the referenced
element is the arrow target.

Use internal component links:

```insight
links:
    -> checkout_service
```

Add call details when they matter:

```insight
links:
    -> payment_gateway
        call = authorize(paymentCommand)
        description = Requests payment authorization
```

Use async details for events:

```insight
links:
    ~> reservation_service
        via = inventory.reserved
        description = Consumes reservation completion events
```

Do not add a broker as a component unless the broker is actually part of the
focal container/service. Shared brokers, queues, gateways, and runtime placement
usually belong to deployment or infrastructure modeling.

The built-in views roll a component dependency up to its owning containers at
C2 and, when it crosses system boundaries, to its owning systems at C1. Remove
equivalent broader wires after the C3 relationship becomes the authoritative
declaration. Keep a broader wire only when it describes a different interaction.

## Common C3 Mistakes

- Writing C3 components under a `system` instead of under a container/service
  unless the project type model explicitly allows that.
- Creating one C3 file for every class or package.
- Linking to an external element without importing it when it lives in another
  context.
- Forgetting `--source <c3-file.ai>` when rendering C3.
- Mixing C2 container links and C3 component links in one view question.
- Keeping a broad container/service link and an equivalent lower-level component
  link without deciding which level should own the relationship.
- Inventing components to satisfy a diagram shape instead of describing real
  responsibilities.

## Validation Commands

```shell
archinsight structure . --format text
archinsight link . --format text
archinsight render . -s checkout_components.ai -v c3 -f svg -o checkout-c3.svg
```

Use `examples/c3-components.ai` as a compact valid C3 model when syntax is
unclear.
