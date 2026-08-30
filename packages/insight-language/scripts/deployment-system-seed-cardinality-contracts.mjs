import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  selectGraph,
} from "../build/runtime/index.js";

const view = (name) => readFileSync(
  new URL(`../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/${name}.aiq`, import.meta.url),
  "utf8",
);

const definitions = source("definitions.ai", `
define type AppEnvironment of Environment
    Compute compute
    NetworkConnection network
`);
const sources = [
  definitions,
  environment("eu", "Europe"),
  environment("sa", "South America"),
  source("model.ai", `
context app

deploymentProfile regional
    appliesTo:
        production from eu
        production from sa
    runsOn compute

external actor customer
    name = Customer
    links:
        -> frontend
            deployment:
                uses network

system platform
    name = Platform

    service frontend
        name = Frontend
        deployment:
            uses regional
        links:
            -> backend
                deployment:
                    uses network

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

const d2 = selectGraph(
  result,
  { context: "app", tab: "model.ai", view: "deployment-container", environment: "eu" },
  view("deployment-container"),
);
assert.deepEqual(graphSignature(d2), {
  elements: [
    "app/backend@@eu/compute",
    "app/customer",
    "app/frontend@@eu/compute",
    "eu/compute",
  ],
  edges: [
    "SyncWire:app/customer->app/frontend@@eu/compute:eu/network",
    "SyncWire:app/frontend@@eu/compute->app/backend@@eu/compute:eu/network",
  ],
}, "D2 must contain every selected physical relationship exactly once and no system-seed rollups");

const d1 = selectGraph(
  result,
  { context: "app", tab: "model.ai", view: "deployment-system" },
  view("deployment-system"),
);
assert.deepEqual(graphSignature(d1), {
  elements: [
    "app/customer",
    "app/platform@@eu/compute",
    "app/platform@@sa/compute",
  ],
  edges: [
    "SyncWire:app/customer->app/platform@@eu/compute:eu/network",
    "SyncWire:app/customer->app/platform@@sa/compute:sa/network",
  ],
}, "D1 must omit internal system relationships and retain each external relationship exactly once per environment");

console.log("deployment system seed cardinality contracts passed");

function environment(id, name) {
  return source(`${id}.ai`, `
environment ${id}
    name = ${name}

deployment production
    compute:
        compute compute
            name = Compute
    network:
        networkConnection network
            name = Network
            projection:
                source $from originalLink target $to
`);
}

function graphSignature(graph) {
  return {
    elements: Object.keys(graph.elements).sort(),
    edges: graph.edges.map((edge) => [
      edge.edge.type,
      `${edge.source}->${edge.target}`,
      edge.edge.projectionRoot ?? "",
    ].join(":")).sort(),
  };
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
