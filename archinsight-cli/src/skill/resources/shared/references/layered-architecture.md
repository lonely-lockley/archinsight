# Modeling Architecture by Layers

Describe architecture from broad intent to implementation detail. Keep every
layer useful on its own.

## C1: System Context

Start with the context, people, owned systems, and external dependencies. Read
`references/c1-context.md` before writing a real C1 model.

```insight
context ecommerce
    name = E-commerce Platform

external actor customer
    name = Customer
    technology = Web browser
    links:
        -> storefront

external system payment_provider
    name = Payment Provider
    technology = HTTPS API

system storefront
    name = Storefront
    technology = Web app
```

At this layer, avoid implementation details. Explain who uses the system and
which external dependencies matter. Whether a peer is an owned `system`, an
`external system`, or an imported declaration depends on the modeled boundary.

## C2: Containers and Services

Nest deployable units under the owned system. Read
`references/c2-containers.md` before writing a real C2 model.

```insight
system storefront
    name = Storefront

    container web_app
        name = Web app
        technology = SvelteKit, TypeScript
        links:
            -> checkout_api

    service checkout_api
        name = Checkout API
        technology = Node.js, PostgreSQL
        links:
            -> payment_provider
```

Use `container` for applications or deployable units. Use `service` for
backend services. Add links that explain runtime collaboration. A C2 file often
focuses one system, but the actual visualization scope is set by the query and
the selected source file.

## C3: Components

Put component details in a separate file with `extend` when a container or
service becomes interesting enough to decompose. Read
`references/c3-components.md` before writing a real C3 model.

```insight
context ecommerce

extend service checkout_api
    component order_controller
        name = Order controller
        technology = REST
        responsibility = Accepts checkout requests and returns order status
        links:
            -> payment_client

    component payment_client
        name = Payment client
        technology = HTTP client
        responsibility = Calls the external payment provider
```

Components should describe responsibilities, not every class or function.
As with C2, a C3 file often focuses one container or service, but custom queries
can intentionally choose a different scope.

## C4: Code

Use project-defined `CodeElement` descendants when a component needs a code
view. Read `references/c4-code.md` before introducing modules, packages,
classes, functions, schemas, or another code vocabulary. Keep those type and
containment definitions separate from the context source, and use
`examples/c4-code` as the minimal working pattern.

The built-in C4 query selects the project's code elements without prescribing
what they mean. Model only implementation structures that explain stable
responsibilities, interfaces, or dependencies.

## Deployment

Use deployment profiles and infrastructure types when physical realization is
important. Read `references/deployment.md` before writing a real deployment model.

```insight
environment eu
    name = Europe

deployment production
    name = Production
```

```insight
context application

deploymentProfile production_service
    appliesTo:
        production from eu
```

Attach deployment details to systems, containers, services, components, or links
only when they clarify real runtime paths. Prefer attaching deployment to C2
containers/services when possible because C2 is usually the most representative
logical runtime boundary.

deployment files often focus one deployment slice. The rendered scope is
defined by the query, projection selectors, and selected source file.

## Layering Rules

- Model stable concepts first; avoid coding transient implementation details.
- Keep identifiers short, lowercase, and stable.
- Prefer `name` for display names and ids for references.
- Use `description` for why a thing exists.
- Use `technology` for concrete technical choices.
- Use `responsibility` for components.
- Split files by layer or subsystem once a file becomes hard to scan.
- Validate after each layer before adding the next.
