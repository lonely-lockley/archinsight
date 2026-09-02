import assert from "node:assert/strict";
import { InsightLanguageService, ProjectAnalysisSession } from "../build/runtime/index.js";

const service = new InsightLanguageService();
const initialSources = [
  source("definitions.ai", definition("customSystem")),
  source("models\\main.ai", model("customSystem", "Initial")),
];
const session = service.createProjectAnalysisSession(initialSources);
const initial = session.analysis();

assert.deepEqual(initial.sources.map((item) => item.sourceName), ["definitions.ai", "models/main.ai"]);
assert.deepEqual(initial.snapshotSources, ["definitions.ai"]);
assert(initial.snapshotBuild.snapshot.constructors.some((item) => item.spelling === "customSystem"));
assert.equal(elementName(initial.result), "Initial");
assertNoErrors(initial.diagnostics);

const unchanged = session.update(initialSources);
assert.equal(unchanged.mode, "unchanged");
assert.equal(unchanged.relinkedSourceCount, 0);

const editedSources = [
  initialSources[0],
  source("models/main.ai", model("customSystem", "Incremental")),
];
const incremental = session.update(editedSources);
assert.equal(incremental.mode, "incremental");
assert(incremental.changedSources.has("models/main.ai"));
assert(incremental.relinkedSources.has("models/main.ai"));
assert.equal(elementName(incremental.result), "Incremental");
assert.deepEqual(resultSignature(incremental.result), resultSignature(ProjectAnalysisSession.create(editedSources).analysis().result));

const sourceLifecycle = session.fork();
const addedSources = [
  ...editedSources,
  source("extra.ai", `context demo

customSystem worker
    name = Worker
`),
];
const addition = sourceLifecycle.update(addedSources);
assert.equal(addition.mode, "incremental");
assert(addition.changedSources.has("extra.ai"));
assert(addition.result.elements.some((element) => element.localId === "worker"));
const removal = sourceLifecycle.update(editedSources);
assert.equal(removal.mode, "incremental");
assert(removal.changedSources.has("extra.ai"));
assert.equal(removal.result.elements.some((element) => element.localId === "worker"), false);

const fork = session.fork();
const overlay = fork.update([
  editedSources[0],
  source("models/main.ai", model("customSystem", "Overlay")),
]);
assert.equal(overlay.mode, "incremental");
assert.equal(elementName(overlay.result), "Overlay");
assert.equal(elementName(session.analysis().result), "Incremental");

const definitionEdit = session.update([
  source("definitions.ai", definition("application")),
  source("models/main.ai", model("application", "Rebuilt")),
]);
assert.equal(definitionEdit.mode, "full");
assert(definitionEdit.snapshotBuild.snapshot.constructors.some((item) => item.spelling === "application"));
assert.equal(elementName(definitionEdit.result), "Rebuilt");
assertNoErrors(definitionEdit.diagnostics);

const dependencyEdit = session.update([
  source("definitions.ai", definition("application")),
  source("models/main.ai", `context demo

import vendor from context external

application app
    name = Rebuilt
`),
]);
assert.equal(dependencyEdit.mode, "full");

const supportAddition = session.update([
  source("definitions.ai", definition("application")),
  source("models/main.ai", model("application", "Rebuilt")),
  source("consumer.ai", `context consumer

import app from context demo
`),
]);
assert.equal(supportAddition.mode, "full");

console.log("project analysis session contracts passed");

function model(constructor, name) {
  return `context demo

${constructor} app
    name = ${name}
`;
}

function definition(constructor) {
  return `define type CustomSystem of System
    constructor ${constructor}
        kind = internal
`;
}

function elementName(result) {
  return result.elements.find((element) => element.localId === "app")?.attributes.name?.[0];
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
