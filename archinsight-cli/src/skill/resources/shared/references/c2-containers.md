# C2 Containers and Services

Use this reference only for C2 work: decomposing one selected owned system into
its main logical runtime units and their collaborations.

## What C2 Answers

A C2 view answers: "Inside this system, which deployable or executable units
exist, what technologies do they use, and how do they collaborate?"

`Container` and `Service` belong to the same modeling level. `Service` is a
specialized `Container`; use the two constructors as semantic synonyms that
make an element's intended role clearer. They do not create separate diagram
levels or different deployment behavior.

Prefer one focal system per C2 source file. The built-in C2 view is scoped by
the selected source file, so a C2 file should usually contain the selected
`system <id>` declaration or an `extend system <id>` block with its
containers/services.

All systems rooted in the selected source are opened together. Their containers
and services are internal to the complete diagram. A dependency leaving that
set is folded to its owning closed system, which is shown as external to this
C2 view without exposing its containers.

## C2 Purity vs Pragmatic Infrastructure

The clean C2 answer is logical: deployable containers/services and how they
collaborate. In that mode, databases, brokers, gateways, vaults, compute, and
regions belong to deployment.

Archinsight does not force that choice. For a quick or single-environment model,
it is acceptable to put simple infrastructure-like runtime nodes into C2 when
the user wants speed over strict layer separation. Be explicit about the
tradeoff: the C2 view becomes mixed, deployment is not modeled for that system,
and many-to-many deployment across different environments will not be available
until the model is migrated to explicit deployment modeling.

Choose this per system. Do not make the whole repository clean or mixed just
because one system needs that style.

## C2 Workflow

1. Run `archinsight structure . --format text` to find the exact system id,
   existing containers/services, and external declarations.
2. Create or edit a C2 file in the same `context <id>`.
3. Import every referenced declaration owned by another source, including a
   declaration in another file of the same context.
4. Add `container` or `service` declarations for the system's logical runtime
   units, choosing the word that best communicates each unit's role.
5. Add runtime links between containers/services and real external systems.
6. Validate with `archinsight link . --format text`.
7. Render with `archinsight render . -s <c2-file.ai> -v c2 -f svg -o c2.svg`.

## File Split Pattern

Keep C1 focused on the system boundary:

```insight
context commerce
    name = Commerce Platform

external system payment_provider
    name = Payment Provider
    technology = HTTPS API

system storefront
    name = Storefront
    technology = Commerce system
    description = Lets shoppers browse products and place orders
```

Put C2 details in a system file:

```insight
context commerce

import payment_provider from context commerce

extend system storefront
    container web_app
        name = Web app
        technology = SvelteKit, TypeScript
        description = Renders product pages and checkout screens
        links:
            -> checkout_api
                technology = HTTPS, JSON
                call = POST /checkout
                description = Starts checkout and shows order status

    service checkout_api
        name = Checkout API
        technology = Kotlin, PostgreSQL
        description = Prices carts, creates orders, and coordinates payment
        links:
            -> payment_provider
                technology = HTTPS
                call = POST /payments/authorizations
                description = Requests payment authorization
```

The extension target is resolved in the shared context and does not need an
import. The ordinary reference to `payment_provider` crosses a source boundary,
so the C2 file imports it even though both files use `context commerce`.

## Frontend and Backend Pattern

Use `container` when "application" or "executable unit" best communicates the
role:

```insight
container web_app
    name = Web app
    technology = SvelteKit, TypeScript
    description = Browser-facing application for customers
```

Use `service` when "service" best communicates the role:

```insight
service checkout_api
    name = Checkout API
    technology = Kotlin, PostgreSQL
    description = Coordinates checkout and payment authorization
```

Do not turn every library, package, or class into a C2 node. Those belong to C3
only when they become stable architectural responsibilities.

The constructors are interchangeable at C2 from the view and deployment
perspective. Follow the vocabulary already used by the project rather than
reclassifying elements only because of their implementation technology.

## External System Pattern

For an external dependency declared in the same context:

```insight
external system payment_provider
    name = Payment Provider
    technology = HTTPS API

system storefront
    name = Storefront

    service checkout_api
        name = Checkout API
        links:
            -> payment_provider
                technology = HTTPS
                call = POST /payments/authorizations
```

For a dependency declared in another context, import it:

```insight
context commerce

import stripe from context external_platforms

extend system storefront
    service checkout_api
        name = Checkout API
        links:
            -> stripe
                technology = HTTPS
                call = POST /payments/authorizations
```

Do not copy an outside system into the current context just to satisfy a link.
Import the real declaration when it is shared.

## Async and Eventing Pattern

Use `~>` for meaningful asynchronous dependencies. For pub/sub, declare the
wire on the consumer, pointing at the producer/source whose topic contract it
depends on:

```insight
external system analytics_platform
    name = Analytics Platform
    technology = Kafka consumer
    links:
        ~> checkout_api
            technology = Kafka
            via = checkout.completed
            description = Consumes completed checkout events

service checkout_api
    name = Checkout API
    description = Publishes checkout.completed as an event contract
```

Do not list consumers under the producer just to answer "who listens to this
topic?" That answer belongs in a query over incoming async dependencies.

Do not add a broker node just to make an event diagram look familiar. In clean
C2, a broker is usually deployment infrastructure unless the project defines
it as a runtime system or service in the selected view. In pragmatic mixed C2,
adding a broker can be acceptable for a quick view, but it means the diagram is
no longer strictly logical C2.

## C2 Link Details

Use link attributes to make runtime collaboration understandable:

```insight
links:
    -> checkout_api
        technology = HTTPS, JSON
        call = POST /checkout
        description = Starts checkout and returns order status
```

`call` is singular. Use `via` for async topics or channels. Keep endpoint
details at C2 only when they clarify the architecture; otherwise use a plain
`description`.

The element containing a wire owns it and becomes its source; the referenced
element is the arrow target. C2 relationships are rolled up to their owning
systems in C1. Once a dependency is expressed at C2, remove an equivalent C1
wire so the most precise declaration remains authoritative and the rollup does
not compete with a broad duplicate.

## What Not To Put In C2

- Components, classes, handlers, repositories, or UI widgets.
- Deployment nodes, pods, regions, network gateways, or secret stores in clean
  C2. Include them only when the user intentionally wants pragmatic mixed C2 or
  the project models them as C2 runtime systems.
- Database tables and internal schemas.
- One-off scripts or build-time tools unless they are real runtime units.
- Duplicate links already represented at a lower C3 level unless the C2 view is
  intentionally showing the rollup.

## Common C2 Mistakes

- Adding C2 nodes directly under `context` instead of under a `system`.
- Modeling infrastructure in C2 without deciding that the system is using the
  pragmatic mixed-C2 style.
- Mixing C2 container/service links with C3 component links in the same source
  file without a clear view goal.
- Forgetting `--source <c2-file.ai>` when rendering C2.
- Making every peer an `external system` instead of deciding whether it is
  owned in the current context.

## Validation Commands

```shell
archinsight structure . --format text
archinsight link . --format text
archinsight render . -s storefront-containers.ai -v c2 -f svg -o storefront-c2.svg
```

Use `examples/c2-containers.ai` as a compact valid C2 model when syntax is
unclear.
