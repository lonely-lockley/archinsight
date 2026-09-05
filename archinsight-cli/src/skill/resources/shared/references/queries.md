# Insight Query Reference

Insight diagram queries use a small Cypher-style subset evaluated in memory.
Use queries to select which linked model elements and relationships appear in a
diagram.

## CLI Shape

```shell
archinsight query . -s <source.ai> -q query.aiq -f text
archinsight query . -s <source.ai> -v deployment-system --format json
archinsight query . -s <source.ai> -v deployment-container --environment <environment> --format json
archinsight render . -s <source.ai> -q query.aiq -f svg -o diagram.svg
```

The scope variables are:

- `$context` - context declared by `--source`, or the explicit
  `--context` used for context-wide execution without a source.
- `$tab` - the semantic model fragment rooted in the source selected by
  `--source` / `--tab`. It includes content contributed to those roots by
  `extend` in other files.

Pass `--source` when a query uses `$tab`. A selected source also supplies
`$context`, so do not repeat its context on the command line.

Path handling:

- `--source` / `-s` is a source name inside the project and is resolved
  relative to `project-dir`.
- `--query` / `-q` is also resolved relative to `project-dir` when it is a
  relative path.

Prefer paths relative to the project root:

```shell
archinsight query path/to/project -s models/storefront.ai -q queries/c2.aiq -f text
```

## Query Shape

Supported clauses:

```cypher
MATCH ...
OPTIONAL MATCH ...
WHERE ...
GROUP BY ...
RETURN ...
```

`MATCH` clauses come first. `GROUP BY` is optional and appears before
`RETURN`. `RETURN` must list the aliases that should be rendered.

## Node Patterns

Select all nodes:

```cypher
MATCH (element)
WHERE element.context = $context
RETURN element
```

Select by type label:

```cypher
MATCH (service:Service)
WHERE service.context = $context
RETURN service
```

Labels are case-sensitive and match Insight types such as `System`,
`Container`, `Service`, `Component`, `CodeElement`, `ExternalSystem`,
and `DeploymentElement`.

Use properties in patterns for exact matches:

```cypher
MATCH (service:Service {id: 'checkout_api', context: $context})
RETURN service
```

## Relationships

Select real relationships:

```cypher
MATCH (source)-[link]->(target)
WHERE source.context = $context
RETURN source, link, target
```

Use a reverse pattern for incoming-only relationships:

```cypher
MATCH (service:Service {id: 'checkout_api'})<-[link:REFERENCES]-(caller:Element)
RETURN service, link, caller
```

Use an undirected pattern to inspect the complete neighborhood of a bound
element:

```cypher
MATCH (service:Service {id: 'checkout_api'})
OPTIONAL MATCH (service)-[link:REFERENCES]-(related:Element)
RETURN service, link, related
```

Use `->` for outgoing-only questions, `<-` for incoming-only questions, and
`-` for a complete neighborhood. These patterns change matching orientation
without reversing the stored edge: outer query endpoints, nested linked
endpoints, and rendering retain the authored or projected source-to-target
direction. A self-reference appears once, while parallel authored
relationships remain distinct.

Use `OPTIONAL MATCH` when nodes should still appear even if a relationship is
missing:

```cypher
MATCH (container:ContainerElement)
WHERE container.sourceIdentity = $tab
OPTIONAL MATCH (container)-[link]->(target)
RETURN container, link, target
```

Return relationship aliases when the query must select or filter exact edges. A
node-only query completes direct authored relationships between selected nodes.
Once a returned relationship alias is present, its result is authoritative: if
the relationship predicate matches nothing, no fallback edges are added.

## Filtering

Supported filters include:

```cypher
WHERE node.context = $context
WHERE node.sourceIdentity = $tab
WHERE node.deployed = true
WHERE node IS External
WHERE NOT node IS DeploymentElement
WHERE edge.projected = 'true'
WHERE edge.projectionRoot = 'eu/service_network'
WHERE node.id IN ['api', 'web_app']
WHERE node.technology CONTAINS 'PostgreSQL'
WHERE node.type <> 'Context'
WHERE node.context = $context AND NOT node IS External
```

Use single quotes for string literals.

`CONTAINS` is case-sensitive. For scalar text it performs substring matching;
for a list property it tests membership. Match the stored spelling exactly.

Attribute cardinality comes from the Insight type system, not from the JSON
representation. Use `CONTAINS` for list-valued attributes such as `uses`.
`runsOn` is declared as a scalar typed reference. When it has one resolved
target, it resolves to one graph node: compare it with another bound node, or
test its qualified id with `node.runsOn IN ['eu/cluster']`.
`node.runsOn CONTAINS 'eu/cluster'` does not match a scalar reference because
that value is neither scalar text nor a list.

A logical element materialized through several deployments can have several
resolved `runsOn` targets. In that case bind a candidate infrastructure node
and use `candidate IN node.runsOn`.

Query JSON serializes attribute values as arrays for a stable transport shape.
The linked element or edge also exposes `listAttributes` and
`referenceAttributes`; use that metadata when an automated analysis needs to
recover the language-level cardinality and reference kind.

Properties of two bound aliases can be compared directly:

```cypher
WHERE source.runsOn = target.runsOn
WHERE source.runsOn <> target.runsOn
```

Scalar references compare by qualified id and lists compare as complete ordered
lists. If either property is absent, both comparisons evaluate to false. Set
intersection and overlap tests are not supported; post-process query JSON for
those operations.

`node.deployed` is true when an element's deployment resolves to at least one
`runsOn` or `uses` infrastructure object. The built-in Deployment view uses it to keep
undeployed logical elements out of the physical diagram.

`edge.projectionRoot` is available on projected relationships and identifies
the infrastructure element whose projection produced the selected segment.
It can be used in relationship predicates and has the same value shown in
`query --format json` output. Resolved `node.runsOn` can contain several
concrete infrastructure objects, so use `candidate IN node.runsOn` when
matching placement targets.

## Relationship Selectors

Relationship selectors are boolean flags inside relationship braces:

```cypher
OPTIONAL MATCH (node)-[derivedLink {derived}]->(target)
OPTIONAL MATCH (node)-[projectedLink {projected}]->(target)
OPTIONAL MATCH (node)-[neighborhood {withDerived}]-(target)
OPTIONAL MATCH ROLLUP (node)-[rollupLink {derived}]->(target)
```

Exact selectors keep one relationship category:

- no selector: direct, non-projected relationships;
- `{derived}`: derived, non-projected relationships;
- `{projected}`: direct projected relationships;
- `{derived, projected}`: derived projected relationships.

Inclusive selectors broaden one independent dimension:

- `{withDerived}` includes direct and derived relationships while retaining
  the default exclusion of projected relationships;
- `{withProjected}` includes direct authored and direct projected relationships while
  retaining the default exclusion of derived relationships;
- `{withDerived, withProjected}` includes all four categories.

Use an inclusive selector when the categories have the same meaning in the
view. Keep separate Deployment clauses when logical wires, placements, and
physical path segments need different predicates.

`ROLLUP` is an operation on the match, not another selector. It walks
containment ancestry and binds the nearest endpoint compatible with the node
pattern. A component relationship can therefore be viewed between its
containers or systems without adding another wire to the model. The
relationship alias retains the underlying linked edge while its outer query
`source` and `target` describe the endpoints selected for this view.
Reverse and undirected `MATCH ROLLUP` patterns change which endpoint is bound
first while preserving the stored source-to-target direction.

For a projected physical path, `ROLLUP` can also use `originSource` and
`originTarget` to discover path segments belonging to a logical wire. The
built-in Deployment query uses this to include an incoming path such as
`customer -> CDN -> load balancer -> service` while keeping every segment's
real physical endpoints. A shared physical segment may carry several logical
origins and remains selectable from each of their source views.

Do not infer the model solely from a rolled-up arrow. Inspect query JSON to
distinguish selected/rendered endpoints from the underlying edge and its
logical projection origin.

## Query JSON

`archinsight query --format json` returns the semantic render graph selected
by the query. Use it as the machine-readable check before interpreting an SVG.
The top-level shape is:

- `context`: selected context id;
- `elements`: a map keyed by query-visible, context-qualified element id;
- `edges`: selected relationships;
- `groups`: render groups created by `GROUP BY`;
- `externalElements`: selected ids drawn outside the internal boundary.

Elements expose their linked `attributes`, optional `listAttributes` and
`referenceAttributes` metadata, and any `annotations`. Relationship data is
nested under each result item's `edge` field and carries the same attribute
metadata plus edge annotations. Annotations can be inspected in JSON but cannot
currently be referenced by a `WHERE` predicate.

For built-in C1-C4 execution, this list combines explicit model externality
with externality relative to the opened diagram boundaries. C2 folds a closed
endpoint to its system, C3 to its container or service, and C4 to its component.
`IS External` in a custom query continues to match only the explicit model
marker.

A custom query file supplies its own selection and grouping contract and
overrides `--view`. To customize C1-C4 boundary behavior, copy the nearest
bundled built-in `.aiq` file and modify its predicates or grouping explicitly.

Each edge contains its selected category and two endpoint pairs:

- outer `source` and `target` are the endpoints that the selected graph will
  draw after rollup and grouping;
- outer `derived` and `projected` preserve the category matched by the query;
- nested `edge.source` and `edge.target` are the endpoints of the underlying
  linked or projected edge;
- nested `edge.originSource` and `edge.originTarget`, when present, identify
  the logical origin selected for this occurrence of a projected segment;
- nested `edge.projectionOrigins`, when present, lists every logical source and
  target that shares the physical segment;
- nested `edge.projectionRoot` identifies the infrastructure element whose
  projection produced the segment;
- nested `edge.sourcePlacement` and `edge.targetPlacement`, when present,
  identify the concrete placement of each logical endpoint independently.

An abridged response remains ordinary JSON:

```json
{
  "context": "shop",
  "elements": {
    "shop/customer": { "id": "shop/customer", "type": "ExternalActor" },
    "eu/cloudfront": { "id": "eu/cloudfront", "type": "InfrastructureComponent" }
  },
  "edges": [
    {
      "source": "shop/customer",
      "target": "eu/cloudfront",
      "derived": false,
      "projected": true,
      "edge": {
        "source": "shop/customer",
        "target": "eu/cloudfront",
        "originSource": "shop/customer",
        "originTarget": "shop/web_app",
        "projected": true
      }
    }
  ],
  "groups": [],
  "externalElements": ["shop/customer"]
}
```

For an unrolled physical deployment segment, the outer and nested endpoints should
normally agree. A deliberate ownership rollup may make them differ. An edge is
unexpected only after its outer endpoints, underlying edge, projection origin,
and query clause have all been checked.

## Grouping

`GROUP BY` controls diagram clusters. A C2 view groups the selected container
and related containers by parent without adding unrelated siblings:

```cypher
MATCH (container:ContainerElement)
WHERE container.sourceIdentity = $tab
OPTIONAL MATCH (container)-[link:REFERENCES {withDerived}]-(related)
MATCH (boundaryContainer:ContainerElement)
WHERE boundaryContainer = container OR boundaryContainer = related
GROUP BY boundaryContainer.parent
RETURN boundaryContainer, link, related
```

For deployment views, grouping by a typed reference attribute is valid:

```cypher
MATCH (node:Element)
WHERE node.sourceIdentity = $tab
OPTIONAL MATCH ROLLUP (node)-[projectedLink:REFERENCES {projected}]-(related)
GROUP BY node.runsOn
RETURN node, projectedLink, related
```

Do not rely on implicit Graphviz clustering. Put grouping in the query when the
diagram needs stable layout.

## Built-In View Patterns

Exact built-in query sources are bundled in:

```text
examples/builtin-views/no-filter.aiq
examples/builtin-views/c1.aiq
examples/builtin-views/c2.aiq
examples/builtin-views/c3.aiq
examples/builtin-views/c4.aiq
examples/builtin-views/deployment-system.aiq
examples/builtin-views/deployment-container.aiq
examples/builtin-views/deployment.aiq
```

C1 selects systems in the selected context and uses one undirected inclusive
neighborhood for direct and derived system-level relationships.

C2 opens every system rooted in `$tab`, selects its `ContainerElement` nodes,
and folds relationships leaving that set to closed systems.

C3 opens every container rooted in `$tab`, selects its components, and folds
relationships leaving that set to closed containers or services.

C4 opens every component rooted in `$tab`, selects direct Code-element
neighborhoods in either direction, and folds outside code to closed components.
Concrete code types and containment remain project-defined.

D1 and D2 select physically deployed logical nodes and source-owned system
endpoints from `$tab`, use one undirected `OPTIONAL MATCH ROLLUP` for projected
paths, and keep placement lookup separate from relationship matching. When the
source owns no deployed elements, environment discovery falls back to
infrastructure used by its authored wires. D1 folds logical nodes to systems.
D1 then contracts internal infrastructure paths and groups the remaining systems
and external integrations by environment. D2 applies the structured environment
scope after discovery and retains its physical detail. The legacy Deployment
query retains all relevant environments.

When a built-in view is close but hides the wrong thing, read
`references/query-recipes.md`, copy the nearest built-in `.aiq`, and change
the filter or grouping deliberately.

## Authoring Rules

- Start from the view question: context, containers, components, or deployment.
- Use domain variable names: `system`, `container`, `component`, `externalSystem`.
- Return every node and relationship alias needed for rendering.
- Add `GROUP BY` deliberately for diagrams with clusters.
- Validate query files with `archinsight query` before rendering.
- Keep custom queries in `.aiq` files when they are reused.
