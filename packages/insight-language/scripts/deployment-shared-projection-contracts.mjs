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
    Monitoring audit

define type Monitoring of InfrastructureComponent
    constructor metrics
    required InfrastructureComponent display
`),
], [coreLanguageSnapshot]);
assertNoErrors(definitions.diagnostics);

for (const serviceOrder of [
  ["frontend", "backend"],
  ["backend", "frontend"],
]) {
  const result = linkedProject(serviceOrder);
  const sharedEdges = result.edges.filter((edge) => edge.projected === true
    && edge.source === "eu/observability"
    && edge.target === "eu/grafana");
  assert.equal(sharedEdges.length, 1, "the linker must keep one shared physical edge");
  assert.deepEqual(
    new Set(sharedEdges[0].projectionOrigins?.map((origin) => `${origin.source}->${origin.target}`)),
    new Set(["app/frontend->app/frontend", "app/backend->app/backend"]),
    "the shared physical edge must retain every logical consumer",
  );
  for (const tab of ["frontend_components.ai", "backend_components.ai"]) {
    const graph = selectGraph(result, { context: "app", tab }, deploymentQuery);
    const projectedSegments = graph.edges.filter((edge) => edge.source === "eu/observability"
      && edge.target === "eu/grafana");
    assert.equal(projectedSegments.length, 1, `${tab} must expand shared observability`);
    const expectedConsumer = `app/${tab.slice(0, -"_components.ai".length)}`;
    assert.equal(projectedSegments[0].edge.originSource, expectedConsumer, `${tab} must select its own projection origin`);
    assert.equal(projectedSegments[0].edge.originTarget, expectedConsumer, `${tab} must select its own projection origin`);
    assert(graph.elements["eu/grafana"], `${tab} must include the shared observability display`);
    assert.equal(graph.elements["eu/audit"], undefined, `${tab} must not include unrelated infrastructure`);
    assert.equal(graph.elements["eu/audit_ui"], undefined, `${tab} must not include unrelated projected infrastructure`);
  }

  const complete = selectGraph(result, { context: "app", tab: "model.ai" }, deploymentQuery);
  assert.equal(
    countEdges(complete, "eu/observability", "eu/grafana"),
    1,
    "a shared physical edge must render once when several consumers are visible",
  );
}

console.log("deployment shared projection contracts passed");

function linkedProject(serviceOrder) {
  const serviceDeclarations = serviceOrder.map((id) => `
    service ${id}
        name = ${id}
        deployment:
            uses application_profile
`).join("\n");
  const sources = [
    source("eu.ai", `
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
            projection:
                target $this connectTo target display

    audit:
        metrics audit
            name = Audit
            runsOn:
                compute
            display:
                infrastructureComponent audit_ui
                    name = Audit UI
            projection:
                target $this connectTo target display
`),
    source("model.ai", `
context app

deploymentProfile application_profile
    appliesTo:
        production from eu
    runsOn compute
    uses observability

deploymentProfile audit_profile
    appliesTo:
        production from eu
    runsOn compute
    uses audit

system platform
    name = Platform
${serviceDeclarations}
    service auditor
        name = Auditor
        deployment:
            uses audit_profile
`),
    source("frontend_components.ai", `
context app

extend service frontend
    component ui
        name = UI
`),
    source("backend_components.ai", `
context app

extend service backend
    component api
        name = API
`),
  ];
  const result = linkProject({ snapshot: definitions.snapshot, sources });
  assertNoErrors(result.diagnostics);
  return result;
}

function countEdges(graph, sourceId, targetId) {
  return graph.edges.filter((edge) => edge.source === sourceId && edge.target === targetId).length;
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
