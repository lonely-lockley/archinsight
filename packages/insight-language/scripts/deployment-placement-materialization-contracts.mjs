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

const multi = linkedProject(["cluster_a", "cluster_b"]);
const multiGraph = selectGraph(multi, { context: "shop", tab: "model.ai", view: "deployment" }, deploymentQuery);
const placements = runsOn(multi, "shop/web");
assert.deepEqual(placements, ["cluster_a/k8s_a", "cluster_b/k8s_b"]);
assert.deepEqual(runsOn(multi, "shop/api"), placements);
assert.equal(multiGraph.edges.length, placements.length);
assert.deepEqual(
  new Set(multiGraph.edges.map((edge) => `${edge.source}->${edge.target}`)),
  new Set(placements.map((placement) => `shop/web@@${placement}->shop/api@@${placement}`)),
  "each physical occurrence must connect the logical nodes inside its own placement",
);
assert.equal(multiGraph.elements["shop/web"], undefined);
assert.equal(multiGraph.elements["shop/api"], undefined);
for (const placement of placements) {
  assert(multiGraph.elements[`shop/web@@${placement}`]);
  assert(multiGraph.elements[`shop/api@@${placement}`]);
  assert.deepEqual(
    new Set(multiGraph.groups.find((group) => group.owner === placement)?.elements),
    new Set([`shop/web@@${placement}`, `shop/api@@${placement}`]),
  );
}

const single = linkedProject(["cluster_a"]);
const singleGraph = selectGraph(single, { context: "shop", tab: "model.ai", view: "deployment" }, deploymentQuery);
assert(singleGraph.elements["shop/web"]);
assert(singleGraph.elements["shop/api"]);
assert.equal(Object.keys(singleGraph.elements).some((id) => id.includes("@@")), false);
assert.equal(singleGraph.edges.length, 1);
assert.deepEqual(singleGraph.edges.map((edge) => `${edge.source}->${edge.target}`), ["shop/web->shop/api"]);

console.log("deployment placement materialization contracts passed");

function linkedProject(selectedEnvironments) {
  const result = linkProject({
    snapshot: definitions.snapshot,
    sources: [
      infrastructure("cluster_a", "k8s_a", "net_a", "A"),
      infrastructure("cluster_b", "k8s_b", "net_b", "B"),
      source("model.ai", `
context shop

deploymentProfile regional
    appliesTo:
${selectedEnvironments.map((environment) => `        production from ${environment}`).join("\n")}
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
  return result;
}

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
            name = Network ${label}
            projection:
                source $from originalLink target $to
`);
}

function runsOn(result, id) {
  return [...(result.elements.find((element) => element.id === id)?.attributes.runsOn ?? [])].sort();
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
