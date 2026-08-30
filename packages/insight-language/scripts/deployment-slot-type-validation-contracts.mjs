import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
} from "../build/runtime/index.js";

const incompatible = linkInfrastructureSlot("Broker");
const incompatibleErrors = errors(incompatible.diagnostics);
assert.equal(incompatibleErrors.length, 1);
assert.equal(incompatibleErrors[0]?.code, "TYPE_MISMATCH");
assert.equal(
  incompatibleErrors[0]?.message,
  "Type 'KafkaBroker' is not assignable to expected type 'Broker'",
);
assert.equal(incompatibleErrors[0]?.sourceName, "infrastructure.ai");
assert.equal(
  incompatible.elements.some((element) => element.localId === "kafka_eu"),
  false,
  "an object that violates its deployment slot type must not enter the linked model",
);

for (const compatibleSlotType of ["NetworkConnection", "KafkaBroker"]) {
  const compatible = linkInfrastructureSlot(compatibleSlotType);
  assertNoErrors(compatible.diagnostics);
  assert.equal(
    compatible.elements.find((element) => element.localId === "kafka_eu")?.type,
    "KafkaBroker",
  );
}

console.log("deployment slot type validation contracts passed");

function linkInfrastructureSlot(slotType) {
  const definitions = buildLanguageSnapshotResultFromSources([
    source("definitions.ai", `
define type ApplicationEnvironment of Environment
    ${slotType} messageBroker

define type KafkaBroker of NetworkConnection
    constructor kafka
`),
  ], [coreLanguageSnapshot]);
  assertNoErrors(definitions.diagnostics);
  return linkProject({
    snapshot: definitions.snapshot,
    sources: [source("infrastructure.ai", `
environment eu
    name = Europe

deployment production
    messageBroker:
        kafka kafka_eu
            name = Message Broker
`)],
  });
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
