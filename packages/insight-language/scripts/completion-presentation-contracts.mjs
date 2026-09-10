import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  CompletionEngine,
  coreLanguageSnapshot,
  linkProject,
  buildProjectStructure,
  createGeneratedInsightSyntaxProvider,
} from "../build/runtime/index.js";

const framework = `
define type Cabinet of BoundaryElement
    constructor cabinet

    List of Drawer drawers
    Drawer primary
    Text caption
    List of Drawer _

define type Drawer of Element
    constructor drawer

    List of Drawer children
    Drawer inner
    Text caption
`;
const built = buildLanguageSnapshotResultFromSources([
  { sourceName: "vocabulary.ai", source: framework },
], [coreLanguageSnapshot]);
assert.deepEqual(built.diagnostics, []);
const engine = new CompletionEngine(createGeneratedInsightSyntaxProvider());

function complete(marked, options = {}) {
  const cursorOffset = marked.indexOf("<caret>");
  const source = marked.replace("<caret>", "");
  const result = engine.complete({
    sourceName: "main.ai", source, cursorOffset, snapshot: built.snapshot, ...options,
  });
  return { ...result, source };
}

const root = complete("context demo\n\n<caret>");
assert.equal(root.items.find((item) => item.label === "cabinet")?.typeName, "Cabinet");
assert(!root.items.some((item) => item.label === "drawer"));

// The same attribute insertion works in named, anonymous, implicit and deep bodies.
for (const body of [
  "cabinet box\n    ",
  "cabinet _\n    ",
  "cabinet box\n    drawer unit\n        ",
  "cabinet box\n    drawer _\n        ",
  "cabinet box\n    drawers:\n        drawer unit\n            ",
  "cabinet box\n    drawers:\n        drawer _\n            ",
  "cabinet box\n    primary:\n        ",
  "cabinet box\n    drawer unit\n        inner:\n            ",
  "cabinet box\n    primary:\n        drawer unit\n            ",
  "cabinet box\n    primary:\n        drawer _\n            ",
]) {
  const indent = body.split("\n").at(-1);
  const isCabinet = body.split("\n").length === 2;
  const listName = isCabinet ? "drawers" : "children";
  const objectName = isCabinet ? "primary" : "inner";
  for (const [name, typeName] of [[listName, "List of Drawer"], [objectName, "Drawer"], ["caption", "Text"]]) {
    for (const word of ["<caret>", `${name.slice(0, 2)}<caret>`, `${name.slice(0, 2)}<caret>${name.slice(2)}`, `${name}<caret>`]) {
      const result = complete(`context demo\n\n${body}${word}`);
      const item = result.items.find((item) => item.label === name);
      assert(item, `${body}${word}: missing ${name}`);
      assert.equal(item.typeName, typeName);
      const text = name === "caption" ? "caption = " : `${name}:\n${indent}    `;
      assert.equal(item.insertText, text);
      assert.equal(
        result.source.slice(0, result.replacementStartOffset) + item.insertText + result.source.slice(result.replacementEndOffset),
        `context demo\n\n${body}${text}`,
      );
      if (word !== "<caret>") assert.deepEqual(result.items.map((item) => item.label),
        name === "drawers" && word !== `${name}<caret>` ? [name, "drawer"] : [name]);
    }
  }
}

for (const imported of [false, true]) {
  const result = complete("context demo\n\ncabinet box\n    drawers:\n        <caret>", {
    indexedIdentifiers: new Map([
      ["remote", { label: "remote", type: "Drawer", imported }],
      ["wrong", { label: "wrong", type: "Cabinet" }],
    ]),
  });
  assert.deepEqual(result.items.map((item) => [item.label, item.typeName]), [
    ["drawer", "Drawer"], ["remote", "Drawer"],
  ]);
}

const scalarValue = complete("context demo\n\ncabinet box\n    caption = some <caret>text");
assert.deepEqual(scalarValue.items, []);


// Root labels use their actual types; environment roots are not Context instances.
for (const [keyword, localType] of [["context", "Context"], ["environment", "Environment"]]) {
  const rootTypes = new Map([["design", "Context"], ["production", "Environment"], ["region", "CustomRegion"]]);
  for (const reference of ["context", "environment"]) {
    const result = complete(`${keyword} local\n\nimport item from ${reference} <caret>`, {
      rootTypes, contextIds: ["unknown"],
    });
    assert.deepEqual(result.items.map((item) => [item.label, item.typeName]), [
      ["design", "Context"], ["local", localType], ["production", "Environment"],
      ["region", "CustomRegion"], ["unknown", undefined],
    ]);
    assert(!rootTypes.has("local"), "completion must not mutate the caller's root index");
  }
}

const specialized = buildLanguageSnapshotResultFromSources([
  { sourceName: "region.ai", source: "define type CustomRegion of Environment\n    Text caption\n" },
], [coreLanguageSnapshot]);
assert.deepEqual(specialized.diagnostics, []);
assert.equal(complete("environment local\n\nimport item from environment lo<caret>", {
  snapshot: specialized.snapshot,
}).items[0]?.typeName, "CustomRegion");


for (const snapshot of [coreLanguageSnapshot, specialized.snapshot]) {
  const rootType = snapshot === coreLanguageSnapshot ? "Environment" : "CustomRegion";
  const model = "context logical\n\ndeploymentProfile archinsight_service\n    appliesTo:\n        production from west\n";
  const sources = [
    { sourceName: "model.ai", source: model },
    { sourceName: "west.ai", source: "# Infrastructure\nenvironment west\n    name = West\n\ndeployment production\n" },
    { sourceName: "east.ai", source: "environment east\n    name = East\n\ndeployment production\n" },
    { sourceName: "other.ai", source: "environment other\n    name = Other\n\ndeployment staging\n" },
  ];
  const linked = linkProject({ snapshot, sources });
  assert.deepEqual(linked.diagnostics.filter((item) => item.level === "ERROR"), []);
  const roots = linked.contexts.map((root) => [root.id, root.type]);
  assert.deepEqual(roots, [["logical", "Context"], ["west", rootType], ["east", rootType], ["other", rootType]]);
  const west = linked.contexts.find((root) => root.id === "west");
  assert.equal(west.declaration.line, 2);
  assert.deepEqual(west.attributes.name, ["West"]);
  assert(west.capabilities.includes("document-aggregate-root"));
  const structure = buildProjectStructure(linked);
  assert.deepEqual(structure.contexts.map((root) => [root.id, root.type]), roots);
  const options = {
    snapshot,
    rootTypes: new Map(roots),
    contextualIdentifiers: linked.elements.filter((item) => !item.anonymous)
      .map((item) => ({ label: item.localId, type: item.type, contextId: item.context })),
  };
  for (const suffix of ["<caret>", "<caret>west", "w<caret>est", "west<caret>"]) {
    const result = complete(model.replace("production from west", `production from ${suffix}`), options);
    assert.deepEqual(result.items.map((item) => [item.label, item.typeName]),
      suffix.startsWith("<caret>") ? [["east", rootType], ["west", rootType]] : [["west", rootType]]);
  }
}

console.log("completion type labels and indented insertion contracts passed");
