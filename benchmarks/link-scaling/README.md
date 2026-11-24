# Link scaling benchmark

This benchmark models a company with 250 independently deployable business
services, 15 deployment environments, and bounded contexts containing 3–10
services. It measures cold project analysis and a subsequent one-file
incremental update from 10 through 250 services in increments of 10.

## Synthetic repository

The deterministic repository is generated under
[`generated/company-250`](generated/company-250). Its manifest records every
source and the service it belongs to, so each benchmark size selects a valid
prefix without including references to omitted services.

At full scale the repository contains:

- 250 business services in 39 bounded contexts;
- 15 concrete deployment environments;
- three containers and 24 C3 components per service;
- two deployment profiles per service, applied to all environments;
- synchronous and asynchronous relationships inside and across contexts;
- 1,016 Insight sources and 71,578 source lines;
- 7,590 linked elements and 10,204 final linked edges.

The generated repository is ignored by Git. Regenerate it with:

```shell
node benchmarks/link-scaling/generate-repository.mjs
```

The generator replaces only a directory containing its own matching manifest;
it refuses to overwrite an unrelated directory.

## Cold and incremental link experiment

Run three independent cold links at every +10 service point:

```shell
node benchmarks/link-scaling/run-benchmark.mjs --trials 3
```

Every trial runs in a fresh Node.js process. Sources are read before the timer.
The cold measurement covers four-worker parsing, source classification,
snapshot construction, linking, deployment expansion, projection, graph
inspection, and result materialization—not filesystem I/O or module startup.
The same session then edits one component file in the highest-numbered service
and measures its incremental update. The output records changed, reparsed,
relinked, and direct support source counts so a local edit cannot silently turn
back into a project-wide relink.

Use `--sequential` for a diagnostic comparison with the single-threaded parser.

Outputs are in [`results`](results): raw trials, CSV summary, SVG chart, and a
Markdown report. Regenerate the presentation files without rerunning the
experiment with:

```shell
node benchmarks/link-scaling/run-benchmark.mjs --render-only
```

## Phase experiment

The opt-in linker profiler records synchronous phase durations without changing
the default linker path. The phase experiment measures every +10 point once and
repeats the control points 10, 80, 140, 180, 210, 220, and 250 three times:

```shell
node benchmarks/link-scaling/run-phase-benchmark.mjs
```

Outputs are in [`phase-results`](phase-results). The primary chart shows total
time and logical-relationship materialization. The secondary chart separates
parsing, deployment, projection, and graph inspection. Re-render from the saved
raw events with:

```shell
node benchmarks/link-scaling/run-phase-benchmark.mjs --render-only
```

The measured timings are machine- and runtime-specific. The repository,
topology, raw trials, phase call counts, and scripts are retained so future
changes can be compared using the same workload.

## Incremental graph-change scenarios

The targeted incremental benchmark uses the full 250-service repository to
compare three one-file changes: relationship topology, an environment metadata
attribute, and an environment projection rule. It records the graph delta,
projected-edge count, invalidation scope, and per-phase timings:

```shell
node benchmarks/link-scaling/run-incremental-scenarios.mjs
```

Outputs are in [`incremental-results`](incremental-results): raw trials, CSV
summary, a logarithmic timing chart, and a Markdown report. Projection changes
are also checked by a deterministic incremental-versus-clean contract in the
language test suite.

## Repository verification

Run both experiments through the root verification task:

```shell
./gradlew benchmark
```

This task is required after changes to linking, deployment expansion,
projection, or incremental analysis. Run the before and after measurements on
the same host. It is intentionally separate from `./gradlew clean check`:
`check` contains deterministic performance contracts, while benchmark timings
are sensitive to host hardware and contention.

Historical measurements from before the repeated-graph-build optimization are
kept under [`before-results`](before-results) and
[`before-phase-results`](before-phase-results). The default runners write the
current measurements to `results` and `phase-results`.
