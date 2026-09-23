# Analyzing an Insight Project

Use focused AIQ queries to answer architecture questions without modifying the
model. Prefer `RETURN TABLE` when the result is naturally a flat set of rows
with scalar columns and answering the question does not require inspecting
nested graph structure. Keep the exact query so the analysis is reproducible,
but show its text to the user only when they explicitly ask for it.

The linked semantic graph is the evidence. A diagram is useful for
communication. Inspect graph-query JSON when the user's question cannot be
expressed faithfully in AIQ, or when the result differs from the user's
expectation and needs diagnosis. In the latter case, check the query and its
scope first, then the linked model and graph output; consider an engine defect
only after those explanations have been ruled out.

## Workflow

1. Run `archinsight link . --format text`; linker errors block a trustworthy report.
2. Run `archinsight structure . --format json` to identify contexts, types, and qualified ids.
3. Start from a bundled query under `examples/queries/` or write one focused `.aiq` in `reports/`.
4. Use a table result for flat scalar data. Use text for terminal inspection and CSV for interchange.
5. Inspect graph-query JSON only when required nesting cannot be flattened faithfully in AIQ, or when diagnosing an unexpected result.
6. State the scope, parameters, depth bounds, and whether derived relationships were included. Keep the query available, but include it in the response only when the user asks.

## Delivering Results

Distinguish a request for an analytical answer from a request for the selected
data. Answer an analytical question directly and cite the material scope or
limits that affect the conclusion. When the user asks for the data itself,
return up to 10 rows inline. If the result contains more than 10 rows, write the
complete result to a downloadable file and give the user the file together with
its row count and a short description; do not paste the complete dataset into
the response. Use CSV for a flat scalar table unless the user requests another
format. Preserve typed or nested values in JSON only when CSV would lose
information. This delivery rule does not change the requirement to show the
AIQ query text only when the user explicitly asks for it.

Bundled starting points:

- `examples/queries/inventory.aiq`
- `examples/queries/impact.aiq`
- `examples/queries/shortest-path.aiq`
- `examples/queries/kafka-topics.aiq`
- `examples/queries/no-incoming-dependencies.aiq`
- `examples/queries/type-summary.aiq`

```shell
archinsight query . -s <source.ai> -q reports/inventory.aiq --format text
archinsight query . -q reports/path.aiq \
  --param 'from="context/A"' --param 'to="context/B"' --format text
archinsight query . -q reports/topics.aiq --params params.json --format csv
```

`--param name=<json>` accepts null, boolean, finite numbers, strings, and lists.
`$context` and `$tab` come from `--context`/`--source` and cannot be supplied as
user parameters. Missing, unused, duplicate, and reserved parameters are errors.

## Run a report in the UI

In the web editor, open the `.aiq` file and enter the required parameters above
the result. In VS Code, open the `.aiq` file and use the play button or run
**Archinsight: Run AIQ Query**. Choose the `.ai` source used for `$tab` when the
workbench asks. Graph queries keep the diagram; `RETURN TABLE` replaces it with
a typed table and does not invoke Graphviz. The table supports local paging,
keyboard navigation, expandable nested values, and JSON/CSV downloads. Nested
cells are available for user-requested reports; agent analysis should prefer
flat scalar columns and use `UNWIND` to turn lists or path steps into rows.
Use the contextual **Download** menu to download JSON when typed cells or path
metadata must be preserved, or CSV for a flat interchange file.
AIQ completion suggests clauses, scoped aliases, types, attributes, functions,
selectors, and parameters while a person edits an incomplete report.

## Inventory

```cypher
MATCH (element:Element)
WHERE element.context = $context
RETURN TABLE elementId(element) AS element, element.type AS type
ORDER BY element
```

## Direct Dependencies

```cypher
MATCH (consumer:Element)-[dependency:REFERENCES]->(provider:Element)
WHERE elementId(consumer) = $element
RETURN TABLE DISTINCT elementId(provider) AS provider,
                      dependency.type AS relationshipType,
                      originId(dependency) AS origin
ORDER BY provider
```

The stored direction is consumer to provider. Reverse the pattern with `<-` to
find consumers of a provider. Direct matching excludes derived and projected
copies unless selectors request them.

## Transitive Impact

```cypher
MATCH (changed:Element)
WHERE elementId(changed) = $element
MATCH p = (changed)<-[:REFERENCES*1..8]-(dependent:Element)
RETURN TABLE elementId(dependent) AS dependent,
             min(length(p)) AS distance
ORDER BY dependent
```

This reports potential dependency impact recorded in the model. It is not an
outage probability or a proven runtime call trace. The maximum depth is part of
the question. A path is a relationship trail: relationships cannot repeat in
one path, while nodes can.

## One Shortest Connection

```cypher
MATCH (from:Element)
WHERE elementId(from) = $from
MATCH (to:Element)
WHERE elementId(to) = $to
MATCH p = shortestPath((from)-[:REFERENCES*1..]->(to))
UNWIND p.steps AS step
RETURN TABLE elementId(from) AS source,
             elementId(to) AS target,
             length(p) AS hops,
             step.index AS position,
             step.from AS stepFrom,
             step.to AS stepTo,
             step.relationshipId AS relationship,
             step.direction AS direction
ORDER BY position
```

For bounded alternatives use `MATCH p = (from)-[:REFERENCES*1..8]->(to)`.
For endpoint-only reachability, omit the path alias and use
`RETURN TABLE DISTINCT`; that form may use `*1..` and avoids enumerating routes.
Use `{withDerived}` only when ownership-level derived dependencies are part of
the question. Variable paths reject projected relations because their visible
endpoints do not form one stable logical traversal graph.

## Kafka and Other Async Topics

```cypher
MATCH (consumer:Element)-[event:REFERENCES]->(producer:Element)
WHERE event IS AsyncWire AND event.technology CONTAINS $technology
UNWIND event.via AS topic
WITH DISTINCT topic, elementId(producer) AS producer, elementId(consumer) AS consumer
RETURN TABLE topic, producer, consumer
ORDER BY topic, producer, consumer
```

Run with `--param 'technology="Kafka"'`. The runtime is generic: edge type,
`technology`, and `via` are model metadata rather than a Kafka-specific command.
A topic without any modeled relationship cannot be discovered by this report.

## Missing Relationships

```cypher
MATCH (service:Service)
WHERE service.context = $context
OPTIONAL MATCH (service)<-[incoming:REFERENCES]-(consumer:Element)
WITH service, incoming
WHERE incoming IS NULL
RETURN TABLE elementId(service) AS service
ORDER BY service
```

Use the outgoing arrow to find services with no declared providers. An empty
table is a successful result.

## Counts and Attributes

```cypher
MATCH (element:Element)
WHERE element.context = $context
RETURN TABLE element.type AS type, count(*) AS total
ORDER BY type
```

`annotations(value)` exposes annotations as data. `UNWIND` can turn a list into
rows. Available aggregates are `count`, `collect`, `min`, `max`, `sum`, and
`avg`; `DISTINCT` works for projections and aggregate arguments.

## Resource Bounds

Execution has finite expansion, row, collection, output-size, and wall-time
budgets. Override them only for a deliberate report:

```shell
archinsight query . -q reports/impact.aiq \
  --max-expansions 2000000 --max-rows 200000 --timeout-ms 20000
```

`LIMIT` limits returned rows but cannot always avoid work required by sorting,
aggregation, or `DISTINCT`. A budget or cancellation error never returns a
partial successful table.

Keep findings separated into authored facts, derived relationships, projected
deployment paths, and query-dependent observations. Do not edit the architecture
merely to make a report easier.
