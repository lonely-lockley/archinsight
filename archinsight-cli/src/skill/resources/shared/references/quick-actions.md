# Deterministic Diagram Quick Actions

Use CLI quick actions for one-off neighborhood, deployment, path, and source
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

The environment is optional when exactly one is relevant. If several are
available, the command fails with their ids instead of choosing one
arbitrarily.

## Find Path

Return the union of all directed routes from source to target:

```shell
archinsight quick-action find-path . --from <source-id> --to <target-id> --format json
```

Add a built-in `--view` plus its scope options to preserve a particular C/D
scale. Use `--environment <id>` to constrain a physical path to one deployment
environment. A successful response with `pathFound: false` contains the two
endpoints and no edge.

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
the four fixed quick-action slices.

Use custom AIQ only when the question needs predicates, aggregation, a table,
more than one hop without a fixed target, or a reusable project-owned view.
