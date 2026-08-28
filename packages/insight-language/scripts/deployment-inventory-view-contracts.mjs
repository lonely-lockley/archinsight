import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  selectGraph,
} from "../build/runtime/index.js";

const deploymentQuery = readFileSync(
  new URL("../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/deployment.aiq", import.meta.url),
  "utf8",
);
const definitions = buildLanguageSnapshotResultFromSources([
  source("framework.ai", `
define type AppEnvironment of Environment
    Compute compute
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

    observability:
        monitoring metrics
            name = Metrics
            runsOn:
                kubernetes
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
    uses observability

system platform
    name = Platform

    service backend
        name = Backend
        deployment:
            uses production_service
`),
  ],
});
assertNoErrors(result.diagnostics);

const graph = selectGraph(result, { context: "eu", tab: "infrastructure.ai" }, deploymentQuery);
assert(graph.elements["eu/kubernetes"], "the inventory view must include concrete compute");
assert(graph.elements["eu/metrics"], "the inventory view must include concrete supporting infrastructure");
assert(graph.elements["eu/grafana"], "the inventory view must expand infrastructure projections");
assert.equal(graph.elements["eu/production"], undefined, "a Deployment is an inventory owner, not a rendered node");
assert.equal(
  graph.edges.some((edge) => edge.source === "eu/production" || edge.target === "eu/production"),
  false,
  "rendered edges must not roll up to a Deployment owner",
);
assert.equal(
  graph.edges.filter((edge) => edge.source === "eu/metrics" && edge.target === "eu/grafana").length,
  1,
  "the inventory view must retain the concrete projected segment",
);

console.log("deployment inventory view contracts passed");

function assertNoErrors(diagnostics) {
  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"),
    [],
  );
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
