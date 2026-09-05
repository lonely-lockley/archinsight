# Deployment

Use Deployment modeling to project the logical architecture onto physical infrastructure: where
logical elements run, which infrastructure they use, and how their wires pass
through the physical world. Keep C1-C4 logical; deployment inventory and
projections supply the physical view.

The built-in Deployment views include a placed logical element when its deployment
resolves at least one `runsOn` or `uses` infrastructure object. An unplaced
system or actor can remain visible as an endpoint of a projected wire; wire
infrastructure supplies the relevant environments when the selected source has
no placements of its own. A logical wire appears only through physical edges
created by its deployment projection. A plain logical wire is intentionally
omitted from Deployment.

Use `deployment-system` (D1) for a system-level overview across the environments
relevant to the selected source. It folds deployed containers and services into
their owning systems, contracts internal infrastructure paths, and retains the
external integrations reached in each environment. Use `deployment-container`
(D2) to inspect containers, services, and physical infrastructure in one
environment. Pass `--environment <id>` when several environments are relevant;
the CLI selects the environment automatically when there is only one. The older
`deployment` view keeps the complete all-environment container graph for
backward compatibility.

Obtain the available D2 choices from the linked model:

```shell
archinsight environments . -s <logical-source.ai> --format json
```

Read the ids from `environments` and pass the selected id to
`deployment-container --environment <id>`. Run the command without
`--source` only when the task needs the complete environment inventory rather
than the choices relevant to one logical source.

Model the infrastructure immediately relevant to those logical elements and
connections. Do not expand a Deployment view into a complete provider, transit, replication,
or network topology. Keep replication modes and deeper operational detail in
`description`, `technology`, `via`, notes, or project-specific attributes
unless an intermediate component is itself important to the architecture.

When a project models deployment explicitly, databases, storage, brokers,
gateways, network connections, compute, and observability belong in the Deployment view. Leave
them at C2 only when the project deliberately chooses a compact mixed model and
does not plan to describe deployment in detail.

## Model

There are four distinct concepts:

1. One environment source starts with exactly one `environment <id>` and may
   own one or more named `Deployment` objects, such as `test` and
   `production`.
2. A concrete `Deployment` fills infrastructure slots defined by the
   environment type.
3. A context-owned `DeploymentProfile` maps logical elements to concrete
   deployments with `appliesTo` and supplies reusable `runsOn` / `uses`
   actions.
4. A logical wire uses only a `NetworkConnection` slot. The linker resolves
   that slot in deployments selected by the wire endpoints and applies the
   concrete network instance's projection.

Do not put application deployment profiles in environment inventory files.
Environment files own concrete infrastructure. The application context owns
the profiles that decide where its systems, containers, and services run.

Deployments are written as top-level siblings after the environment header, not
indented inside it, but they remain owned by that environment. A second
environment requires a second source file. One environment can contain several
deployment schemes, and profiles may select `production from eu` and
`test from eu` without a conflict because they are different concrete
deployments.

The built-in Deployment view renders concrete `InfrastructureComponent`
instances. Their core presentation gives the nodes dashed borders, inherited
by project-defined infrastructure types unless they override `graphviz.style`.
A `Deployment` object organizes the inventory and is not itself a physical
node, so projected relationships do not roll up to that owner.

When one logical element resolves to several concrete compute placements,
Deployment query output creates one visible occurrence per selected placement.
Occurrence ids use `<logical-id>@@<compute-id>`, and their `projectedFrom`
attribute retains the logical id. Projected edges connect the matching source
and target occurrences. A graph whose logical elements all have one placement
keeps their ordinary ids.

## Framework and inventory

Define the available slots on an environment type:

```insight
define type ApplicationEnvironment of Environment
    Compute compute
    Storage storage
    Monitoring observability
    PublicGateway publicGateway
    NetworkConnection network
    Egress egress

define type PublicGateway of NetworkConnection
    constructor publicGateway
    required InfrastructureComponent loadBalancer

define type Egress of NetworkConnection
    constructor egress

define type Monitoring of InfrastructureComponent
    constructor monitoring
```

A project with one shared environment contract may instead use
`extend type Environment` with the same slots. That extension changes the base
type for every environment. A named subtype such as `ApplicationEnvironment`
keeps the contract isolated and is preferable when the project has several
environment families. Environment declarations infer a constructorless subtype
from the slots used by their deployments; the match must be unambiguous.

Fill those slots inside concrete deployments:

```insight
environment eu
    name = Europe

deployment production
    compute:
        compute kubernetes
            name = Kubernetes

    storage:
        storage postgres
            name = PostgreSQL

    publicGateway:
        publicGateway public_edge
            name = Public ingress
            loadBalancer:
                infrastructureComponent load_balancer
                    name = Load balancer

    network:
        networkConnection service_network
            name = Service network
```

An explicit object id may differ from the slot name: `public_edge` still fills
the `publicGateway` slot of `eu/production`. Add concrete physical paths
only after reading `references/deployment-projections.md`.

## Concrete infrastructure placement

The `runsOn:` attribute on an infrastructure component is a typed reference to
one concrete, named infrastructure instance:

```insight
compute kubernetes
    name = Kubernetes

infrastructureComponent ingress
    name = Ingress
    runsOn:
        kubernetes
```

The target `kubernetes` is an object id. It must be visible in the source and
cannot be the anonymous id `_`. Anonymous objects are suitable only when no
other declaration needs to address them.

This reference form is different from `runsOn compute` inside a deployment
profile. The profile form names an environment slot and resolves its concrete
instance separately in every deployment selected by `appliesTo`.

## Context-owned deployment profiles

Declare profiles in the logical context and reference concrete deployments with
the standard anonymous-import syntax:

```insight
context shop

deploymentProfile production_service
    appliesTo:
        production from eu
        production from us

    runsOn compute
    uses observability

deploymentProfile test_service
    appliesTo:
        test from eu

    runsOn compute
```

`appliesTo` is required and contains `Deployment` references, not environment
references. The full identity is the pair of environment context and deployment
id. Therefore `production from eu` and `test from eu` are different targets.
Repeating the same resolved deployment in one profile produces a
`DEPLOYMENT_PROFILE_MEMBER_DUPLICATE` warning on the repeated entry, including
when an alias and an inline reference resolve to the same target.

Apply profiles only to logical elements:

```insight
service checkout
    name = Checkout
    deployment:
        uses production_service
```

Several profiles may be applied to one element only when their concrete
deployment sets are disjoint. Applying two profiles that both contain
`production from eu` is an error. Profiles may share the same environment when
they select different deployments, such as `test` and `production`.

Profile slot actions resolve independently in every concrete deployment from
`appliesTo`. A missing `runsOn compute` or element-level `uses storage` slot
is an error because the selected deployment cannot realize the profile.

## Wire deployment

A wire deployment accepts `uses` of `NetworkConnection` descendants only:

```insight
external actor customer
    links:
        -> frontend
            deployment:
                uses publicGateway

service frontend
    deployment:
        uses production_service
    links:
        -> checkout
            deployment:
                uses network
```

Do not attach `DeploymentProfile`, `runsOn`, `Storage`, `Compute`, or another
non-network infrastructure type to a wire. Ingress, egress, service-mesh, and
VPN path types used by wires must inherit `NetworkConnection`. The built-in
`Broker` already does; derive product-specific broker types from `Broker` and
place their projection on the concrete instance. Read
`references/deployment-projections.md` before defining the physical path.

For each relevant concrete deployment, the linker checks the requested slot:

- when the deployment provides a compatible network instance, its projection
  is applied to the logical relationship;
- when that deployment does not fill the slot, it is skipped;
- when the slot resolves to a non-network type or several ambiguous values,
  linking fails.

This makes public exposure deployment-specific. A logical user-to-service link
can project through `publicGateway` in production and have no physical ingress
path in test without creating a fake wire profile.

Components inherit effective deployments from their nearest deployed logical
ancestor, normally a container or service. Put profiles on independently
deployable C2 elements unless a C3 component truly has distinct placement.

Deployment completeness checks become active only after the project starts
using the corresponding feature. Once a deployment-relevant wire has a `deployment`
block, the linker warns about other wires between different deployment endpoints with
no deployment and about configured wires that produce no physical projection.
A component relationship inside one container collapses to a self-relationship
in the Deployment view and does not require a physical projection. Element checks activate
separately by logical modeling family, so starting container placement does not
demand artificial placement for every system, component, or external actor.

## Projection overview

A projection on a concrete infrastructure instance turns an element placement
or logical wire into directed physical edges. Element projections receive one
logical endpoint; wire projections receive both. The selected deployment,
endpoint placement, `originalLink`, `connectTo`, copy-on-write overrides,
and shared physical segments all affect the observable result.

Read `references/deployment-projections.md` before writing or repairing a
projection. It contains the execution contract and complete gateway, storage,
broker, egress, and monitoring projects with expected query JSON.

## Diagram scope and scale

Each concrete deployment is an independent physical scope. Profiles from many
systems may refer to the same deployment, producing one shared deployment view.
If several regions are physically identical and separate diagrams add no value,
model one intentional global environment/deployment and record its region list
as project-specific metadata. Large deployment graphs should be narrowed by
query, context, source identity, domain, or team instead of corrupting the model
to make a picture smaller.

## Validation

Run:

```shell
archinsight link . --format text
archinsight query . -s <logical-source.ai> -v deployment-system --format json
archinsight query . -s <logical-source.ai> -v deployment-container --environment <environment> --format json
archinsight render . -s <logical-source.ai> -v deployment-container --environment <environment> -f svg -o deployment.svg
```

A clean link proves that syntax, types, imports, and deployment references are
valid. It does not prove that a view selected the intended semantic graph.
Inspect query JSON before relying on SVG: query output is the authoritative list
of elements and edges selected for rendering.

Treat missing slots, overlapping profile deployments, non-network wire uses,
and ambiguous references as model errors. Treat `WIRE_MISSING_DEPLOYMENT`,
`WIRE_DEPLOYMENT_NOT_PROJECTED`, `ELEMENT_MISSING_DEPLOYMENT`, and
`ELEMENT_DEPLOYMENT_NOT_PHYSICAL` as incomplete deployment coverage. If a physical
arrow is absent, check the endpoint profiles, their `appliesTo` deployments,
the requested network slot, and the concrete instance projection in that order.
