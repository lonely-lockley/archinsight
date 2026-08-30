import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  discoverDeploymentEnvironments,
  linkProject,
  selectGraph,
} from "../build/runtime/index.js";

const view = (name) => readFileSync(
  new URL(`../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/${name}.aiq`, import.meta.url),
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
    environment("cluster_a", "k8s_a", "net_a"),
    environment("cluster_b", "k8s_b", "net_b"),
    environment("cluster_c", "k8s_c", "net_c"),
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
            -> worker
                deployment:
                    uses network
            -> api
                deployment:
                    uses network

    service worker
        name = Worker
        deployment:
            uses regional
`),
    source("target.ai", `
context shop

deploymentProfile central
    appliesTo:
        production from cluster_c
    runsOn compute

system backend
    name = Backend

    service api
        name = API
        deployment:
            uses central
`),
  ],
});
assertNoErrors(result.diagnostics);

assert.deepEqual(
  discoverDeploymentEnvironments(result, { context: "shop", tab: "caller.ai" }),
  [
    { id: "cluster_a", name: "Environment cluster_a" },
    { id: "cluster_b", name: "Environment cluster_b" },
  ],
  "environment discovery must follow deployments used by the selected source and expose display names",
);
assert.deepEqual(
  discoverDeploymentEnvironments(result, { context: "shop", tab: "target.ai" }),
  [{ id: "cluster_c", name: "Environment cluster_c" }],
);

const unscoped = selectGraph(
  result,
  { context: "shop", tab: "caller.ai", view: "deployment-container" },
  view("deployment-container"),
);
assert.equal(Object.keys(unscoped.elements).length, 0, "ambiguous D2 selection must never render every environment");

const d2 = selectGraph(
  result,
  { context: "shop", tab: "caller.ai", view: "deployment-container", environment: "cluster_a" },
  view("deployment-container"),
);
assert(Object.keys(d2.elements).some((id) => id.includes("cluster_a")), "D2 must include the selected placement");
assert.equal(Object.keys(d2.elements).some((id) => id.includes("cluster_b")), false, "D2 must exclude sibling placements");
assert.equal(d2.groups.some((group) => group.owner.startsWith("cluster_b/")), false);
assert(
  d2.externalElements.some((id) => id.startsWith("shop/api")),
  "a cross-environment logical endpoint must remain visible as an external participant",
);

const d1 = selectGraph(
  result,
  { context: "shop", tab: "caller.ai", view: "deployment-system" },
  view("deployment-system"),
);
assert.equal(
  Object.values(d1.elements).some((element) => element.baseTypes.includes("ContainerElement")),
  false,
  "D1 must not expose container-level logical elements",
);
assert(Object.keys(d1.elements).some((id) => id.startsWith("shop/storefront")));
assert(Object.keys(d1.elements).some((id) => id.startsWith("shop/backend")));
assert(
  d1.groups.some((group) => group.owner === "cluster_a/cluster_a"
    && group.elements.some((id) => id.startsWith("shop/storefront"))),
  "D1 must place the system occurrence in the first environment boundary",
);
assert(
  d1.groups.some((group) => group.owner === "cluster_b/cluster_b"
    && group.elements.some((id) => id.startsWith("shop/storefront"))),
  "D1 must place the system occurrence in the second environment boundary",
);
assert(
  d1.externalElements.some((id) => id.startsWith("shop/backend")),
  `D1 must preserve externality after system rollup: ${JSON.stringify(d1.externalElements)}`,
);
assert.equal(
  d1.edges.some((edge) => {
    const source = edge.edge.originSource ?? edge.edge.source;
    const target = edge.edge.originTarget ?? edge.edge.target;
    return source === "shop/web" && target === "shop/worker";
  }),
  false,
  "D1 must omit physical paths for dependencies internal to one system",
);

const irrelevant = selectGraph(
  result,
  { context: "shop", tab: "caller.ai", view: "deployment-container", environment: "cluster_c" },
  view("deployment-container"),
);
assert.equal(Object.keys(irrelevant.elements).length, 0, "an irrelevant environment must not widen D2 scope");

console.log("deployment detail view contracts passed");

function environment(context, compute, network) {
  return source(`${context}.ai`, `
environment ${context}
    name = Environment ${context}

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
