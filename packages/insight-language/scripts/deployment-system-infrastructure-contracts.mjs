import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  selectGraph,
} from "../build/runtime/index.js";

const query = readFileSync(
  new URL("../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/deployment-system.aiq", import.meta.url),
  "utf8",
);
const definitions = buildLanguageSnapshotResultFromSources([
  source("framework.ai", `
define type AppEnvironment of Environment
    Compute compute
    Storage storage
    Monitoring observability

define type Monitoring of InfrastructureComponent
    constructor monitoring
    required InfrastructureComponent display
`),
], [coreLanguageSnapshot]);
assertNoErrors(definitions.diagnostics);

const result = linkProject({
  snapshot: definitions.snapshot,
  sources: [
    source("infrastructure.ai", `
environment eu
    name = Europe

deployment production
    compute:
        compute kubernetes
            name = Kubernetes

    storage:
        storage database
            name = Database
            projection:
                source $from originalLink target $this

    observability:
        monitoring metrics
            name = Metrics
            display:
                infrastructureComponent grafana
                    name = Grafana
            projection:
                target $this connectTo target display
`),
    source("application.ai", `
context app

deploymentProfile production_service
    appliesTo:
        production from eu
    runsOn compute
    uses storage
    uses observability

system platform
    name = Platform

    service frontend
        name = Frontend
        deployment:
            uses production_service
        links:
            -> backend

    service backend
        name = Backend
        deployment:
            uses production_service
`),
  ],
});
assertNoErrors(result.diagnostics);

const graph = selectGraph(result, { context: "app", tab: "application.ai", view: "deployment-system" }, query);

assert(graph.elements["app/platform"], "D1 must fold deployed services to their system");
assert.equal(graph.elements["app/frontend"], undefined);
assert.equal(graph.elements["app/backend"], undefined);
assert(graph.elements["eu/database"], "D1 must retain storage used by the system");
assert(graph.elements["eu/metrics"], "D1 must retain the observability entry point");
assert(graph.elements["eu/grafana"], "D1 must retain infrastructure reached by a self-projection");
assert(
  graph.edges.some((edge) => edge.source === "app/platform" && edge.target === "eu/database"),
  "D1 must retain the system-to-storage projection",
);
assert(
  graph.edges.some((edge) => edge.source === "eu/metrics" && edge.target === "eu/grafana"),
  "D1 must retain the observability projection",
);
assert.equal(
  graph.edges.some((edge) => edge.source === "app/platform" && edge.target === "app/platform"),
  false,
  "a dependency internal to the system must not become a self-edge",
);

console.log("deployment system infrastructure contracts passed");

function assertNoErrors(diagnostics) {
  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"),
    [],
  );
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
