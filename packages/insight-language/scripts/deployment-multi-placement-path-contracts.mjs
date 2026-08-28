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
define type RoutedNetwork of NetworkConnection
    constructor routedNetwork
    required InfrastructureComponent gateway

define type AppEnvironment of Environment
    Compute compute
    RoutedNetwork network
`),
], [coreLanguageSnapshot]);
assertNoErrors(definitions.diagnostics);

const result = linkProject({
  snapshot: definitions.snapshot,
  sources: [
    environment("cluster_a", "k8s_a", "net_a", "gateway_a"),
    environment("cluster_b", "k8s_b", "net_b", "gateway_b"),
    source("model.ai", `
context shop

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
                    uses network

    service api
        name = API
        deployment:
            uses regional
`),
  ],
});
assertNoErrors(result.diagnostics);

const graph = selectGraph(result, { context: "shop", tab: "model.ai", view: "deployment" }, deploymentQuery);
assert.equal(graph.edges.length, 4);
assert.deepEqual(
  new Set(graph.edges.map((edge) => `${edge.source}->${edge.target}`)),
  new Set([
    "shop/web@@cluster_a/k8s_a->cluster_a/gateway_a",
    "cluster_a/gateway_a->shop/api@@cluster_a/k8s_a",
    "shop/web@@cluster_b/k8s_b->cluster_b/gateway_b",
    "cluster_b/gateway_b->shop/api@@cluster_b/k8s_b",
  ]),
  "infrastructure-only path segments must remain connected to the correct logical occurrences",
);
assert(graph.elements["cluster_a/gateway_a"]);
assert(graph.elements["cluster_b/gateway_b"]);

console.log("deployment multi-placement path contracts passed");

function environment(context, compute, network, gateway) {
  return source(`${context}.ai`, `
environment ${context}
    name = ${context}

deployment production
    compute:
        compute ${compute}
            name = ${compute}
    network:
        routedNetwork ${network}
            name = ${network}
            gateway:
                infrastructureComponent ${gateway}
                    name = ${gateway}
            projection:
                source $from originalLink target gateway
                target gateway connectTo target $to
`);
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
