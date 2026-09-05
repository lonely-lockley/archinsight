# Scaling an Archinsight Repository

Use this reference when a project grows beyond one or two files and you need to
reuse definitions, environments, deployment profiles, or systems without
duplicating them.

## Repository Shape

Prefer one shared framework per repository:

- one definitions/framework area for environment types, custom infrastructure
  types, and presentation tweaks;
- source files grouped by context directories when the repository is large;
- model files that usually focus on one primary owned system being detailed;
- one or more inventory files, each with exactly one concrete
  `environment <id>` header and one or more deployments owned by it;
- shared external contexts for external actors and systems reused by many
  systems;
- context-owned deployment profile files that map logical elements to concrete
  deployments;
- wire deployment that names network slots directly, without call profiles.

Do not copy the same environment or infrastructure type definitions into every
system file. Keep concrete inventory in environment files and keep each
application's deployment profiles in its logical context.

Use `extend type Environment` when the repository intentionally has one slot
contract shared by every environment. If several environment families need
different contracts, define constructorless subtypes such as
`ApplicationEnvironment` and `DataEnvironment` instead. Keep either form in
the shared framework area rather than repeating it in inventory files.

## Framework Once, Use Everywhere

A typical deployment framework file contains only shared vocabulary: type
definitions, type extensions, and presentation overrides. Do
not mix `define type` / `extend type` declarations and `context`
declarations in the same source file.

```insight
define type PublicGateway of NetworkConnection
    constructor publicGateway
    required InfrastructureComponent cdn
    required InfrastructureComponent loadBalancer

define type KafkaBroker of Broker
    constructor kafka

extend type Environment
    Compute compute
    Storage storage
    Broker events
    PublicGateway publicGateway
    NetworkConnection network
```

Concrete environment files contain inventory and instance-level projections:

```insight
environment prod_eu
    name = Production EU

deployment production
    compute:
        compute ecs
            name = ECS
            technology = AWS ECS
    events:
        kafka event_bus
            name = Kafka
            technology = MSK
            address = kafka.prod.eu.internal
            projection:
                target $to connectTo target $this
                target $this originalLink source $from
```

```insight
context commerce

deploymentProfile regional_service
    appliesTo:
        production from prod_eu

    runsOn compute
```

System files in the same logical context should import the context-owned profile
when it is declared in a different source identity. Wires name compatible
`NetworkConnection` slots directly. Read the
[Broker](deployment-projections.md#broker) example before adding an event path;
the built-in `Broker` can fill a wire-facing slot directly, and
product-specific broker types should derive from it.

## System Files and External Contexts

The default model file is centered on one owned system:

```text
commerce/
    checkout.ai
    catalog.ai
    fulfillment.ai
external/
    platforms.ai
    regulators.ai
```

`commerce/checkout.ai` would declare `context commerce`, the
`system checkout` focal object, and the containers/services/components needed
to explain checkout. `commerce/catalog.ai` would do the same for catalog.

Shared external actors and systems should not be copied into every system file.
Put them in one external context, or a few semantically grouped external
contexts:

```insight
context external_platforms

external system stripe
    name = Stripe

external system sendgrid
    name = SendGrid
```

Then import them where needed:

```insight
context commerce

import stripe from context external_platforms

system checkout
    links:
        -> stripe
```

Avoid making a separate file for every external actor or vendor unless the
external dependency itself has substantial reusable structure. A small number of
well-named external contexts gives all repository systems one shared vocabulary
for outside dependencies.

When a system file becomes too large, split details by extending the focal
object in utility subdirectories:

```text
commerce/
    checkout.ai
    checkout-components/
        pricing.ai
        payment.ai
        inventory.ai
```

Those files should repeat the same `context commerce` and use `extend service
checkout_api`, `extend container web_app`, or another object extension to
add focused details. The extension target is resolved in the shared context
namespace; ordinary references used inside the extension body still follow the
usual import rules.

## Same-Context Cross-File Imports

Insight resolves unqualified ids in this order: declarations in the same source
file, explicit imports in the same source file, then it reports an error if the
same id exists only in another source file of the same context.

That means splitting one context across files still requires imports:

```insight
context services

deploymentProfile eu_service
    appliesTo:
        production from eu
```

```insight
context services

import eu_service from context services

system checkout
    name = Checkout
    deployment:
        uses eu_service
```

This is intentional. If a file is extracted, removed, or not included in the
project, the linker should fail with an explicit identifier/import diagnostic
instead of silently binding to whatever remains in the context.

## Inline `from` qualifier

An inline qualifier is an anonymous import for one relationship target. Use it
instead of a named import when the target is referenced only once:

```insight
context commerce

system checkout
    name = Checkout
    links:
        -> payments from external_systems
            technology = HTTPS
            call = POST /payments
```

The inline `from <context-id>` states which context owns the linked element
without creating a reusable local binding. The same form works for a
same-context cross-file link:

```insight
context services

system checkout_api
    links:
        -> inventory_api from services
            technology = HTTPS
            call = GET /inventory
```

This explicitness is useful during refactors: if the source file holding
`inventory_api` disappears, validation points at the missing declaration
instead of creating a hidden dependency on file layout.

## Deployment Multi-File Pattern

For Deployment modeling, keep these responsibilities separate:

- framework file: environment schemas, infrastructure constructors, and
  presentation definitions;
- environment inventory files: concrete deployments and instance projections;
- logical context files: deployment profiles with `appliesTo` references and
  the relationships whose network paths should render.

When rendering Deployment with `-s <source.ai>`, remember that source/tab scoping is
part of the view. The selected tab includes the full model fragment rooted in
that source, including relationships contributed to those roots by `extend`
files. Keep imported framework and inventory reusable, and validate the rendered
Deployment output after changing which root a traffic relationship extends:

```shell
archinsight link . --format text
archinsight query . -s deployment.ai -v deployment-system --format json
archinsight query . -s deployment.ai -v deployment-container --environment eu --format json
archinsight render . -s deployment.ai -v deployment-container --environment eu -f svg -o deployment.svg
```

If projected infrastructure edges disappear after a split, first check whether
the logical relationship still belongs to a root declared by the selected tab.
Do not fix that by duplicating infrastructure nodes; fix the source selection,
the extension target, or the file boundary.

## Practical Workflow

1. Run `archinsight structure . --format text`.
2. Identify contexts, source files, and declaration ids before editing.
3. Move shared vocabulary into one framework file.
4. Group model files by context directory when the repository is large.
5. Keep each ordinary system file focused on one owned system being detailed.
6. Put external actors/systems in shared external contexts, not one file per
   external element.
7. Keep concrete deployments in environment files; put deployment profiles in
   the logical context that owns the deployed elements.
8. Acknowledge every cross-file dependency, including same-context
   dependencies, with either a named import or an inline `from` qualifier.
9. Prefer a named import for repeated references and an inline qualifier for a
   one-off relationship or list value.
10. Validate with `archinsight link . --format text`.
11. Render important C1, C2, C3, C4, and Deployment views with explicit `-c`, `-s`, and `-v`
   options.
