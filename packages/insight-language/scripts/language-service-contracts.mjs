import assert from "node:assert/strict";
import {
  coreLanguageSnapshot,
  InsightLanguageService,
} from "../build/runtime/index.js";

const service = new InsightLanguageService({ snapshot: coreLanguageSnapshot });

const source = {
  sourceName: "architecture.ai",
  source: `
context shared

system api
    name = API
`,
};

const result = service.link({ sources: [source] });
assert.equal(result.diagnostics.some((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"), false);
assert(result.graph.node("shared/api"));

const rendered = service.render({
  result,
  scope: { context: "shared", tab: "architecture.ai" },
  query: "MATCH (node:System) WHERE node.sourceIdentity = $tab RETURN node",
});
assert(rendered.graph.elements["shared/api"]);
assert.match(rendered.dot, /shared__api/);

const completion = service.complete({
  sourceName: "draft.ai",
  source: "",
  cursorOffset: 0,
  contextIds: ["shared"],
});
assert(completion.items.some((item) => item.label === "context" && item.insertText === "context "));

const state = service.createState({ sources: [source] });
const fork = service.forkState(state);
service.replaceSource(fork, {
  sourceName: "architecture.ai",
  source: `
context shared

system forked
    name = Forked
`,
});
assert(fork.result().graph.node("shared/forked"));
assert(state.result().graph.node("shared/api"));
assert.equal(state.result().graph.node("shared/forked"), undefined);

const update = service.replaceSource(state, {
  sourceName: "architecture.ai",
  source: `
context shared

system backend
    name = Backend
`,
});
assert(update.result.graph.node("shared/backend"));
assert.equal(update.result.graph.node("shared/api"), undefined);
assert(update.relinkedSources.has("architecture.ai"));

console.log("language service contract fixtures passed");
