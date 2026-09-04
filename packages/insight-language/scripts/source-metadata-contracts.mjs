import assert from "node:assert/strict";
import {
  coreLanguageSnapshot,
  linkProject,
  parseInsightSource,
} from "../build/runtime/index.js";

const cases = [
  coreTypesCarryDeclarationMetadata,
  abstractTypesContributeToTheLanguageSnapshot,
  linkedEntitiesCarryDeclarationMetadata,
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
  console.log("source metadata contract fixtures passed");
}

function coreTypesCarryDeclarationMetadata() {
  const service = coreLanguageSnapshot.types.find((item) => item.name === "Service");
  assert(service?.declaration !== undefined, "Missing Service type declaration");
  assert.equal(service.declaration.sourceName, "core_container.ai");
  assert.equal(service.declaration.line, 12);
  assert.equal(service.declaration.column, 13);

  const wire = coreLanguageSnapshot.types.find((item) => item.name === "Wire");
  assert(wire?.declaration !== undefined, "Missing Wire operator type declaration");
  assert.equal(wire.declaration.sourceName, "core_operator.ai");
  assert.equal(wire.declaration.line, 7);
  assert.equal(wire.declaration.column, 17);
}

function abstractTypesContributeToTheLanguageSnapshot() {
  const parsed = parseInsightSource({
    sourceName: "extension-point.ai",
    source: "define abstract type ExtensionPoint of Element\n",
  });

  assert.equal(parsed.metadata.role, "definitions");
  assert.equal(parsed.metadata.contributesToSnapshot, true);
  assert.equal(parsed.metadata.reliable, true);
}

function linkedEntitiesCarryDeclarationMetadata() {
  const sourceText = `
context symbols

import imported from context external

@planned
system source # Source note
    name = Source
    links:
        @attribute(style=dotted)
        -> target # Edge note

system target
    name = Target
`.trimStart();
  const result = linkProject({
    snapshot: coreLanguageSnapshot,
    sources: [
      source("external.ai", `
context external

system imported
    name = Imported
`),
      source("symbols.ai", sourceText),
    ],
  });

  assert.deepEqual(result.diagnostics.filter((item) => item.level !== "NOTE"), []);
  assertLocationToken(sourceText, result.contexts.find((item) => item.id === "symbols")?.declaration, "context");
  assertLocationToken(sourceText, result.imports[0]?.declaration, "imported");
  const sourceElement = result.elements.find((item) => item.localId === "source");
  const sourceEdge = result.edges.find((item) => item.source === "symbols/source");
  assertLocationToken(sourceText, sourceElement?.declaration, "system");
  assertLocationToken(sourceText, sourceElement?.annotations?.[0]?.source, "@planned");
  assertLocationToken(sourceText, sourceElement?.noteSource, "#");
  assertLocationToken(sourceText, sourceEdge?.declaration, "->");
  assertLocationToken(sourceText, sourceEdge?.annotations?.[0]?.source, "@attribute");
  assertLocationToken(sourceText, sourceEdge?.noteSource, "#");
}

function assertLocationToken(sourceText, location, expectedToken) {
  assert(location !== undefined, `Missing declaration for ${expectedToken}`);
  assert.equal(location.sourceName, "symbols.ai");
  assert.equal(tokenAt(sourceText, location.line, location.column), expectedToken, JSON.stringify(location));
}

function tokenAt(sourceText, oneBasedLine, oneBasedColumn) {
  const line = sourceText.split(/\r?\n/)[oneBasedLine - 1] ?? "";
  const suffix = line.slice(Math.max(0, oneBasedColumn - 1));
  const annotation = /^@[A-Za-z_][A-Za-z0-9_]*/.exec(suffix);
  if (annotation !== null) {
    return annotation[0];
  }
  const identifier = /^[A-Za-z_][A-Za-z0-9_]*/.exec(suffix);
  if (identifier !== null) {
    return identifier[0];
  }
  if (suffix.startsWith("#")) {
    return "#";
  }
  const operator = /^[~+\-*\/!?<>=|&:]+/.exec(suffix);
  return operator?.[0] ?? "";
}

function source(sourceName, sourceText) {
  return {
    sourceName,
    source: sourceText.trimStart(),
  };
}
