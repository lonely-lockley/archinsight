import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
} from "../build/runtime/index.js";

const definitions = buildLanguageSnapshotResultFromSources([
  source("definitions.ai", `
define type ApplicationEnvironment of Environment
    Compute compute
    NetworkConnection network
    Broker defaultEvents
    Broker events

define type KafkaBroker of Broker
    constructor kafka
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
    compute:
        compute runtime
            name = Runtime

    network:
        name = Private network

    defaultEvents:
        name = Default broker

    events:
        kafka kafka_eu
            name = Kafka
            projection:
                target $to connectTo target $this
                target $this originalLink source $from
`),
    source("model.ai", `
context application

deploymentProfile service_profile
    appliesTo:
        production from eu
    runsOn compute

system platform
    name = Platform

    service publisher
        name = Publisher
        deployment:
            uses service_profile

    service consumer
        name = Consumer
        deployment:
            uses service_profile
        links:
            ~> publisher
                deployment:
                    uses events
`),
  ],
});
assertNoErrors(result.diagnostics);

assert.equal(namedElement(result, "Private network")?.type, "NetworkConnection");
assert.equal(namedElement(result, "Default broker")?.type, "Broker");
assert.equal(element(result, "kafka_eu")?.type, "KafkaBroker");
assert(
  result.edges.some((edge) => edge.projected === true && edge.source === "application/publisher" && edge.target === "eu/kafka_eu"),
  "a Broker slot must project a wire directly through its concrete broker",
);
assert(
  result.edges.some((edge) => edge.projected === true && edge.source === "eu/kafka_eu" && edge.target === "application/consumer"),
  "the original async hop must survive the direct Broker projection",
);

console.log("broker network contracts passed");

function element(linked, localId) {
  return linked.elements.find((candidate) => candidate.localId === localId);
}

function namedElement(linked, name) {
  return linked.elements.find((candidate) => candidate.attributes.name?.[0] === name);
}

function errors(diagnostics) {
  return diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR");
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(errors(diagnostics), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
