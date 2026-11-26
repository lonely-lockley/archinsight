# Deployment

Use Deployment modeling to place logical systems and containers on physical infrastructure and to project their relationships through explicit environment-owned routes.

## Working model

Keep these responsibilities separate:

1. An environment file owns one `environment`, its concrete `deployment` inventories, and its `route` implementations.
2. A logical context owns `deploymentProfile` declarations.
3. Systems, containers, and services select profiles with `deployment: uses <profile>`.
4. A logical relationship selects a route per applicable environment with `route <name> in <environment>` and an optional unqualified default.
5. Infrastructure selected by a profile or logical element may define its own `route:` using `$from` and `$this`.

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

Choose one deployment owner level per system. Deploy the system as a whole or deploy its individual containers and services. Mixing levels, even through an extension or in disjoint environments, produces `DEPLOYMENT_OWNERSHIP_CONFLICT`. Wire routes belong to the relationship and can be selected at either level.

Components and code inherit the deployment of their containing service or container. Do not add core deployment actions to them.

## Sharing physical infrastructure

- Use a bare slot in a shared profile (`uses database`) for one inventory database per deployment. Use a concrete inventory reference (`uses postgres from central`) to pin a common database across deployments.
- For one customized instance per owner and deployment, declare `uses database as orderLedger` on the provider and put overrides there. At the consumer write `shares orderLedger from orders`. Resolve `orders` as a visible system or container, including an imported alias. A profile may supply a named use to its consuming owner.
- Name a database binding for the data the cluster holds. Model primary and replica nodes and their replication links in the cluster’s infrastructure projection when the deployment view needs that detail.
- For one use of a slot, `shares database from orders` is sufficient. Give repeated uses distinct aliases. Equal display names carry no identity.
- For a database shared by sibling containers, put the aliased use on one container and reference it from its siblings. A system deployed as a whole can own a binding for consumers in other systems.
- For customized resources, filter AIQ by `db.binding` (alias) and `db.bindingOwner` (canonical owner id). Match consumers with `db IN service.uses`; `db.cloneOf` identifies the original inventory instance.
- Check every concrete consumer deployment. Missing provider placement, missing binding and ambiguous binding are linking errors. Apply both profiles and inspect D2 for each environment. Keep deployment infrastructure out of C2.

```insight
system commerce
    name = Commerce

    service orders
        name = Orders
        deployment:
            uses regional
            uses database as orderLedger
                name = Order ledger cluster

    service billing
        name = Billing
        deployment:
            uses regional
            shares orderLedger from orders
```

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

For a wire used only from LATAM write `route clusterLocal in latam`. For different paths by environment, put one selection per line under the wire's `deployment:` list. An explicit selection overrides a single unqualified default. With no default, other environments produce no path. Check qualifiers against the wire owner's effective deployments, or the target's when the owner has none (e.g. an actor). A reversed physical segment preserves this selection scope.

A route has `outbound`, optional `transit`, and `inbound` sections. At least one of `outbound` or `inbound` is required. Sections connect in written order.

Use `originalLink` wherever the physical edge must retain the logical operator and its attributes. Use `connectTo` for a new physical edge. Multiple `originalLink` rules are intentional and preserve the same logical provenance. To label a single hop, indent `technology` or `description` under its arrow. The [cross-environment route](deployment-projections.md#cross-environment-route) shows both fields on a transit hop.

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

## Routes on infrastructure components

Write `route:` on the infrastructure component itself. For older syntax, follow the [3.2.0 migration guide](migration-3.2.md). Component routes use `$from` for the logical consumer and `$this` for the selected infrastructure component. `$to` is invalid.

```insight
storage postgres
    route:
        $from originalLink $this
```

The flat form is a local shorthand. The full section and placement syntax is also available:

```insight
storage reporting
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
