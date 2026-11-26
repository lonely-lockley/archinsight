# Deployment

Deployment models map logical systems and containers to physical infrastructure and describe how logical relationships travel between their concrete deployments.

The model has four parts:

- environments own deployments, infrastructure, and routes;
- deployment profiles place systems and containers into deployments;
- routes project logical relationships onto physical paths;
- component routes describe direct use of storage, observability, brokers, and other supporting components.

Components and code inherit the deployment of their containing container. Model an independently deployed responsibility as a separate container or service.

## Environments and deployments

An `environment` is a physical namespace such as a region, account, cluster estate, or data center. Keep each environment in its own source file.

```insight
environment eu
    name = Europe
    region = eu-central-1

deployment production
    name = Production
```

Projects normally define the infrastructure slots available in their environments:

```insight
define type CommerceEnvironment of Environment
    Compute compute
    Storage database
    Broker events
    NetworkConnection publicGateway
```

Each deployment fills those slots with concrete infrastructure:

```insight
environment eu
    name = Europe

deployment production
    compute:
        compute kubernetes
            name = Production Kubernetes

    database:
        storage postgres
            name = PostgreSQL

    events:
        broker kafka
            name = Kafka

    publicGateway:
        networkConnection public_gateway
            name = Public gateway
```

The same environment may contain several schemes, such as `production` and `test`. A deployment reference therefore includes both parts:

```insight
production from eu
```

## Infrastructure nesting and placement

Nest infrastructure to express physical ownership:

```insight
compute kubernetes
    name = Kubernetes

    infrastructureComponent ingress
        name = Traefik ingress
```

Use `runsOn:` between concrete infrastructure components:

```insight
compute kubernetes
    name = Kubernetes
    runsOn:
        cloud_provider
```

An anonymous `_` component cannot be referenced. Give infrastructure a stable id when another declaration must address it.

## Deployment profiles

A deployment profile places logical systems and containers into one or more deployments:

```insight
context commerce

deploymentProfile regional_service
    appliesTo:
        production from eu
        production from us

    runsOn compute
    uses database
    uses events
```

`runsOn` selects the hosting slot. `uses` selects supporting infrastructure. Every deployment in `appliesTo` must provide compatible values for the referenced slots.

Apply a profile to a system, container, or service:

```insight
service backend
    name = Backend API
    deployment:
        uses regional_service
```

Several profiles may be applied to one element when their deployment sets do not overlap. Selecting the same concrete deployment through two profiles is an error.

## Routes for logical relationships

A logical relationship chooses a named route:

```insight
service frontend
    links:
        -> backend
            technology = HTTPS, REST
            description = Calls the backend API
            deployment:
                route clusterLocal
```

Routes are declared in environments. The same route name may have a different implementation in every environment:

```insight
route clusterLocal
    outbound:
        $from originalLink $to
```

`$from` and `$to` are the logical relationship endpoints. `originalLink` preserves the logical operator and its attributes, including `technology`, `description`, `call`, and `via`. `connectTo` creates an ordinary physical segment.

Use `in <environment>` on a wire to select where it takes a route. For example, a service deployed in several environments can use a partner gateway in two of them and the public gateway everywhere else.

```insight
deployment:
    route partnerGateway in eu
    route partnerGateway in latam
    route publicGateway
```

An explicit selection takes precedence over the default regardless of line order. Omit the default to project the wire only in the listed environments. For a LATAM-only call, a single `route partnerGateway in latam` is sufficient. Each selected environment must implement its chosen route.

The available environments come from the effective deployments of the element declaring the wire. For an actor without its own deployment, they come from the target. This rule also applies when the physical request runs in reverse, as with a Prometheus scrape. Inside the route body, `in` on a path endpoint still specifies where that endpoint lives.

A route has these sections:

- `outbound` describes the path leaving the current deployment;
- `transit` describes optional intermediate hops;
- `inbound` describes the path entering the destination deployment.

At least one of `outbound` or `inbound` is required. `transit` is optional. Sections are connected in their written order.

### Gateway route

```insight
route publicInbound
    inbound:
        $from originalLink cdn
        cdn connectTo loadBalancer
            technology = HTTPS
        loadBalancer connectTo ingress
            technology = HTTP
        ingress connectTo $to
```

Infrastructure names in a route resolve against the deployment inventory of the environment that owns the route. Nested components such as `cdn`, `loadBalancer`, and `ingress` may be used directly.

### Cross-environment route

Use `in` to move the route cursor to another environment:

```insight
environment us
    name = United States

route macroRegion
    outbound:
        $from originalLink $to

    transit:
        $from connectTo tgw in eu_central_1
        tgw connectTo $to

    inbound:
        $from connectTo tgw in latam
        tgw connectTo privateGateway
        privateGateway originalLink $to
```

The short form selects the matching deployment id in another environment:

```insight
tgw connectTo privateGateway in latam
```

Use the long form when the destination deployment has a different id or must be explicit:

```insight
tgw connectTo privateGateway in production from latam
```

Once a rule changes the cursor, following unqualified infrastructure terms in that section use the selected deployment. Repeating `in` is allowed. A qualifier must appear before an infrastructure reference whose placement depends on it.

The final `$to` must be deployed in the selected destination. Archinsight reports an error instead of guessing another placement or producing a Cartesian set of relationships.

### Broadcast route

Broadcast is explicit: write one physical branch for every intended destination.

```insight
route broadcast
    outbound:
        $from originalLink $to in latam
        $from originalLink $to in eu_central_1
        $from originalLink $to in mena
```

Archinsight does not infer local-first, nearest-region, macro-region, or global-routing behavior. Route names such as `clusterLocal`, `macroRegion`, and `global` are project vocabulary; their meaning comes entirely from their environment implementations.

### Asynchronous route

`$from` always means the input of the current section, even when it appears on the right. This allows a consumer-owned asynchronous relationship to describe producer-to-broker-to-consumer flow:

```insight
route events
    inbound:
        $to connectTo broker
        broker originalLink $from
```

Several `originalLink` rules are allowed when the logical relationship must remain visible on more than one physical segment. Each occurrence keeps the same logical provenance and attributes.

## Routes on infrastructure components

An infrastructure component can declare its own `route:`. When a deployed element uses that component, the route describes how they connect. For example, a storage component can describe the connection from each consumer to the database.

```insight
storage postgres
    name = PostgreSQL
    route:
        $from originalLink $this
```

`$from` is the logical element using the infrastructure. `$this` is the selected infrastructure component. `$to` is not available in an infrastructure projection.

For a local connection, put the arrows directly under `route:`. Use sections when the path crosses deployments or needs several phases. For a directly used component from 3.1.x, rename `projection:` to `route:` and translate its `source` and `target` prefixes to the intended placements. An earlier 3.2 preview with unprefixed component rules needs only the field rename.

```insight
storage reporting_database
    name = Reporting database
    route:
        outbound:
            $from connectTo privateGateway
            privateGateway connectTo $this
        transit:
            $from connectTo tgw in eu_central_1
            tgw connectTo $this
        inbound:
            $from originalLink $this in production from eu_central_1
```

Routes are the only way to deploy a logical relationship. Infrastructure slots are still selected with `uses` on deployment profiles and logical elements; they are not selected with `uses` inside a wire deployment block.

## Deployment views

The editor provides two deployment detail levels:

- D1 (`deployment-system`) folds containers and internal infrastructure into deployed systems across all relevant environments;
- D2 (`deployment-container`) shows containers, services, and infrastructure in one selected environment.

The CLI exposes the same views:

```shell
archinsight query . -s storefront.ai -v deployment-system --format json
archinsight environments . -s storefront.ai --format json
archinsight query . -s storefront.ai -v deployment-container --environment eu --format json
```

The older `deployment` view remains available for a complete container-level graph across relevant environments.

A route is resolved once for every applicable source deployment. D2 shows the selected environment and keeps remote endpoints required by cross-environment paths as external participants. D1 contracts the physical path while preserving the logical relationship and its metadata.

## Diagnostics

Common route errors explain the unresolved assumption directly:

- the named route is not declared in an applicable environment;
- neither endpoint provides an effective deployment;
- an endpoint is not placed in the required deployment;
- `$to` has no deployment matching an `in` qualifier;
- a destination has several ambiguous matching deployments;
- a section does not connect to its required boundary;
- an infrastructure term is referenced before its environment can be determined;
- a relationship deployment uses an action other than `route <name>`.

Warnings about missing relationship deployment begin only after a project uses relationship deployment modeling. Logical relationships without a route remain valid in logical views but are absent from deployment views.

## Deployment entities

| Entity | Constructor | Purpose |
| --- | --- | --- |
| `Environment` | `environment` | Physical namespace and inventory. |
| `Deployment` | `deployment` | Concrete scheme inside an environment. |
| `InfrastructureComponent` | `infrastructureComponent` | General physical or managed resource. |
| `Compute` | `compute` | Runtime host or execution platform. |
| `Storage` | `storage` | Database, bucket, volume, or other stateful resource. |
| `Broker` | `broker` | Message broker or event infrastructure. |
| `NetworkConnection` | `networkConnection` | Network infrastructure used by routes. |
| `Route` | `route` | Environment-owned implementation of a logical relationship path. |
| `DeploymentProfile` | `deploymentProfile` | Reusable logical placement and infrastructure selection. |
| `Projection` | `projection` | Value type of the infrastructure component’s `route:` attribute. |

## Validation

Run the project link before trusting a deployment view:

```shell
archinsight link .
```

Then inspect D1, every relevant D2 environment, and any important cross-environment path. A clean logical model does not by itself prove that every route chooses the intended destination or that its physical labels are sufficient for readers.
