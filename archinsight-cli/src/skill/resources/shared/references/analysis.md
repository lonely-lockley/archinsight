# Analyzing an Insight Project

Use focused AIQ queries to answer architecture questions without modifying the
model. Prefer `RETURN TABLE` when the result is naturally a flat set of rows
with scalar columns and answering the question does not require inspecting
nested graph structure. Keep the exact query so the analysis is reproducible,
but show its text to the user only when they explicitly ask for it.

Treat the linked model as an abstraction at its declared level. Lead an
analytical answer with the verdict, follow with the model evidence, and mention
one limitation only when it could change that verdict. For failure-propagation
questions, a modeled synchronous path is usually the first evidence to
evaluate. Answer in terms appropriate to the question; do not turn model
evidence into a guarantee about a runtime outage or bury it under a list of
unmodeled implementation details.

The linked semantic graph is the evidence. A diagram is useful for
communication. Inspect graph-query JSON when the user's question cannot be
expressed faithfully in AIQ, or when the result differs from the user's
expectation and needs diagnosis. In the latter case, check the query and its
scope first, then the linked model and graph output; consider an engine defect
only after those explanations have been ruled out.

## Workflow

1. Run `archinsight link . --format text`; linker errors block a trustworthy report.
2. Run `archinsight structure . --format json` to identify contexts, types, and qualified ids.
3. Translate the question into a selection: its anchor, relationship semantics,
   direction, layer, and required result. Decide whether the anchor is one
   element, a system including its children, a context, or a set; whether the
   relationship is sync, async, any dependency, containment, placement, or
   infrastructure use; whether traversal is incoming, outgoing, or both; and
   whether authored, ownership-level, or projected facts answer the question.
4. Resolve every qualified anchor id through `structure` or an inventory report
   before interpreting an empty anchored result. An unknown id also returns zero
   rows and must not be reported as “no dependencies.”
5. Start from a bundled query only after the selection is defined, or write one
   focused table report under `reports/`. A transport word such as Kafka or gRPC
   describes a relationship unless the question explicitly asks for a
   technology filter or infrastructure.
6. Use a table result for flat scalar data. Use text for terminal inspection and CSV for interchange.
7. Inspect graph-query JSON only when required nesting cannot be flattened faithfully in AIQ, or when diagnosing an unexpected result.
8. State the scope, parameters, depth bounds, and whether derived relationships were included. Keep the query available, but include it in the response only when the user asks.

## Interpretation cues for core constructs

Use these meanings as starting points for built-in constructs. They are neither
an exhaustive catalogue of possible conclusions nor required answer wording.
Combine them, use other linked facts, and make additional conclusions when the
model supports them. Project-defined types and attributes add the meaning
established by that project.

| Construct | Common analytical signal |
| --- | --- |
| `->` / `SyncWire` | Usually a blocking dependency and evidence for possible immediate influence from provider to consumer. |
| `~>` / `AsyncWire` | Usually a decoupled dependency; useful for reasoning about delivery, delay, stale data, backlog, producers, and consumers. |
| Wire direction | Stored consumer to provider by default; impact questions commonly traverse against the arrow. |
| Containment, derived relationships, `ROLLUP` | Lets child-level facts answer questions at a compatible system or container ownership level. |
| `runsOn` | Records placement and supports questions about infrastructure exposure, allocation, and affected workloads. |
| `uses` | Records an infrastructure dependency or selected path without prescribing one universal runtime consequence. |
| `external` | Marks a responsibility boundary; internal details may intentionally be outside the model. |

Choose relevant semantics before query syntax. For example, “What can fail
immediately if this provider fails?” usually starts with incoming `SyncWire`
reachability; “Who receives this event?” starts with the relevant `AsyncWire`
selection; and “What runs on this cluster?” starts with `runsOn`. Extend or
combine those selections whenever the actual question and project vocabulary
require it.

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
- `examples/queries/sync-impact.aiq`
- `examples/queries/system-impact.aiq`
- `examples/queries/shortest-path.aiq`
- `examples/queries/async-topics.aiq`
- `examples/queries/system-async-consumers.aiq`
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
WHERE dependent <> changed
RETURN TABLE elementId(dependent) AS dependent,
             min(length(p)) AS distance
ORDER BY dependent
```

This reports potential dependency impact recorded in the model. It is not an
outage probability or a proven runtime call trace. The maximum depth is part of
the question. A path is a relationship trail: relationships cannot repeat in
one path, while nodes can. Excluding `changed` keeps a cycle from reporting the
anchor as something else affected by its own change.

For immediate failure propagation, traverse only synchronous wires:

```cypher
MATCH (changed:Element)
WHERE elementId(changed) = $element
MATCH p = (changed)<-[:REFERENCES*1..8 {type: 'SyncWire'}]-(dependent:Element)
WHERE dependent <> changed
RETURN TABLE elementId(dependent) AS dependent,
             min(length(p)) AS distance
ORDER BY dependent
```

Report the result as “a modeled synchronous path exists” or “no modeled
synchronous path exists.” The generic impact report intentionally includes
other dependency types and answers a broader change-impact question.

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
A selector-free `REFERENCES` path follows the direct model relationships. Use
it when the answer requires one continuous dependency chain. `{withDerived}`
traverses the ownership rollup graph instead: consecutive hops can summarize
relationships belonging to different children of their shared owner. Use that
only when the question explicitly asks about reachability in the aggregated
owner graph. Variable paths reject projected relations because their visible
endpoints do not form one stable logical traversal graph.

When the anchor is a system but its relationships belong to children, expand
the system first and keep the dependency traversal selector-free:

```cypher
MATCH (changed:System)
WHERE elementId(changed) = $system
MATCH (changed)-[:CONTAINS*0..8]->(provider:Element)
MATCH (provider)<-[:REFERENCES*1..]-(dependent:Element)
WHERE dependent <> provider
RETURN TABLE DISTINCT elementId(dependent) AS dependent
ORDER BY dependent
```

The containment bound covers the ownership depth to inspect; raise it for a
deeper project. This query traverses actual relationships from every element
inside the system instead of composing derived owner-to-owner copies.

## Async Topics

```cypher
MATCH (consumer:Element)-[event:REFERENCES]->(producer:Element)
WHERE consumer.context = $context
  AND event IS AsyncWire
UNWIND event.via AS topic
RETURN TABLE DISTINCT topic,
                      elementId(producer) AS producer,
                      elementId(consumer) AS consumer
ORDER BY topic, producer, consumer
```

This report relies only on what the eventing model guarantees: an async wire
and its `via` value. It includes subscriptions that have no `technology` and no
deployment block. A topic without a modeled relationship cannot be discovered.

`kafka-topics.aiq` is a narrower compatibility example for projects that store
`Kafka` directly in the logical wire's `technology`. Use it only after checking
that convention. When technology belongs to a deployed broker, join a bound
`InfrastructureComponent` with `broker IN event.uses` and filter the broker's
technology; do not require infrastructure for a logical topic inventory.

## Async consumers of a system

```cypher
MATCH (producer:System)
WHERE elementId(producer) = $system
MATCH ROLLUP (consumer:ContainerElement)-[event:REFERENCES]->(producer)
WHERE event IS AsyncWire
UNWIND event.via AS topic
RETURN TABLE DISTINCT topic, elementId(consumer) AS consumer
ORDER BY topic, consumer
```

`ROLLUP` lets a relationship authored against any child of the producer system
match that system while retaining the actual consuming service or container.
For a graph query, selecting `{withDerived}` relationships is the other common
way to ask an ownership-level question. Neither form requires a deployment join.

## Missing Relationships

```cypher
MATCH (container:ContainerElement)
WHERE container.context = $context
OPTIONAL MATCH (container)<-[incoming:REFERENCES]-(consumer:Element)
WITH container, incoming
WHERE incoming IS NULL
RETURN TABLE elementId(container) AS container
ORDER BY container
```

This incoming pattern finds container elements with no modeled consumers. Swap
the arrow to find container elements with no declared providers. An empty table
is a successful result only after the context and candidate inventory have been
confirmed.

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

Save reusable flat `RETURN TABLE` queries under `reports/`. Save reusable graph
`RETURN` queries and reserved web-view overrides under `views/`. Both use the
same AIQ runtime; the directory names state their purpose. Use a temporary file
for a one-off read-only investigation unless the user asks to keep it.
