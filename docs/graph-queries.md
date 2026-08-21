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

Parentheses describe nodes, square brackets describe a directed relationship, names before `:` bind aliases, and names after `:` select labels or relationship kinds.

Archinsight queries are not fully compatible with Cypher. The current language supports:

- `MATCH` and `OPTIONAL MATCH` clauses;
- directed outgoing patterns written with `->`;
- node labels and relationship kinds;
- node and relationship property predicates;
- one `WHERE` expression attached to each match clause;
- `AND`, `OR`, `NOT`, and parentheses;
- `=`, `<>`, `CONTAINS`, `IN`, `IS`, and `IS NOT` predicates;
- list literals in expressions;
- architecture-specific `ROLLUP` matching;
- architecture-specific `derived` and `projected` relationship selectors;
- one `GROUP BY` expression;
- `RETURN` of bound aliases.

The current grammar has no mutation clauses, aggregation functions, variable-length paths, undirected relationships, reverse-arrow syntax, subqueries, ordering, pagination, or general Cypher expression language. `RETURN` selects previously bound aliases rather than computing arbitrary projections.

## Built-in scope variables

Query text is reusable because the caller supplies a scope separately. Built-in variables expose the relevant parts of that scope to `WHERE` expressions and pattern properties.

### `$context`

`$context` contains the selected context or environment identifier. It is commonly compared with the `context` property of an element:

```cypher
MATCH (element:Element)
WHERE element.context = $context
RETURN element
```

The same query can be evaluated for several contexts without rewriting the query text.

### `$tab`

`$tab` is the second built-in query variable. It represents the currently selected tab:

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

Type labels include inherited Insight types. The general `Element`, `Context`, `SourceIdentity`, and `Type` labels select the corresponding semantic node kinds.

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

Attributes declared on an Insight edge type are available in the same way as element attributes.

Ordinary relationship patterns select direct, non-derived, non-projected relationships. Derived and projected edges are opt-in selectors written inside the relationship property block:

```cypher
OPTIONAL MATCH (system)-[dependency:REFERENCES {derived}]->(target:SystemElement)
OPTIONAL MATCH (service)-[path:REFERENCES {projected}]->(infrastructure:DeploymentElement)
```

The selector form `{derived}` is distinct from a property comparison such as `{context: $context}`. Selectors ask for one category of generated relationship and exclude the ordinary category.

## Writing queries step by step

### 1. Select elements in a context

Start with one node alias, one type, and the selected context:

```cypher
MATCH (element:Element)
WHERE element.context = $context
RETURN element
```

This returns the element nodes and no architecture edges. It is useful for checking scope before adding relationship patterns.

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

Type predicates use the effective inheritance tree:

```cypher
MATCH (node:Element)
WHERE node IS ContainerElement
  AND node IS NOT External
RETURN node
```

`External` is a built-in semantic predicate based on the element's resolved external kind.

### 4. Follow outgoing relationships

A complete pattern binds the source, edge, and target:

```cypher
MATCH (service:Service)-[dependency:REFERENCES]->(target:Element)
WHERE service.context = $context
RETURN service, dependency, target
```

The arrow follows the direction established by the Insight operator. Returning the relationship also returns its endpoints to the render graph.

Incoming relationships are expressed by placing the potential source on the left:

```cypher
MATCH (caller:Element)-[dependency:REFERENCES]->(service:Service)
WHERE service.context = $context
RETURN caller, dependency, service
```

The current syntax always uses a left-to-right arrow, so reversing the aliases expresses the incoming question.

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

`IN` tests whether a node occurs in a list-valued reference attribute:

```cypher
MATCH (node:Element)
WHERE node.sourceIdentity = $tab
OPTIONAL MATCH (infrastructure:InfrastructureComponent)
WHERE infrastructure IN node.uses
RETURN node, infrastructure
```

Equality works for a single typed reference:

```cypher
MATCH (node:Element)
WHERE node.sourceIdentity = $tab
OPTIONAL MATCH (runtime:InfrastructureComponent)
WHERE runtime = node.runsOn
RETURN node, runtime
```

These patterns select nodes connected through typed model attributes even when the attribute itself is not represented as an authored `REFERENCES` edge.

### 8. Include derived and projected paths

Lower-level relationships can be viewed at a broader ownership level with `ROLLUP`:

```cypher
MATCH (system:SystemElement)
WHERE system.context = $context
OPTIONAL MATCH ROLLUP (system)-[dependency:REFERENCES {derived}]->(target:SystemElement)
RETURN system, dependency, target
```

Rollup walks the containment ancestry of the original endpoints and binds the nearest nodes compatible with the requested pattern. The resulting relationship is marked `derived`, while its underlying edge retains the original endpoints.

For a projected physical path, projection-origin metadata can let a clause anchored to a logical endpoint discover all path segments that belong to its wire. Each returned segment still keeps its actual physical source and target. This allows an incoming path such as `customer → CDN → load balancer → service` to be selected from `service` without rewriting the intermediate hops into invented direct connections.

Deployment views select projected relationships explicitly:

```cypher
MATCH (node:Element)
WHERE node.sourceIdentity = $tab
OPTIONAL MATCH (node)-[path:REFERENCES {projected}]->(target:DeploymentElement)
RETURN node, path, target
```

Derived and projected selectors can be combined in separate clauses when a view needs both ownership rollup and physical paths.

### 9. Group the result

`GROUP BY` turns a property into render-graph ownership:

```cypher
MATCH (container:ContainerElement)
WHERE container.sourceIdentity = $tab
OPTIONAL MATCH (container)-[dependency:REFERENCES]->(target:Element)
GROUP BY container.parent
RETURN container, dependency, target
```

Grouping by `parent` places containers under their owning systems. A scalar property creates a labeled group, while a typed reference property groups elements under the referenced element. List-valued grouping is supported for typed reference attributes and can place an element into each referenced group.

Grouping affects only the render graph. It does not change containment or ownership in the linked architecture model.

## Inspecting query JSON

The CLI can return the selected render graph directly:

```shell
archinsight query . -c <context> -s <source.ai> -v c4 --format json
archinsight query . -c <context> -s <source.ai> -q query.aiq --format json
```

The response contains `context`, an `elements` map keyed by query-visible qualified id, an `edges` array, render `groups`, and `externalElements`. Each selected edge has two endpoint pairs:

- outer `source` and `target` are the endpoints that the selected graph will draw after query rollup and grouping;
- nested `edge.source` and `edge.target` are the endpoints of the underlying linked or projected edge;
- nested `edge.originSource` and `edge.originTarget`, when present, identify the logical wire that produced a projected segment.

For a normal physical C4 segment, the outer and nested endpoints should agree. An ownership-level rollup can intentionally bind an ancestor and make them differ. Projection origin metadata lets a query discover all segments belonging to one logical wire; it does not turn those segments into direct connections between the logical endpoints.

Query JSON is the semantic artifact to inspect before rendering. If an unexpected edge already appears there, investigate the query, its `ROLLUP` clauses, selectors, and projection origin. If the JSON is correct but the image is not, the remaining problem belongs to rendering or layout.

### Diagnosing missing or unexpected content

For missing content, confirm the selected context and source, inspect the declaration through `archinsight structure`, and then compare the narrow view with the nearest broader query. Check `$tab`, type predicates, `deployed`, and relationship selectors before changing the model.

For unexpected content, find the returned edge in JSON and compare its outer endpoints, nested linked endpoints, projection origin, and `projected` flag. Run the built-in query unchanged when a custom query is involved. If the built-in query also returns an invalid edge, reduce it to the responsible match clause and treat the result as a query/runtime problem. Deleting or duplicating model declarations is not a valid way to compensate for an incorrect view.

## Reading a complete query

A practical view usually begins with required nodes, adds optional relationships, groups the selected elements, and returns every alias that should become visible:

```cypher
MATCH (container:ContainerElement)
WHERE container.sourceIdentity = $tab
OPTIONAL MATCH (container)-[internal:REFERENCES]->(target:ContainerElement)
OPTIONAL MATCH (container)-[external:REFERENCES]->(externalSystem:SystemElement)
WHERE externalSystem IS External
GROUP BY container.parent
RETURN container, internal, target, external, externalSystem
```

The first clause defines the stable center of the view. Each optional clause enriches those rows without removing containers that lack a particular relationship. `GROUP BY` describes the visual boundary, and `RETURN` determines which bound nodes and edges enter the render graph.

When a query becomes difficult to understand, preserve this progression. Establish the base scope first, add one relationship family at a time, and return aliases only after their role in the view is clear. The resulting text remains an architectural explanation rather than a collection of incidental graph filters.
