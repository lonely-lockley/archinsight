import assert from "node:assert/strict";
import {
  hydrateParsedSource,
  InsightLanguageService,
  parseInsightSource,
  portableParsedSource,
  ProjectAnalysisSession,
} from "../build/runtime/index.js";
import { ProjectLinkerSourceCache } from "../build/runtime/project-linker.js";
import { ProjectLinkerState } from "../build/runtime/project-linker-state.js";

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

const asyncSession = await ProjectAnalysisSession.createAsync(initialSources, async (sources) => {
  assert.deepEqual(sources.map((item) => item.sourceName), ["definitions.ai", "models/main.ai"]);
  return sources.map((item) => hydrateParsedSource(portableParsedSource(parseInsightSource(item))));
});
assert.deepEqual(resultSignature(asyncSession.analysis().result), resultSignature(initial.result),
  "portable parallel-parser results must remain equivalent to the synchronous parser");

const restoredSession = ProjectAnalysisSession.restore(session.portableSnapshot());
assert.deepEqual(
  resultSignature(restoredSession.analysis().result),
  resultSignature(initial.result),
  "a portable session snapshot must restore the complete linked result and indexed graph",
);
const restoredUnchanged = restoredSession.update(initialSources);
assert.equal(restoredUnchanged.mode, "unchanged");
assert.equal(restoredUnchanged.reparsedSourceCount, 0);
const restoredIncremental = restoredSession.update([
  initialSources[0],
  source("models/main.ai", model("customSystem", "Restored incremental")),
]);
assert.equal(restoredIncremental.mode, "incremental");
assert.equal(restoredIncremental.reparsedSourceCount, 1);
assert.equal(elementName(restoredIncremental.result), "Restored incremental");

const typeChangeSources = [
  source("types.ai", typeChangeDefinitions()),
  source("model.ai", model("firstSystem", "Before type change")),
];
const cachedTypeChangeSession = ProjectAnalysisSession.restore(
  ProjectAnalysisSession.create(typeChangeSources).portableSnapshot(),
);
const changedTypeSources = [
  typeChangeSources[0],
  source("model.ai", model("secondSystem", "After type change")),
];
const cachedTypeChange = cachedTypeChangeSession.update(changedTypeSources);
assert.equal(cachedTypeChange.mode, "full",
  "changing an existing element constructor must rebuild the complete semantic project");
assert.equal(cachedTypeChange.reparsedSourceCount, 1,
  "a full semantic rebuild after a type change must reuse cached ASTs for unchanged sources");
assert.deepEqual(cachedTypeChange.relinkedSources, new Set(["model.ai", "types.ai"]));
assert.deepEqual(
  resultSignature(cachedTypeChange.result),
  resultSignature(ProjectAnalysisSession.create(changedTypeSources).analysis().result),
  "a cached type-change rebuild must equal a clean project analysis",
);

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
assert(incremental.supportSources.has("models/main.ai"));
assert(incremental.relinkedSources.has("models/main.ai"));
assert.equal(incremental.reparsedSourceCount, 1);
assert.equal(elementName(incremental.result), "Incremental");
assert.deepEqual(resultSignature(incremental.result), resultSignature(ProjectAnalysisSession.create(editedSources).analysis().result));

const cachedSupportSources = [
  source("external.ai", `context external

system vendor
    name = Vendor
`),
  source("sibling.ai", `context demo

system sibling
    name = Sibling
`),
  source("main.ai", `context demo

import vendor from context external

system app
    name = Initial
    links:
        -> vendor
`),
];
const sourceCache = new ProjectLinkerSourceCache();
const cachedState = new ProjectLinkerState({
  snapshot: service.snapshot(),
  sources: cachedSupportSources,
}, undefined, sourceCache);
const initialParseCount = sourceCache.parseCount();
const cachedUpdate = cachedState.replaceSource(source("main.ai", `context demo

import vendor from context external

system app
    name = Changed
    links:
        -> vendor
`));
assert.equal(sourceCache.parseCount() - initialParseCount, 1,
  "an incremental replacement must parse only the changed source and reuse unchanged providers");
assert(cachedUpdate.supportSources.has("external.ai"),
  "the cached provider must remain available as linking support");
assert(cachedUpdate.supportSources.has("sibling.ai"),
  "an unchanged same-context sibling must remain available from the parse cache");
assert.deepEqual(cachedUpdate.relinkedSources, new Set(["main.ai"]),
  "unchanged linking support must not be reported or merged as recomputed output");
assert.deepEqual(
  resultSignature(cachedUpdate.result),
  resultSignature(ProjectAnalysisSession.create([
    cachedSupportSources[0],
    cachedSupportSources[1],
    source("main.ai", `context demo

import vendor from context external

system app
    name = Changed
    links:
        -> vendor
`),
  ]).analysis().result),
);

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

const commentSession = ProjectAnalysisSession.create([
  source("comment.ai", `context comments

# define type ThisIsOnlyAComment
system app
`),
]);
assert.deepEqual(commentSession.analysis().snapshotSources, []);
const commentEdit = commentSession.update([
  source("comment.ai", `context comments

# define type StillOnlyAComment
system app
`),
]);
assert.equal(commentEdit.mode, "incremental");

const formattingSession = ProjectAnalysisSession.create([
  source("formatted.ai", `context demo

import vendor from context external
system app
`),
  source("external.ai", `context external

system vendor
`),
]);
const formattingOnly = formattingSession.update([
  source("formatted.ai", `# formatting does not change dependencies
context demo

# same import
import   vendor   from context external
system app
`),
  source("external.ai", `context external

system vendor
`),
]);
assert.equal(formattingOnly.mode, "incremental");

const batchSession = ProjectAnalysisSession.create([
  source("one.ai", model("system", "One")),
  source("two.ai", `context second\n\nsystem two\n    name = Two\n`),
]);
const batchSources = [
  source("one.ai", model("system", "One changed")),
  source("two.ai", `context second\n\nsystem two\n    name = Two changed\n`),
];
const batchUpdate = batchSession.update(batchSources);
assert.equal(batchUpdate.mode, "incremental");
assert.deepEqual(batchUpdate.changedSources, new Set(["one.ai", "two.ai"]));
assert.equal(batchUpdate.relinkedSourceCount, batchUpdate.relinkedSources.size);
assert.equal(batchUpdate.reparsedSourceCount, 2);
assert.deepEqual(
  resultSignature(batchUpdate.result),
  resultSignature(ProjectAnalysisSession.create(batchSources).analysis().result),
  "a batch update links the union of affected sources once and remains equivalent to a clean analysis",
);

const anonymousImportSession = ProjectAnalysisSession.create([
  source("main.ai", model("system", "Main")),
]);
const anonymousImportAddition = anonymousImportSession.update([
  source("main.ai", model("system", "Main")),
  source("consumer.ai", `context consumer

system client
    links:
        -> app from demo
`),
]);
assert.equal(anonymousImportAddition.mode, "full");

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

function typeChangeDefinitions() {
  return `define type FirstSystem of System
    constructor firstSystem

define type SecondSystem of System
    constructor secondSystem
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
