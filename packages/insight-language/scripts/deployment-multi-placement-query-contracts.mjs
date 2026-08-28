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

const result = linkProject({
  snapshot: definitions.snapshot,
  sources: [
    infrastructure("cluster_a", "k8s_a", "net_a", "A"),
    infrastructure("cluster_b", "k8s_b", "net_b", "B"),
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
                technology = gRPC
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
const deployedElements = result.elements.filter((element) =>
  element.sourceIdentity === "model.ai" && element.deployed === true
);
const concreteRunTargets = new Set(deployedElements.flatMap((element) => element.attributes.runsOn ?? []));

assert.equal(concreteRunTargets.size, 2, "the fixture must resolve the profile to two concrete placements");
for (const target of concreteRunTargets) {
  assert(graph.elements[target], `the Deployment view must include concrete runsOn target '${target}'`);
  assert(graph.groups.some((group) => group.owner === target), `the Deployment view must keep group '${target}'`);
}

console.log("deployment multi-placement query contracts passed");

function infrastructure(context, compute, network, label) {
  return source(`infra-${label.toLowerCase()}.ai`, `
environment ${context}
    name = Cluster ${label}

deployment production
    compute:
        compute ${compute}
            name = Kubernetes ${label}

    network:
        networkConnection ${network}
            name = Cluster ${label} network
            runsOn:
                ${compute}
            projection:
                source $from originalLink target $to
`);
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
