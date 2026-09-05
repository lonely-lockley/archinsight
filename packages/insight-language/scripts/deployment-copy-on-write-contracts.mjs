import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  parseSyntheticLinkedLocalId,
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
            projection:
                source $from originalLink target $to

    publicGateway:
        publicGateway public_edge
            name = Public ingress
            cdn:
                infrastructureComponent cloudfront
                    name = CloudFront
            loadBalancer:
                infrastructureComponent alb
                    name = ALB
            projection:
                source $from originalLink target cdn
                target cdn connectTo target loadBalancer
                target loadBalancer connectTo target $to
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
                uses publicGateway
                    name = Dedicated ingress

system storefront
    name = Storefront

    service web_app
        name = Web app
        deployment:
            uses production_service
        links:
            -> checkout_api
                deployment:
                    uses network

    service checkout_api
        name = Checkout API
        deployment:
            uses production_service
`),
  ],
});

assertNoErrors(snapshot);
assertNoErrors(result);

const clonesByName = new Map(
  result.elements
    .filter((element) => parseSyntheticLinkedLocalId(element.localId)?.kind === "deployment-clone")
    .map((element) => [element.attributes.name?.[0], element]),
);
const gateway = requiredClone(clonesByName, "Dedicated ingress");
const cdn = requiredClone(clonesByName, "CloudFront");
const loadBalancer = requiredClone(clonesByName, "ALB");
assert([gateway, cdn, loadBalancer].every((element) => element.synthetic === true));

assert.deepEqual(
  result.edges
    .filter((edge) => edge.projected === true && edge.originSource === "shop/shopper")
    .map(edgeKey)
    .sort(),
  [
    `${cdn.id}->${loadBalancer.id}`,
    `${loadBalancer.id}->shop/web_app`,
    `shop/shopper->${cdn.id}`,
  ].sort(),
  "the linker must project the wire through the cloned child slots only",
);

const graph = selectGraph(result, { context: "shop", tab: "model.ai" }, builtinDeploymentQuery);
assert.deepEqual(
  graph.edges.map((edge) => `${edge.source}->${edge.target}`).sort(),
  [
    `${cdn.id}->${loadBalancer.id}`,
    `${loadBalancer.id}->shop/web_app`,
    `shop/shopper->${cdn.id}`,
    "shop/web_app->shop/checkout_api",
  ].sort(),
  "the Deployment view must not roll cloned child-slot edges through the clone root",
);
assert(!graph.edges.some((edge) => edge.source === gateway.id || edge.target === gateway.id));
assert(graph.edges.every((edge) => edge.source === edge.edge.source && edge.target === edge.edge.target));
assert(!graph.edges.some((edge) => edge.source === "eu/cloudfront" || edge.target === "eu/cloudfront"));
assert(!graph.edges.some((edge) => edge.source === "eu/alb" || edge.target === "eu/alb"));

console.log("deployment copy-on-write contract fixtures passed");

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}

function requiredClone(clonesByName, name) {
  const clone = clonesByName.get(name);
  assert(clone, `expected a deployment clone named '${name}'`);
  return clone;
}

function edgeKey(edge) {
  return `${edge.source}->${edge.target}`;
}

function assertNoErrors(linkResult) {
  const errors = linkResult.diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR");
  assert.deepEqual(errors, []);
}
