# C4: Deployment

A deployment model projects the logical architecture onto physical infrastructure. Systems, containers, components, and wires retain their logical meaning, while the deployment layer shows where the selected elements run, which infrastructure they use, and how their relationships pass through the physical world.

The goal is a readable physical explanation of the logical model. A deployment diagram focuses on a deployable element and the infrastructure immediately relevant to it. Transit networks, replication meshes, provider internals, and every possible deployment variation would quickly turn the model into a complete infrastructure topology. Details of that depth are usually better recorded in `description`, `technology`, `via`, notes, or project-specific attributes on the relevant element or relationship.

The C4 deployment level is the home of infrastructure. Compute platforms, databases, object storage, message brokers, gateways, load balancers, ingress controllers, network connections, and observability services belong here when the project models deployment explicitly. Logical C2 elements refer to these resources without turning a database or broker into an application container.

The default deployment view starts from the model fragment associated with the selected tab. It follows the deployment profiles, placements, infrastructure uses, and projected wires reachable from that logical fragment. The result stays centered on the system or service being examined while drawing the relevant objects from their environment namespaces.

A logical element enters the default view only after its deployment resolves to physical infrastructure through `runsOn` or `uses`. A logical wire enters only through the physical relationships produced by its deployment projection. A wire without deployment information is therefore absent from C4 even when both logical endpoints are deployed. Direct relationships declared between deployment elements remain visible because they already describe the physical model.

## Environment and deployment boundaries

An `environment` is the root of a physical infrastructure inventory. It commonly represents a region, account, cluster estate, data center, or another operational boundary:

```insight
environment eu
    name = Europe
    region = eu-central
```

The environment identifier establishes its namespace. Logical model files can refer to its deployments and infrastructure without moving those objects into a logical context.

One environment can contain several deployment schemes. Each `deployment` fills the infrastructure slots available in that environment for a particular variant such as production, test, disaster recovery, or an isolated tenant:

```insight
environment eu
    name = Europe
    region = eu-central

deployment production
    name = Production

deployment test
    name = Test
```

The two deployments share the `eu` environment boundary and keep separate infrastructure instances. A logical element can be mapped to either deployment through a profile, and different profiles can select different schemes from the same environment.

Projects usually define an environment subtype with the slots required by their deployment model:

```insight
define type CommerceEnvironment of Environment
    Compute compute
    Storage database
    Broker events
    NetworkConnection publicGateway
```

Every deployment of that environment can then provide concrete values for those slots:

```insight
environment eu
    name = Europe

deployment production
    compute:
        compute production_compute
            name = Production Kubernetes

    database:
        storage production_database
            name = Production PostgreSQL

    events:
        broker production_events
            name = Production Kafka

    publicGateway:
        networkConnection production_public_gateway
            name = Production public gateway
            projection:
                source $from originalLink target $to

deployment test
    compute:
        compute test_compute
            name = Test Kubernetes

    database:
        storage test_database
            name = Test PostgreSQL

    events:
        broker test_events
            name = Test Kafka

    publicGateway:
        networkConnection test_public_gateway
            name = Test public gateway
            projection:
                source $from originalLink target $to
```

The slot names form a stable contract. A deployment profile can ask for `compute` or `database`, and each selected deployment supplies the appropriate concrete instance.

## Infrastructure nesting

Infrastructure is nested to express ownership and composition. A compute platform can contain a cluster, a gateway can contain its load balancer and ingress, and a managed service can contain the concrete resources that form it:

```insight
compute kubernetes
    name = Kubernetes

    infrastructureComponent ingress
        name = Traefik ingress

    infrastructureComponent worker_pool
        name = Application worker pool
```

The indentation makes `ingress` and `worker_pool` parts of `kubernetes`. This structural ownership determines how the physical inventory is organized and gives deployment diagrams natural boundaries.

Nesting is the first choice when one infrastructure component is genuinely part of another. It creates a clear hierarchy that can be read without interpreting additional relationships.

## `runsOn`

`runsOn` records runtime placement. It connects an element to the infrastructure component that hosts or executes it:

```insight
compute kubernetes
    name = Kubernetes
    runsOn:
        cloud_provider
```

Within an environment inventory, this can express placement across structural boundaries: a Kubernetes cluster runs on a cloud provider, while an ingress controller runs on the cluster. The target remains a normal infrastructure object in the same physical model.

Deployment profiles use the operator form to refer to an environment slot:

```insight
deploymentProfile application_service
    appliesTo:
        production from eu

    runsOn compute
```

Here, `compute` names a slot rather than one hard-coded infrastructure instance. Applying the profile to `production from eu` resolves it to the concrete compute value supplied by that deployment.

## `uses`

`uses` records infrastructure required by a deployed element in addition to its host. A service may run on compute while using storage, a broker, or observability:

```insight
deploymentProfile stateful_service
    appliesTo:
        production from eu

    runsOn compute
    uses database
    uses events
```

`runsOn` answers where the workload executes. `uses` identifies supporting infrastructure with which it interacts. The distinction lets a diagram place the workload under its host while drawing its other physical dependencies separately.

On a wire, `uses` selects a `NetworkConnection`. This describes infrastructure used by the relationship itself, such as a public gateway, private route, ingress path, or egress path. The logical element containing the wire remains its owner and source, so deployment expansion preserves the original arrow direction.

## Optional infrastructure projections

An infrastructure component may define a `projection` when selecting that component should expand a logical wire into a more explicit physical path. Projections are optional. A resource without one still appears as infrastructure used by the deployed element or relationship.

A simple storage projection connects the logical source directly to the selected storage instance:

```insight
storage database
    name = PostgreSQL
    projection:
        source $from originalLink target $this
```

`$from` is the source endpoint of the logical wire, and `$this` is the infrastructure component whose projection is being applied. `originalLink` carries the original logical operator and its attributes into the projected segment. A synchronous database dependency therefore keeps its technology, call, description, and direction when it reaches `database`.

A gateway can expose the intermediate components that matter to the architecture:

```insight
networkConnection public_gateway
    name = Public ingress path

    infrastructureComponent cdn
        name = CDN

    infrastructureComponent load_balancer
        name = Load balancer

    infrastructureComponent ingress
        name = Ingress controller

    projection:
        source $from originalLink target cdn
        target cdn connectTo target load_balancer
        target load_balancer connectTo target ingress
        target ingress connectTo target $to
```

`$to` is the target endpoint of the logical wire. The projection turns one logical relationship into the visible path:

```text
$from → CDN → load balancer → ingress → $to
```

The first segment uses `originalLink`, preserving the logical wire and its attributes. The following `connectTo` segments describe direct physical connections between infrastructure components. These intermediate objects exist only at C4; C1, C2, and C3 remain focused on the logical endpoints.

The `source` and `target` words before projection terms assign each endpoint of the generated segment to the corresponding side of the deployment relationship. References such as `cdn`, `load_balancer`, and `ingress` identify infrastructure held by the projection owner. This allows an ingress path to stay with the target deployment and an egress path to stay with the source deployment.

Projections should stop at the level needed to explain the architecture. Provider transit hops, broker replication, database replication, and similar operational detail can remain in the relationship description unless the team deliberately treats an intermediate resource as an architectural element.

## Deployment profiles

A `DeploymentProfile` describes how particular logical elements are deployed into concrete deployments. It selects its deployment variants through the required `appliesTo` list and records the infrastructure slots shared by elements using the profile:

```insight
context commerce

import eu from environment eu

deploymentProfile production_service
    appliesTo:
        production from eu

    runsOn compute
    uses events
```

The profile belongs to the logical context because it describes a deployment variant of that context's systems, containers, or components. The concrete infrastructure remains owned by the environment.

One profile may apply to several concrete deployments when they share the required slot contract:

```insight
deploymentProfile regional_service
    appliesTo:
        production from eu
        production from us

    runsOn compute
    uses events
```

Every selected deployment must provide compatible values for `compute` and `events`. A missing slot or a value of the wrong type produces an error at the profile action that cannot be resolved.

Several profiles can be applied to one logical element when their `appliesTo` sets are disjoint. Two profiles that select the same concrete deployment contradict one another for that element, and Archinsight reports an error. Different deployment schemes inside the same environment remain valid when they refer to different deployment IDs, such as `production from eu` and `test from eu`.

`appliesTo` accepts `Deployment` values. Pointing it at an `Environment` directly is a type error because the environment may contain several deployment schemes.

## Placing containers and services

A logical element selects a profile inside its `deployment` block:

```insight
service backend
    name = Backend API
    deployment:
        uses production_service
```

The profile contributes its concrete deployment set, `runsOn` placement, and `uses` infrastructure to `backend`. The deployment view can then group the service under its compute resource and include the storage, broker, observability, or other infrastructure it uses.

The same form is available to every `Element`, including systems and components. Containers and services are the usual placement boundary because they normally represent deployable runtime units. A component can select its own profile when it has deployment behavior that genuinely differs from its parent container.

The linker begins checking deployment coverage for a modeling level after at least one comparable element at that level has a `deployment` block. It then warns when another element at that level has no deployment, or when a deployment block resolves to no `runsOn` or `uses` infrastructure. This keeps projects that have not started deployment modeling quiet while exposing gaps once a physical model is being maintained. External actors and systems can enter the view through projected wires and do not need artificial placement merely to appear as an endpoint.

## Placing wires onto physical paths

A logical wire selects network infrastructure in its own `deployment` block:

```insight
external actor customer
    name = Customer
    links:
        -> frontend
            technology = HTTPS
            description = Opens the storefront
            deployment:
                uses publicGateway
```

The actor owns this wire, so the logical arrow begins at `customer` and points to `frontend`. `publicGateway` is resolved for the deployments of the wire endpoints. If that network connection has a projection, the deployment diagram expands the logical relationship through its declared CDN, load balancer, ingress, or other direct infrastructure components.

A wire deployment accepts `NetworkConnection` infrastructure through `uses`. It does not select a `DeploymentProfile` and does not use `runsOn`: profiles place elements, while a wire describes the physical route between their deployed endpoints.

Element placement and wire placement work together. The element profiles identify the concrete deployments and runtime infrastructure. The wire then selects the connection available in those deployments, and its projection explains the visible physical path while preserving the wire's source, target, and logical attributes.

Wire coverage is checked only after the project contains at least one C4-relevant wire with a `deployment` block. From that point, a logical wire between different C4 endpoints produces `WIRE_MISSING_DEPLOYMENT` when it has no deployment, while a configured wire that produces no physical projection produces `WIRE_DEPLOYMENT_NOT_PROJECTED`. A component relationship whose endpoints belong to the same container does not require a physical projection because it collapses to a self-relationship at C4. Both diagnostics are warnings: the linked logical graph remains valid, while the incomplete wire stays out of the default deployment view.

## Deployment entities

| Entity | Constructor | Purpose |
| --- | --- | --- |
| `DeploymentElement` | — | Abstract family for objects that can live directly in an environment or deployment boundary. |
| `Environment` | `environment` | Root namespace and inventory for physical infrastructure. |
| `Deployment` | `deployment` | One concrete deployment scheme inside an environment. |
| `InfrastructureComponent` | `infrastructureComponent` | General physical, managed, or platform resource. |
| `Compute` | `compute` | Runtime host, cluster, compute platform, or execution environment. |
| `Storage` | `storage` | Database, bucket, volume, or other stateful infrastructure. |
| `Broker` | `broker` | Message broker or event infrastructure. |
| `NetworkConnection` | `networkConnection` | Network capability that can carry and project a logical wire. |
| `DeploymentProfile` | `deploymentProfile` | Reusable placement and infrastructure selection for concrete deployments. |
| `ProjectionTerm` | — | Supporting value used to describe endpoints inside an infrastructure projection. |

### `Environment` attributes

| Name | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | `Text` | Yes | Human-readable environment name. |
| `region` | `Text` | No | Region, location, or other physical scope label. |
| `_` | `List of DeploymentElement` | No | Anonymous list of deployments and environment-level infrastructure. |

### `Deployment` attributes

| Name | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | `Text` | No | Human-readable name of the deployment scheme. |
| `_` | `List of DeploymentElement` | No | Anonymous list of infrastructure owned by the deployment. |

Project-specific environment subtypes add the named infrastructure slots filled by each deployment.

### `InfrastructureComponent` attributes

| Name | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | `Text` | No | Human-readable infrastructure name. |
| `technology` | `Text` | No | Provider, product, protocol, or implementation technology. |
| `description` | `Text` | No | Architectural purpose and relevant operational detail. |
| `runsOn` | `InfrastructureComponent` | No | Infrastructure that hosts this component. |
| `projection` | `List of PhysicalWire` | No | Optional physical path produced when the component is selected by deployment. |
| `_` | `List of InfrastructureComponent` | No | Nested infrastructure owned by this component. |

### Specialized infrastructure attributes

| Type | Name | Attribute type | Required | Meaning |
| --- | --- | --- | --- | --- |
| `Compute` | `address` | `Text` | No | Address or location of the compute platform. |
| `Compute` | `components` | `List of InfrastructureComponent` | No | Named collection of infrastructure associated with the compute platform. |
| `Broker` | `address` | `Text` | No | Broker address or connection location. |

`Storage` and `NetworkConnection` add no data attributes to the base infrastructure schema. Their types provide distinct modeling roles and presentations. A `NetworkConnection` is hidden by the default presentation until its projection contributes visible infrastructure or relationships.

### `DeploymentProfile` attributes

| Name | Type | Required | Meaning |
| --- | --- | --- | --- |
| `appliesTo` | `List of Deployment` | Yes | Concrete deployment schemes selected by the profile. |

The `runsOn` and `uses` lines in a profile are typed operator invocations. They resolve infrastructure slots from every deployment listed in `appliesTo` and contribute the resulting placement and dependencies to elements using the profile.

### Deployment attributes on logical elements and wires

| Owner | Name | Type | Required | Meaning |
| --- | --- | --- | --- | --- |
| `Element` | `deployment` | `List of Edge` | No | Deployment actions, including selection of a profile through `uses`. |
| `Element` | `runsOn` | `InfrastructureComponent` | No | Resolved runtime placement. |
| `Element` | `uses` | `List of InfrastructureComponent` | No | Resolved supporting infrastructure. |
| `Wire` | `deployment` | `List of Edge` | No | Deployment actions attached to the logical relationship. |
| `Wire` | `uses` | `List of NetworkConnection` | No | Network connections carrying the wire through deployment infrastructure. |
