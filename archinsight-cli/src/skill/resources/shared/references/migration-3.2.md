# Migrating Insight deployment models from 3.1.x to 3.2.0

Start at the logical consumer of each old `projection:`. If a wire selected the infrastructure with `deployment: uses <slot>`, its physical path becomes a named route in the environment. If a service or profile used the infrastructure directly, the component owns its path in a `route:` field. A component used both ways can need both forms. A repository-wide rename loses that distinction.

## Incoming API call through a gateway

**3.1.9.** The actor's wire selected an infrastructure slot. The concrete gateway held the rules that connected the customer to the API.

```insight
links:
    -> api
        technology = HTTPS
        description = Calls the public API
        deployment:
            uses publicGateway
```

```insight
projection:
    source $from originalLink target gateway
    target gateway connectTo target loadBalancer
        technology = HTTPS
    target loadBalancer connectTo target $to
        technology = HTTP
```

**3.2.0.** On that wire, replace `uses publicGateway` with `route publicInbound`. Keep its direction and attributes. Remove the old block from the gateway. Keep the gateway, load balancer and their inventory declarations. Add the following top-level declaration in the environment file, alongside `deployment production`.

```insight
route publicInbound
    inbound:
        $from originalLink gateway
        gateway connectTo loadBalancer
            technology = HTTPS
        loadBalancer connectTo $to
            technology = HTTP
```

In this example the actor has no deployment and the API runs in EU, so `environment eu` supplies the route. The first hop inherits HTTPS and the API description. The other hops take the technologies written under their arrows. Keep annotations and `call` or `via` on the authored wire. Use `originalLink` on each hop that needs the original label. See the [complete gateway model](../examples/deployment-projections/gateway/model.ai).

## Direct storage or monitoring use

**3.1.9**, inside the storage inventory:

```insight
storage postgres
    name = PostgreSQL
    projection:
        source $from originalLink target $this
```

**3.2.0**, in the same inventory slot:

```insight
storage postgres
    name = PostgreSQL
    route:
        $from originalLink $this
```

Keep `uses database` on the deployment profile and `uses stateful_profile` on the service. Here `$from` is the deployed consumer and `$this` is the selected storage instance. For a Prometheus scrape, `$this connectTo $from` keeps the physical request pointing from monitoring to the service. Component routes also support sections and explicit remote placement. [Storage example](../examples/deployment-projections/storage/model.ai) · [Cross-environment component route](deployment-projections.md#cross-environment-infrastructure-projection)

**Earlier 3.2 previews.** If a component already has unprefixed rules using the new placement semantics, rename its `projection:` field to `route:` and keep its body. In a 3.1.x model, migrate the placement prefixes as well.

## Consumer-owned Kafka subscription

**3.1.9**, on the broker selected by a wire with `uses events`:

```insight
projection:
    target $to connectTo target $this
        technology = Kafka
    target $this originalLink source $from
```

**3.2.0.** Keep `consumer ~> publisher` and its `via = orders.created`. Change the wire selection to `route events`. Inside the environment route, identify the broker by its inventory slot, `events`. The spelling matches the route name in this example.

```insight
route events
    inbound:
        $to connectTo events
            technology = Kafka
        events originalLink $from
```

The physical path is publisher → broker → consumer. Preserve that direction when moving rules that used `$this` from an infrastructure instance to an environment route. [Complete broker model](../examples/deployment-projections/broker/model.ai)

## Cross-environment placement and limited availability

The 3.1.x `source` and `target` prefixes referred to logical sides. Recover the actual placement from both endpoint profiles and the inventory. An `inbound:` section alone does not move the path to a remote environment. For example, if a caller in `source_env` reaches a gateway and service in `target_env`, declare this route in `source_env`:

```insight
route privateGateway
    outbound:
        $from originalLink privateGateway in target_env
        privateGateway connectTo $to
            technology = HTTPS
```

The first hop selects the remote gateway. The next hop continues there. Within a route, `in target_env` looks for the same concrete deployment name and can use the sole deployment in that environment. Use `in production from target_env` to select it explicitly. For a multi-stage path use `outbound:`, optional `transit:`, and/or `inbound:`. End each intermediate section at its boundary (`$to` for a wire, `$this` for a component). At least one endpoint section is required on a named route. [Complete cross-environment model](../examples/deployment-private-gateway/source-system.ai)

On the wire, `in` chooses **where the call originates**. For a caller whose profile includes EU, LATAM and US, this selection uses the partner path in two environments and the public path in US:

```insight
deployment:
    route partnerGateway in eu
    route partnerGateway in latam
    route publicGateway
```

Omit the default to project only the two specified environments. Each selected environment must implement its chosen route. For an unplaced actor, use the target's effective deployments to select the starting environment. This selection also applies to physically reversed paths. Where the old model omitted a cross-environment occurrence, establish the intended destinations before adding branches. One explicit destination per branch expresses broadcast.

## Project-defined deployment vocabulary

Review framework `.ai` files that extend the old wire `uses` operator or the `SourceProjectionTerm` and `TargetProjectionTerm` operators. The core wire selector is now `RouteUse`, with capability `deployment-route-use`. Standard selectors work with project-defined storage, gateways and brokers. A former `$slot from $owner <name>` reference in a wire path needs the concrete inventory slot or component ID in the appropriate deployment. Check for ambiguous names when several gateways contain a child with the same slot name.

## Checking a migration

1. Capture the old D1 and per-environment D2 output with the project's 3.1.x CLI if available. Record the expected hops, placements and labels. Keep the old and new outputs outside the model sources.
2. Check `archinsight --version`, then run these commands with the 3.2 CLI, substituting the logical model file and applicable environment IDs:

   ```shell
   archinsight link . --format text
   archinsight query . -s model.ai -v deployment-system --format json
   archinsight query . -s model.ai -v deployment-container -e eu --format json
   ```

   For the cross-environment example above, inspect the receiving gateway with `archinsight query . -s target-system.ai -v deployment-container -e target_env --format json`. D2 is scoped by both the logical source file and the environment.

3. `WIRE_USES_REMOVED` identifies a wire that still selects infrastructure directly. A removed-prefix diagnostic points to a physical rule whose placement needs translation. For `ROUTE_NOT_DECLARED`, check the selection in the starting environment. For `ROUTE_TARGET_DEPLOYMENT_MISSING`, check the destination profile and the last placement on the path.
4. Compare physical source, target, direction, technology and description. Check logical ownership through `edge.originSource` and `edge.originTarget`, especially on shared gateways and reversed broker paths. Review custom AIQ reports that read the old wire's `uses` attribute or the component's `projection` field. In AIQ, select projected edges by `projectionRoot` and read `originSource` and `originTarget` for their logical endpoints. The Async Topics example in `analysis.md` shows the broker report. A successful link can still describe the wrong path.
