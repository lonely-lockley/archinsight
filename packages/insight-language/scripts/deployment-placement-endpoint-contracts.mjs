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

const external = linkedModel("external system dependency", true);
const externalGraph = selectGraph(external, { context: "shop", tab: "model.ai", view: "deployment" }, deploymentQuery);
assert.equal(externalGraph.edges.length, 2);
assert.deepEqual(
  new Set(externalGraph.edges.map((edge) => `${edge.source}->${edge.target}`)),
  new Set([
    "shop/web@@cluster_a/k8s_a->shop/dependency",
    "shop/web@@cluster_b/k8s_b->shop/dependency",
  ]),
);
assert(externalGraph.elements["shop/dependency"]);
assert.equal(Object.keys(externalGraph.elements).some((id) => id.startsWith("shop/dependency@@")), false);

const unplaced = linkedModel("service dependency", false);
const unplacedGraph = selectGraph(unplaced, { context: "shop", tab: "model.ai" }, `
MATCH (node:ContainerElement)
WHERE node.sourceIdentity = $tab AND node.id = 'web'
OPTIONAL MATCH (node)-[path:REFERENCES {projected}]-(peer:ContainerElement)
GROUP BY node.runsOn
RETURN node, path, peer
`);
assert.equal(unplacedGraph.edges.length, 2);
assert.deepEqual(
  new Set(unplacedGraph.edges.map((edge) => `${edge.source}->${edge.target}`)),
  new Set([
    "shop/web@@cluster_a/k8s_a->shop/dependency",
    "shop/web@@cluster_b/k8s_b->shop/dependency",
  ]),
);
assert(unplacedGraph.elements["shop/dependency"]);
assert.equal(Object.keys(unplacedGraph.elements).some((id) => id.startsWith("shop/dependency@@")), false);

console.log("deployment placement endpoint contracts passed");

function linkedModel(dependencyDeclaration, dependencyIsExternal) {
  const result = linkProject({
    snapshot: definitions.snapshot,
    sources: [
      environment("cluster_a", "k8s_a", "net_a"),
      environment("cluster_b", "k8s_b", "net_b"),
      source("model.ai", `
context shop

deploymentProfile regional
    appliesTo:
        production from cluster_a
        production from cluster_b
    runsOn compute

${dependencyIsExternal ? `${dependencyDeclaration}
    name = Dependency

system storefront` : "system storefront"}
    name = Storefront

    service web
        name = Web
        deployment:
            uses regional
        links:
            -> dependency
                deployment:
                    uses network

${dependencyIsExternal ? "" : `    ${dependencyDeclaration}
        name = Dependency
`}`),
    ],
  });
  assertNoErrors(result.diagnostics);
  return result;
}

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
            projection:
                source $from originalLink target $to
`);
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
