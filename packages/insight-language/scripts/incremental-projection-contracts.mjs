import assert from "node:assert/strict";
import { ProjectAnalysisSession } from "../build/runtime/index.js";

const initialSources = [
  source("definitions.ai", `
define type AppEnvironment of Environment
    Compute compute
    Monitoring observability

define type Monitoring of InfrastructureComponent
    constructor metrics
    required InfrastructureComponent display
`),
  source("eu.ai", environment(true)),
  source("model.ai", `
context app

deploymentProfile application_profile
    appliesTo:
        production from eu
    runsOn compute
    uses observability

system platform
    name = Platform

    service backend
        name = Backend
        deployment:
            uses application_profile
`),
];

const session = ProjectAnalysisSession.create(initialSources);
assertNoErrors(session.analysis().diagnostics);
assert.equal(projectedDisplayEdges(session.analysis().result), 1);

const editedSources = initialSources.map((item) =>
  item.sourceName === "eu.ai" ? source("eu.ai", environment(false)) : item
);
const incremental = session.update(editedSources);
const clean = ProjectAnalysisSession.create(editedSources).analysis();

assert.equal(incremental.mode, "incremental");
assert.equal(incremental.reparsedSourceCount, 1);
assert(incremental.supportSources.has("model.ai"),
  "projection changes must invalidate sources whose derived graph uses the environment rule");
assert.equal(projectedDisplayEdges(incremental.result), 0);
assert.deepEqual(resultSignature(incremental.result), resultSignature(clean.result));

console.log("incremental projection contracts passed");

function environment(withProjection) {
  return `
environment eu
    name = EU

deployment production
    compute:
        compute compute
            name = Kubernetes

    observability:
        metrics observability
            name = Metrics
            runsOn:
                compute
            display:
                infrastructureComponent grafana
                    name = Grafana
${withProjection ? `            projection:
                target $this connectTo target display
` : ""}`;
}

function projectedDisplayEdges(result) {
  return result.edges.filter((edge) => edge.projected === true
    && edge.source === "eu/observability"
    && edge.target === "eu/grafana").length;
}

function resultSignature(result) {
  const byJson = (left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right));
  return {
    diagnostics: [...result.diagnostics].sort(byJson),
    contexts: [...result.contexts].sort(byJson),
    elements: [...result.elements].sort(byJson),
    imports: [...result.imports].sort(byJson),
    edges: [...result.edges].sort(byJson),
    tabRoots: result.tabRoots,
    graphNodes: [...result.graph.nodes()].sort(byJson),
    graphRelations: [...result.graph.relations()].sort(byJson),
  };
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"),
    [],
  );
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
