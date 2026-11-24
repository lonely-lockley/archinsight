import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
} from "../build/runtime/index.js";

const definitions = buildLanguageSnapshotResultFromSources([
  source("framework.ai", `
define type AppEnvironment of Environment
    Compute compute
    List of Storage databases
`),
], [coreLanguageSnapshot]);
assertNoErrors(definitions.diagnostics);

const result = linkProject({
  snapshot: definitions.snapshot,
  sources: [
    source("eu.ai", `
environment eu
    name = Europe

deployment production
    compute:
        compute k8s
            name = Kubernetes

    databases:
        storage db_one
            name = Primary database
        storage db_two
            name = Cache database
`),
    source("app.ai", `
context app

system application
    name = Application

    service worker
        name = Worker
        deployment:
            runsOn k8s from eu
            uses db_one from eu
            uses db_two from eu
`),
  ],
});
assertNoErrors(result.diagnostics);

const worker = result.elements.find((element) => element.id === "app/worker");
assert.deepEqual(
  worker?.attributes.uses,
  ["eu/db_one", "eu/db_two"],
  "concrete infrastructure references of the same family must all survive deployment linking",
);

console.log("deployment concrete uses contract fixtures passed");

function assertNoErrors(diagnostics) {
  const errors = diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR");
  assert.deepEqual(errors, []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
