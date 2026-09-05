# Validation and Inspection

Run validation after every Insight edit:

```shell
archinsight --version
archinsight link . --format text
```

The text output is TSV:

```text
level<TAB>code<TAB>source<TAB>line<TAB>column<TAB>message
```

Treat `ERROR` as blocking. `WARNING` and `NOTE` can still be useful design
feedback.

A successful link proves that sources parse, types and imports resolve, and
linker constraints hold. It does not prove that a built-in or custom view
selects the intended semantic graph.

Inspect project structure:

```shell
archinsight structure . --format text
archinsight structure . --format json
```

Inspect the selected graph before rendering whenever a change affects C2, C3,
C4, Deployment, projections, or query text:

```shell
archinsight query . -s <source.ai> -v c2 --format json
archinsight query . -s <source.ai> -v c3 --format json
archinsight query . -s <source.ai> -v c4 --format json
archinsight query . -s <source.ai> -v deployment-system --format json
archinsight query . -s <source.ai> -v deployment-container --environment <environment> --format json
```

Then render the same source and view; the source carries the same context:

```shell
archinsight render . -s <source.ai> -v c1 -f svg -o diagram.svg
archinsight render . -s <source.ai> -v c2 -f svg -o diagram.svg
archinsight render . -s <source.ai> -v c3 -f svg -o diagram.svg
archinsight render . -s <source.ai> -v c4 -f svg -o diagram.svg
archinsight render . -s <source.ai> -v deployment-system -f svg -o deployment-system.svg
archinsight render . -s <source.ai> -v deployment-container --environment <environment> -f svg -o deployment-container.svg
```

Run a custom query from a file:

```shell
archinsight query . -s <source.ai> -q query.aiq -f text
archinsight query . -s <source.ai> -q query.aiq -f json
archinsight render . -s <source.ai> -q query.aiq -f svg -o diagram.svg
```

Use three validation layers:

1. `link` for syntax, types, imports, and project diagnostics.
2. `query --format json` for the exact semantic elements, edges, endpoints,
   origins, and groups selected by the view.
3. `render` for presentation, Graphviz layout, labels, and styling.

When JSON already contains an unexpected edge, investigate query matching,
`ROLLUP`, selectors, and projection origin before editing the model. When JSON
is correct but SVG is not, investigate rendering or layout. Do not use a clean
link or a plausible image as a substitute for semantic query inspection.

Useful built-in views:

- `c1` for system context.
- `c2` for containers/services in the selected source.
- `c3` for components in the selected source.
- `c4` for project-defined code elements in the selected source.
- `deployment-system` for the D1 system deployment overview across relevant
  environments.
- `deployment-container --environment <id>` for D2 physical detail in one
  environment.
- `deployment` only when an all-environment container graph is intentionally
  required for backward compatibility or analysis.
- `no-filter` for the full context.

C2, C3, C4, Deployment, and custom queries that use `$tab` depend on the
active file. Pass `--source <file>` / `-s <file>`; the CLI will not guess
between several project files. That source also supplies `$context`.

The bundled `examples` directory contains several independent model projects,
not one project to link as a whole. Validate `layered-architecture.ai`, the C1,
C2, and C3 files individually. Validate `c4-code` as its own directory. Validate
the three `deployment*.ai` files together, and validate
`deployment-private-gateway` as its own directory.

If the CLI is missing, do not silently install it. Ask the user to install or
expose `@archinsight/cli`.
