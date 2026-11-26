# Deployment

Use Deployment modeling to place logical systems and containers on physical infrastructure and to project their relationships through explicit environment-owned routes.

## Working model

Keep these responsibilities separate:

1. An environment file owns one `environment`, its concrete `deployment` inventories, and its `route` implementations.
2. A logical context owns `deploymentProfile` declarations.
3. Systems, containers, and services select profiles with `deployment: uses <profile>`.
4. A logical relationship selects exactly one route name with `deployment: route <route>`.
5. Infrastructure selected by a profile or logical element may define a `projection` using `$from` and `$this`.

Do not use an infrastructure slot directly in a wire deployment. `uses network`, `uses gateway`, and `uses broker` on a wire belong to the removed deployment model. Migrate them to a named route.

## Inventory and profiles

```insight
define type ApplicationEnvironment of Environment
    Compute compute
    Storage database
    Broker events
    NetworkConnection publicGateway
```

```insight
environment eu
    name = Europe

deployment production
    compute:
        compute kubernetes
            name = Kubernetes
    database:
        storage postgres
            name = PostgreSQL
    events:
        broker kafka
            name = Kafka
```

Deployments are top-level siblings after the environment header. A second environment requires a second source file.

```insight
context shop

deploymentProfile regional
    appliesTo:
        production from eu
        production from us
    runsOn compute
    uses database
    uses events

system commerce
    service api
        name = API
        deployment:
            uses regional
```

`appliesTo` contains concrete `Deployment` references, not environments. Every selected deployment must supply compatible values for every referenced slot. Profiles may overlap in environment but not in the same concrete deployment when applied to one element.

Components and code inherit the deployment of their containing service or container. Do not add core deployment actions to them.

## Relationship routes

At the logical relationship:

```insight
links:
    -> backend
        technology = HTTPS, REST
        description = Calls the backend API
        deployment:
            route clusterLocal
```

In every applicable source environment:

```insight
route clusterLocal
    outbound:
        $from originalLink $to
```

Route names are project vocabulary. There is no built-in meaning for local, regional, macro-regional, or global routing. The same name can have a different implementation in each environment.

A route has `outbound`, optional `transit`, and `inbound` sections. At least one of `outbound` or `inbound` is required. Sections connect in written order.

Use `originalLink` wherever the physical edge must retain the logical operator and its attributes. Use `connectTo` for a new physical edge. Multiple `originalLink` rules are intentional and preserve the same logical provenance.

Use short placement when the deployment id stays the same:

```insight
tgw connectTo gateway in latam
```

Use the long form when it must be explicit:

```insight
tgw connectTo gateway in production from latam
```

The first `in` moves the section cursor. Following unqualified infrastructure terms use that deployment until another `in` changes it. A placement qualifier must appear before an infrastructure term that depends on it.

Example with three phases:

```insight
route macroRegion
    outbound:
        $from originalLink edgeGateway
        edgeGateway connectTo $to

    transit:
        $from connectTo tgw in eu_central_1
        tgw connectTo $to

    inbound:
        $from connectTo tgw in latam
        tgw connectTo privateGateway
        privateGateway originalLink $to
```

Broadcast must be explicit:

```insight
route broadcast
    outbound:
        $from originalLink $to in latam
        $from originalLink $to in eu_central_1
        $from originalLink $to in mena
```

Never infer local-first, nearest-region, fallback, or a Cartesian mapping. If `$to` has no matching deployment, correct the route or the target placement; do not hide the error.

For a consumer-owned asynchronous relationship, `$from` still means the input of the section when used on the right:

```insight
route events
    inbound:
        $to connectTo broker
        broker originalLink $from
```

## Infrastructure projections

Infrastructure projections use `$from` for the logical consumer and `$this` for the selected infrastructure component. `$to` is invalid.

```insight
storage postgres
    projection:
        $from originalLink $this
```

The flat form is a local shorthand. The full section and placement syntax is also available:

```insight
storage reporting
    projection:
        outbound:
            $from connectTo privateGateway
            privateGateway connectTo $this
        transit:
            $from connectTo tgw in eu_central_1
            tgw connectTo $this
        inbound:
            $from originalLink $this in production from eu_central_1
```

Read `references/deployment-projections.md` for complete route and projection patterns.

## Views and validation

Use D1 for the system overview and D2 for one environment:

```shell
archinsight link . --format text
archinsight environments . -s <logical-source.ai> --format json
archinsight query . -s <logical-source.ai> -v deployment-system --format json
archinsight query . -s <logical-source.ai> -v deployment-container --environment <id> --format json
```

Read the ids from `environments` and pass the selected id to `--environment`.

Inspect query JSON before SVG. Check every relevant D2 environment and every important cross-environment path. A clean link proves references and placements resolve; it does not prove that the chosen route expresses the intended traffic policy.

Treat route diagnostics as modeling errors, not renderer defects. Important cases include an undeclared route, an endpoint without a deployment, a missing or ambiguous target deployment, infrastructure used before its placement is known, and a section that does not reach its required boundary.
