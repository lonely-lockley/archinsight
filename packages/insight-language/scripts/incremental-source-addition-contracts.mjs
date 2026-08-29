import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  InsightLanguageService,
} from "../build/runtime/index.js";

const definitions = buildLanguageSnapshotResultFromSources([
  source("deployment-framework.ai", `
define type AppEnvironment of Environment
    Compute compute
`),
], [coreLanguageSnapshot]);
assertNoErrors(definitions.diagnostics);

const service = new InsightLanguageService({ snapshot: definitions.snapshot });
const initialSources = [
  environment("eu", "eu_compute"),
  source("application.ai", `
context application

deploymentProfile regional
    appliesTo:
        production from eu
        production from sa

    runsOn compute

system storefront
    name = Storefront

    service api
        name = API
        deployment:
            uses regional
`),
];

const state = service.createState({ sources: initialSources });
assert(
  state.result().diagnostics.some((diagnostic) => diagnostic.code === "UNDECLARED_IDENTIFIER"
    && diagnostic.message.includes("'production'")
    && diagnostic.message.includes("'sa'")),
  "the initial result must expose the unresolved deployment",
);

const sa = environment("sa", "sa_compute");
const update = service.replaceSource(state, sa);
const clean = service.link({ sources: [...initialSources, sa] });

assertNoErrors(update.result.diagnostics);
assert.deepEqual(resultSignature(update.result), resultSignature(clean));
assert(update.relinkedSources.has("application.ai"), "adding a provider must relink an existing unresolved consumer");
assert.deepEqual(
  update.result.elements.find((element) => element.id === "application/api")?.attributes.appliesTo,
  ["eu/production", "sa/production"],
);

console.log("incremental source addition contracts passed");

function environment(id, compute) {
  return source(`${id}.ai`, `
environment ${id}
    name = ${id}

deployment production
    compute:
        compute ${compute}
            name = ${compute}
`);
}

function resultSignature(result) {
  return {
    diagnostics: result.diagnostics.map((item) => ({ ...item })).sort(byJson),
    contexts: result.contexts.map((item) => ({ ...item })).sort(byJson),
    elements: result.elements.map((item) => ({ ...item })).sort(byJson),
    imports: result.imports.map((item) => ({ ...item })).sort(byJson),
    edges: result.edges.map((item) => ({ ...item })).sort(byJson),
    tabRoots: result.tabRoots,
    graphNodes: [...result.graph.nodes()].sort(byJson),
    graphRelations: [...result.graph.relations()].sort(byJson),
  };
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"),
    [],
  );
}

function byJson(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
