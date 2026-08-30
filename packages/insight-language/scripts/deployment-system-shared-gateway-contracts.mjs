import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  selectGraph,
} from "../build/runtime/index.js";

const query = readFileSync(
  new URL("../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/deployment-system.aiq", import.meta.url),
  "utf8",
);

const definitions = buildLanguageSnapshotResultFromSources([
  source("definitions.ai", `
define type PublicGateway of NetworkConnection
    constructor publicGateway
    required InfrastructureComponent cdn
    required InfrastructureComponent loadBalancer
    required InfrastructureComponent ingress

define type AppEnvironment of Environment
    InfrastructureComponent provider
    Compute compute
    PublicGateway publicGateway
`),
], [coreLanguageSnapshot]);
assertNoErrors(definitions.diagnostics);

const result = linkProject({
  snapshot: definitions.snapshot,
  sources: [
    source("infrastructure.ai", `
environment eu
    name = Europe

deployment production
    provider:
        infrastructureComponent cloud
            name = Cloud provider

    compute:
        compute compute
            name = Compute
            runsOn:
                cloud

    publicGateway:
        publicGateway ingress_path
            name = Public ingress
            cdn:
                infrastructureComponent cloudflare
                    name = Cloudflare
            loadBalancer:
                infrastructureComponent load_balancer
                    name = Load balancer
                    runsOn:
                        cloud
            ingress:
                infrastructureComponent ingress
                    name = Ingress
                    runsOn:
                        compute
            projection:
                source $from originalLink target cdn
                target cdn connectTo target loadBalancer
                target loadBalancer connectTo target ingress
                target ingress connectTo target $to
`),
    source("application.ai", `
context app

deploymentProfile service_profile
    appliesTo:
        production from eu
    runsOn compute

external actor user
    name = User
    links:
        -> frontend
            description = Opens the editor
            deployment:
                uses publicGateway
        -> backend
            description = Calls the API
            deployment:
                uses publicGateway

system platform
    name = Editor

    service frontend
        name = Frontend
        deployment:
            uses service_profile

    service backend
        name = Backend
        deployment:
            uses service_profile
`),
  ],
});
assertNoErrors(result.diagnostics);

const graph = selectGraph(result, { context: "app", tab: "application.ai", view: "deployment-system" }, query);
assert.deepEqual(Object.keys(graph.elements).sort(), [
  "app/platform",
  "app/user",
  "eu/cloudflare",
]);
assert.deepEqual(graph.edges.map(edgeSignature).sort(), [
  "ConnectTo:eu/cloudflare->app/platform:",
  "SyncWire:app/user->eu/cloudflare:Calls the API",
  "SyncWire:app/user->eu/cloudflare:Opens the editor",
], "D1 must show both logical ingress relationships and one shared physical continuation without a direct bypass");

console.log("deployment system shared gateway contracts passed");

function edgeSignature(edge) {
  return `${edge.edge.type}:${edge.source}->${edge.target}:${edge.edge.attributes.description?.[0] ?? ""}`;
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
