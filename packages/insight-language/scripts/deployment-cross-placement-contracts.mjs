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
                    route crossCluster
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
const projected = result.edges.find((edge) => edge.projected === true);
assert.equal(projected?.sourcePlacement, "cluster_a/k8s_a");
assert.equal(projected?.targetPlacement, "cluster_c/k8s_c");

const graph = selectGraph(result, { context: "shop", tab: "target.ai", view: "deployment" }, deploymentQuery);
assert.deepEqual(
  graph.edges.map((edge) => `${edge.source}->${edge.target}`),
  ["shop/web->shop/api"],
  "a cross-environment path must retain the placement of each endpoint independently",
);
assert(graph.elements["shop/web"]);
assert(graph.elements["shop/api"]);
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

route crossCluster
    outbound:
        $from originalLink $to in production from cluster_c
` : ""}`);
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
