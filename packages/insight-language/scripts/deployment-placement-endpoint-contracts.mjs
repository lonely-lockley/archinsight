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
define type AppEnvironment of Environment
    Compute compute
    NetworkConnection network
`),
], [coreLanguageSnapshot]);
assertNoErrors(definitions.diagnostics);

const partiallyPlaced = linkProject({
  snapshot: definitions.snapshot,
  sources: [
    environment("cluster_a", "k8s_a", "net_a"),
    environment("cluster_b", "k8s_b", "net_b"),
    environment("cluster_c", "k8s_c", "net_c"),
    source("partial.ai", `
context shop

deploymentProfile everywhere
    appliesTo:
        production from cluster_a
        production from cluster_b
        production from cluster_c
    runsOn compute

deploymentProfile partial
    appliesTo:
        production from cluster_a
        production from cluster_b
    runsOn compute

system storefront
    name = Storefront

    service caller
        name = Caller
        deployment:
            uses everywhere
        links:
            -> target
                deployment:
                    route clusterLocal

    service target
        name = Target
        deployment:
            uses partial
`),
  ],
});
assert.deepEqual(
  partiallyPlaced.diagnostics.filter((item) => item.level === undefined || item.level === "ERROR").map((item) => item.code),
  ["ROUTE_TARGET_DEPLOYMENT_MISSING"],
);
assert.match(
  partiallyPlaced.diagnostics.find((item) => item.code === "ROUTE_TARGET_DEPLOYMENT_MISSING")?.message ?? "",
  /target.*production from cluster_c/,
);
const partialGraph = selectGraph(
  partiallyPlaced,
  { context: "shop", tab: "partial.ai", view: "deployment" },
  deploymentQuery,
);
assert.deepEqual(
  new Set(partialGraph.edges.map((edge) => `${edge.source}->${edge.target}`)),
  new Set([
    "shop/caller@@cluster_a/k8s_a->shop/target@@cluster_a/k8s_a",
    "shop/caller@@cluster_b/k8s_b->shop/target@@cluster_b/k8s_b",
  ]),
  "a projected wire must not fall back to an unplaced endpoint when the peer has no occurrence in that environment",
);
assert.equal(
  partialGraph.edges.some((edge) => edge.source === "shop/caller" || edge.target === "shop/target"),
  false,
  "partially placed endpoints must never leak their logical ids into the deployment graph",
);

console.log("deployment placement endpoint contracts passed");

function environment(context, compute, network) {
  return source(`${context}.ai`, `
environment ${context}
    name = ${context}

deployment production
    compute:
        compute ${compute}
            name = ${compute}
    network:
        networkConnection ${network}
            name = ${network}
            route:
                $from originalLink $to
route clusterLocal
    outbound:
        $from originalLink $to
`);
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
