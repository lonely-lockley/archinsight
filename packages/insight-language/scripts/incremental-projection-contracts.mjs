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

keepsProjectedInfrastructureAfterInfrastructureEditAndUndo();
keepsProfileProjectionAfterLogicalEditAndUndo();

console.log("incremental projection contracts passed");

function keepsProjectedInfrastructureAfterInfrastructureEditAndUndo() {
  const initial = cacheRegressionSources(true);
  const session = ProjectAnalysisSession.restore(
    ProjectAnalysisSession.create(initial).portableSnapshot(),
  );
  const edited = replaceSourceText(initial, "infra/r1.ai", (text) =>
    text.replace("name = Vault", "name = Vault X")
  );

  const update = session.update(edited);
  assert.equal(update.mode, "incremental");
  assert.deepEqual(update.relinkedSources, new Set(["infra/r1.ai"]),
    "attribute-only infrastructure edits must preserve the one-source relink path");
  assert.deepEqual(resultSignature(update.result), resultSignature(ProjectAnalysisSession.create(edited).analysis().result));
  assert.deepEqual(projectedEdgePairs(update.result), [
    "r1/prom_r1 connectTo shop/api",
    "shop/api -> r1/vault_r1",
  ]);

  const undo = session.update(initial);
  assert.equal(undo.mode, "incremental");
  assert.deepEqual(resultSignature(undo.result), resultSignature(ProjectAnalysisSession.create(initial).analysis().result));
  assert.deepEqual(projectedEdgePairs(undo.result), [
    "r1/prom_r1 connectTo shop/api",
    "shop/api -> r1/vault_r1",
  ]);
}

function keepsProfileProjectionAfterLogicalEditAndUndo() {
  const initial = cacheRegressionSources(false);
  const session = ProjectAnalysisSession.restore(
    ProjectAnalysisSession.create(initial).portableSnapshot(),
  );
  const edited = replaceSourceText(initial, "shop.ai", (text) =>
    text.replace("name = API", "name = API X")
  );

  const update = session.update(edited);
  assert.equal(update.mode, "incremental");
  assert(update.supportSources.has("infra/r1.ai"), "profile-derived infrastructure must support logical relinking");
  assert.deepEqual(resultSignature(update.result), resultSignature(ProjectAnalysisSession.create(edited).analysis().result));
  assert.deepEqual(projectedEdgePairs(update.result), ["r1/prom_r1 connectTo shop/api"]);

  const undo = session.update(initial);
  assert.equal(undo.mode, "incremental");
  assert.deepEqual(resultSignature(undo.result), resultSignature(ProjectAnalysisSession.create(initial).analysis().result));
  assert.deepEqual(projectedEdgePairs(undo.result), ["r1/prom_r1 connectTo shop/api"]);
}

function cacheRegressionSources(withSecrets) {
  return [
    source("framework.ai", `
extend type Environment
    Compute compute
    SecretStore secrets
    Monitoring observability

define type SecretStore of InfrastructureComponent
    constructor secretStore

define type Monitoring of InfrastructureComponent
    constructor monitoring
`),
    source("infra/r1.ai", `
environment r1
    name = Region 1

deployment production
    compute:
        compute k8s_r1
            name = K8s r1
    secrets:
        secretStore vault_r1
            name = Vault
            runsOn:
                k8s_r1
            projection:
                $from originalLink $this
    observability:
        monitoring prom_r1
            name = Prometheus
            runsOn:
                k8s_r1
            projection:
                $this connectTo $from
`),
    source("shop.ai", `
context shop

deploymentProfile everywhere
    appliesTo:
        production from r1
    runsOn compute
    uses observability

system shop_sys
    name = Shop
    service api
        name = API
        deployment:
            uses everywhere
${withSecrets ? "            uses secrets\n" : ""}`),
  ];
}

function replaceSourceText(sources, sourceName, transform) {
  return sources.map((item) => item.sourceName === sourceName
    ? source(sourceName, transform(item.source))
    : item);
}

function projectedEdgePairs(result) {
  return result.edges
    .filter((edge) => edge.projected === true)
    .map((edge) => `${edge.source} ${edge.operator} ${edge.target}`)
    .sort();
}

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
                $this connectTo display
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
