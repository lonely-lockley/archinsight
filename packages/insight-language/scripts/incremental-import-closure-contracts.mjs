import assert from "node:assert/strict";
import { coreLanguageSnapshot, InsightLanguageService } from "../build/runtime/index.js";

const service = new InsightLanguageService({ snapshot: coreLanguageSnapshot });
const initialSources = [
  source("external.ai", `
context external

external system google
    name = Google
`),
  source("backend.ai", `
context app

import google from context external

system backend
    name = Backend
    links:
        -> google
`),
  source("frontend.ai", frontend("Frontend")),
];

const state = service.createState({ sources: initialSources });
assertNoErrors(state.result());

const broken = service.replaceSource(state, source("frontend.ai", `
context app

system frontend
    name =
`)).result;
assert(broken.diagnostics.some((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"));

const replacement = source("frontend.ai", frontend("Updated frontend"));
const incremental = service.replaceSource(state, replacement).result;
const clean = service.link({
  sources: initialSources.map((item) => item.sourceName === replacement.sourceName ? replacement : item),
});

assertNoErrors(incremental);
assert.deepEqual(resultSignature(incremental), resultSignature(clean));
assert(incremental.imports.some((item) => item.sourceIdentity === "backend.ai" && item.alias === "google"));
assert(incremental.edges.some((edge) => edge.source === "app/backend" && edge.target === "external/google"));

console.log("incremental import closure contracts passed");

function frontend(name) {
  return `
context app

system frontend
    name = ${name}
`;
}

function resultSignature(result) {
  return {
    contexts: result.contexts.map((item) => `${item.id}|${item.sourceIdentity}`).sort(),
    elements: result.elements.map((item) => `${item.id}|${item.sourceIdentity}`).sort(),
    imports: result.imports.map((item) => `${item.sourceIdentity}|${item.alias}|${item.target}`).sort(),
    edges: result.edges.map((item) => `${item.source}|${item.target}|${item.sourceIdentity}`).sort(),
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
