# Custom Views and Saved Queries

An agent may create project-owned `.aiq` files when a reusable architectural
question or diagram view is part of the task. Put graph-returning queries and
reserved web-view overrides under `views/`. Put reusable `RETURN TABLE` reports
under `reports/`. Both use the same AIQ runtime; this is a purpose-based project
convention. Unless the user specifies another path, use:

```text
views/
    dependencies.aiq
    async-flows.aiq
reports/
    dependency-inventory.aiq
```

Create the needed directory when it does not exist. Use a short descriptive
lowercase filename. Before writing, search the whole project for `.aiq` files
and compare their basenames, because directories do not namespace query names.

## Choose a Custom Name or an Override

Use a descriptive new name when the user needs an additional view. In the web
workspace, `views/dependencies.aiq` appears as `dependencies` in the **Custom
view** selector and runs without a built-in view pipeline.

Use a reserved filename only when the task intentionally changes a standard
view for the whole project:

| Filename | Web view |
| --- | --- |
| `no-filter.aiq` | All / No filter |
| `c1.aiq` | C1 |
| `c2.aiq` | C2 |
| `c3.aiq` | C3 |
| `c4.aiq` | C4 |
| `deployment-system.aiq` | D1 |
| `deployment-container.aiq` | D2 |
| `deployment.aiq` | Legacy Deployment |

For an override, copy the exact current source from
`examples/builtin-views/<name>.aiq` to `views/<name>.aiq`, then make the
smallest requested change. Do not reconstruct a built-in query from memory.
The web workspace replaces the query text while retaining that view's boundary,
deployment, environment, and other post-selection stages.

Do not use a reserved name merely because the new query resembles C2 or D1.
Use it only when pressing that standard view button should run the new query.
Renaming or deleting the file restores the built-in query. Two `.aiq` files
with the same basename conflict even when they are in different directories;
never create a duplicate and never rely on directory order for precedence.

## Scope in the Web Editor

Open an `.aiq` file in the main editor to preview it. `$tab` and `$context`
have inline selectors there. The selected values belong to editor state and are
not written into the query. Every occurrence of the same variable shares one
selection.

Changing a query invalidates every open tab that uses it. A model tab keeps its
own source and context; the query panel shown on a model file receives that
scope automatically and does not show inline selectors.

## Run the Query with the CLI

The CLI does not discover project `.aiq` files by name. Always pass a custom or
overriding file explicitly with `--query` / `-q`:

```shell
archinsight query . -s models/storefront.ai -q views/dependencies.aiq --format json
archinsight render . -s models/storefront.ai -q views/dependencies.aiq --format svg --out dependencies.svg
```

Relative `--query` paths are resolved from the project directory. Use
`--source` when the query contains `$tab`; it also supplies `$context`. When a
query uses `$context` without `$tab`, a context-wide run may use:

```shell
archinsight query . -c ecommerce -q views/external-integrations.aiq --format json
```

`--query` takes precedence over `--view`; pass only one. `-v c2` runs the
built-in C2 query bundled in the CLI and does not discover `views/c2.aiq`.
Conversely, `-q views/c2.aiq` runs the file as a standalone query without C2's
post-selection pipeline. The web override retains that pipeline, so boundary
folding or other pipeline-sensitive output can differ between these two calls.

## Agent Workflow

1. Read `references/queries.md` and inspect the existing model and `.aiq`
   basenames.
2. Decide whether the request needs a table report, an additional named graph
   view, or an intentional project-wide override.
3. Write table reports to `reports/<descriptive-name>.aiq` and graph queries to
   `views/<descriptive-name>.aiq`. For an override, copy the corresponding
   bundled built-in query first.
4. Run `archinsight link . --format text` to ensure the model still links.
5. Run the exact query with
   `archinsight query ... -q views/<name>.aiq --format json` and inspect
   elements, edges, groups, and external endpoints.
6. Render the same file only after the JSON matches the intended scope.
7. Keep the `.aiq` file in the project when the report or view is reusable. For
   a one-off read-only investigation, use a temporary file when the user did not
   ask to preserve it.

Do not change correct model declarations merely to make a custom view easier to
write. Query selection owns analytical and presentation scope; the model owns
architectural facts.
