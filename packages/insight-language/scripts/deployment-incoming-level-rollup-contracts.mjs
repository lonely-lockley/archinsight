import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  selectGraph,
} from "../build/runtime/index.js";

const view = (name) => readFileSync(
  new URL(`../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/${name}.aiq`, import.meta.url),
  "utf8",
);

const sources = [
  source("definitions.ai", `
define type MessageBroker of NetworkConnection
    constructor messageBroker

define type AppEnvironment of Environment
    Compute compute
    MessageBroker messageBroker
`),
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

        component api
            name = API
`),
  source("integration.ai", `
context integration

import backend from context application
import api from context application

external system service_peer
    name = Service peer
    links:
        ~> backend
            deployment:
                route brokerRoute

external system component_peer
    name = Component peer
    links:
        ~> api
            deployment:
                route brokerRoute
`),
];
const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
assertNoErrors(snapshot.diagnostics);
const result = linkProject({ snapshot: snapshot.snapshot, sources });
assertNoErrors(result.diagnostics);

const d2 = selectGraph(
  result,
  { context: "application", tab: "application.ai", view: "deployment-container", environment: "eu" },
  view("deployment-container"),
);
assert.deepEqual(graphSignature(d2), {
  elements: [
    "application/backend@@eu/compute",
    "eu/broker",
    "eu/compute",
    "integration/component_peer",
    "integration/service_peer",
  ],
  edges: [
    "AsyncWire:eu/broker->integration/component_peer:integration/component_peer->application/api:eu/brokerRoute",
    "AsyncWire:eu/broker->integration/service_peer:integration/service_peer->application/backend:eu/brokerRoute",
    "ConnectTo:application/backend@@eu/compute->eu/broker:integration/component_peer->application/api:eu/brokerRoute",
    "ConnectTo:application/backend@@eu/compute->eu/broker:integration/service_peer->application/backend:eu/brokerRoute",
  ],
}, "D2 opened from the target source must retain incoming system relationships authored at C2 and C3");

const d1 = selectGraph(
  result,
  { context: "application", tab: "application.ai", view: "deployment-system" },
  view("deployment-system"),
);
assert.deepEqual(graphSignature(d1), {
  elements: [
    "application/platform@@eu/compute",
    "application/platform@@sa/compute",
    "integration/component_peer",
    "integration/service_peer",
  ],
  edges: [
    "AsyncWire:application/platform@@eu/compute->integration/component_peer:integration/component_peer->application/api:eu/brokerRoute",
    "AsyncWire:application/platform@@eu/compute->integration/service_peer:integration/service_peer->application/backend:eu/brokerRoute",
    "AsyncWire:application/platform@@sa/compute->integration/component_peer:integration/component_peer->application/api:sa/brokerRoute",
    "AsyncWire:application/platform@@sa/compute->integration/service_peer:integration/service_peer->application/backend:sa/brokerRoute",
  ],
}, "D1 must roll incoming C2 and C3 relationships up to their systems exactly once per environment");

console.log("deployment incoming level rollup contracts passed");

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

route brokerRoute
    inbound:
        $to connectTo messageBroker
        messageBroker originalLink $from
`);
}

function graphSignature(graph) {
  return {
    elements: Object.keys(graph.elements).sort(),
    edges: graph.edges.map((edge) => [
      edge.edge.type,
      `${edge.source}->${edge.target}`,
      `${edge.edge.originSource ?? edge.edge.source}->${edge.edge.originTarget ?? edge.edge.target}`,
      edge.edge.projectionRoot ?? "",
    ].join(":")).sort(),
  };
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
