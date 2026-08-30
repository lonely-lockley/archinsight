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
define type EventEnvironment of Environment
    InfrastructureComponent provider
    Compute compute
    EventChannel events

define type EventChannel of NetworkConnection
    constructor eventChannel
    required Broker transport
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
        compute kubernetes
            name = Kubernetes
            runsOn:
                cloud

    events:
        eventChannel order_events
            name = Order events
            transport:
                broker kafka
                    name = Kafka
                    runsOn:
                        cloud
            projection:
                target $to connectTo target transport
                target transport originalLink source $from
`),
    source("model.ai", `
context shop

deploymentProfile service_profile
    appliesTo:
        production from eu
    runsOn compute

system ordering
    name = Ordering

    service publisher
        name = Publisher
        deployment:
            uses service_profile

system fulfillment
    name = Fulfillment

    service consumer
        name = Consumer
        deployment:
            uses service_profile
        links:
            ~> publisher
                via = orders.created
                technology = Kafka
                description = Consumes order-created events
                deployment:
                    uses events
`),
  ],
});
assertNoErrors(result.diagnostics);

const graph = selectGraph(result, { context: "shop", tab: "model.ai", view: "deployment-system" }, query);
assert.equal(graph.elements["eu/kafka"], undefined, "D1 must contract the internal broker");

const event = graph.edges.find((edge) => edge.source === "shop/ordering" && edge.target === "shop/fulfillment");
assert(event, "D1 must retain the async relationship between the owning systems");
assert.equal(event.edge.type, "AsyncWire");
assert.equal(event.edge.operator, "~>");
assert.deepEqual(event.edge.attributes.model, ["async"]);
assert.deepEqual(event.edge.attributes.via, ["orders.created"]);
assert.deepEqual(event.edge.attributes.technology, ["Kafka"]);
assert.deepEqual(event.edge.attributes.description, ["Consumes order-created events"]);

console.log("deployment system async contracts passed");

function assertNoErrors(diagnostics) {
  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"),
    [],
  );
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
