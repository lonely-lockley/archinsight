import assert from "node:assert/strict";
import {
  InsightLanguageService,
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  coreOperatorImplementationRegistry,
} from "../build/runtime/index.js";

const customImplementationId = "@example/audited-edge";
const registry = coreOperatorImplementationRegistry.with(customImplementationId, {
  apiVersion: "insight.operator.v1",
  invoke(input) {
    assert.equal(input.execution.implementation, customImplementationId);
    assert.equal(input.execution.mode, "link");
    assert(input.invocation.edge, "link-mode edge implementations receive a normalized candidate");
    assert(input.from);
    assert(input.to);
    return {
      edges: [{
        ...input.invocation.edge,
        attributes: {
          ...input.invocation.edge.attributes,
          audited: ["true"],
        },
      }],
    };
  },
});
assert.equal(coreOperatorImplementationRegistry.resolve(customImplementationId), undefined,
  "extending a registry must not mutate the shared core registry");

const snapshot = buildLanguageSnapshotResultFromSources([source("audited-wire.ai", `
define operator AuditedWire of Wire
    constructor @> Element
        on Element
        model = sync

    implementation = "${customImplementationId}"
`)], [coreLanguageSnapshot]).snapshot;
const service = new InsightLanguageService({ snapshot, operatorImplementations: registry });
const architecture = source("architecture.ai", `
context shared

system caller
    name = Caller
    links:
        @> target

system target
    name = Target
`);

const result = service.link({ sources: [architecture] });
assertNoErrors(result);
assert.deepEqual(result.edges[0]?.attributes.audited, ["true"]);

const state = service.createState({ sources: [architecture] });
const fork = service.forkState(state);
const update = service.replaceSource(fork, {
  sourceName: "architecture.ai",
  source: architecture.source.replace("name = Caller", "name = Forked caller"),
});
assertNoErrors(update.result);
assert.deepEqual(update.result.edges[0]?.attributes.audited, ["true"],
  "forked incremental states must retain the same immutable registry");
assert.deepEqual(state.result().elements.find((element) => element.id === "shared/caller")?.attributes.name, ["Caller"]);

console.log("operator implementation registry contracts passed");

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}

function assertNoErrors(result) {
  assert.deepEqual(
    result.diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"),
    [],
  );
}
