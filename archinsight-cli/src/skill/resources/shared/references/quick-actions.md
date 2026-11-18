# Deterministic Diagram Quick Actions

Use CLI quick actions for one-off next-level, neighborhood, deployment, path, and source
lookup requests, including requests to export those results as subdiagrams.
They call the same semantic selectors as the diagram UI and do not require a
temporary `.aiq` filter.

## Choosing and delivering a result

1. Resolve canonical element ids with `archinsight structure . --format json`
   or an existing query result. Do not guess ids from diagram titles.
2. Use the quick action when its fixed semantics answer the request. Use a
   custom AIQ view only when the user needs additional predicates,
   aggregation, a table, an open-ended traversal, or a reusable project view.
3. Match the requested output format directly. When the user asks for a file,
   pass `--out <path>` and return that artifact; do not paste binary output or
   substitute a screenshot.
4. Report the selected element, direction, view, and environment when those
   choices affect interpretation. Treat `pathFound: false` as a valid result,
   not a command failure.

## Drill Down

Open the next logical C-level below an architecture boundary and retain its
rolled-up crossing relationships:

```shell
archinsight quick-action drill-down . --element <canonical-id> --format json
```

Use Drill down to move exactly one level, such as C1 to C2 or C2 to C3,
without creating a temporary query. Deeper descendants remain folded. Opposite
endpoints are one-hop context and remain closed boundary cubes; unrelated model
content and physical deployment descendants are omitted.

## Isolate

Return one directed hop around an element:

```shell
archinsight quick-action isolate . --element <canonical-id> --format json
```

Add `--view c1|c2|c3|c4|no-filter` and the corresponding `--source` or
`--context` when the result must use a specific built-in scale. Without a
view, Isolate uses the direct linked logical graph.

## Deployment

Return the focus occurrences, their direct physical neighbors, and retained
`runsOn`/placement ownership groups:

```shell
archinsight quick-action deployment . --element <canonical-id> --environment <id> --format json
```

The environment is optional when exactly one D2 slice contains the selected
element or one of its direct physical relationships. If several slices are
relevant, the command fails with their ids instead of choosing one
arbitrarily. Relevance is not the same as the element's execution placement:
a cross-environment relationship can make the slice on either side relevant.

## Find Path

Return the union of all directed routes from source to target:

```shell
archinsight quick-action find-path . --from <source-id> --to <target-id> --format json
```

Without `--view`, Find Path uses authored logical relationships only. Add a
built-in `--view` plus its scope options to preserve a particular C/D scale.
Use `--environment <id>` to select the source element's physical occurrence
when it is deployed to more than one environment. Physical traversal uses the
all-environment deployment graph, so a route can cross environment boundaries.
In the diagram UI, the source and target occurrences retain the environments
in which the user selected them.

A successful response with `pathFound: false` contains the two endpoints and
no edge.

In JSON, graph relationships are wrapper objects under `.graph.edges[]`:

```json
{
  "source": "commerce/api@@eu/k8s",
  "target": "commerce/database@@eu/postgres",
  "derived": false,
  "projected": true,
  "edge": {
    "source": "commerce/api",
    "target": "commerce/database",
    "sourcePlacement": "eu/k8s",
    "targetPlacement": "eu/postgres"
  }
}
```

Treat outer `source` and `target` occurrence ids as opaque diagram identities.
Whether they contain `@@<placement>` can change when another element gains an
additional placement. Read the concrete endpoint placements from nested
`edge.sourcePlacement` and `edge.targetPlacement`; use the nested logical
endpoints or the quick-action `source`/`target` metadata for canonical ids.

Source and target order is semantic. `--from A --to B` traverses only edges
directed from A toward B. A path from B to A does not satisfy that request, and
`pathFound: false` for A to B does not establish that B cannot reach A. Do not
swap the endpoints or combine both directions unless the user asks for it.
Run the reverse request explicitly:

```shell
archinsight quick-action find-path . --from <target-id> --to <source-id> --format json
```

## Declaration

Resolve the authored location of one element:

```shell
archinsight quick-action declaration . --element <canonical-id> --format json
```

The command fails if the id is unknown or has no source declaration.
Graphical formats produce a one-element subdiagram; JSON also includes the
authored source coordinates.

## Output

JSON is the default and uses schema `diagram-quick-action.v1`. Every action
also supports `--format text|dot|svg|png`. Use `--out <file>` for images and
other saved artifacts:

```shell
archinsight quick-action find-path . \
  --from commerce/customer --to commerce/payment_api \
  --format png --out payment-path.png
```

PNG export rasterizes the same deterministic graph as JSON/SVG and enforces
dimension, pixel-count, and output-size limits.

The ordinary `archinsight render` command uses the same
`text|json|dot|svg|png` diagram formats for built-in views and custom
graph-returning `.aiq` views. Use it when the requested diagram is not one of
the five fixed quick-action slices.

Use custom AIQ only when the question needs predicates, aggregation, a table,
more than one hop without a fixed target, or a reusable project-owned view.
