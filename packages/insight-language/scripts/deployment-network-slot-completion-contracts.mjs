import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  CompletionEngine,
  coreLanguageSnapshot,
  createGeneratedInsightSyntaxProvider,
} from "../build/runtime/index.js";

const completion = new CompletionEngine(createGeneratedInsightSyntaxProvider());
const constructorOnly = snapshot(`
define type MessageBroker of NetworkConnection
    constructor messageBroker
`);
const environmentSlot = snapshot(`
define type MessageBroker of NetworkConnection
    constructor messageBroker

define type AppEnvironment of Environment
    MessageBroker messageBroker
`);

assert.equal(
  labels(complete(constructorOnly)).has("messageBroker"),
  false,
  "a constructor is not itself a deployment slot",
);
assert.equal(
  labels(complete(environmentSlot)).has("messageBroker"),
  true,
  "a custom NetworkConnection Environment slot must be offered to wire deployment completion",
);

console.log("deployment network slot completion contracts passed");

function complete(languageSnapshot) {
  const sourceWithCursor = `
context consumer

import backend from context application

system client
    name = Client
    links:
        ~> backend
            deployment:
                uses __CURSOR__
`.trimStart();
  const cursorOffset = sourceWithCursor.indexOf("__CURSOR__");
  return completion.complete({
    sourceName: "consumer.ai",
    source: sourceWithCursor.replace("__CURSOR__", ""),
    cursorOffset,
    snapshot: languageSnapshot,
    contextIds: ["application", "consumer"],
    indexedIdentifiers: new Map([
      ["backend", { label: "backend", type: "Service", imported: true }],
    ]),
  });
}

function snapshot(sourceText) {
  const result = buildLanguageSnapshotResultFromSources([
    { sourceName: "definitions.ai", source: sourceText.trimStart() },
  ], [coreLanguageSnapshot]);
  assert.deepEqual(result.diagnostics, []);
  return result.snapshot;
}

function labels(result) {
  return new Set(result.items.map((item) => item.label));
}
