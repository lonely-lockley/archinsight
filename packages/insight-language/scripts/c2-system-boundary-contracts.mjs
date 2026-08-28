import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  selectGraph,
} from "../build/runtime/index.js";

const sources = [
  source("model.ai", `
context app

system platform
    name = Platform

    service api
        name = API

    service worker
        name = Worker

    container scheduler
        name = Scheduler

system reporting
    name = Reporting

    service reports
        name = Reports
`),
  source("api_components.ai", `
context app

import worker from context app

extend service api
    component endpoint
        name = Endpoint

    links:
        -> worker
`),
];
const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
assertNoErrors(snapshot.diagnostics);
const result = linkProject({ snapshot: snapshot.snapshot, sources });
assertNoErrors(result.diagnostics);

const graph = selectGraph(
  result,
  { context: "app", tab: "api_components.ai", view: "c2" },
  readFileSync(
    new URL("../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/c2.aiq", import.meta.url),
    "utf8",
  ),
);

assert.deepEqual(Object.keys(graph.elements).sort(), [
  "app/api",
  "app/worker",
]);
assert.deepEqual(graph.externalElements, []);
assert.deepEqual(graph.groups, [{
  owner: "app/platform",
  elements: ["app/api", "app/worker"],
}]);
assert.equal(graph.elements["app/scheduler"], undefined, "unrelated containers in an open system must remain hidden");
assert.equal(graph.elements["app/reports"], undefined, "containers from a closed system must remain hidden");

console.log("C2 system boundary contracts passed");

function assertNoErrors(diagnostics) {
  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"),
    [],
  );
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
