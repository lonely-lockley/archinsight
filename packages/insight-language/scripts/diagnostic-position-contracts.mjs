import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  mergeLanguageSnapshots,
} from "../build/runtime/index.js";

const cases = [
  frameworkUnknownBaseTypePointsToTypeToken,
  frameworkDuplicateTypeDeclarationPointsToDuplicateTypeToken,
  frameworkRepeatedTypeExtensionWarningPointsToRepeatedTypeToken,
  frameworkDuplicateTypeConstructorPointsToDuplicateConstructorToken,
  frameworkDuplicateOperatorConstructorPointsToDuplicateOperatorToken,
  frameworkDuplicatePresentationDeclarationPointsToDuplicatePresentationToken,
  frameworkUnknownPresentationExtensionPointsToPresentationIdentifier,
  frameworkUnknownPresentationTypePointsToPresentationIdentifier,
  frameworkUnknownPresentationFieldPointsToFieldToken,
  frameworkUnknownPresentationAttributeValuePointsToValueToken,
  frameworkUnknownPresentationSectionPointsToSectionToken,
  frameworkUnknownPresentationSectionPropertyPointsToPropertyToken,
  architectureUnknownConstructorPointsToConstructorToken,
  duplicateIdentifierPointsToDuplicateIdentifierToken,
  architectureUnknownAttributePointsToAttributeToken,
  architectureUnknownNestedSlotPointsToSlotToken,
  architectureUnknownOperatorPointsToOperatorToken,
  architectureUndeclaredEdgeTargetPointsToTargetToken,
  architectureMissingImportPointsToTargetToken,
  architectureUndeclaredExtensionTargetPointsToTargetToken,
  architectureInvalidExtensionConstructorPointsToConstructorToken,
  architectureTypedAttributeMismatchPointsToAttributeToken,
  unknownImportContextPointsToContextIdentifier,
  unknownImportedElementPointsToImportedIdentifier,
  isolatedElementCoversIdentifierToken,
  deprecatedAttributeAnnotationCoversAnnotationToken,
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
  console.log("diagnostic position contract fixtures passed");
}

function frameworkUnknownBaseTypePointsToTypeToken() {
  const sourceText = `
define type Widget of MissingBase
    constructor widget
`.trimStart();
  const result = buildLanguageSnapshotResultFromSources([
    source("definitions.ai", sourceText),
  ]);
  assertDiagnosticToken(result.diagnostics, sourceText, "TYPE_NOT_DECLARED", "MissingBase", "MissingBase");
}

function frameworkDuplicateTypeDeclarationPointsToDuplicateTypeToken() {
  const sourceText = `
define type Widget
    constructor widget

define type Widget
    constructor duplicate
`.trimStart();
  const result = buildLanguageSnapshotResultFromSources([
    source("definitions.ai", sourceText),
  ]);
  assertDiagnosticToken(result.diagnostics, sourceText, "TYPE_ALREADY_DECLARED", "already declared", "Widget");
}

function frameworkRepeatedTypeExtensionWarningPointsToRepeatedTypeToken() {
  const sourceText = `
define type Widget
    constructor widget

define type First
    constructor first

define type Second
    constructor second

extend type Widget
    First first

extend type Widget
    Second second
`.trimStart();
  const result = buildLanguageSnapshotResultFromSources([
    source("definitions.ai", sourceText),
  ]);
  assertDiagnosticToken(result.diagnostics, sourceText, "TYPE_EXTENDED_MULTIPLE_TIMES", "Widget", "Widget");
}

function frameworkDuplicateTypeConstructorPointsToDuplicateConstructorToken() {
  const sourceText = `
define type First of Element
    constructor widget

define type Second of Element
    constructor widget
`.trimStart();
  const result = buildLanguageSnapshotResultFromSources([
    source("definitions.ai", sourceText),
  ]);
  assertDiagnosticToken(result.diagnostics, sourceText, "CONSTRUCTOR_ALREADY_DECLARED", "widget", "widget");
}

function frameworkDuplicateOperatorConstructorPointsToDuplicateOperatorToken() {
  const sourceText = `
define operator FirstWire of Edge
    constructor +> Element
        on Element

define operator SecondWire of Edge
    constructor +> Element
        on Element
`.trimStart();
  const result = buildLanguageSnapshotResultFromSources([
    source("definitions.ai", sourceText),
  ]);
  assertDiagnosticToken(result.diagnostics, sourceText, "CONSTRUCTOR_ALREADY_DECLARED", "+>", "+>");
}

function frameworkUnknownPresentationTypePointsToPresentationIdentifier() {
  const sourceText = `
define presentation Ghost
    # empty
`.trimStart();
  const result = buildLanguageSnapshotResultFromSources([
    source("definitions.ai", sourceText),
  ]);
  assertDiagnosticToken(result.diagnostics, sourceText, "UNKNOWN_PRESENTATION_TYPE", "Ghost", "Ghost");
}

function frameworkDuplicatePresentationDeclarationPointsToDuplicatePresentationToken() {
  const sourceText = `
define type Widget
    constructor widget

define presentation Widget
    header = name

define presentation Widget
    body = description
`.trimStart();
  const result = buildLanguageSnapshotResultFromSources([
    source("definitions.ai", sourceText),
  ]);
  assertDiagnosticToken(result.diagnostics, sourceText, "PRESENTATION_ALREADY_DECLARED", "Widget", "Widget");
}

function frameworkUnknownPresentationExtensionPointsToPresentationIdentifier() {
  const sourceText = `
define type Widget
    constructor widget

extend presentation Widget
    header = name
`.trimStart();
  const result = buildLanguageSnapshotResultFromSources([
    source("definitions.ai", sourceText),
  ]);
  assertDiagnosticToken(result.diagnostics, sourceText, "PRESENTATION_NOT_DECLARED", "Widget", "Widget");
}

function frameworkUnknownPresentationFieldPointsToFieldToken() {
  const sourceText = `
define type Widget
    constructor widget

    Text name

define presentation Widget
    title = name
`.trimStart();
  const result = linkFramework(sourceText);
  assertDiagnosticToken(result.diagnostics, sourceText, "ATTRIBUTE_NOT_DECLARED", "Presentation field 'title'", "title");
}

function frameworkUnknownPresentationAttributeValuePointsToValueToken() {
  const sourceText = `
define type Widget
    constructor widget

    Text name

define presentation Widget
    header = title
`.trimStart();
  const result = linkFramework(sourceText);
  assertDiagnosticToken(result.diagnostics, sourceText, "ATTRIBUTE_NOT_DECLARED", "Attribute 'title'", "title");
}

function frameworkUnknownPresentationSectionPointsToSectionToken() {
  const sourceText = `
define type Widget
    constructor widget

define presentation Widget
    fancy
        fill = "#ffffff"
`.trimStart();
  const result = linkFramework(sourceText);
  assertDiagnosticToken(result.diagnostics, sourceText, "ATTRIBUTE_NOT_DECLARED", "Presentation section 'fancy'", "fancy");
}

function frameworkUnknownPresentationSectionPropertyPointsToPropertyToken() {
  const sourceText = `
define type Widget
    constructor widget

define presentation Widget
    graphviz
        bogus = true
`.trimStart();
  const result = linkFramework(sourceText);
  assertDiagnosticToken(result.diagnostics, sourceText, "ATTRIBUTE_NOT_DECLARED", "Presentation section property 'bogus'", "bogus");
}

function architectureUnknownConstructorPointsToConstructorToken() {
  const sourceText = `
context shared

system app
    name = App

servie api
    name = API
`.trimStart();
  const result = linkWithCore(source("architecture.ai", sourceText));
  assertDiagnosticToken(result.diagnostics, sourceText, "CONSTRUCTOR_NOT_DECLARED", "servie", "servie");
}

function duplicateIdentifierPointsToDuplicateIdentifierToken() {
  const sourceText = `
context shared

system app
    name = App

system app
    name = Duplicate
`.trimStart();
  const result = linkWithCore(source("architecture.ai", sourceText));
  assertDiagnosticToken(result.diagnostics, sourceText, "IDENTIFIER_ALREADY_DECLARED", "app", "app");
}

function architectureUnknownAttributePointsToAttributeToken() {
  const sourceText = `
context shared

system app
    name = App
    titel = Wrong
`.trimStart();
  const result = linkWithCore(source("architecture.ai", sourceText));
  assertDiagnosticToken(result.diagnostics, sourceText, "ATTRIBUTE_NOT_DECLARED", "titel", "titel");
}

function architectureUnknownNestedSlotPointsToSlotToken() {
  const sourceText = `
context shared

system app
    name = App
    members:
        service api
            name = API
`.trimStart();
  const result = linkWithCore(source("architecture.ai", sourceText));
  assertDiagnosticToken(result.diagnostics, sourceText, "ATTRIBUTE_NOT_DECLARED", "members", "members");
}

function architectureUnknownOperatorPointsToOperatorToken() {
  const sourceText = `
context shared

system app
    name = App
    links:
        +> peer

system peer
    name = Peer
`.trimStart();
  const result = linkWithCore(source("architecture.ai", sourceText));
  assertDiagnosticToken(result.diagnostics, sourceText, "CONSTRUCTOR_NOT_DECLARED", "+>", "+>");
}

function architectureUndeclaredEdgeTargetPointsToTargetToken() {
  const sourceText = `
context shared

system app
    name = App
    links:
        -> missing
`.trimStart();
  const result = linkWithCore(source("architecture.ai", sourceText));
  assertDiagnosticToken(result.diagnostics, sourceText, "UNDECLARED_IDENTIFIER", "missing", "missing");
}

function architectureMissingImportPointsToTargetToken() {
  const sourceText = `
context shared

system app
    name = App
    links:
        -> target
`.trimStart();
  const result = linkWithCore(
    source("source.ai", sourceText),
    source("target.ai", `
context shared

system target
`),
  );
  assertDiagnosticToken(result.diagnostics, sourceText, "MISSING_IMPORT", "target", "target");
}

function architectureUndeclaredExtensionTargetPointsToTargetToken() {
  const sourceText = `
context shared

extend system missing
    service api
        name = API
`.trimStart();
  const result = linkWithCore(source("architecture.ai", sourceText));
  assertDiagnosticToken(result.diagnostics, sourceText, "UNDECLARED_IDENTIFIER", "missing", "missing");
}

function architectureInvalidExtensionConstructorPointsToConstructorToken() {
  const sourceText = `
context shared

system app
    name = App

extend actor app
    description = Wrong type
`.trimStart();
  const result = linkWithCore(source("architecture.ai", sourceText));
  assertDiagnosticToken(result.diagnostics, sourceText, "TYPE_MISMATCH", "actor", "actor");
}

function architectureTypedAttributeMismatchPointsToAttributeToken() {
  const sourceText = `
context shared

system app
    name = App

    service api
        name = API
        tier = silver
`.trimStart();
  const result = linkProject({
    snapshot: mergeLanguageSnapshots([coreLanguageSnapshot, tierSnapshot()]),
    sources: [source("architecture.ai", sourceText)],
  });
  assertDiagnosticToken(result.diagnostics, sourceText, "TYPE_MISMATCH", "tier", "tier");
}

function unknownImportContextPointsToContextIdentifier() {
  const sourceText = `
context shared

import target from context missing_context
`.trimStart();
  const result = linkWithCore(source("architecture.ai", sourceText));
  assertDiagnosticToken(result.diagnostics, sourceText, "UNKNOWN_IMPORT_CONTEXT", "missing_context", "missing_context");
}

function unknownImportedElementPointsToImportedIdentifier() {
  const sourceText = `
context source

import rederer from context archinsight
`.trimStart();
  const result = linkWithCore(
    source("source.ai", sourceText),
    source("archinsight.ai", `
context archinsight

service renderer
`),
  );
  assertDiagnosticToken(result.diagnostics, sourceText, "UNKNOWN_IMPORTED_ELEMENT", "rederer", "rederer");
}

function isolatedElementCoversIdentifierToken() {
  const sourceText = `
context shared

external system xxx
    name = External
`.trimStart();
  const result = linkWithCore(source("architecture.ai", sourceText));
  assertDiagnosticRange(result.diagnostics, sourceText, "ISOLATED_ELEMENT", "xxx", "xxx");
}

function deprecatedAttributeAnnotationCoversAnnotationToken() {
  const sourceText = `
context shared

@attribute
system app
    name = App
`.trimStart();
  const result = linkWithCore(source("architecture.ai", sourceText));
  assertDiagnosticRange(result.diagnostics, sourceText, "ATTRIBUTE_ANNOTATION_DEPRECATED", "@attribute", "@attribute");
}

function linkWithCore(...sources) {
  return linkProject({
    snapshot: mergeLanguageSnapshots([coreLanguageSnapshot]),
    sources,
  });
}

function linkFramework(sourceText) {
  const snapshotResult = buildLanguageSnapshotResultFromSources([
    source("definitions.ai", sourceText),
  ]);
  return linkProject({
    snapshot: snapshotResult.snapshot,
    sources: [],
  });
}

function tierSnapshot() {
  const result = buildLanguageSnapshotResultFromSources([
    source("definitions.ai", `
define type Tier
    required Text name

define enum of Tier
    gold
        name = Gold

extend type Service
    Tier tier
`),
  ]);
  assert.deepEqual(result.diagnostics, []);
  return result.snapshot;
}

function assertDiagnosticToken(diagnostics, sourceText, code, messageFragment, expectedToken, occurrence = 1) {
  const diagnostic = diagnostics.filter((item) =>
    item.code === code && item.message.includes(messageFragment)
  )[occurrence - 1];
  assert(diagnostic !== undefined, `Missing ${code} containing ${messageFragment}; actual: ${JSON.stringify(diagnostics)}`);
  assert.equal(tokenAt(sourceText, diagnostic.line, diagnostic.column), expectedToken, JSON.stringify(diagnostic));
}

function assertDiagnosticRange(diagnostics, sourceText, code, messageFragment, expectedRange, occurrence = 1) {
  const diagnostic = diagnostics.filter((item) =>
    item.code === code && item.message.includes(messageFragment)
  )[occurrence - 1];
  assert(diagnostic !== undefined, `Missing ${code} containing ${messageFragment}; actual: ${JSON.stringify(diagnostics)}`);
  assert.equal(rangeText(sourceText, diagnostic), expectedRange, JSON.stringify(diagnostic));
}

function rangeText(sourceText, diagnostic) {
  assert.equal(diagnostic.line, diagnostic.endLine, `Multi-line diagnostic is not supported by this assertion: ${JSON.stringify(diagnostic)}`);
  const line = sourceText.split(/\r?\n/)[diagnostic.line - 1] ?? "";
  return line.slice(diagnostic.column - 1, diagnostic.endColumn - 1);
}

function tokenAt(sourceText, oneBasedLine, oneBasedColumn) {
  const line = sourceText.split(/\r?\n/)[oneBasedLine - 1] ?? "";
  const index = Math.max(0, oneBasedColumn - 1);
  const suffix = line.slice(index);
  const annotation = /^@[A-Za-z_][A-Za-z0-9_]*/.exec(suffix);
  if (annotation !== null) {
    return annotation[0];
  }
  const identifier = /^[A-Za-z_][A-Za-z0-9_]*/.exec(suffix);
  if (identifier !== null) {
    return identifier[0];
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
