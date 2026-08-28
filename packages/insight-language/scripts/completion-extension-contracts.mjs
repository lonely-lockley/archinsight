import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  CompletionEngine,
  coreLanguageSnapshot,
  createGeneratedInsightSyntaxProvider,
} from "../build/runtime/index.js";

const snapshotBuild = buildLanguageSnapshotResultFromSources([{
  sourceName: "framework.ai",
  source: `
define type TestEnvironment of Environment
    NetworkConnection privateGateway
`.trimStart(),
}], [coreLanguageSnapshot]);
assert.deepEqual(snapshotBuild.diagnostics, []);

const engine = new CompletionEngine(createGeneratedInsightSyntaxProvider());
const source = `
context app

extend container frontend
    component editor
        name = Editor
        links:
            -> api
                deployment:
                    __CURSOR__
`.trimStart();

assertCompletion(source, "uses");
assertCompletion(source.replace("__CURSOR__", "uses __CURSOR__"), "privateGateway");

console.log("completion inside object extension contracts passed");

function assertCompletion(sourceWithCursor, expected) {
  const cursorOffset = sourceWithCursor.indexOf("__CURSOR__");
  const completion = engine.complete({
    sourceName: "components.ai",
    source: sourceWithCursor.replace("__CURSOR__", ""),
    cursorOffset,
    snapshot: snapshotBuild.snapshot,
    contextIds: ["test"],
  });
  const labels = completion.items.map((item) => item.label);
  assert(labels.includes(expected), `${expected} missing from ${labels.join(", ")}`);
}
