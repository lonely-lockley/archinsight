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
    source("ingress.ai", `
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
    source("other.ai", `
context shop

import production_service from context shop

system reporting
    name = Reporting

    service report_api
        name = Report API
        deployment:
            uses production_service
        links:
            -> report_worker
                deployment:
                    uses network

    service report_worker
        name = Report worker
        deployment:
            uses production_service
`),
  ],
});

assertNoErrors(snapshot);
assertNoErrors(result);

const graph = selectGraph(result, { context: "shop", tab: "other.ai" }, builtinDeploymentQuery);
assert.deepEqual(
  graph.edges.map((edge) => `${edge.source}->${edge.target}`),
  ["shop/report_api->shop/report_worker"],
  "the selected Deployment source must not include projected infrastructure paths used only by another source",
);
assert(!Object.values(graph.elements).some((element) =>
  ["Public ingress", "CloudFront", "ALB"].includes(element.attributes.name?.[0])
));

console.log("deployment source-scope contract fixtures passed");

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}

function assertNoErrors(linkResult) {
  const errors = linkResult.diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR");
  assert.deepEqual(errors, []);
}
