# C1 System Context

Use this reference only for C1 work: modeling a bounded context, its users,
owned systems, external systems, and high-level relationships.

## What C1 Answers

A C1 view answers: "What system are we discussing, who uses it, and which
outside systems does it depend on?"

The built-in C1 query selects the complete context boundary. It shows all C1
systems and actors in the selected context even when their declarations are
split across several files; C1 is scoped by context rather than by one tab.
Participating elements owned by another context are external to the C1 view,
while an explicit `external actor` or `external system` remains external in
every view.

Do not include containers, services, components, databases, queues, or runtime
nodes unless the project deliberately treats them as context-level systems. C1
is about boundaries and responsibilities, not implementation structure.

## C1 Workflow

1. Name the bounded `context <id>`.
2. Add external actors that initiate or consume behavior.
3. Add owned `system` declarations inside the modeled boundary.
4. Add `external system` declarations for dependencies outside the boundary.
5. Add high-level links that explain business or capability flow.
6. Validate with `archinsight link . --format text`.
7. Render with `archinsight render . -s <c1-source.ai> -v c1 -f svg -o c1.svg`.

## Boundary Choices

Choose the modeled boundary before choosing constructors.

- Use `system` for systems owned inside the current context.
- Use `external system` for systems outside the current context boundary.
- Use `external actor` for people, roles, teams, or external automation that
  interacts with the system from outside.
- Use `import <id> from context <context-id>` when a reusable outside system is
  declared in another context.

When the same actor participates in several contexts, declare it once in a
shared external context and import it. Declaring a separate local actor in every
context creates several identities for what readers understand as one actor.

Externality is relative. A system can be external to the current system but
still owned in the same context. A vendor platform or regulator is usually
external to the context.

## Basic C1 Pattern

```insight
context commerce
    name = Commerce Platform

external actor shopper
    name = Shopper
    technology = Browser
    description = Browses products and places orders
    links:
        -> storefront
            description = Shops and checks out

external actor support_agent
    name = Support agent
    technology = Back-office browser
    description = Helps customers investigate orders
    links:
        -> order_admin
            description = Looks up order state and customer communication

external system payment_provider
    name = Payment Provider
    technology = HTTPS API
    description = Authorizes card payments

system storefront
    name = Storefront
    technology = Web application
    description = Lets shoppers browse products and place orders
    links:
        -> payment_provider
            technology = HTTPS
            description = Requests payment authorization

system order_admin
    name = Order Admin
    technology = Internal web application
    description = Lets support staff inspect and manage orders
    links:
        -> storefront
            description = Reads customer order data
```

## Owned Peer Pattern

Do not make every peer `external system`. If two systems are owned inside the
same architecture boundary, keep both as `system` and link them:

```insight
context company_platform
    name = Company Platform

system fintech
    name = Fintech
    description = Payment and account capabilities

system compliance
    name = Compliance
    description = Compliance rules, audit, and reporting
    links:
        -> fintech
            description = Reads transactions for screening and reporting
```

Here `fintech` can be outside the compliance team boundary, but it is not
outside the company platform context. Use the context boundary, not team
ownership alone, to decide `system` vs `external system`.

C1 opens the complete context, so both declarations remain internal `System`
members there. When a compliance source opens only that system at C2, the
sibling fintech system is included through the relationship and presented as
external relative to the opened system boundary. Do not rewrite it as
`ExternalSystem` to obtain that presentation. Deployment is narrower still:
it includes only logical endpoints and physical infrastructure reached through
the selected effective deployments and valid projections.

## Reusable External Context Pattern

When the same outside dependency appears in many contexts, declare it once and
import it:

```insight
context external_platforms

external system stripe
    name = Stripe
    technology = HTTPS API
    description = External payment platform
```

```insight
context commerce

import stripe from context external_platforms

system storefront
    name = Storefront
    links:
        -> stripe
            technology = HTTPS
            description = Requests payment authorization
```

Use imports for shared declarations; do not duplicate the same vendor system in
every context unless the project intentionally wants separate local identities.

## C1 Links

Links should be high-level and readable:

```insight
links:
    -> storefront
        description = Places orders
```

Add `technology`, `call`, or `via` only when the detail is stable and useful
at context level. Prefer capability language over endpoint trivia.

The declaration owner is always the wire source, and the referenced target is
the arrow destination. Lower-level C2 and C3 relationships are rolled up to
their owning systems by the built-in C1 view. When a precise lower-level wire
already describes the dependency, remove an equivalent C1 wire to avoid
duplicate edges, ambiguity, and shadowing. Keep a direct C1 wire only when it
expresses a distinct system-level interaction.

Use `~>` for meaningful asynchronous context flows:

```insight
external system analytics_platform
    name = Analytics Platform
    links:
        ~> storefront
            technology = Kafka
            via = order.completed
            description = Consumes completed order events from Storefront
```

## What Not To Put In C1

- Internal containers such as `web_app`, `api`, or `worker`.
- Components, classes, packages, screens, handlers, or repositories.
- Databases, queues, pods, nodes, gateways, or regions unless modeled as
  context-level systems.
- Low-level calls between internals.
- Placeholder systems invented only to make the diagram symmetric.

## Common C1 Mistakes

- Treating a peer owned in the same context as `external system`.
- Duplicating imported external systems instead of importing the shared
  declaration.
- Adding implementation details that belong to C2, C3, or a project-defined
  code model.
- Drawing a relationship without naming what capability or dependency it means.
- Choosing constructors before deciding the context boundary.

## Validation Commands

```shell
archinsight structure . --format text
archinsight link . --format text
archinsight render . -s c1-context.ai -v c1 -f svg -o commerce-c1.svg
```

Use `examples/c1-context.ai` as a compact valid C1 model when syntax is
unclear.
