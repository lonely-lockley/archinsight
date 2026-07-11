import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  mergeLanguageSnapshots,
  coreLanguageSnapshot,
  TypeSystem,
} from "../build/runtime/index.js";

const cases = [
  duplicateTypeDeclaration,
  duplicateBuiltinTypeDeclaration,
  duplicateTypeDeclarationFromBaseSnapshot,
  duplicateEnumDeclaration,
  duplicatePresentationDeclaration,
  typeSystemOffersConstructorsAssignableToExpectedType,
  reportsTypeConstructorNameClashes,
  reportsOperatorConstructorNameClashes,
  allowsOperatorConstructorOverloadsWithDifferentOperandTypes,
  capturesOperatorImplementations,
  reportsNotDeclaredTypesInDefinitionsAndPresentations,
  reportsMissingConstructorsForInstantiableTypes,
  allowsDataTypesWithoutConstructors,
  allowsEnumValuesWithoutAttributes,
  rejectsEnumExtensionsWithoutDefinition,
  extendsDeclaredEnums,
  rejectsPresentationExtensionsWithoutDefinition,
  extendsDeclaredPresentations,
  capturesProjectionRules,
  reportsInvalidProjectionTermOncePerDefinition,
  inheritedProjectionTermIsValid,
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
  console.log("language contract fixtures passed");
}

function duplicateTypeDeclaration() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "types.ai",
      source: `
define type Region
    # marker

define type Region
    # duplicate
`,
    },
  ]);

  assert.equal(countDiagnostics(result, "TYPE_ALREADY_DECLARED", "Region"), 1);
}

function duplicateBuiltinTypeDeclaration() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "types.ai",
      source: `
define type Element
    constructor element
`,
    },
  ]);

  assert.equal(countDiagnostics(result, "TYPE_ALREADY_DECLARED", "Element"), 1);
}

function duplicateTypeDeclarationFromBaseSnapshot() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "user-definitions.ai",
      source: `
define type System
    constructor host
`,
    },
  ], [coreLanguageSnapshot]);

  assert.equal(countDiagnostics(result, "TYPE_ALREADY_DECLARED", "System"), 1);
}

function duplicateEnumDeclaration() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "enums.ai",
      source: `
define type Region
    # marker

define enum of Region
    europe

define enum of Region
    usa
`,
    },
  ]);

  assert.equal(countDiagnostics(result, "ENUM_ALREADY_DECLARED", "Region"), 1);
}

function duplicatePresentationDeclaration() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "presentations.ai",
      source: `
define type Widget of Element
    constructor widget

define presentation Widget
    header = name

define presentation Widget
    body = description
`,
    },
  ], [coreLanguageSnapshot]);

  assert.equal(countDiagnostics(result, "PRESENTATION_ALREADY_DECLARED", "Widget"), 1);
}

function typeSystemOffersConstructorsAssignableToExpectedType() {
  const typeSystem = new TypeSystem(coreLanguageSnapshot);
  const labels = new Set(typeSystem.constructorsForExpectedType("BoundaryElement").map((constructor) => constructor.spelling));

  assert(labels.has("system"), [...labels].join(", "));
  assert(labels.has("actor"), [...labels].join(", "));
}

function reportsTypeConstructorNameClashes() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "constructors.ai",
      source: `
define type First of Element
    constructor widget

define type Second of Element
    constructor widget
`,
    },
  ]);

  assert.equal(countDiagnostics(result, "CONSTRUCTOR_ALREADY_DECLARED", "widget"), 1);
  assert.equal(countDiagnostics(result, "CONSTRUCTOR_ALREADY_DECLARED", "First"), 1);
}

function reportsOperatorConstructorNameClashes() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "operators.ai",
      source: `
define operator FirstWire of Edge
    constructor +> Element
        on Element

define operator SecondWire of Edge
    constructor +> Element
        on Element
`,
    },
  ]);

  assert.equal(countDiagnostics(result, "CONSTRUCTOR_ALREADY_DECLARED", "+>"), 1);
  assert.equal(countDiagnostics(result, "CONSTRUCTOR_ALREADY_DECLARED", "FirstWire"), 1);
}

function allowsOperatorConstructorOverloadsWithDifferentOperandTypes() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "operators.ai",
      source: `
define type Source of Element
    constructor source

define type FirstTarget of Element
    constructor first

define type SecondTarget of Element
    constructor second

define operator FirstWire of Edge
    constructor +> FirstTarget
        on Source

define operator SecondWire of Edge
    constructor +> SecondTarget
        on Source
`,
    },
  ]);

  assert.equal(countDiagnostics(result, "CONSTRUCTOR_ALREADY_DECLARED", "+>"), 0);
}

function capturesOperatorImplementations() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "operators.ai",
      source: `
define operator Wire of Edge
    constructor -> Element
        on Element

    implementation = "@insight/core.edge"
`,
    },
  ]);

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.snapshot.operators[0]?.implementation, "@insight/core.edge");
}

function reportsNotDeclaredTypesInDefinitionsAndPresentations() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "invalid-definitions.ai",
      source: `
define type Broken of Missing
    Unknown attribute

define presentation Ghost
    header = name
`,
    },
  ]);

  assert.equal(countDiagnostics(result, "TYPE_NOT_DECLARED", "Missing"), 1);
  assert.equal(countDiagnostics(result, "TYPE_NOT_DECLARED", "Unknown"), 1);
  assert.equal(countDiagnostics(result, "UNKNOWN_PRESENTATION_TYPE", "Ghost"), 1);
}

function reportsMissingConstructorsForInstantiableTypes() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "definitions.ai",
      source: `
define type System of Element
    # missing constructor

define operator Wire of Edge
    # missing constructor
`,
    },
  ]);

  assert.equal(countDiagnostics(result, "TYPE_CONSTRUCTOR_MISSING", "System"), 1);
  assert.equal(countDiagnostics(result, "TYPE_CONSTRUCTOR_MISSING", "Wire"), 1);
}

function allowsDataTypesWithoutConstructors() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "definitions.ai",
      source: `
define type Tier
    required Text name

define enum of Tier
    t1
        name = Tier 1
`,
    },
  ]);

  assert.deepEqual(result.diagnostics, []);
}

function allowsEnumValuesWithoutAttributes() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "definitions.ai",
      source: `
define enum of Text
    europe
    usa
`,
    },
  ]);

  assert.deepEqual(result.diagnostics, []);
}

function rejectsEnumExtensionsWithoutDefinition() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "definitions.ai",
      source: `
define type Region
    # marker

extend enum of Region
    europe
`,
    },
  ]);

  assert.equal(countDiagnostics(result, "ENUM_NOT_DECLARED", "Region"), 1);
}

function extendsDeclaredEnums() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "definitions.ai",
      source: `
define type Region
    # marker

define enum of Region
    europe

extend enum of Region
    usa
`,
    },
  ]);

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.snapshot.enums.find((enumeration) => enumeration.type === "Region")?.values, ["europe", "usa"]);
}

function rejectsPresentationExtensionsWithoutDefinition() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "definitions.ai",
      source: `
define type Widget of Element
    constructor widget

extend presentation Widget
    header = name
`,
    },
  ]);

  assert.equal(countDiagnostics(result, "PRESENTATION_NOT_DECLARED", "Widget"), 1);
}

function extendsDeclaredPresentations() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "definitions.ai",
      source: `
define type Widget of Element
    constructor widget

    Text name
    Text technology
    Text description

define presentation Widget
    header = name
    body = description

extend presentation Widget
    subtitle = technology
`,
    },
  ], [coreLanguageSnapshot]);

  assert.deepEqual(result.diagnostics, []);
  const presentation = result.snapshot.presentations?.find((item) => item.name === "Widget");
  assert.equal(presentation?.assignments?.header, "name");
  assert.equal(presentation?.assignments?.subtitle, "technology");
  assert.equal(presentation?.assignments?.body, "description");
}

function capturesProjectionRules() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "infra.ai",
      source: infrastructureDefinitions(`
    project:
        collector -> $from
        alert -> collector
        display -> collector
`),
    },
  ]);
  assert.deepEqual(result.diagnostics, []);

  const monitoring = result.snapshot.types.find((type) => type.name === "Monitoring");
  assert.equal(monitoring?.projectionRules?.length, 3);
  assertProjectionRule(monitoring?.projectionRules?.[0], "attribute", "collector", "->", "from", "$from");
}

function reportsInvalidProjectionTermOncePerDefinition() {
  const sourceText = infrastructureDefinitions(`
    project:
        collector -> $from
        alert -> collector
        displday -> collector
`);
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "infra.ai",
      source: sourceText,
    },
  ]);

  assert.equal(countDiagnostics(result, "ATTRIBUTE_NOT_DECLARED", "displday"), 1);
  const diagnostic = result.diagnostics.find((item) => item.code === "ATTRIBUTE_NOT_DECLARED" && item.message.includes("displday"));
  assert(diagnostic !== undefined);
  assert.equal(tokenAt(sourceText, diagnostic.line, diagnostic.column), "displday");
}

function inheritedProjectionTermIsValid() {
  const result = buildLanguageSnapshotResultFromSources([
    {
      sourceName: "infra.ai",
      source: `
define type InfrastructureComponent of Element
    constructor infrastructure

    required Text name
    InfrastructureComponent runsOn

define type Compute of InfrastructureComponent
    constructor compute

    project:
        runsOn -> $this
`,
    },
  ]);
  const snapshot = mergeLanguageSnapshots([coreLanguageSnapshot, result.snapshot]);
  const typeSystem = new TypeSystem(snapshot);

  assert.deepEqual(result.diagnostics, []);
  assert.equal(typeSystem.attribute("Compute", "runsOn")?.type, "InfrastructureComponent");
}

function infrastructureDefinitions(projectBlock) {
  return `
define type InfrastructureComponent of Element
    constructor infrastructure

    required Text name

define type Monitoring of InfrastructureComponent
    constructor metrics

    InfrastructureComponent display
    InfrastructureComponent collector
    InfrastructureComponent alert
${projectBlock}`;
}

function assertProjectionRule(rule, sourceKind, sourceValue, operator, targetKind, targetValue) {
  assert(rule !== undefined);
  assert.equal(rule.source.kind, sourceKind);
  assert.equal(rule.source.value, sourceValue);
  assert.equal(rule.operator, operator);
  assert.equal(rule.target.kind, targetKind);
  assert.equal(rule.target.value, targetValue);
}

function tokenAt(sourceText, oneBasedLine, oneBasedColumn) {
  const line = sourceText.split(/\r?\n/)[oneBasedLine - 1] ?? "";
  const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(Math.max(0, oneBasedColumn - 1)));
  return match?.[0] ?? "";
}

function countDiagnostics(result, code, text) {
  return result.diagnostics
    .filter((diagnostic) => diagnostic.code === code)
    .filter((diagnostic) => diagnostic.message.includes(text))
    .length;
}
