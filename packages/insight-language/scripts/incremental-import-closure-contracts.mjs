import assert from "node:assert/strict";
import { coreLanguageSnapshot, InsightLanguageService } from "../build/runtime/index.js";

const service = new InsightLanguageService({ snapshot: coreLanguageSnapshot });
const initialSources = [
  source("external.ai", `
context external

external system google
    name = Google

external system azure
    name = Azure
`),
  source("backend.ai", `
context app

import google from context external
import azure from context external

system backend
    name = Backend
    links:
        -> google
`),
  source("frontend.ai", frontend("Frontend")),
];

const state = service.createState({ sources: initialSources });
assertNoErrors(state.result());

const brokenState = service.createState({ sources: initialSources });
const broken = service.replaceSource(brokenState, source("frontend.ai", `
context app

import backend from context app

system frontend
    name =
`)).result;
assert(broken.diagnostics.some((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"));

const replacement = source("frontend.ai", frontend("Updated frontend"));
const update = service.replaceSource(state, replacement);
const incremental = update.result;
const clean = service.link({
  sources: initialSources.map((item) => item.sourceName === replacement.sourceName ? replacement : item),
});

assertNoErrors(incremental);
assert.deepEqual(update.affectedSources, new Set(["frontend.ai"]));
assert.deepEqual(update.supportSources, new Set(["frontend.ai", "backend.ai"]),
  "an incremental relink must load direct siblings without recursively expanding their import closure");
assert.deepEqual(update.relinkedSources, new Set(["frontend.ai"]));
assert.deepEqual(resultSignature(incremental), resultSignature(clean));
assert(incremental.imports.some((item) => item.sourceIdentity === "backend.ai" && item.alias === "google"));
assert(incremental.edges.some((edge) => edge.source === "app/backend" && edge.target === "external/google"));

const cosmeticState = service.createState({ sources: initialSources });
const cosmeticBackendReplacement = source("backend.ai", `
context app

import google from context external
import azure from context external

system backend
    name = Updated backend
    links:
        -> google
`);
const cosmeticUpdate = service.replaceSource(cosmeticState, cosmeticBackendReplacement);
const cosmeticClean = service.link({
  sources: initialSources.map((item) => item.sourceName === cosmeticBackendReplacement.sourceName
    ? cosmeticBackendReplacement
    : item),
});
assert.deepEqual(cosmeticUpdate.affectedSources, new Set(["backend.ai"]),
  "a stable graph dependency surface must not invalidate unchanged consumers");
assert.deepEqual(cosmeticUpdate.relinkedSources, new Set(["backend.ai"]));
assert.deepEqual(resultSignature(cosmeticUpdate.result), resultSignature(cosmeticClean));

const relationshipState = service.createState({ sources: initialSources });
const relationshipReplacement = source("backend.ai", `
context app

import google from context external
import azure from context external

system backend
    name = Backend
    links:
        -> azure
`);
const relationshipUpdate = service.replaceSource(relationshipState, relationshipReplacement);
const relationshipClean = service.link({
  sources: initialSources.map((item) => item.sourceName === relationshipReplacement.sourceName
    ? relationshipReplacement
    : item),
});
assert(relationshipUpdate.affectedSources.has("frontend.ai"),
  "relationship topology changes must retain dependent consumers for global graph diagnostics");
assert(relationshipUpdate.supportSources.has("external.ai"));
assert.deepEqual(resultSignature(relationshipUpdate.result), resultSignature(relationshipClean));

const dependentState = service.createState({ sources: initialSources });
const backendReplacement = source("backend.ai", `
context app

import google from context external
import azure from context external

system backend_v2
    name = Updated backend
    links:
        -> google
`);
const dependentUpdate = service.replaceSource(dependentState, backendReplacement);
const dependentClean = service.link({
  sources: initialSources.map((item) => item.sourceName === backendReplacement.sourceName ? backendReplacement : item),
});
assert(dependentUpdate.affectedSources.has("frontend.ai"));
assert(dependentUpdate.supportSources.has("external.ai"),
  "an edit with dependent sources must retain the transitive closure required by global deployment and projection phases");
assert.deepEqual(resultSignature(dependentUpdate.result), resultSignature(dependentClean));

console.log("incremental import closure contracts passed");

function frontend(name) {
  return `
context app

import backend from context app

system frontend
    name = ${name}
    links:
        -> backend
`;
}

function resultSignature(result) {
  return {
    diagnostics: result.diagnostics.map((item) => JSON.stringify(item)).sort(),
    contexts: result.contexts.map((item) => `${item.id}|${item.sourceIdentity}`).sort(),
    elements: result.elements.map((item) => `${item.id}|${item.sourceIdentity}`).sort(),
    imports: result.imports.map((item) => `${item.sourceIdentity}|${item.alias}|${item.target}`).sort(),
    edges: result.edges.map((item) => `${item.source}|${item.target}|${item.sourceIdentity}`).sort(),
    graphNodes: [...result.graph.nodes()].map((item) => JSON.stringify(item)).sort(),
    graphRelations: [...result.graph.relations()].map((item) => JSON.stringify(item)).sort(),
  };
}

function assertNoErrors(result) {
  assert.deepEqual(
    result.diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"),
    [],
  );
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
