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

const definitions = source("definitions.ai", `
define type MessageBroker of NetworkConnection
    constructor messageBroker

define type AppEnvironment of Environment
    Compute compute
    MessageBroker messageBroker
    NetworkConnection network
`);
const sources = [
  definitions,
  environment("eu", "Europe"),
  environment("sa", "South America"),
  source("application.ai", `
context application

deploymentProfile regional
    appliesTo:
        production from eu
        production from sa
    runsOn compute

system platform
    name = Platform

    service backend
        name = Backend
        deployment:
            uses regional
`),
  source("integration.ai", `
context integration

import backend from context application

system producer
    name = Producer
    links:
        ~> backend
            deployment:
                uses messageBroker
        -> backend
            deployment:
                uses network
`),
];
const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
assertNoErrors(snapshot.diagnostics);
const result = linkProject({ snapshot: snapshot.snapshot, sources });
assertNoErrors(result.diagnostics);

assert.deepEqual(discoverDeploymentEnvironments(result, { context: "integration", tab: "integration.ai" }), [
  { id: "eu", name: "Europe" },
  { id: "sa", name: "South America" },
]);

const d2 = selectGraph(
  result,
  { context: "integration", tab: "integration.ai", view: "deployment-container", environment: "eu" },
  view("deployment-container"),
);
assert.deepEqual(Object.keys(d2.elements).sort(), [
  "application/backend@@eu/compute",
  "eu/broker",
  "integration/producer",
]);
assert.deepEqual(edgeSignatures(d2), [
  "AsyncWire:integration/producer->eu/broker:eu/broker",
  "ConnectTo:application/backend@@eu/compute->eu/broker:eu/broker",
  "SyncWire:integration/producer->application/backend@@eu/compute:eu/network",
].sort(), "D2 must preserve the exact async projection and the direct sync relationship");

const d1 = selectGraph(
  result,
  { context: "integration", tab: "integration.ai", view: "deployment-system" },
  view("deployment-system"),
);
assert.deepEqual(Object.keys(d1.elements).sort(), [
  "application/platform@@eu/compute",
  "application/platform@@sa/compute",
  "integration/producer",
]);
assert.equal(
  Object.values(d1.elements).some((element) => hasType(element, "InfrastructureComponent")),
  false,
  "D1 must fold internal brokers and placement infrastructure",
);
assert.deepEqual(edgeSignatures(d1), [
  "AsyncWire:integration/producer->application/platform@@eu/compute:eu/broker",
  "AsyncWire:integration/producer->application/platform@@sa/compute:sa/broker",
  "SyncWire:integration/producer->application/platform@@eu/compute:eu/network",
  "SyncWire:integration/producer->application/platform@@sa/compute:sa/network",
].sort(), "D1 must preserve both logical relationships in every environment without duplicates");

console.log("deployment unplaced system endpoint contracts passed");

function environment(id, name) {
  return source(`${id}.ai`, `
environment ${id}
    name = ${name}

deployment production
    compute:
        compute compute
            name = Compute
    messageBroker:
        messageBroker broker
            name = Broker
            runsOn:
                compute
            projection:
                source $from originalLink source $this
                target $to connectTo target $this
    network:
        networkConnection network
            name = Network
            projection:
                source $from originalLink target $to
`);
}

function edgeSignatures(graph) {
  return graph.edges.map((edge) => [
    edge.edge.type,
    `${edge.source}->${edge.target}`,
    edge.edge.projectionRoot ?? "",
  ].join(":")).sort();
}

function hasType(element, type) {
  return element.type === type || element.baseTypes.includes(type);
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
