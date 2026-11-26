import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  selectGraph,
} from "../build/runtime/index.js";

const builtinDeploymentQuery = readFileSync(
  new URL("../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/deployment.aiq", import.meta.url),
  "utf8",
);

const snapshot = buildLanguageSnapshotResultFromSources([
  source("framework.ai", `
define type PublicGateway of NetworkConnection
    constructor publicGateway
    required InfrastructureComponent cdn
    required InfrastructureComponent loadBalancer

define type AppEnvironment of Environment
    Compute compute
    NetworkConnection network
    PublicGateway publicGateway
`),
], [coreLanguageSnapshot]);

const result = linkProject({
  snapshot: snapshot.snapshot,
  sources: [
    source("infra.ai", `
environment eu
    name = Europe

deployment production
    compute:
        compute kubernetes
            name = Kubernetes

    network:
        networkConnection service_network
            name = Service network
            route:
                $from originalLink $to

    publicGateway:
        publicGateway public_edge
            name = Public ingress
            cdn:
                infrastructureComponent cloudfront
                    name = CloudFront
            loadBalancer:
                infrastructureComponent alb
                    name = ALB

route publicInbound
    inbound:
        $from originalLink cdn
        cdn connectTo loadBalancer
        loadBalancer connectTo $to

route clusterLocal
    outbound:
        $from originalLink $to
`),
    source("model.ai", `
context shop

deploymentProfile production_service
    appliesTo:
        production from eu

    runsOn compute

external actor shopper
    name = Shopper
    links:
        -> web_app
            deployment:
                route publicInbound

system storefront
    name = Storefront

    service web_app
        name = Web app
        deployment:
            uses production_service
        links:
            -> checkout_api
                deployment:
                    route clusterLocal

    service checkout_api
        name = Checkout API
        deployment:
            uses production_service
`),
  ],
});

assertNoErrors(snapshot);
assertNoErrors(result);

assert.deepEqual(
  result.edges
    .filter((edge) => edge.projected === true && edge.originSource === "shop/shopper")
    .map(edgeKey)
    .sort(),
  [
    "eu/alb->shop/web_app",
    "eu/cloudfront->eu/alb",
    "shop/shopper->eu/cloudfront",
  ].sort(),
  "the route must project the wire through the environment-owned child slots",
);

const graph = selectGraph(result, { context: "shop", tab: "model.ai" }, builtinDeploymentQuery);
assert.deepEqual(
  graph.edges.map((edge) => `${edge.source}->${edge.target}`).sort(),
  [
    "eu/alb->shop/web_app",
    "eu/cloudfront->eu/alb",
    "shop/shopper->eu/cloudfront",
    "shop/web_app->shop/checkout_api",
  ].sort(),
  "the Deployment view must keep every route segment",
);
assert(graph.edges.every((edge) => edge.source === edge.edge.source && edge.target === edge.edge.target));
assert(graph.elements["eu/cloudfront"]);
assert(graph.elements["eu/alb"]);

console.log("deployment copy-on-write contract fixtures passed");

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}

function edgeKey(edge) {
  return `${edge.source}->${edge.target}`;
}

function assertNoErrors(linkResult) {
  const errors = linkResult.diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR");
  assert.deepEqual(errors, []);
}
