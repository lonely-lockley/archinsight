# Deployment Routes and Projections

Read `references/deployment.md` first. Use this reference when adding or debugging a physical relationship path.

## Terms and operators

Route terms:

- `$from` — input of the current route section;
- `$to` — logical destination of the relationship;
- a plain id — infrastructure resolved in the current deployment cursor.

Terms in a component’s own `route:` block:

- `$from` — deployed logical element using the infrastructure;
- `$this` — selected infrastructure component;
- a plain id — infrastructure resolved in the current deployment cursor.

`$to` is not available in infrastructure projections.

Every rule is a directed physical edge from its left term to its right term. In `outbound:`, `transit:`, and `inbound:`, indent `technology` and `description` under the individual arrow to label that hop. Either field can be used on its own.

`connectTo` takes its labels from the rule. `originalLink` inherits the logical wire's labels, operator, annotations, and provenance. Setting a label under `originalLink` overrides that field on this projected edge and preserves the other inherited fields. Project-defined physical operators work in the same positions.

`source` and `target` prefix operators no longer exist. Placement is expressed by route sections and postfix `in` qualifiers.

## Section execution

```insight
route example
    outbound:
        ...
    transit:
        ...
    inbound:
        ...
```

At least one of `outbound` or `inbound` is required. `transit` is optional. End each intermediate section at `$to` (or `$this` in an infrastructure projection). This boundary joins the next section's `$from`; only the final section resolves the destination itself.

Within a section, `$from` always refers to that section input. It does not change merely because it appears on the right side of a rule. Named infrastructure terms connect rules and branches.

## Placement

An unqualified route begins in the concrete source deployment. Postfix placement changes the cursor:

```insight
$from connectTo tgw in eu_central_1
tgw connectTo privateGateway
privateGateway originalLink $to in production from latam
```

`in <environment>` keeps the current deployment id. `in <deployment> from <environment>` selects an exact deployment. The first qualifier must appear early enough to resolve every infrastructure term on that branch.

The route implementation is selected by name in each concrete source environment. `$to` must have exactly one matching destination deployment. Missing and ambiguous placements are errors. There is no implicit local-first choice or cross-product.

## Local route

```insight
route clusterLocal
    outbound:
        $from originalLink $to
```

Use at the logical relationship:

```insight
links:
    -> api
        deployment:
            route clusterLocal
```

## Inbound gateway

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

The route may reference nested infrastructure held by a gateway or another inventory component.

## Cross-environment route

```insight
route macroRegion
    outbound:
        $from originalLink outboundGateway
        outboundGateway connectTo $to

    transit:
        $from connectTo tgw in eu_central_1
            technology = AWS Transit Gateway
            description = Carries traffic to the central gateway
        tgw connectTo $to

    inbound:
        $from connectTo tgw in latam
        tgw connectTo privateGateway
        privateGateway originalLink $to
```

This describes a concrete policy; the route name itself has no semantic behavior.

For a route that reaches a service through an interface VPC endpoint, label the hop from that endpoint to the endpoint service:

```insight
interfaceEndpoint connectTo endpointService
    technology = AWS PrivateLink
    description = Accesses the partner API privately
```

## Broadcast

```insight
route broadcast
    outbound:
        $from originalLink $to in latam
        $from originalLink $to in eu_central_1
        $from originalLink $to in mena
```

Write every intended destination. Do not synthesize branches from the set of target deployments.

## Broker route

Read [Eventing](modeling.md#eventing) for the logical async model before choosing this physical route.

For a consumer-owned async relationship:

```insight
service consumer
    links:
        ~> publisher
            via = orders.created
            deployment:
                route events
```

The environment route can reverse the physical flow:

```insight
route events
    inbound:
        $to connectTo broker
            technology = Kafka
        broker originalLink $from
```

The projected `originalLink` retains `~>`, `via`, technology, description, and annotations. Parallel logical relationships remain separate even when they share endpoints. Identical non-logical physical segments are shared and keep all projection origins.

## Multiple logical labels

`originalLink` may appear more than once on a branch when both sides of an infrastructure path need the authored relationship label:

```insight
route labeledGateway
    inbound:
        $from originalLink gateway
        gateway originalLink $to
```

Both edges refer to the same logical relationship. This is intentional, not a duplicated logical wire.

## Storage projection

```insight
storage postgres
    name = PostgreSQL
    route:
        $from originalLink $this
```

Apply it through an element profile:

```insight
deploymentProfile stateful
    appliesTo:
        production from eu
    runsOn compute
    uses database
```

## Cross-environment infrastructure projection

```insight
storage archive
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

Use the full form when an element consumes infrastructure in another deployment. The destination `$this` must resolve there.

## Fan-out projection

```insight
monitoring telemetry
    route:
        $from originalLink $this
        $this connectTo prometheus
        $this connectTo collector
```

Every rule is independent. Reusing `$this` creates fan-out.

## Debugging checklist

1. Run `archinsight link . --format text` and resolve every route diagnostic.
2. Verify the source and target deployment profiles.
3. Check the wire's `route <name> in <environment>` selections and optional default. An unselected environment has no path. A selected but missing implementation produces `ROUTE_NOT_DECLARED`, including when a default exists. Duplicate selections for an environment or two defaults are ambiguous. An environment outside the effective profile produces `ROUTE_ENVIRONMENT_NOT_APPLICABLE`. Qualifiers select the logical owner's environments (the target's for an unplaced actor) before projecting any physical arrows.
4. Follow each `in` cursor change in order.
5. Confirm that every infrastructure id exists in the active deployment.
6. Confirm that the final `$to` or `$this` has exactly one matching destination deployment.
7. Query D1 and each D2 environment before rendering.
8. Inspect `edge.originSource`, `edge.originTarget`, `edge.projectionRoot`, and `edge.projectionOrigins` when a shared segment or logical label is surprising.

For reusable environment frameworks and large project structure, continue with [Scaling](scaling.md#framework-once-use-everywhere).
