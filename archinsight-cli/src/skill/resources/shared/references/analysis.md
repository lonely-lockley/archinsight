# Analyzing an Insight Project

Use analysis mode to answer architecture questions without modifying the model.
Start from the linked semantic graph, then use queries to select the relevant
subgraph. Treat the rendered image as a presentation artifact, not as the
primary analytical result.

## What the Query Language Is For

Insight queries select nodes and relationships for inspection or rendering.
The current subset is well suited to:

- inventory by context, source fragment, type, or attribute;
- direct outgoing and incoming dependencies;
- logical relationships rolled up to C1, C2, or C3 ownership levels;
- external-boundary and technology-focused slices;
- async versus sync relationship slices;
- logical-to-physical deployment placement and projected wire paths;
- comparing a broad context graph with a focused built-in or custom view.

It is not a general graph analytics language. It has no aggregation functions,
computed return columns, variable-length paths, shortest-path operations,
subqueries, ordering, or pagination. It cannot directly express transitive
impact, cycle detection, centrality, counts, or the absence of a relationship.
`ROLLUP` climbs containment ownership; it is not transitive dependency
traversal.

For questions outside that boundary, select a sufficiently broad graph with
`--format json` and analyze that JSON with the agent's ordinary data-processing
tools. Keep this second step read-only and state clearly which result comes from
the Insight query and which result was computed from its output.

## Analysis Workflow

1. Run `archinsight link . --format text`. Diagnostics are part of the
   evidence; do not silently analyze a partially linked model as if it were
   complete.
2. Run `archinsight structure . --format json` to establish contexts, source
   roles, types, objects, extensions, and qualified identities.
3. Choose the smallest query that answers the question. Use a built-in view for
   an architectural level, a focused custom query for one-hop questions, or
   `no-filter` for a broad logical export.
4. Inspect query JSON before rendering. Distinguish selected outer endpoints,
   underlying edge endpoints, derived relationships, and projection origins.
5. If the question needs traversal, aggregation, set intersection, or absence
   checks, compute them over the exported JSON without changing the model or
   pretending the computation was supported by the query DSL. Ordinary
   property equality and inequality can stay in the Insight query.
6. Report the scope: context, selected source when `$tab` is used, query or
   built-in view, and whether derived or projected edges were included.

## Inventory a Context

The built-in unfiltered view is the simplest broad logical export:

```shell
archinsight query . -c <context-id> -v no-filter --format json
```

Use the `elements` map to inventory qualified identities and types. Use
`edges` for direct relationships selected by the view. Parent-based render
groups are useful presentation metadata but do not replace element ownership in
the linked model.

For a typed inventory, narrow the query:

```cypher
MATCH (service:Service)
WHERE service.context = $context
RETURN service
```

## Direct Dependency Questions

Outgoing dependencies from one service:

```cypher
MATCH (service:Service {id: 'checkout_api', context: $context})-[dependency:REFERENCES]->(target:Element)
RETURN service, dependency, target
```

Incoming dependencies can keep the inspected service at the start of the
pattern by using the reverse arrow:

```cypher
MATCH (service:Service {id: 'checkout_api', context: $context})<-[dependency:REFERENCES]-(caller:Element)
RETURN service, dependency, caller
```

This selects the same stored edge as placing `caller` on the left with `->`.
Pattern orientation changes matching readability, not the relationship stored
in the architecture model.

These answer one-hop questions. To find all transitively affected elements,
export the relevant context graph and traverse its direct `REFERENCES` edges
outside the query language. State whether derived and projected edges were
excluded or analyzed separately so the same dependency is not counted at
several architectural levels.

## Choose the Dependency Scope

The bundled `examples/queries/direct-service-dependencies.aiq` selects the
one-hop dependency graph at container/service ownership level:

```cypher
MATCH (source:ContainerElement)-[dependency:REFERENCES {withDerived}]->(target:ContainerElement)
WHERE source.context = $context
RETURN source, dependency, target
```

`withDerived` includes relationships lifted from components to their owning
containers or services. This is appropriate for a service dependency map, but
it is not an inventory of authored wires. Because both endpoints must be
`ContainerElement`, it intentionally omits a direct service-to-system or
system-to-system relationship.

Run the query once for the context instead of querying every service
individually:

```shell
archinsight query . -c <context-id> \
  -q <skill-path>/examples/queries/direct-service-dependencies.aiq \
  --format json
```

In direct, non-projected results, nested `edge.source` and `edge.target`
preserve dependency ownership. The source depends on the target. Use qualified
ids from those fields when building an adjacency map; do not infer direction
from diagram placement.

For every authored one-hop dependency regardless of architectural level, use
`examples/queries/direct-authored-dependencies.aiq`:

```cypher
MATCH (source:Element)-[dependency:REFERENCES]->(target:Element)
WHERE source.context = $context
RETURN source, dependency, target
```

```shell
archinsight query . -c <context-id> \
  -q <skill-path>/examples/queries/direct-authored-dependencies.aiq \
  --format json
```

This query excludes derived and projected copies. It is the correct starting
point for questions such as "what does this service or system directly depend
on?" when the target may live at another architectural level.

## Analyze Async Topics and Channels

The bundled `examples/queries/async-topic-dependencies.aiq` selects every
authored async dependency without requiring a particular transport or endpoint
level:

```cypher
MATCH (consumer:Element)-[event:REFERENCES]->(producer:Element)
WHERE consumer.context = $context
  AND event.type = 'AsyncWire'
RETURN consumer, event, producer
```

Insight eventing is consumer-owned: the consumer declares `~> producer`, and
`via` names the topic or channel. Therefore an outgoing async edge lists what
an element consumes, while incoming async edges list the modeled consumers of a
producer's topic contract. The endpoints may be systems, services, components,
or project-defined element types.

Run the generic query for the whole context:

```shell
archinsight query . -c <context-id> \
  -q <skill-path>/examples/queries/async-topic-dependencies.aiq \
  --format json
```

To select a topic family, copy the query and add a case-sensitive membership or
substring predicate such as `AND event.via CONTAINS 'orders.'`.

For one consumer, constrain its local id in the first node pattern:

```cypher
MATCH (consumer:Element {id: 'order_processor', context: $context})
    -[event:REFERENCES]->(producer:Element)
WHERE event.type = 'AsyncWire'
RETURN consumer, event, producer
```

For one producer, use the reverse pattern:

```cypher
MATCH (producer:Element {id: 'order_processor', context: $context})
    <-[event:REFERENCES]-(consumer:Element)
WHERE event.type = 'AsyncWire'
RETURN producer, event, consumer
```

The query result is a render graph rather than a row set. When `jq` is
available, extract a compact dependency table without loading the complete JSON
into the agent's context:

```shell
archinsight query . -c <context-id> \
  -q <skill-path>/examples/queries/async-topic-dependencies.aiq \
  --format json |
jq -r '.edges[] | [
  .edge.source,
  .edge.target,
  (.edge.attributes.via // [] | join(", ")),
  (.edge.attributes.technology // [] | join(", "))
] | @tsv'
```

This reports topic contracts used by at least one modeled consumer. Do not
claim it is a complete producer catalog: a topic with no modeled wire is not
discoverable unless the project represents that contract separately.

The bundled `examples/queries/kafka-service-dependencies.aiq` is a narrower
specialization for projects that consistently record `technology = Kafka`
and want only authored container-to-container dependencies without derived or
projected copies:

```cypher
MATCH (consumer:ContainerElement)-[event:REFERENCES]->(producer:ContainerElement)
WHERE consumer.context = $context
  AND event.type = 'AsyncWire'
  AND event.technology CONTAINS 'Kafka'
RETURN consumer, event, producer
```

Do not use this specialization when `technology` is absent or inconsistent;
the generic async query still finds those modeled relationships.

## Compare Endpoint Attributes

Equality and inequality can compare properties on two bound endpoints:

```cypher
MATCH (source:Element)-[dependency:REFERENCES]->(target:Element)
WHERE source.runsOn <> target.runsOn
RETURN source, dependency, target
```

Scalar references compare by qualified element id. List properties compare as
complete ordered lists. If either property is absent, both `=` and `<>`
evaluate to false for that row. The query language does not calculate list
intersection or set difference; export JSON and post-process it when the
question is whether two multi-valued placements overlap.

## Report Annotations

Annotations are present in query JSON, but the current query language has no
annotation predicate. Select a sufficiently broad graph and filter the JSON:

```shell
archinsight query . -c <context-id> -v no-filter --format json |
jq '{
  elements: [
    .elements[] |
    select((.annotations // []) | length > 0) |
    {id, annotations}
  ],
  edges: [
    .edges[] |
    select((.edge.annotations // []) | length > 0) |
    {source, target, annotations: .edge.annotations}
  ]
}'
```

Each annotation retains its name, optional value, and source position. This is
a read-only reporting workaround, not an Insight query predicate.

## Analyze a Source Fragment

Use `$tab` when the question concerns the semantic fragment rooted in one
source and its extensions:

```cypher
MATCH (element:Element)
WHERE element.sourceIdentity = $tab
OPTIONAL MATCH (element)-[dependency:REFERENCES]->(target:Element)
RETURN element, dependency, target
```

Run it with `--source <source.ai>`. Explain that the result follows semantic
source identity and can include declarations contributed through `extend`;
it is not a raw inventory of lines physically present in that file.

## Analyze Deployment Realization

Use built-in Deployment query JSON when the question is how logical architecture
is realized physically. D1 answers which systems and external integrations are
present across relevant environments. D2 shows container and infrastructure
detail inside one selected environment:

```shell
archinsight query . -s <logical-source.ai> -v deployment-system --format json
archinsight query . -s <logical-source.ai> -v deployment-container --environment <environment> --format json
```

Use the legacy `deployment` view only when the question intentionally requires
one container-level graph across every relevant environment.

For each projected edge, compare outer `source` and `target` with nested
`edge.source` and `edge.target`. Use `edge.originSource` and
`edge.originTarget` for the logical origin selected by the query. When
`edge.projectionOrigins` is present, inspect the complete list before deciding
that a shared physical segment belongs to only one logical consumer.
Analyze logical wires and projected segments as separate layers; otherwise one
dependency can appear to be several independent architectural relationships.

## Quality and Impact Checks

The query DSL cannot directly ask for nodes with no incoming edge, nodes with no
outgoing edge, cycles, counts by type, or transitive consumers. Export a broad
JSON graph, compute those conditions from qualified ids and direct edges, and
then return to source declarations for confirmation. A selected view can omit
objects by design, so absence in C1, C2, C3, C4, or Deployment is not evidence that the
object is absent from the linked project.

Analysis findings should distinguish verified model facts, query-dependent
observations, externally computed results, and unresolved interpretation. Do
not edit the architecture merely to make an analytical query easier.
