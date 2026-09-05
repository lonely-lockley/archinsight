import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
} from "../build/runtime/index.js";

const broad = `
define operator BroadWire of Edge
    constructor +> BaseTarget
        on BaseSource
`;
const specific = `
define operator SpecificWire of Edge
    constructor +> SpecificTarget
        on SpecificSource
`;

for (const operators of [`${broad}${specific}`, `${specific}${broad}`]) {
  const snapshot = definitions(operators);
  const result = linkProject({
    snapshot: snapshot.snapshot,
    sources: [source("model.ai", `
context test

specificSource caller
    links:
        +> callee

specificTarget callee
`)],
  });

  assertNoErrors(snapshot.diagnostics);
  assertNoErrors(result.diagnostics);
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0]?.type, "SpecificWire");
}

const ambiguous = definitions(`
define operator OwnerSpecificWire of Edge
    constructor ?> BaseTarget
        on SpecificSource

define operator TargetSpecificWire of Edge
    constructor ?> SpecificTarget
        on BaseSource
`);
assert.equal(
  ambiguous.diagnostics.filter((diagnostic) => diagnostic.code === "OPERATOR_OVERLOAD_AMBIGUOUS").length,
  1,
);

console.log("operator overload specificity contracts passed");

function definitions(operators) {
  return buildLanguageSnapshotResultFromSources([source("definitions.ai", `
define type BaseSource of BoundaryElement
    constructor baseSource

    List of Edge links

define type SpecificSource of BaseSource
    constructor specificSource

define type BaseTarget of BoundaryElement
    constructor baseTarget

define type SpecificTarget of BaseTarget
    constructor specificTarget

${operators}
`)], [coreLanguageSnapshot]);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((diagnostic) =>
    diagnostic.level === undefined || diagnostic.level === "ERROR"
  ), []);
}
