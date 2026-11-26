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
  source("infrastructure.ai", `
environment eu
    name = Europe

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
`),
  source("application.ai", `
context application

deploymentProfile regional
    appliesTo:
        production from eu
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

external system producer
    name = Producer
    links:
        ~> backend
            via = topic_one
            deployment:
                route brokerRoute
        ~> backend
            via = topic_two
            deployment:
                route brokerRoute
        ~> backend
            via = topic_three
            deployment:
                route brokerRoute

external system producer_two
    name = Producer two
    links:
        ~> backend
            via = topic_four
            deployment:
                route brokerRoute
`),
];

const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
assertNoErrors(snapshot.diagnostics);
const result = linkProject({ snapshot: snapshot.snapshot, sources });
assertNoErrors(result.diagnostics);

const logical = result.edges.filter((edge) => edge.projected !== true && edge.type === "AsyncWire");
assert.deepEqual(
  logical.map(logicalRelationshipSignature).sort(),
  [
    "integration/producer->application/backend:topic_one",
    "integration/producer->application/backend:topic_three",
    "integration/producer->application/backend:topic_two",
    "integration/producer_two->application/backend:topic_four",
  ],
);

const projectedLogical = result.edges.filter((edge) => edge.projected === true && edge.type === "AsyncWire");
assert.deepEqual(
  projectedLogical.map(logicalRelationshipSignature).sort(),
  [
    "eu/broker->integration/producer:topic_one",
    "eu/broker->integration/producer:topic_three",
    "eu/broker->integration/producer:topic_two",
    "eu/broker->integration/producer_two:topic_four",
  ],
  "each originalLink projection must preserve a distinct logical wire even when its endpoints match",
);
assert.equal(new Set(projectedLogical.map((edge) => `${edge.declaration?.sourceName}:${edge.declaration?.line}`)).size, 4);

const sharedPhysical = result.edges.filter((edge) => edge.projected === true && edge.type === "ConnectTo");
assert.equal(sharedPhysical.length, 1, "the shared physical segment must not be duplicated per logical wire");
assert.equal(sharedPhysical[0]?.projectionOrigins?.length, 4, "the shared segment must retain every logical origin");

const d2 = selectGraph(
  result,
  { context: "application", tab: "application.ai", view: "deployment-container", environment: "eu" },
  view("deployment-container"),
);
assert.deepEqual(graphRelationshipSignature(d2), [
  "AsyncWire:eu/broker->integration/producer:topic_one",
  "AsyncWire:eu/broker->integration/producer:topic_three",
  "AsyncWire:eu/broker->integration/producer:topic_two",
  "AsyncWire:eu/broker->integration/producer_two:topic_four",
  "ConnectTo:application/backend->eu/broker:",
], "D2 must contain every logical broker relationship and one shared physical segment");

const d1 = selectGraph(
  result,
  { context: "application", tab: "application.ai", view: "deployment-system" },
  view("deployment-system"),
);
assert.deepEqual(graphRelationshipSignature(d1), [
  "AsyncWire:application/platform->integration/producer:topic_one",
  "AsyncWire:application/platform->integration/producer:topic_three",
  "AsyncWire:application/platform->integration/producer:topic_two",
  "AsyncWire:application/platform->integration/producer_two:topic_four",
], "D1 must retain parallel async relationships while contracting their internal broker path");

console.log("deployment parallel async contracts passed");

function logicalRelationshipSignature(edge) {
  return `${edge.source}->${edge.target}:${edge.attributes.via?.[0] ?? ""}`;
}

function graphRelationshipSignature(graph) {
  return graph.edges.map((edge) => `${edge.edge.type}:${edge.source}->${edge.target}:${edge.edge.attributes.via?.[0] ?? ""}`).sort();
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
