import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  CompletionEngine,
  coreLanguageSnapshot,
  createGeneratedInsightSyntaxProvider,
  linkProject,
  parseWithGeneratedInsightParser,
  TypeSystem,
} from "../build/runtime/index.js";

const completion = new CompletionEngine(createGeneratedInsightSyntaxProvider());

const cases = [
  exposesOnlyCanonicalTextType,
  parsesCanonicalTextLikeEveryOtherType,
  rejectsLowercaseTextInTypePosition,
  completesOnlyCanonicalTextType,
  keepsLowercaseTextAvailableAsAPropertyName,
  linksCanonicalTextAttributes,
];

let failures = 0;
for (const testCase of cases) {
  try {
    testCase();
  } catch (error) {
    failures++;
    console.error(`${testCase.name} failed`);
    console.error(error);
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log("canonical Text type contracts passed");
}

function exposesOnlyCanonicalTextType() {
  const typeSystem = new TypeSystem(coreLanguageSnapshot);
  assert.equal(typeSystem.isDeclared("Text"), true);
  assert.equal(typeSystem.isDeclared("text"), false);
  assert.equal(coreLanguageSnapshot.types.filter((type) => type.name.toLowerCase() === "text").length, 1);
}

function parsesCanonicalTextLikeEveryOtherType() {
  const parsed = parseDefinitions(`
define type Note of Element
    constructor note
    required Text body
`);
  assert.deepEqual(parsed.syntaxErrors, []);

  const result = buildLanguageSnapshotResultFromSources([source("note.ai", `
define type Note of Element
    constructor note
    required Text body
`)], [coreLanguageSnapshot]);
  assertNoErrors(result.diagnostics);
  assert.equal(result.snapshot.types.find((type) => type.name === "Note")?.attributes?.[0]?.type, "Text");
}

function rejectsLowercaseTextInTypePosition() {
  const parsed = parseDefinitions(`
define type Note of Element
    constructor note
    required text body
`);
  assert(parsed.syntaxErrors.length > 0);
}

function completesOnlyCanonicalTextType() {
  const sourceText = `define type Note of Element\n    constructor note\n    required `;
  const result = completion.complete({
    sourceName: "completion.ai",
    source: sourceText,
    cursorOffset: sourceText.length,
    snapshot: coreLanguageSnapshot,
  });
  const typeItems = result.items.filter((item) => item.kind === "TYPE");
  assert(typeItems.some((item) => item.label === "Text"));
  assert.equal(typeItems.some((item) => item.label === "text"), false);
}

function keepsLowercaseTextAvailableAsAPropertyName() {
  const parsed = parseDefinitions(`
define presentation Element
    light
        text = #101010
`);
  assert.deepEqual(parsed.syntaxErrors, []);
}

function linksCanonicalTextAttributes() {
  const definitions = buildLanguageSnapshotResultFromSources([source("note.ai", `
define type Note of BoundaryElement
    constructor note
    required Text body
`)], [coreLanguageSnapshot]);
  assertNoErrors(definitions.diagnostics);

  const result = linkProject({
    snapshot: definitions.snapshot,
    sources: [source("model.ai", `
context demo

note release_note
    body = Text is stored as a scalar attribute
`)],
  });
  assertNoErrors(result.diagnostics);
  assert.deepEqual(result.elements.find((element) => element.localId === "release_note")?.attributes.body, [
    "Text is stored as a scalar attribute",
  ]);
}

function parseDefinitions(sourceText) {
  const trimmed = sourceText.trimStart();
  return parseWithGeneratedInsightParser({
    sourceName: "definitions.ai",
    source: trimmed,
    cursorOffset: trimmed.length,
    snapshot: coreLanguageSnapshot,
  });
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((diagnostic) => diagnostic.severity === "error"), []);
}
