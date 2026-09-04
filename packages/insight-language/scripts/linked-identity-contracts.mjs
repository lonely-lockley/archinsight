import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  parseSyntheticLinkedLocalId,
  syntheticLinkedLocalId,
} from "../build/runtime/index.js";

const encoded = syntheticLinkedLocalId("test", ["owner/a", "source a", 7]);
assert.equal(/^[a-z][A-Za-z0-9_]*$/.test(encoded), false,
  "synthetic identities must not occupy the Insight identifier namespace");
assert.deepEqual(parseSyntheticLinkedLocalId(encoded), {
  kind: "test",
  provenance: ["owner/a", "source a", "7"],
});
assert.equal(parseSyntheticLinkedLocalId("ordinary_identifier"), undefined);

const definitions = buildLanguageSnapshotResultFromSources([source("environment-types.ai", `
define type AppEnvironment of Environment
    Compute compute
`)], [coreLanguageSnapshot]);
assertNoErrors(definitions.diagnostics);

const sources = [
  source("infra.ai", `
environment cluster
    name = Cluster

deployment production
    compute:
        compute node
            name = Shared node
`),
  source("model.ai", `
context app

deploymentProfile regional
    appliesTo:
        production from cluster

system application
    name = Application

    service api
        name = API
        deployment:
            uses regional
            uses compute
                description = Dedicated node
`),
  source("peer.ai", `
context app

external system _
    name = Vendor
`),
];

const forward = linked(sources);
const reversed = linked([...sources].reverse());
assert.deepEqual(syntheticIds(forward), syntheticIds(reversed),
  "synthetic identities must be stable when source iteration order changes");
assert(syntheticIds(forward).length >= 2, "fixture must cover anonymous and deployment-clone identities");
for (const id of syntheticIds(forward)) {
  const localId = id.slice(id.indexOf("/") + 1);
  assert(parseSyntheticLinkedLocalId(localId));
}

console.log("linked synthetic identity contracts passed");

function linked(projectSources) {
  const result = linkProject({ snapshot: definitions.snapshot, sources: projectSources });
  assertNoErrors(result.diagnostics);
  return result;
}

function syntheticIds(result) {
  return result.elements
    .filter((element) => parseSyntheticLinkedLocalId(element.localId) !== undefined)
    .map((element) => element.id)
    .sort();
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}
