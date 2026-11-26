import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
} from "../build/runtime/index.js";

const definitions = buildLanguageSnapshotResultFromSources([
  source("definitions.ai", `
define type AppEnvironment of Environment
    Compute compute
    NetworkConnection optionalNetwork
`),
], [coreLanguageSnapshot]);
assertNoErrors(definitions.diagnostics);

const commonSources = [
  source("eu.ai", `
environment eu
    name = Europe

deployment production
    compute:
        compute compute
            name = Compute

route clusterLocal
    outbound:
        $from originalLink $to
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
];

const unknown = linkedWithWireSlot("jhv");
const unknownErrors = errors(unknown.diagnostics);
assert.equal(unknownErrors.length, 1);
assert.equal(unknownErrors[0]?.code, "ROUTE_NOT_DECLARED");
assert.match(unknownErrors[0]?.message ?? "", /jhv|Route/);
assert.equal(unknownErrors[0]?.sourceName, "consumer.ai");

const optional = linkedWithWireSlot("clusterLocal");
assertNoErrors(optional.diagnostics);
assert.equal(
  optional.diagnostics.some((diagnostic) => diagnostic.code === "UNDECLARED_IDENTIFIER"),
  false,
  "a declared wire slot may be intentionally empty in an applicable deployment",
);

console.log("deployment slot validation contracts passed");

function linkedWithWireSlot(slot) {
  const sources = [
    ...commonSources,
    source("consumer.ai", `
context consumer

import backend from context application

external system client
    name = Client
    links:
        ~> backend
            deployment:
                route ${slot}
`),
  ];
  return linkProject({ snapshot: definitions.snapshot, sources });
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
