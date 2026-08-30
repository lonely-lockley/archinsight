import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  selectGraph,
} from "../build/runtime/index.js";

const sources = [
  source("definitions.ai", `
define type AppEnvironment of Environment
    Compute compute
`),
  infrastructure("eu", "European"),
  infrastructure("sa", "South American"),
  source("model.ai", `
context app

deploymentProfile regional
    appliesTo:
        production from eu
        production from sa
    runsOn compute

system platform
    name = Platform

    service frontend
        name = Frontend
        deployment:
            uses regional
        links:
            -> backend

    service backend
        name = Backend
        deployment:
            uses regional
`),
];

const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
assertNoErrors(snapshot.diagnostics);
const result = linkProject({ snapshot: snapshot.snapshot, sources });
assertNoErrors(result.diagnostics);

const graph = selectGraph(
  result,
  { context: "app", tab: "model.ai", view: "c2" },
  readFileSync(
    new URL("../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/c2.aiq", import.meta.url),
    "utf8",
  ),
);

assert.deepEqual(Object.keys(graph.elements).sort(), ["app/backend", "app/frontend"]);
assert.deepEqual(graph.groups, [{ owner: "app/platform", elements: ["app/frontend", "app/backend"] }]);
assert.deepEqual(graph.edges.map((edge) => `${edge.source}->${edge.target}`), ["app/frontend->app/backend"]);
assert.equal(
  Object.keys(graph.elements).some((id) => id.includes("@@")),
  false,
  "logical views must not materialize deployment occurrences",
);

console.log("C2 deployment isolation contracts passed");

function infrastructure(environment, name) {
  return source(`${environment}.ai`, `
environment ${environment}
    name = ${name}

deployment production
    compute:
        compute cluster
            name = Cluster
`);
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"),
    [],
  );
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
