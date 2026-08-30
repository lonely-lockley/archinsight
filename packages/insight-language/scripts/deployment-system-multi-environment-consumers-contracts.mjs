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

const environmentIds = ["eu", "sa", "apac"];
const consumers = [
  { id: "consumer_a", target: "event_api", topic: "events.shared" },
  { id: "consumer_b", target: "event_api", topic: "events.shared" },
  { id: "consumer_c", target: "event_api", topic: "events.profile" },
  { id: "consumer_d", target: "event_api", topic: "events.shared" },
  { id: "consumer_e", target: "event_api", topic: "events.ocr" },
  { id: "consumer_f", target: "event_api", topic: "events.vehicle" },
  { id: "consumer_g", target: "document_store", topic: "documents.updated" },
  { id: "consumer_h", target: "document_store", topic: "documents.updated" },
];

const sources = [
  source("definitions.ai", `
define type MessageBroker of NetworkConnection
    constructor messageBroker

define type AppEnvironment of Environment
    Compute compute
    MessageBroker broker
`),
  ...environmentIds.map(environment),
  source("application.ai", `
context application

deploymentProfile regional
    appliesTo:
${environmentIds.map((id) => `        production from ${id}`).join("\n")}
    runsOn compute

system platform
    name = Platform

    service event_api
        name = Event API
        deployment:
            uses regional

    service document_store
        name = Document store
        deployment:
            uses regional
`),
  source("consumers.ai", `
context consumers

import event_api from context application
import document_store from context application

${consumers.map(({ id, target, topic }) => `external system ${id}
    name = ${id}
    links:
        ~> ${target}
            via = ${topic}
            deployment:
                uses broker`).join("\n\n")}
`),
];

const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
assertNoErrors(snapshot.diagnostics);
const result = linkProject({ snapshot: snapshot.snapshot, sources });
assertNoErrors(result.diagnostics);

const graph = selectGraph(result, { context: "application", tab: "application.ai", view: "deployment-system" }, query);
const expectedElements = [
  ...environmentIds.map((id) => `application/platform@@${id}/compute`),
  ...consumers.map(({ id }) => `consumers/${id}`),
].sort();
assert.deepEqual(Object.keys(graph.elements).sort(), expectedElements);

const expectedEdges = consumers.flatMap(({ id, topic }) => environmentIds.map((environmentId) =>
  `AsyncWire:consumers/${id}->application/platform@@${environmentId}/compute:${topic}`
)).sort();
assert.equal(expectedEdges.length, 24, "the regression topology must cover eight consumers in three environments");
assert.deepEqual(
  graph.edges.map(edgeSignature).sort(),
  expectedEdges,
  "every consumer must connect to the system occurrence in every projected environment",
);

const connected = new Set(graph.edges.flatMap((edge) => [edge.source, edge.target]));
assert.deepEqual(
  Object.keys(graph.elements).filter((id) => !connected.has(id)),
  [],
  "D1 must not retain disconnected consumer nodes after folding shared infrastructure",
);

console.log("deployment system multi-environment consumer contracts passed");

function environment(id) {
  return source(`${id}.ai`, `
environment ${id}
    name = ${id}

deployment production
    compute:
        compute compute
            name = Compute

    broker:
        messageBroker kafka
            name = Kafka
            runsOn:
                compute
            projection:
                source $from originalLink source $this
                target $to connectTo target $this
`);
}

function edgeSignature(edge) {
  return `${edge.edge.type}:${edge.source}->${edge.target}:${edge.edge.attributes.via?.[0] ?? ""}`;
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
