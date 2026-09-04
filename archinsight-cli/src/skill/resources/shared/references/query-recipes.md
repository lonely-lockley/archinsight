# Query Recipes and Built-In View Customization

Use this reference when a built-in C1, C2, C3, C4, or Deployment view is close but not quite right:
an expected element is hidden, a relationship is missing, an unexpected edge
appears, infrastructure is too noisy, or the diagram needs a different scope.

## Start From Built-In Queries

The generated skill includes exact built-in view queries:

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

Before inventing a query from scratch, open the nearest built-in query, copy it
to the project, and make the smallest change.

Choose `deployment-system.aiq` for a D1 overview and
`deployment-container.aiq` for D2 detail in one environment. Start from the
legacy `deployment.aiq` only when the intended result is one container-level
graph across every relevant environment.

```shell
archinsight query . -s <source.ai> -q queries/custom.aiq -f text
archinsight query . -s <source.ai> -q queries/custom.aiq -f json
archinsight render . -s <source.ai> -q queries/custom.aiq -f svg -o custom.svg
```

Use `references/queries.md` for syntax details. Use this file for common
customization patterns.

## When To Customize

Write or adjust a `.aiq` query when:

- the built-in view hides a node or edge visible in the linked graph through a
  broader query;
- the built-in query returns a node or edge outside the intended view scope;
- the source/tab scope is right but the view intentionally filters out a type;
- Deployment should include actors, vendors, or a special deployment path;
- the diagram should show only one layer, one flow, or one relationship class;
- grouping needs to change, such as grouping by parent instead of `runsOn`.

Do not compensate for a view filter by duplicating model elements. First inspect
the built-in query and decide whether the model or the query owns the behavior.

## Graph Is Not The Picture

The linked model can have correct fan-in to one broker, gateway, load balancer,
producer, or shared runtime node. A crowded diagram means the current view is too
broad or not aggregated enough; it does not automatically mean the model is
wrong.

When the graph is right but the picture is noisy:

- narrow `-s <source.ai>` to the file that owns the view;
- copy the nearest `examples/builtin-views/*.aiq` query;
- filter to the layer, flow, or relationship class the user asked for;
- change `GROUP BY` to cluster by parent, runtime placement, or another useful
  attribute.

Do not duplicate infrastructure or invert dependencies only to make one render
look cleaner.

## Diagnose Missing Content

1. Validate the model:

```shell
archinsight link . --format text
```

2. Inspect declarations and source identities:

```shell
archinsight structure . --format text
```

3. Run the built-in query explicitly and inspect its JSON. Choose the command
   that matches the diagram being investigated:

```shell
archinsight query . -s <source.ai> -v deployment-system -f json
archinsight query . -s <source.ai> -v deployment-container --environment <environment> -f json
```

4. Check the query filters:

- `node.sourceIdentity = $tab` selects the semantic fragment rooted in the
  selected source, including contributions added to those roots through
  `extend` in other files.
- The built-in D1 and D2 node filters include deployment elements and logical
  container or external elements whose deployment resolves to physical
  infrastructure. External endpoints without their own placement still enter
  through projected paths attached to a deployed logical node.
- `{projected}` means only deployment-projected edges are selected.
- `{derived}` means only rolled-up relationships are selected.
- A relationship property such as `sourceIdentity: $tab` is available for a
  deliberately narrow custom view. The built-in D1 and D2 queries rely on the
  selected node scope and semantic tab closure instead of applying that filter
  to projected relationships.
- The built-in D1 and D2 views use one undirected `MATCH ROLLUP` for the
  projected neighborhood. Projection origin metadata lets that clause find
  ingress and egress segments while every segment preserves its real physical
  source and target.

## Diagnose Unexpected Content

Do not start by deleting model declarations when a view contains an unexpected
node or edge.

1. Run `archinsight link . --format text` to separate linker errors from view
   behavior.
2. Run the exact built-in or custom query with `--format json`.
3. Find the edge in `edges` and compare:
   - outer `source` / `target`, which are drawn by the selected graph;
   - nested `edge.source` / `edge.target`, which belong to the underlying
     linked or projected edge;
   - `edge.originSource` / `edge.originTarget`, which identify the logical
     origin selected for this occurrence;
   - `edge.projectionOrigins`, which reveals other logical consumers of a
     shared physical segment;
   - `edge.projected` and the clause that returned its alias.
4. Run the nearest built-in query unchanged. If only the custom query returns
   the edge, fix the custom query. If the built-in query returns it too, reduce
   the query to the responsible `MATCH` clause and report a query/runtime bug.
5. Render only after the JSON result is understood. If JSON is correct and SVG
   is not, investigate the renderer or layout instead of changing the model.

`ROLLUP` can intentionally select ancestor endpoints for an ownership-level
view. That is not a new model wire. A physical deployment segment, however, must retain
its actual physical endpoints; projection origin metadata is for discovery and
traceability, not for inventing a direct physical connection.

## Include Internal Actors In Deployment

The built-in Deployment views include external actors reached by a projected
physical path. If an all-environment deployment diagram also needs internal
actors, use the bundled, tested legacy-view customization:

```shell
archinsight query . -s <source.ai> -q examples/queries/deployment-internal-actors.aiq -f json
```

This query is generated from the exact legacy `deployment.aiq` source and
changes only the node, projected-target, and incoming-source predicates to admit
`Actor`. For a D1 or D2 customization, copy the corresponding
`deployment-system.aiq` or `deployment-container.aiq` source and apply the
same actor predicates there so its current scope and environment behavior remain
intact.

If the actor is declared in another source file, either render from that source
or relax the `node.sourceIdentity = $tab` condition intentionally.

## Show Only Async Flows

Use edge attributes when the question is about relationship kind:

```cypher
MATCH (source:Element)-[link]->(target:Element)
WHERE source.context = $context
  AND link.model = 'async'
GROUP BY source.parent
RETURN source, link, target
```

This is useful for event-stream, broker, queue, or notification diagrams. Add
`source.sourceIdentity = $tab` when the query should stay scoped to one file.

## Hide Deployment Infrastructure

When a deployment-oriented source file is too noisy and you only need logical containers
or services, select logical container elements and direct logical relationships:

```cypher
MATCH (node:ContainerElement)
WHERE node.sourceIdentity = $tab
OPTIONAL MATCH (node)-[link]->(target:ContainerElement)
GROUP BY node.parent
RETURN node, link, target
```

This is intentionally closer to C2 than the Deployment view. Use it when deployment annotations
exist in the file but the diagram question is still logical.

## Projected Edges Across Split Files

The current built-in D1 and D2 queries match `{projected}` edges without an
explicit `sourceIdentity: $tab` relationship filter. The query engine expands `$tab`
to the roots declared by the selected source and contributions made to those
roots through `extend`, so a normal multi-file split does not require a looser
edge selector.

If a project has a custom query copied from an older template, remove the edge
filter while keeping the node scope. Start again from the bundled current query
instead of preserving the rest of the older copy:

```text
copy examples/builtin-views/deployment-system.aiq for D1
or copy examples/builtin-views/deployment-container.aiq for D2
remove sourceIdentity: $tab only from the relationship selector if an old copy has it
keep node.sourceIdentity = $tab
```

Validate the result with `archinsight query ... --format json`. If a path is
still absent, check that its logical relationship contributes to a root selected
by the tab before changing the model or broadening the node scope.

## Change Grouping

Grouping controls visual clusters. If D1 or D2 grouping is not helpful, copy the
complete corresponding built-in query and change only its `GROUP BY` expression:

```cypher
GROUP BY node.parent
```

Use `GROUP BY node.runsOn` for deployment placement; use `GROUP BY node.parent`
for logical ownership. Preserve the rest of the selected D1 or D2 query so its
projected-neighborhood aliases and environment behavior remain unchanged.

## Working Rule

If a diagram looks wrong but `archinsight link` is clean, inspect the selected
source, built-in query, and returned aliases before changing the model. Many
display issues are query scope issues, not schema or linker bugs.
