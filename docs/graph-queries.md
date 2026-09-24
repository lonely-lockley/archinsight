# Querying the Architecture Graph

An Insight project becomes a semantic graph after linking. Queries select a view of that graph for inspection or rendering: the nodes that answer a particular architectural question, the relationships that connect them, and the groups that should form visual boundaries.

The query language uses a focused subset of Cypher. Its graph patterns read naturally from left to right, and familiar clauses such as `MATCH`, `WHERE`, and `RETURN` select the architectural elements that belong in a view. Archinsight adds a small number of operations for architecture-specific tasks such as rolling dependencies up to a broader level and grouping elements into visual boundaries.

## The graph model

The graph contains four kinds of nodes:

- `Context` nodes represent logical contexts and environment scopes.
- `SourceIdentity` nodes represent individual semantic source contributions.
- `Type` nodes represent the effective type hierarchy.
- `Element` nodes represent linked architecture objects.

An element node carries its concrete type and every base type. A `Service` can therefore be matched as `Service`, `Container`, `ContainerElement`, or `Element`. Labels are case-sensitive and follow Insight type names.

The semantic graph uses six structural relationship kinds:

| Relationship | Meaning |
| --- | --- |
| `CONTRIBUTES` | A source contributes declarations to a context or environment scope. |
| `DECLARES` | A source owns an element declaration. |
| `CONTAINS` | A context or parent element contains a child element. |
| `IMPORTS` | A source imports an element owned by another source boundary. |
| `INHERITS` | A type derives from another type. |
| `REFERENCES` | One architecture element has a directed authored or projected relationship to another. |

`REFERENCES` relations retain the concrete Insight edge type, operator, source identity, attributes, and projection metadata. Several relationships may connect the same pair of elements; each remains a separate graph edge.

Queries can inspect both the structural graph and the architecture graph. A project structure view may traverse `DECLARES`, `IMPORTS`, and `INHERITS`, while a diagram usually selects `Element` nodes and `REFERENCES` relationships.

## Cypher compatibility

The language borrows Cypher's pattern notation:

```cypher
MATCH (source:Service)-[dependency:REFERENCES]->(target:Element)
RETURN source, dependency, target
```

Parentheses describe nodes, square brackets describe a relationship, names before `:` bind aliases, and names after `:` select labels or relationship kinds. The surrounding `->`, `<-`, or `-` syntax determines how the relationship is matched.

Archinsight queries are not fully compatible with Cypher. The current language supports:

- `MATCH` and `OPTIONAL MATCH` clauses;
- directed outgoing patterns written with `->`, directed incoming patterns written with `<-`, and undirected matching patterns written with `-`;
- node labels and relationship kinds;
- node and relationship property predicates;
- one `WHERE` expression attached to each match clause;
- `AND`, `OR`, `NOT`, and parentheses;
- `=`, `<>`, `<`, `<=`, `>`, `>=`, `CONTAINS`, `IN`, `IS`, and `IS NOT`
  predicates;
- list literals, `all`/`any` predicates, and list comprehensions;
- architecture-specific `ROLLUP` matching;
- architecture-specific exact and inclusive relationship selectors;
- one `GROUP BY` expression;
- `RETURN` of bound aliases.

The language has no mutation clauses or subqueries. Plain `RETURN` selects
bound aliases for a graph result. `RETURN TABLE` adds `WITH`, `UNWIND`, named
path assignments, `shortestPath`, computed projections, aggregation,
`DISTINCT`, `ORDER BY`, `SKIP`, and `LIMIT` for analytical reports.

## Table reports and analytics

Use `RETURN TABLE` when the answer is rows rather than a diagram. Every computed
column needs an `AS` name; a bound alias can keep its name. Table queries support
`WITH`, `UNWIND`, `DISTINCT`, `ORDER BY`, `SKIP`, `LIMIT`, list literals,
parameters, comparisons, and `IS NULL`. Aggregates are `count`, `collect`,
`min`, `max`, `sum`, and `avg`. Scalar functions include `elementId`, `size`,
`coalesce`, `nodes`, `relationships`, `length`, `startNode`, `endNode`,
`annotations`, `originId`, and the `toInteger`/`toFloat`/`toBoolean`/`toString`
conversions.
The `all(item IN list WHERE predicate)` and
`any(item IN list WHERE predicate)` functions evaluate list predicates. List
comprehensions use `[item IN list WHERE predicate | projection]`, with an
optional `WHERE` part.

```cypher
MATCH (service:Service)
WHERE service.context = $context
RETURN TABLE elementId(service) AS service,
             service.type AS type,
             service.technology AS technology
ORDER BY service
```

The CLI returns the versioned `aiq-table.v1` JSON envelope by default. `csv`
contains only the column header and rows; `text` is intended for reading in a
terminal. The web workspace and VS Code workbench show the same result as a
table in place of the diagram, with JSON and CSV downloads. Required user
parameters appear above the result when editing a saved `.aiq`. `$context` and
`$tab` continue to use the query scope selectors.

JSON preserves cell types and distinguishes null from an empty string. CSV
encodes null as an empty field and lists/records/paths as JSON text inside one
cell, so use JSON when that distinction matters. CSV uses CRLF records and
standard quote doubling, but it does not neutralize spreadsheet formulas.

```shell
archinsight query . -s models/storefront.ai -q reports/inventory.aiq --format json
archinsight query . -s models/storefront.ai -q reports/inventory.aiq --format csv --out inventory.csv
archinsight query . -q reports/path.aiq --param 'from="sales/api"' --param 'to="billing/api"'
archinsight query . -q reports/topics.aiq --params report-params.json
```

In VS Code, open a saved `.aiq` in the Archinsight editor and use the play
button or run **Archinsight: Run AIQ Query** from the Command Palette. Choose
`$tab` and `$context` with the inline controls embedded at their occurrences in
the query. Required user parameters appear above the result. The web editor
uses the same shared editor and controls. A table report replaces the diagram
area; it shows up to 100 rows per local page and can be downloaded using the
same JSON or CSV contract as the CLI. AIQ completion remains available while
the query is incomplete.

Parameter values are JSON null, boolean, finite number, string, or lists of
those values. `--param name=<json>` can be repeated. `--params` reads one JSON
object relative to the current working directory. Missing, unused, duplicated,
or attempts to set reserved `$context`/`$tab` parameters are errors.

Variable paths use relationship trails, so a single query-visible relationship
does not repeat within one path. Nodes may repeat. Enumerating paths must have
a finite maximum. An endpoint-only `RETURN TABLE DISTINCT` reachability query
and `shortestPath` may omit the maximum:

```cypher
MATCH (from:Element)
WHERE elementId(from) = $from
MATCH (from)-[:REFERENCES*1..]->(to:Element)
RETURN TABLE DISTINCT elementId(to) AS target
ORDER BY target
```

The endpoint-only form uses a visited traversal and does not enumerate alternate
routes. It may return either endpoint or both and may filter endpoint properties:

```cypher
MATCH (from:Element)
WHERE elementId(from) IN $from
MATCH (from)-[:REFERENCES*1..]->(to:Element)
WHERE elementId(to) IN $to
RETURN TABLE DISTINCT elementId(from) AS source,
                      elementId(to) AS target
ORDER BY source, target
```

It must not bind a path or relationship, return or aggregate path evidence, or
have another input clause after the unbounded match. Bind a named path and set a
finite maximum when route evidence is needed:

```cypher
MATCH (from:Element)
WHERE elementId(from) = $from
MATCH (to:Element)
WHERE elementId(to) = $to
MATCH p = shortestPath((from)-[:REFERENCES*1..]->(to))
RETURN TABLE elementId(from) AS source,
             elementId(to) AS target,
             length(p) AS hops,
             p.steps AS steps
```

Use `<-` for impact analysis when authored dependencies point from consumer to
provider. Each path step preserves the stored relationship direction. Derived
relationships can be included with `{withDerived}`, which changes the traversal
to the ownership rollup graph. Consecutive rollup hops can represent relations
of different children of the shared owner, so that path establishes aggregated
owner reachability rather than one continuous underlying dependency chain. Keep
the path selector-free for exact dependency and impact analysis. Projected
relationships are rejected for variable-length traversal because their
query-visible endpoints do not define one stable logical traversal graph.

## Solving common questions

The following recipes are starting points for people. Keep them in `reports/`;
use `views/` for graph-returning queries.

### Direct dependencies

Question: “Which elements does this service depend on?”

```cypher
MATCH (service:Service)-[dependency:REFERENCES]->(provider:Element)
WHERE elementId(service) = $service
RETURN TABLE DISTINCT elementId(provider) AS provider,
                      dependency.type AS relationshipType,
                      originId(dependency) AS origin
ORDER BY provider
```

Run with `--param 'service="context/service"'`. Parallel relationships remain
separate when their type or origin differs.

```shell
archinsight query . -q reports/direct-dependencies.aiq \
  --param 'service="shop/checkout"' --format text
```

A typical row contains `shop/catalog`, `SyncWire`, and the authored relationship
id. JSON is the best format when provenance will be processed by another tool.

### Change impact

Question: “What can be affected if B changes?”

```cypher
MATCH (changed:Element)
WHERE elementId(changed) = $element
MATCH p = (changed)<-[:REFERENCES*1..8]-(dependent:Element)
WHERE dependent <> changed
RETURN TABLE elementId(dependent) AS dependent,
             min(length(p)) AS distance,
             collect(p.steps) AS evidence
ORDER BY dependent
```

Run with `--param 'element="context/B"'`. The result is potential impact in the
declared model, not an outage probability or execution trace. Depth 8 is part of
the question; raise it deliberately if the architecture is deeper.

```shell
archinsight query . -q reports/impact.aiq \
  --param 'element="shop/catalog"' --format csv
```

For a direct checkout dependency, the first columns are
`shop/checkout,1`. Evidence remains a structured list in JSON and is encoded as
JSON text inside one CSV cell.

For immediate failure propagation, constrain the path relationship with
`{type: 'SyncWire'}`. Then the answer is whether a modeled synchronous path
exists against the dependency arrow. The generic query above answers broader
change impact and intentionally includes async dependencies.

When the changed anchor is a system and dependencies are authored against its
children, expand the system before traversing the direct relationship graph:

```cypher
MATCH (changed:System)
WHERE elementId(changed) = $system
MATCH (changed)-[:CONTAINS*0..8]->(provider:Element)
MATCH (provider)<-[:REFERENCES*1..]-(dependent:Element)
WHERE dependent <> provider
RETURN TABLE DISTINCT elementId(dependent) AS dependent
ORDER BY dependent
```

The containment bound states the ownership depth included in the question.
This form does not need `{withDerived}`: without a selector, `REFERENCES`
matches only direct, non-derived, non-projected relationships.

### Async topics and consumers

Question: “Which async topics exist, and who produces or consumes them?”

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

This form includes wires with no `technology` and no deployment block. Filter
`event.technology` only in a project that stores transport technology on the
logical wire. If Kafka is modeled on a broker, join that infrastructure through
`broker IN event.uses` only when the question is about the broker.

```shell
archinsight query . -c shop -q reports/async-topics.aiq --format json
```

For one checkout consumer, a row can contain `orders.created`, `shop/catalog`,
and `shop/checkout`. A topic with no modeled wire cannot be discovered.

For consumers of topics produced by any child of one system, roll the producer
endpoint up to its owner while keeping the consuming service or container:

```cypher
MATCH (producer:System)
WHERE elementId(producer) = $system
MATCH ROLLUP (consumer:ContainerElement)-[event:REFERENCES]->(producer)
WHERE event IS AsyncWire
UNWIND event.via AS topic
RETURN TABLE DISTINCT topic, elementId(consumer) AS consumer
ORDER BY topic, consumer
```

`ROLLUP` is the direct system-level pattern. A graph query using
`{withDerived}` can instead select authored relationships lifted to owners.

### No incoming dependencies

```cypher
MATCH (container:ContainerElement)
WHERE container.context = $context
OPTIONAL MATCH (container)<-[incoming:REFERENCES]-(consumer:Element)
WITH container, incoming
WHERE incoming IS NULL
RETURN TABLE elementId(container) AS container
ORDER BY container
```

An empty result is meaningful only after the context, candidate inventory, and
any qualified anchor id have been checked. An unknown id also produces no rows.

```shell
archinsight query . -c shop -q reports/no-incoming-dependencies.aiq --format text
```

The output is one service or container id per row. Swap the arrow to find
elements with no outgoing dependency instead.

### Counts by type

```cypher
MATCH (element:Element)
WHERE element.context = $context
RETURN TABLE element.type AS type, count(*) AS total
ORDER BY type
```

```shell
archinsight query . -c shop -q reports/type-summary.aiq --format csv
```

The table has `type,total`, for example `Service,12`. Counts describe the
selected semantic graph and can include derived query-visible objects only when
the query asks for them.

### Paths, alternatives, and cycles

Use the shortest-path report when one explanation is enough:

```shell
archinsight query . -q reports/shortest-path.aiq \
  --param 'from="shop/checkout"' --param 'to="shop/catalog"' --format json
```

The result includes source, target, hop count, nodes, and ordered steps. Replace
`shortestPath((from)-[:REFERENCES*1..]->(to))` with a finite pattern such as
`(from)-[:REFERENCES*1..8]->(to)` to enumerate alternatives. A cycle query binds
the same element at both endpoints and uses a minimum of 1. Both operations use
relationship trails, so a relationship cannot repeat within one returned path;
always state the maximum depth when interpreting alternatives or cycles.

### Annotations

Annotations are ordinary typed data rather than a special report mode:

```cypher
MATCH (element:Element)
WHERE element.context = $context
UNWIND annotations(element) AS annotation
RETURN TABLE elementId(element) AS element,
             annotation.name AS annotation,
             annotation.value AS value
ORDER BY element, annotation
```

Save this as `reports/annotations.aiq` and run
`archinsight query . -c shop -q reports/annotations.aiq --format json`.
Elements without annotations produce no rows; keep JSON when annotation values
or source metadata need to retain their types.

AIQ completion in the web and native VS Code editors suggests clauses, aliases,
model types and attributes, functions, selectors, and parameters even while a
query is incomplete.

## Saved queries and custom views

Create a file with the `.aiq` extension to keep a reusable query with the
project. Put graph-returning views under `views/` and table reports under
`reports/`:

```text
views/
    dependencies.aiq
    external-integrations.aiq
reports/
    dependency-inventory.aiq
```

These directories are a purpose-based project convention, not part of query identity. The web
workspace discovers query files recursively and identifies each query only by
its filename without `.aiq`. `views/dependencies.aiq` therefore creates the
custom view `dependencies`. Names and the `.aiq` extension are case-sensitive.
Files may live elsewhere when the project has a different convention.

Names that do not belong to a built-in view appear in the **Custom view**
selector. Select the view to run it for a model tab, or open the `.aiq` file to
edit the query and choose its preview scope. A descriptive lowercase name such
as `dependencies.aiq` or `async-flows.aiq` is preferable to a generic name such
as `query.aiq`.

In the web editor, create a tab, switch its document type to **Query**, and save
it as `views/<name>.aiq`. The file appears in the project tree and custom-view
selector after it is saved.

### Override a built-in view

The following filenames are reserved and replace the query of the corresponding
built-in view throughout the project:

| Filename | View |
| --- | --- |
| `no-filter.aiq` | All / No filter |
| `c1.aiq` | C1 |
| `c2.aiq` | C2 |
| `c3.aiq` | C3 |
| `c4.aiq` | C4 |
| `deployment-system.aiq` | D1 |
| `deployment-container.aiq` | D2 |
| `deployment.aiq` | Legacy Deployment |

An override retains its built-in boundary, grouping/materialization, deployment,
and environment pipeline. It replaces the query text, not the complete view
configuration. For example, `views/c2.aiq` changes what the C2 button selects
while retaining C2 boundary handling. Start from the current built-in source,
change the smallest necessary predicate or grouping clause, and keep the
reserved filename:

```shell
mkdir -p views
cp <skill-path>/examples/builtin-views/c2.aiq views/c2.aiq
```

Other names, such as `views/impact.aiq`, execute as custom views without a
built-in pipeline. Display labels and aliases such as `D1` and `default` are not
reserved filenames.

Two files with the same query name, even in different directories, produce a
conflict when that view is used. Archinsight does not pick a file by directory
or traversal order. Renaming or deleting a reserved query restores the built-in
query; a selected custom view whose file is missing reports an error.

Open a query from the project tree or use **Open query file** on a view that
uses one. In the main `.aiq` editor, `$tab` and `$context` have noneditable inline
selectors for the preview source and context. Click a selector to search its
choices, or use **Choose query source or context** in Monaco's command palette
(Ctrl/Cmd+Alt+Enter at the variable). Arrow keys navigate the choices, Enter
selects, and Escape closes the list. Variables in comments and string literals
have no selector.

Opening a query from a model tab initially uses that model as its preview
source. Choosing a source infers its context. Choosing a different context
clears an incompatible source selection; a query that also uses `$tab` then
requires a source. All occurrences of each variable share the same selection.
Preview choices are saved in workspace state and are not inserted into `.aiq`
text. The query editor panel on `.ai` tabs keeps deriving scope from its own
model tab and has no inline selectors.

Query edits affect every tab using that query, including edits not yet saved.
The active preview updates after a short typing delay; other affected diagrams
are invalidated and rebuilt when opened, each with its own model scope. Editing
query text directly in an `.ai` tab's query panel creates that tab's local
customization, as before. Selecting a view again restores the file-backed or
built-in query.

Query discovery skips hidden directories and the `node_modules`, `build`, and
`dist` directories. Bundled examples under generated `.claude/skills/` and
`.codex/skills/` packages therefore do not become project queries or built-in
overrides.

### Run a saved query from the CLI

The CLI does not discover project query files or override built-in views by
filename. Pass the file explicitly with `--query` / `-q`; relative paths are
resolved from the project directory:

```shell
archinsight query . -s models/storefront.ai -q views/dependencies.aiq --format json
archinsight render . -s models/storefront.ai -q views/dependencies.aiq --format svg --out dependencies.svg
```

Use `--source` when the query contains `$tab`. That source also supplies
`$context`. A query that needs `$context` but not `$tab` can instead use an
explicit context:

```shell
archinsight query . -c ecommerce -q views/external-integrations.aiq --format json
```

`--query` and `--view` are mutually exclusive, so pass one or the other. In
particular, `archinsight query ... -v c2` runs the built-in query bundled with
that CLI version; it does not look for `views/c2.aiq`. Running
`-q views/c2.aiq` executes the file as a standalone query and does not attach
the C2 post-selection pipeline. The web workspace does attach that pipeline
when the same filename overrides its C2 button, so pipeline-sensitive output
such as folded boundary endpoints can differ.

Inspect JSON before rendering and commit reusable `.aiq` files with the model.
Renaming a custom query changes its view name. Renaming or deleting a reserved
override restores the built-in query in the web workspace.

## Built-in scope variables

Query text is reusable because the caller supplies a scope separately. Built-in variables expose the relevant parts of that scope to `WHERE` expressions and pattern properties.

### `$context`

`$context` contains the context or environment identifier declared by the
selected source. A context-wide CLI query without a source can set the same
variable explicitly with `--context`. It is commonly compared with the
`context` property of an element:

```cypher
MATCH (element:Element)
WHERE element.context = $context
RETURN element
```

The same query can be evaluated for several sources or explicit contexts
without rewriting the query text.

### `$tab`

`$tab` is the second built-in query variable. It represents the selected model source (the model tab, or the source chosen for an `.aiq` preview):

```cypher
MATCH (element:Element)
WHERE element.sourceIdentity = $tab
RETURN element
```

Its scope is wider than the text written in that tab. The query includes the complete part of the model whose root object is declared there. When that object is expanded with `extend` in other files, those additions belong to the same scope as well.

This makes `$tab` useful for views centered on one source file: the query can select the whole model fragment introduced by the tab, including its nested content and later extensions.

## Node labels and properties

A node pattern can bind any node:

```cypher
MATCH (node)
RETURN node
```

Adding a label restricts the candidates:

```cypher
MATCH (service:Service)
RETURN service
```

Element type labels include inherited Insight types. The general `Element`, `Context`, `SourceIdentity`, and `Type` labels select the corresponding semantic node kinds. Type-definition nodes use only the `Type` label; inspect their `type` and `baseTypes` properties when querying the type hierarchy.

Element nodes expose these built-in properties:

| Property | Value |
| --- | --- |
| `id` | The local element identifier inside its context. |
| `context` | The owning context or environment identifier. |
| `sourceIdentity` | The semantic source contribution associated with the declaration. |
| `type` | The concrete resolved Insight type. |
| `constructor` | The constructor used to create the element. |
| `baseType` | The nearest base type. |
| `baseTypes` | The complete ordered list of base types. |
| `parent` | The containing element or context as a graph node value. |
| `deployed` | `true` when the element's deployment resolves to at least one `runsOn` or `uses` infrastructure object; otherwise `false`. |

Declared Insight attributes are also available as properties. A scalar attribute evaluates to one value, a list attribute evaluates to a list, and a single typed reference evaluates to the referenced graph node.

Context nodes expose `id`, `context`, `type`, `sourceIdentity`, and their declared attributes. Source nodes expose `id`, `sourceIdentity`, `source`, and the `SourceIdentity` type. Type nodes expose `id`, `type`, `baseType`, and `baseTypes`.

Properties can be placed in a node pattern:

```cypher
MATCH (service:Service {id: 'catalog', context: $context})
RETURN service
```

They can also be tested in `WHERE`, which is more convenient for compound conditions.

## Relationship properties and selectors

A relationship alias exposes these built-in properties:

| Property | Value |
| --- | --- |
| `type` | The concrete edge type or structural relationship kind. |
| `operator` | The Insight operator that created an architecture edge. |
| `sourceIdentity` | The source contribution that owns the relationship. |
| `context` | The context associated with the authored edge. |
| `derived` | Whether the relation was rolled up from lower-level endpoints. |
| `projected` | Whether deployment projection produced the edge. |
| `projectionRoot` | The infrastructure element whose projection produced a projected edge. |

Attributes declared on an Insight edge type are available in the same way as element attributes.

The arrow controls how a relationship is matched. A directed pattern matches its stored source on the left and its stored target on the right:

```cypher
MATCH (caller:Service)-[dependency:REFERENCES]->(callee:Service)
RETURN caller, dependency, callee
```

The reverse form places the target first and selects incoming relationships:

```cypher
MATCH (service:Service {id: 'checkout_api'})<-[dependency:REFERENCES]-(caller:Element)
RETURN service, dependency, caller
```

An undirected pattern finds relationships touching either side:

```cypher
MATCH (service:Service {id: 'checkout_api'})
OPTIONAL MATCH (service)-[dependency:REFERENCES]-(related:Element)
RETURN service, dependency, related
```

For an authored relationship `caller -> callee`, `(caller)-[dependency]->(callee)` and `(callee)<-[dependency]-(caller)` select the same edge. The undirected form can begin with either endpoint. All three forms keep the relationship as `caller -> callee` in query JSON and rendering. Pattern syntax controls matching and never rewrites the architecture relationship. Self-references are returned once, and parallel authored relationships remain separate.

Ordinary relationship patterns select direct, non-derived, non-projected relationships. Exact and inclusive edge selectors are written inside the relationship property block:

```cypher
OPTIONAL MATCH (system)-[dependency:REFERENCES {derived}]->(target:SystemElement)
OPTIONAL MATCH (service)-[path:REFERENCES {projected}]->(infrastructure:DeploymentElement)
OPTIONAL MATCH (system)-[neighborhood:REFERENCES {withDerived}]-(related:SystemElement)
```

| Selector | Relationships matched |
| --- | --- |
| no selector | Direct, non-projected relationships |
| `{derived}` | Derived, non-projected relationships only |
| `{projected}` | Direct projected relationships only |
| `{derived, projected}` | Derived projected relationships only |
| `{withDerived}` | Direct and derived relationships, excluding projected relationships |
| `{withProjected}` | Direct authored and direct projected relationships, excluding derived relationships |
| `{withDerived, withProjected}` | Every derivation and projection category |

Derivation and projection are independent dimensions. `withDerived` broadens only derivation, while `withProjected` broadens only projection. Exact selectors remain useful when a clause must return one category. Selector names without `:` are distinct from property comparisons such as `{context: $context}`.

## Writing queries step by step

### 1. Select elements in a context

Start with one node alias, one type, and the selected context:

```cypher
MATCH (element:Element)
WHERE element.context = $context
RETURN element
```

This establishes the element scope. A node-only query also includes direct authored relationships whose endpoints are both selected. It is useful for checking scope before adding relationship patterns that select or filter edges explicitly.

### 2. Select one architectural level

Replace `Element` with a concrete or abstract framework type:

```cypher
MATCH (system:SystemElement)
WHERE system.context = $context
RETURN system
```

Because labels are inheritance-aware, the result includes actors, systems, and their external variants.

### 3. Filter by properties

Model attributes participate in expressions:

```cypher
MATCH (service:Service)
WHERE service.context = $context
  AND service.technology CONTAINS 'Kotlin'
RETURN service
```

String literals use single quotes. `CONTAINS` performs substring matching for scalar text and exact membership matching for list values. Both forms are case-sensitive, so `'Kotlin'` and `'kotlin'` are different values.

Properties on two bound aliases can be compared directly:

```cypher
MATCH (source:Element)-[dependency:REFERENCES]->(target:Element)
WHERE source.runsOn <> target.runsOn
RETURN source, dependency, target
```

Scalar references compare by qualified element id. List-valued properties
compare as complete ordered lists. When either property is absent, both `=` and
`<>` evaluate to false for that row. Ordered comparisons `<`, `<=`, `>`, and
`>=` accept two numbers or two strings. Use `all(item IN list WHERE predicate)`
and `any(item IN list WHERE predicate)` for list predicates. A list
comprehension such as `[item IN source.uses WHERE item IN target.uses | item]`
can select an intersection without post-processing query JSON.

Type predicates use the effective inheritance tree:

```cypher
MATCH (node:Element)
WHERE node IS ContainerElement
  AND node IS NOT External
RETURN node
```

They also apply to relationships in both graph and table queries, including
project-defined operator descendants:

```cypher
MATCH (consumer:Element)-[event:REFERENCES]->(producer:Element)
WHERE event IS AsyncWire
RETURN consumer, event, producer
```

`External` is a built-in semantic predicate based on the element's resolved model kind. It matches declarations created with `external actor` or `external system`. Relative externality in a built-in C1-C4 view is carried separately by the resulting render graph and does not change this predicate in custom queries.

A custom CLI query uses its own selection and grouping rules. Select it with
`--query` instead of `--view`; the two options are mutually exclusive. Built-in
boundary handling is not applied after the custom query:

```shell
archinsight query . -s storefront.ai -q views/dependencies.aiq --format json
```

The CLI obtains `$context` from `storefront.ai` and supplies `$tab` from the same
source. The query still evaluates `IS External` against the explicit model
marker. To customize C2 while retaining its boundary folding and relative
externality, override the web view with `views/c2.aiq`. A standalone CLI query
can reuse the built-in query's selection and grouping clauses, but it does not
run the C2 post-selection pipeline.

### 4. Follow outgoing relationships

A complete pattern binds the source, edge, and target:

```cypher
MATCH (service:Service)-[dependency:REFERENCES]->(target:Element)
WHERE service.context = $context
RETURN service, dependency, target
```

The arrow follows the direction established by the Insight operator. Returning the relationship also returns its endpoints to the render graph.

Incoming relationships can be expressed directly with a reverse arrow:

```cypher
MATCH (service:Service)<-[dependency:REFERENCES]-(caller:Element)
WHERE service.context = $context
RETURN service, dependency, caller
```

This selects the same stored edge as
`(caller)-[dependency:REFERENCES]->(service)`. Choose the orientation that keeps
the element being investigated at the natural starting point of the pattern.

### 5. Preserve nodes without relationships

A required relationship match removes source nodes that have no matching edge. `OPTIONAL MATCH` keeps the previous row when the optional pattern has no result:

```cypher
MATCH (service:Service)
WHERE service.sourceIdentity = $tab
OPTIONAL MATCH (service)-[dependency:REFERENCES]->(target:Element)
RETURN service, dependency, target
```

This is the common shape for a diagram that must include isolated services as well as their dependencies.

A `WHERE` following an optional clause filters that optional pattern. It does not remove the already selected base node when the optional relationship is absent.

Returning a relationship alias makes that match authoritative for the edge set. If its predicate matches no relationships, the result contains no edges; the engine does not replace the empty selection with authored relationships between the remaining nodes.

### 6. Select a semantic source slice

Source-scoped views use the `sourceIdentity` property and `$tab` variable:

```cypher
MATCH (container:ContainerElement)
WHERE container.sourceIdentity = $tab
OPTIONAL MATCH (container)-[dependency:REFERENCES]->(target:Element)
RETURN container, dependency, target
```

This pattern is useful when one source is the readable entry point for a system and the view should include the subtree contributed or extended by that source.

### 7. Match referenced attributes

`IN` tests whether a node occurs in a list-valued reference attribute. Both `uses` and the resolved `runsOn` value can contain several infrastructure objects:

```cypher
MATCH (node:Element)
WHERE node.sourceIdentity = $tab
OPTIONAL MATCH (infrastructure:InfrastructureComponent)
WHERE infrastructure IN node.uses OR infrastructure IN node.runsOn
RETURN node, infrastructure
```

Equality works for a single typed reference:

```cypher
MATCH (component:ComponentElement)
WHERE component.sourceIdentity = $tab
OPTIONAL MATCH (container:ContainerElement)
WHERE container = component.parent
RETURN component, container
```

These patterns select nodes connected through typed model attributes even when the attribute itself is not represented as an authored `REFERENCES` edge.

Attribute cardinality comes from the Insight type system and linked reference metadata. `Wire.uses` is a declared list; infrastructure `runsOn` is a declared scalar reference. On systems and containers, `runsOn` and `uses` are computed deployment results, not declared source attributes. A single resolved reference is the real typed graph node and can be compared with a bound node or tested against a qualified id:

```cypher
WHERE node.uses IN ['eu/vault']
WHERE node.runsOn IN ['eu/cluster']
```

`node.runsOn CONTAINS 'eu/cluster'` does not match a scalar reference because that value is neither scalar text nor a list. For several resolved targets, bind an infrastructure node and use `candidate IN node.runsOn` or `candidate IN node.uses`; these forms also work with a single target. Use `CONTAINS` for declared lists such as `Wire.uses`. Query JSON represents attribute values as arrays for a stable transport shape, but this does not change their language-level cardinality. Automated consumers can inspect `listAttributes` and `referenceAttributes` on linked elements and edges.

### 8. Include derived and projected paths

Lower-level relationships can be viewed at a broader ownership level with `ROLLUP`:

```cypher
MATCH (system:SystemElement)
WHERE system.context = $context
OPTIONAL MATCH ROLLUP (system)-[dependency:REFERENCES]-(related:SystemElement)
RETURN system, dependency, related
```

Rollup walks the containment ancestry of the original endpoints and binds the nearest nodes compatible with the requested pattern. With an undirected pattern it can begin from either endpoint, but the rolled relationship keeps the stored source-to-target direction. The outer endpoints show the nodes chosen for this view, while the nested edge retains the original endpoints and category.

For a projected physical path, projection-origin metadata can let a clause anchored to a logical endpoint discover all path segments that belong to its wire. Each returned segment still keeps its actual physical source and target. This allows an incoming path such as `customer → CDN → load balancer → service` to be selected from `service` without rewriting the intermediate hops into invented direct connections.

Deployment views select projected relationships explicitly:

```cypher
MATCH (node:Element)
WHERE node.sourceIdentity = $tab
OPTIONAL MATCH (node)-[path:REFERENCES {projected}]->(target:DeploymentElement)
RETURN node, path, target
```

Inclusive selectors can combine categories in one clause when they have the same view semantics. Deployment queries may still use separate clauses because logical wires, placement relationships, and physical path segments play different roles.

The built-in D1 and D2 views apply deployment detail after this source-scoped selection. `deployment-system` folds logical endpoints to their owning systems. `deployment-container` accepts an environment through query scope and retains only that environment's placement and infrastructure, plus closed logical endpoints needed by cross-environment relationships. The CLI supplies this scope with `--environment <id>`; it is separate from predicates written into the query text.

### 9. Group the result

`GROUP BY` turns a property into render-graph ownership:

```cypher
MATCH (container:ContainerElement)
WHERE container.sourceIdentity = $tab
OPTIONAL MATCH (container)-[dependency:REFERENCES]->(target:Element)
MATCH (boundaryContainer:ContainerElement)
WHERE boundaryContainer = container OR boundaryContainer = target
GROUP BY boundaryContainer.parent
RETURN boundaryContainer, dependency, target
```

The final match identifies the selected container and any related container as boundary members. Grouping by `parent` places same-system members inside their owning system without adding unrelated siblings to the diagram. A scalar property creates a labeled group, while a typed reference property groups elements under the referenced element. List-valued grouping is supported for typed reference attributes and can place an element into each referenced group.

Grouping affects only the render graph. It does not change containment or ownership in the linked architecture model.

## Inspecting query JSON

The CLI can return the selected render graph directly:

```shell
archinsight query . -s <source.ai> -v deployment-system --format json
archinsight query . -s <source.ai> -v deployment-container --environment <environment> --format json
archinsight query . -s <source.ai> -q views/<name>.aiq --format json
```

For source-scoped commands, the selected file supplies both `$tab` and its
declared `$context`. A context-wide C1 or `no-filter` query may instead use
`--context <id>` without a source. If both options are supplied, they must
identify the same context.

Use the legacy `deployment` view only when the analysis intentionally needs the
complete container-level graph across all relevant environments.

The response contains `context`, an `elements` map keyed by query-visible qualified id, an `edges` array, render `groups`, and `externalElements`. In built-in C1-C4 views, `externalElements` includes both explicitly external declarations and endpoints outside the boundaries opened by that view. A closed endpoint is folded to the system at C2, the container or service at C3, and the component at C4. Each selected edge keeps its query category and two endpoint pairs:

- outer `source` and `target` are the endpoints that the selected graph will draw after query rollup and grouping;
- outer `derived` and `projected` identify the relationship category matched by the query;
- nested `edge.source` and `edge.target` are the endpoints of the underlying linked or projected edge;
- nested `edge.originSource` and `edge.originTarget`, when present, identify the logical origin selected for this occurrence of a projected segment;
- nested `edge.projectionOrigins`, when present, lists every logical source and target that shares the physical segment;
- nested `edge.projectionRoot` identifies the infrastructure element whose projection produced the segment;
- nested `edge.sourcePlacement` and `edge.targetPlacement`, when present, identify the concrete placement of each logical endpoint independently.

For a normal physical deployment segment, the outer and nested endpoints agree until query rollup or multi-placement grouping selects a view-specific endpoint. A grouped occurrence has an id such as `shop/backend@@eu/kubernetes`, while its nested linked edge retains the logical id and records the corresponding placement. Projection origin metadata lets a query discover all segments belonging to a logical wire. A segment shared by several logical consumers remains one physical relationship; the metadata does not turn it into direct connections between the logical endpoints.

Query JSON is the semantic artifact to inspect before rendering. If an unexpected edge already appears there, investigate the query, its `ROLLUP` clauses, selectors, and projection origin. If the JSON is correct but the image is not, the remaining problem belongs to rendering or layout.

### Diagnosing missing or unexpected content

For missing content, confirm the selected context and source, inspect the declaration through `archinsight structure`, and then compare the narrow view with the nearest broader query. Check `$tab`, type predicates, `deployed`, and relationship selectors before changing the model.

For unexpected content, find the returned edge in JSON and compare its outer endpoints, nested linked endpoints, projection origin, and `projected` flag. Run the built-in query unchanged when a custom query is involved. If the built-in query also returns an invalid edge, reduce it to the responsible match clause and treat the result as a query/runtime problem. Deleting or duplicating model declarations is not a valid way to compensate for an incorrect view.

## Reading a complete query

A practical view usually begins with required nodes, adds optional relationships, groups the selected elements, and returns every alias that should become visible:

```cypher
MATCH (container:ContainerElement)
WHERE container.sourceIdentity = $tab
OPTIONAL MATCH (container)-[containerLink:REFERENCES {withDerived}]-(related:Element)
WHERE related IS ContainerElement OR related IS SystemElement
MATCH (boundaryContainer:ContainerElement)
WHERE boundaryContainer = container OR boundaryContainer = related
GROUP BY boundaryContainer.parent
RETURN boundaryContainer, containerLink, related
```

The first clause defines the center of the view. The optional clause adds its relationship neighborhood, while the final match identifies which returned containers belong inside system boundaries. `GROUP BY` describes those visual boundaries, and `RETURN` determines which bound nodes and edges enter the render graph.

When a query becomes difficult to understand, preserve this progression. Establish the base scope first, add one relationship family at a time, and return aliases only after their role in the view is clear. The resulting text remains an architectural explanation rather than a collection of incidental graph filters.
