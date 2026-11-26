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
  false,
  "NetworkConnection slots must not be offered where relationship deployment requires a Route",
);
assert.equal(
  labels(complete(environmentSlot)).has("clusterLocal"),
  true,
  "environment-owned routes must be offered to relationship deployment completion",
);

assert.deepEqual([...labels(complete(environmentSlot, "route clusterLocal __CURSOR__"))], ["in"]);
assert.deepEqual([...labels(complete(environmentSlot, "route clusterLocal in __CURSOR__"))].sort(), ["eu", "latam"]);
assert.deepEqual([...labels(complete(environmentSlot, "route clusterLocal in la__CURSOR__"))], ["latam"]);
assert.deepEqual([...labels(complete(environmentSlot, "route clusterLocal in __CURSOR__", []))], ["target_env"]);

const customRoute = snapshot(`
define operator ForwardPath of DeploymentAction
    constructor forwardVia Route
        on Wire
    capability = "deployment-route-use"
`);
assert.deepEqual([...labels(complete(customRoute, "forwardVia partner in __CURSOR__"))].sort(), ["eu", "latam"]);

console.log("deployment network slot completion contracts passed");

function complete(languageSnapshot, selection = "route __CURSOR__", ownerEnvs = ["eu", "latam"]) {
  const sourceWithCursor = `
context consumer

import backend from context application

system client
    name = Client
    links:
        ~> backend
            deployment:
                ${selection}
`.trimStart();
  const cursorOffset = sourceWithCursor.indexOf("__CURSOR__");
  return completion.complete({
    sourceName: "consumer.ai",
    source: sourceWithCursor.replace("__CURSOR__", ""),
    cursorOffset,
    snapshot: languageSnapshot,
    contextIds: ["application", "consumer"],
    contextualIdentifiers: [{ contextId: "consumer", label: "client", type: "System", deploymentEnvironments: ownerEnvs }],
    indexedIdentifiers: new Map([
      ["backend", { label: "backend", type: "Service", imported: true, deploymentEnvironments: ["target_env"] }],
      ["clusterLocal", { label: "clusterLocal", type: "Route", contextId: "application" }],
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
