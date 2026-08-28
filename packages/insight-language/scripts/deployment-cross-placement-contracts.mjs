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
  source("definitions.ai", `
define type ClusterLink of NetworkConnection
    constructor clusterLink

define type AppEnvironment of Environment
    Compute compute
    ClusterLink clusterLink
`),
], [coreLanguageSnapshot]);
assertNoErrors(definitions.diagnostics);

const result = linkProject({
  snapshot: definitions.snapshot,
  sources: [
    environment("cluster_a", "k8s_a", true),
    environment("cluster_b", "k8s_b", false),
    environment("cluster_c", "k8s_c", false),
    source("caller.ai", `
context shop

import api from context shop

deploymentProfile regional
    appliesTo:
        production from cluster_a
        production from cluster_b
    runsOn compute

system storefront
    name = Storefront

    service web
        name = Web
        deployment:
            uses regional
        links:
            -> api
                deployment:
                    uses clusterLink
`),
    source("target.ai", `
context shop

deploymentProfile only_c
    appliesTo:
        production from cluster_c
    runsOn compute

system backend
    name = Backend

    service api
        name = API
        deployment:
            uses only_c
`),
  ],
});
assertNoErrors(result.diagnostics);

const graph = selectGraph(result, { context: "shop", tab: "target.ai", view: "deployment" }, deploymentQuery);
assert.deepEqual(
  graph.edges.map((edge) => `${edge.source}->${edge.target}`),
  ["shop/web@@cluster_a/k8s_a->shop/api@@cluster_c/k8s_c"],
  "a cross-environment path must retain the placement of each endpoint independently",
);
assert(graph.elements["shop/web@@cluster_a/k8s_a"]);
assert(graph.elements["shop/api@@cluster_c/k8s_c"]);
assert.equal(graph.elements["shop/web"], undefined);
assert.equal(graph.elements["shop/api"], undefined);
assert.equal(graph.elements["shop/web@@cluster_b/k8s_b"], undefined);
assert.equal(graph.groups.some((group) => group.owner === "cluster_b/k8s_b"), false);
assert.deepEqual(new Set(graph.groups.map((group) => group.owner)), new Set(["cluster_a/k8s_a", "cluster_c/k8s_c"]));

console.log("deployment cross-placement contracts passed");

function environment(context, compute, connected) {
  return source(`${context}.ai`, `
environment ${context}
    name = ${context}

deployment production
    compute:
        compute ${compute}
            name = ${compute}
${connected ? `    clusterLink:
        clusterLink route
            name = Route to cluster C
            projection:
                source $from originalLink target $to
` : ""}`);
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
