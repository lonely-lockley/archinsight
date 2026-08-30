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
    InfrastructureComponent provider
    Compute compute
    Storage storage
    Monitoring observability

define type Monitoring of InfrastructureComponent
    constructor monitoring
    required InfrastructureComponent display
    required InfrastructureComponent telemetry
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
    provider:
        infrastructureComponent cloud
            name = Cloud provider

    compute:
        compute kubernetes
            name = Kubernetes
            runsOn:
                cloud

    storage:
        storage database
            name = Database
            runsOn:
                cloud
            projection:
                source $from originalLink target $this

    observability:
        monitoring metrics
            name = Metrics
            runsOn:
                kubernetes
            display:
                infrastructureComponent grafana
                    name = Grafana
            telemetry:
                infrastructureComponent otel
                    name = OpenTelemetry
            projection:
                target $this connectTo target display
                target $this connectTo target telemetry
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
assert.equal(graph.elements["eu/kubernetes"], undefined, "D1 must hide internal compute infrastructure");
assert.equal(graph.elements["eu/database"], undefined, "D1 must hide internal storage infrastructure");
assert.equal(graph.elements["eu/metrics"], undefined, "D1 must hide internal observability infrastructure");
assert(graph.elements["eu/grafana"], "D1 must retain external infrastructure integrations");
assert(graph.elements["eu/otel"], "D1 must retain every branch of an external infrastructure integration");
assert(
  graph.edges.some((edge) => edge.source === "app/platform" && edge.target === "eu/grafana"),
  "D1 must contract an internal infrastructure path into the external integration",
);
assert(
  graph.edges.some((edge) => edge.source === "app/platform" && edge.target === "eu/otel"),
  "D1 must preserve branching external integrations while contracting their common internal source",
);
assert.equal(
  graph.edges.some((edge) => edge.target === "eu/database"),
  false,
  "D1 must drop paths that terminate at internal infrastructure",
);
assert.deepEqual(graph.groups, [{ owner: "eu/eu", elements: ["app/platform", "eu/grafana", "eu/otel"] }]);
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
