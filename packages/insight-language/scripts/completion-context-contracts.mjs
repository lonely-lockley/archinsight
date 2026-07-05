import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  CompletionEngine,
  coreLanguageSnapshot,
  createGeneratedInsightSyntaxProvider,
  mergeLanguageSnapshots,
} from "../build/runtime/index.js";

const completion = new CompletionEngine(createGeneratedInsightSyntaxProvider());
let cachedCustomTypeSlotSnapshot;

const cases = [
  importContextCompletionUsesProvidedContextIds,
  typedSlotCompletionUsesIndexedImportAliasTypes,
  wireUsesCompletionMarksOnlyImportedIdentifiersAsImported,
  contextBodySuggestsExternalPrefixOperatorAtLineStart,
  contextBodySuggestsObjectExtensionAtLineStart,
  annotationCompletionWorksAfterAtPrefix,
  customPrefixOperatorsCompleteFromCurrentOwnerAndExpectedElementType,
  anonymousObjectInEdgeReferenceListSuggestsItsAttributes,
  coreTypeSlotReferenceUsesOperatorTargetsEnvironmentSlots,
  customTypeSlotReferenceOperatorsUseCurrentOwnerType,
  customTypeSlotReferenceOperatorTargetsUseOperatorTargetType,
  customTypeSlotReferenceOperatorsWorkInDeepNestedObjects,
  customConstructorsCompleteInImplicitNamedAndAnonymousObjectSlots,
  objectBodyDoesNotSuggestAssignedScalarAttributes,
  identifierDeclarationsHaveNoCandidates,
  archinsightExampleCompletionDoesNotLeakTextWordsAtLineEnds,
  caretAtNextLineStartAfterTextValueIsNotInsideTextValueRule,
  caretInsideScalarTextValueIsInsideTextValueRule,
  caretInsideIndentedContinuationLineIsInsideTextValueRule,
  caretAtLineStartAfterIndentedContinuationIsNotInsideTextValueRule,
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
  console.log("completion context contract fixtures passed");
}

function importContextCompletionUsesProvidedContextIds() {
  const source = (`
context shared

import target from context
`.trimStart() + " ");
  const result = complete(source, source.length, { contextIds: ["external"] });
  const labels = itemLabels(result);

  assert(labels.has("shared"), [...labels].join(", "));
  assert(labels.has("external"), [...labels].join(", "));
}

function typedSlotCompletionUsesIndexedImportAliasTypes() {
  const sourceWithCursor = `
context test

import envoy from context infra
import internal from context infra
import kafka from context infra
import db from context infra
import kube from context infra
import loki from context infra

system b
    name = API
    links:
        -> c
            uses:
                __CURSOR__

system c
    name = Something else
`.trimStart();
  const cursorOffset = sourceWithCursor.indexOf("__CURSOR__");
  const source = sourceWithCursor.replace("__CURSOR__", "");
  const result = complete(source, cursorOffset, {
    snapshot: mergeLanguageSnapshots([
      coreLanguageSnapshot,
      {
        schemaVersion: "completion-infra",
        constructors: [],
        operators: [],
        enums: [],
        types: [
          { name: "System", attributes: [{ name: "uses", type: "List", list: true, listElementType: "InfrastructureComponent" }] },
          { name: "Wire", attributes: [{ name: "uses", type: "List", list: true, listElementType: "InfrastructureComponent" }] },
        ],
      },
    ]),
    indexedIdentifiers: new Map([
      ["envoy", { label: "envoy", type: "InfrastructureComponent" }],
      ["internal", { label: "internal", type: "InfrastructureComponent" }],
      ["kafka", { label: "kafka", type: "InfrastructureComponent" }],
      ["db", { label: "db", type: "InfrastructureComponent" }],
      ["kube", { label: "kube", type: "InfrastructureComponent" }],
      ["loki", { label: "loki", type: "InfrastructureComponent" }],
    ]),
  });
  const labels = itemLabels(result);

  for (const expected of ["envoy", "internal", "kafka", "db", "kube", "loki"]) {
    assert(labels.has(expected), `${expected} missing from ${[...labels].join(", ")}`);
  }
}

function wireUsesCompletionMarksOnlyImportedIdentifiersAsImported() {
  const sourceWithCursor = `
context test

import kafka from context infra

storage local_db
    name = Local DB

system b
    name = API
    links:
        -> c
            uses:
                __CURSOR__

system c
    name = Something else
`.trimStart();
  const cursorOffset = sourceWithCursor.indexOf("__CURSOR__");
  const source = sourceWithCursor.replace("__CURSOR__", "");
  const result = complete(source, cursorOffset, {
    snapshot: mergeLanguageSnapshots([
      coreLanguageSnapshot,
      {
        schemaVersion: "completion-infra",
        constructors: [
          { spelling: "storage", ownerType: "Storage" },
        ],
        operators: [],
        enums: [],
        types: [
          { name: "Storage", baseType: "InfrastructureComponent", attributes: [{ name: "name", type: "Text" }] },
          { name: "Wire", attributes: [{ name: "uses", type: "List", list: true, listElementType: "InfrastructureComponent" }] },
        ],
      },
    ]),
    indexedIdentifiers: new Map([
      ["kafka", { label: "kafka", type: "InfrastructureComponent", imported: true }],
    ]),
  });
  const items = new Map(result.items.map((item) => [item.label, item]));

  assert.equal(items.get("kafka")?.imported, true, JSON.stringify([...items.values()]));
  assert.notEqual(items.get("local_db")?.imported, true, JSON.stringify([...items.values()]));
}

function contextBodySuggestsExternalPrefixOperatorAtLineStart() {
  const sourceWithCursor = `
context test

__CURSOR__system app
    name = App
`.trimStart();
  const cursorOffset = sourceWithCursor.indexOf("__CURSOR__");
  const source = sourceWithCursor.replace("__CURSOR__", "");
  const result = complete(source, cursorOffset);
  const labels = itemLabels(result);

  assert(labels.has("external"), [...labels].join(", "));
  assert(labels.has("system"), [...labels].join(", "));
  assert(!labels.has("->"), [...labels].join(", "));
}

function contextBodySuggestsObjectExtensionAtLineStart() {
  const lineSourceWithCursor = `
context test

system app
    name = App

__LINE_CURSOR__
`.trimStart();
  const constructorSourceWithCursor = `
context test

system app
    name = App

extend __CONSTRUCTOR_CURSOR__
`.trimStart();
  const targetSourceWithCursor = `
context test

system app
    name = App

extend system __TARGET_CURSOR__
`.trimStart();

  const lineCursorOffset = lineSourceWithCursor.indexOf("__LINE_CURSOR__");
  const lineSource = lineSourceWithCursor.replace("__LINE_CURSOR__", "");
  const constructorCursorOffset = constructorSourceWithCursor.indexOf("__CONSTRUCTOR_CURSOR__");
  const constructorSource = constructorSourceWithCursor.replace("__CONSTRUCTOR_CURSOR__", "");
  const targetCursorOffset = targetSourceWithCursor.indexOf("__TARGET_CURSOR__");
  const targetSource = targetSourceWithCursor.replace("__TARGET_CURSOR__", "");

  const lineLabels = itemLabels(complete(lineSource, lineCursorOffset));
  const constructorLabels = itemLabels(complete(constructorSource, constructorCursorOffset));
  const targetLabels = itemLabels(complete(targetSource, targetCursorOffset));

  assert(lineLabels.has("extend"), [...lineLabels].join(", "));
  assert(lineLabels.has("system"), [...lineLabels].join(", "));
  assert(constructorLabels.has("system"), [...constructorLabels].join(", "));
  assert(targetLabels.has("app"), [...targetLabels].join(", "));
}

function annotationCompletionWorksAfterAtPrefix() {
  const contextSource = `
context test

system app
    name = App

@
`.trimStart();
  const edgeSource = `
context test

system app
    links:
        @
`.trimStart();

  for (const source of [contextSource, edgeSource]) {
    const cursorOffset = source.indexOf("@") + 1;
    const result = complete(source, cursorOffset);
    const labels = itemLabels(result);
    assert(labels.has("@planned"), [...labels].join(", "));
    assert(labels.has("@deprecated"), [...labels].join(", "));
    assert.equal(result.replacementStartOffset, cursorOffset - 1);
    assert.equal(result.replacementEndOffset, cursorOffset);
  }
}

function customPrefixOperatorsCompleteFromCurrentOwnerAndExpectedElementType() {
  const result = buildLanguageSnapshotResultFromSources([
    source("custom_prefix_operator.ai", `
define type RootThing of BoundaryElement
    constructor root

    List of ChildThing _

define type ChildThing of Element
    constructor child

    Text name

define operator MarkRoot of RootThing
    constructor mark RootThing
        on Context

define operator MarkChild of ChildThing
    constructor mark ChildThing
        on RootThing
`),
  ], [coreLanguageSnapshot]);
  assert.deepEqual(result.diagnostics, []);

  const sourceWithCursor = `
context test

__ROOT_CURSOR__root app
    __CHILD_CURSOR__child local
        name = Local
`.trimStart();
  const rootCursorOffset = sourceWithCursor.indexOf("__ROOT_CURSOR__");
  const childCursorOffset = sourceWithCursor.indexOf("__CHILD_CURSOR__");
  const architectureSource = sourceWithCursor
    .replace("__ROOT_CURSOR__", "")
    .replace("__CHILD_CURSOR__", "");
  const childCursorShift = "__ROOT_CURSOR__".length;

  const rootLabels = itemLabels(complete(architectureSource, rootCursorOffset, { snapshot: result.snapshot }));
  const childLabels = itemLabels(complete(architectureSource, childCursorOffset - childCursorShift, { snapshot: result.snapshot }));

  assert(rootLabels.has("mark"), [...rootLabels].join(", "));
  assert(rootLabels.has("root"), [...rootLabels].join(", "));
  assert(!rootLabels.has("child"), [...rootLabels].join(", "));
  assert(childLabels.has("mark"), [...childLabels].join(", "));
  assert(childLabels.has("child"), [...childLabels].join(", "));
  assert(!childLabels.has("root"), [...childLabels].join(", "));
}

function anonymousObjectInEdgeReferenceListSuggestsItsAttributes() {
  const sourceWithCursor = `
context test

system b
    name = API
    links:
        ~> c
            uses:
                broker _
                    __CURSOR__

system c
    name = Something else
`.trimStart();
  const cursorOffset = sourceWithCursor.indexOf("__CURSOR__");
  const source = sourceWithCursor.replace("__CURSOR__", "");
  const result = complete(source, cursorOffset, {
    snapshot: mergeLanguageSnapshots([
      coreLanguageSnapshot,
      {
        schemaVersion: "completion-infra",
        constructors: [
          { spelling: "broker", ownerType: "Broker" },
        ],
        operators: [],
        enums: [],
        types: [
          { name: "Broker", baseType: "InfrastructureComponent" },
          { name: "Wire", attributes: [{ name: "uses", type: "List", list: true, listElementType: "InfrastructureComponent" }] },
        ],
      },
    ]),
  });
  const labels = itemLabels(result);

  assert(labels.has("name"), [...labels].join(", "));
}

function coreTypeSlotReferenceUsesOperatorTargetsEnvironmentSlots() {
  const sourceWithCursor = `
context test

import global from context infrastructure

component api
    name = API
    links:
        -> repository
            deployment:
                environmentsFrom global
                uses __CURSOR__

component repository
    name = Repository
`.trimStart();
  const cursorOffset = sourceWithCursor.indexOf("__CURSOR__");
  const source = sourceWithCursor.replace("__CURSOR__", "");
  const result = complete(source, cursorOffset, { snapshot: environmentSlotSnapshot() });
  const labels = itemLabels(result);

  for (const expected of ["broker", "publicGateway", "storage"]) {
    assert(labels.has(expected), `${expected} missing from ${[...labels].join(", ")}`);
  }
  assert(!labels.has("name"), [...labels].join(", "));
  assert(!labels.has("global"), [...labels].join(", "));
}

function customTypeSlotReferenceOperatorsUseCurrentOwnerType() {
  const sourceWithCursor = `
context test

target primary
    name = Primary

profile reusable
    name = Reusable

host app
    name = App
    profile:
        __CURSOR__
`.trimStart();
  const cursorOffset = sourceWithCursor.indexOf("__CURSOR__");
  const source = sourceWithCursor.replace("__CURSOR__", "");
  const result = complete(source, cursorOffset, { snapshot: customTypeSlotSnapshot() });
  const labels = itemLabels(result);

  for (const expected of ["name", "copyTemplate", "pick", "read"]) {
    assert(labels.has(expected), `${expected} missing from ${[...labels].join(", ")}`);
  }
  assert(!labels.has("->"), [...labels].join(", "));
  assert(!labels.has("host"), [...labels].join(", "));
}

function customTypeSlotReferenceOperatorTargetsUseOperatorTargetType() {
  const sourceWithCursor = `
context test

target primary
    name = Primary

profile reusable
    name = Reusable

scope runtimeScope
    name = Runtime Scope
    primary:
        primary
    secondary:
        primary

host app
    name = App
    profile:
        pick __PICK_CURSOR__
        copyTemplate __PROFILE_CURSOR__
        read __READ_CURSOR__
`.trimStart();
  const pickCursorOffset = sourceWithCursor.indexOf("__PICK_CURSOR__");
  const profileCursorOffset = sourceWithCursor.indexOf("__PROFILE_CURSOR__");
  const readCursorOffset = sourceWithCursor.indexOf("__READ_CURSOR__");
  const source = sourceWithCursor
    .replace("__PICK_CURSOR__", "")
    .replace("__PROFILE_CURSOR__", "")
    .replace("__READ_CURSOR__", "");
  const profileCursorShift = "__PICK_CURSOR__".length;
  const readCursorShift = profileCursorShift + "__PROFILE_CURSOR__".length;

  const pickLabels = itemLabels(complete(source, pickCursorOffset, { snapshot: customTypeSlotSnapshot() }));
  const profileLabels = itemLabels(complete(source, profileCursorOffset - profileCursorShift, { snapshot: customTypeSlotSnapshot() }));
  const readLabels = itemLabels(complete(source, readCursorOffset - readCursorShift, { snapshot: customTypeSlotSnapshot() }));

  assert(pickLabels.has("primary"), [...pickLabels].join(", "));
  assert(!pickLabels.has("reusable"), [...pickLabels].join(", "));
  assert(profileLabels.has("reusable"), [...profileLabels].join(", "));
  assert(!profileLabels.has("primary"), [...profileLabels].join(", "));
  assert(readLabels.has("primary"), [...readLabels].join(", "));
  assert(readLabels.has("secondary"), [...readLabels].join(", "));
  assert(!readLabels.has("runtimeScope"), [...readLabels].join(", "));
}

function customTypeSlotReferenceOperatorsWorkInDeepNestedObjects() {
  const sourceWithCursor = `
context test

target primary
    name = Primary

profile reusable
    name = Reusable

scope runtimeScope
    name = Runtime Scope
    primary:
        primary
    secondary:
        primary

host app
    name = App
    layer1 first
        layer2 second
            layer3 third
                profile:
                    __BODY_CURSOR__
                    pick __TARGET_CURSOR__
                    read __SLOT_CURSOR__
`.trimStart();
  const bodyCursorOffset = sourceWithCursor.indexOf("__BODY_CURSOR__");
  const targetCursorOffset = sourceWithCursor.indexOf("__TARGET_CURSOR__");
  const slotCursorOffset = sourceWithCursor.indexOf("__SLOT_CURSOR__");
  const source = sourceWithCursor
    .replace("__BODY_CURSOR__", "")
    .replace("__TARGET_CURSOR__", "")
    .replace("__SLOT_CURSOR__", "");
  const targetCursorShift = "__BODY_CURSOR__".length;
  const slotCursorShift = targetCursorShift + "__TARGET_CURSOR__".length;

  const bodyLabels = itemLabels(complete(source, bodyCursorOffset, { snapshot: customTypeSlotSnapshot() }));
  const targetLabels = itemLabels(complete(source, targetCursorOffset - targetCursorShift, { snapshot: customTypeSlotSnapshot() }));
  const slotLabels = itemLabels(complete(source, slotCursorOffset - slotCursorShift, { snapshot: customTypeSlotSnapshot() }));

  assert(bodyLabels.has("pick"), [...bodyLabels].join(", "));
  assert(bodyLabels.has("copyTemplate"), [...bodyLabels].join(", "));
  assert(bodyLabels.has("read"), [...bodyLabels].join(", "));
  assert(targetLabels.has("primary"), [...targetLabels].join(", "));
  assert(!targetLabels.has("reusable"), [...targetLabels].join(", "));
  assert(slotLabels.has("primary"), [...slotLabels].join(", "));
  assert(slotLabels.has("secondary"), [...slotLabels].join(", "));
  assert(!slotLabels.has("runtimeScope"), [...slotLabels].join(", "));
}

function customConstructorsCompleteInImplicitNamedAndAnonymousObjectSlots() {
  const sourceWithCursor = `
context test

target primary
    name = Primary

host app
    name = App
    profile:
        __IMPLICIT_OR_CONSTRUCTOR_CURSOR__

host explicit
    name = Explicit
    profile:
        profile local
            __NAMED_BODY_CURSOR__

host anonymous
    name = Anonymous
    profile:
        profile _
            __ANONYMOUS_BODY_CURSOR__
`.trimStart();
  const implicitCursorOffset = sourceWithCursor.indexOf("__IMPLICIT_OR_CONSTRUCTOR_CURSOR__");
  const namedCursorOffset = sourceWithCursor.indexOf("__NAMED_BODY_CURSOR__");
  const anonymousCursorOffset = sourceWithCursor.indexOf("__ANONYMOUS_BODY_CURSOR__");
  const source = sourceWithCursor
    .replace("__IMPLICIT_OR_CONSTRUCTOR_CURSOR__", "")
    .replace("__NAMED_BODY_CURSOR__", "")
    .replace("__ANONYMOUS_BODY_CURSOR__", "");
  const namedCursorShift = "__IMPLICIT_OR_CONSTRUCTOR_CURSOR__".length;
  const anonymousCursorShift = namedCursorShift + "__NAMED_BODY_CURSOR__".length;

  const implicitLabels = itemLabels(complete(source, implicitCursorOffset, { snapshot: customTypeSlotSnapshot() }));
  const namedBodyLabels = itemLabels(complete(source, namedCursorOffset - namedCursorShift, { snapshot: customTypeSlotSnapshot() }));
  const anonymousBodyLabels = itemLabels(complete(source, anonymousCursorOffset - anonymousCursorShift, { snapshot: customTypeSlotSnapshot() }));

  assert(implicitLabels.has("name"), [...implicitLabels].join(", "));
  assert(implicitLabels.has("profile"), [...implicitLabels].join(", "));
  assert(implicitLabels.has("pick"), [...implicitLabels].join(", "));
  assert(namedBodyLabels.has("name"), [...namedBodyLabels].join(", "));
  assert(namedBodyLabels.has("pick"), [...namedBodyLabels].join(", "));
  assert(anonymousBodyLabels.has("name"), [...anonymousBodyLabels].join(", "));
  assert(anonymousBodyLabels.has("pick"), [...anonymousBodyLabels].join(", "));
}

function objectBodyDoesNotSuggestAssignedScalarAttributes() {
  const source = `
context shared

system app
    name = App

    service repository
        name = Repository
        `.trimStart();
  const result = complete(source, source.length);
  const labels = itemLabels(result);

  assert(!labels.has("name"), [...labels].join(", "));
  assert(labels.has("technology"), [...labels].join(", "));
}

function identifierDeclarationsHaveNoCandidates() {
  const contextSource = "context ";
  const objectSource = (`
context shared

system
`.trimStart() + " ");
  const contextResult = complete(contextSource, contextSource.length);
  const objectResult = complete(objectSource, objectSource.length);

  assert.equal(contextResult.items.length, 0, itemLabels(contextResult));
  assert.equal(objectResult.items.length, 0, itemLabels(objectResult));
}

function archinsightExampleCompletionDoesNotLeakTextWordsAtLineEnds() {
  const source = [
    "context archinsight",
    "",
    "system ai",
    "    name = Archinsight",
    "",
    "    service editor_front",
    "        name = Frontend",
    "        technology = Typescript, Monako, Vaadin",
    "        links:",
    "            -> envoy",
    "                technology = HTTP, REST, Websocket",
    "                description = Load frontend, perform requests",
  ].join("\n");
  for (const cursorOffset of lineEndOffsets(source)) {
    const labels = itemLabels(complete(source, cursorOffset));
    for (const leaked of ["Archinsight", "Typescript", "Monako", "Vaadin", "HTTP", "REST", "Websocket", "Load", "perform", "requests"]) {
      assert(!labels.has(leaked), `Unexpected ${leaked} at ${cursorOffset}: ${[...labels].join(", ")}`);
    }
  }
  const afterLinksHeader = source.indexOf("        links:") + "        links:".length;
  assert(!itemLabels(complete(source, afterLinksHeader)).has("->"));
  const nextEdgeIndent = source.indexOf("            -> envoy") + "            ".length;
  assert(itemLabels(complete(source, nextEdgeIndent)).has("->"));
}

function caretAtNextLineStartAfterTextValueIsNotInsideTextValueRule() {
  const source = `
context shared

system app
    name = App
    description = First line
    service api
        name = API
`.trimStart();
  const result = complete(source, offset(source, 5, 0));

  assert(!result.ruleStack.includes("textValue"), result.ruleStack.join(" > "));
  assert(!result.ruleStack.includes("assignment"), result.ruleStack.join(" > "));
}

function caretInsideScalarTextValueIsInsideTextValueRule() {
  const source = `
context shared

system app
    name = App
    service api
        name = API
`.trimStart();
  const result = complete(source, offset(source, 4, 12));

  assert(result.ruleStack.includes("textValue"), result.ruleStack.join(" > "));
  assert(result.ruleStack.includes("assignment"), result.ruleStack.join(" > "));
}

function caretInsideIndentedContinuationLineIsInsideTextValueRule() {
  const source = `
context shared

system app
    name = App
    description = First line
        Second line
    service api
        name = API
`.trimStart();
  const result = complete(source, offset(source, 6, 10));

  assert(result.ruleStack.includes("textValue"), result.ruleStack.join(" > "));
  assert(result.ruleStack.includes("assignment"), result.ruleStack.join(" > "));
}

function caretAtLineStartAfterIndentedContinuationIsNotInsideTextValueRule() {
  const source = `
context shared

system app
    name = App
    description = First line
        Second line
    service api
        name = API
`.trimStart();
  const result = complete(source, offset(source, 7, 0));

  assert(!result.ruleStack.includes("textValue"), result.ruleStack.join(" > "));
  assert(!result.ruleStack.includes("assignment"), result.ruleStack.join(" > "));
}

function complete(source, cursorOffset, overrides = {}) {
  return completion.complete({
    sourceName: "architecture.ai",
    source,
    cursorOffset,
    snapshot: coreLanguageSnapshot,
    ...overrides,
  });
}

function customTypeSlotSnapshot() {
  if (cachedCustomTypeSlotSnapshot !== undefined) {
    return cachedCustomTypeSlotSnapshot;
  }
  const result = buildLanguageSnapshotResultFromSources([
    source("custom_type_slot.ai", `
define type Target of Element
    constructor target

    required Text name

define type Profile of Element
    constructor profile

    Text name
    List of TypeSlotReference _

define type Scope of Element
    constructor scope

    Text name
    Target primary
    Target secondary

define type Host of Element
    constructor host

    required Text name
    Profile profile
    List of LayerOne _

define type LayerOne of Element
    constructor layer1

    List of LayerTwo _

define type LayerTwo of Element
    constructor layer2

    List of LayerThree _

define type LayerThree of Element
    constructor layer3

    Profile profile

define type TargetReference of TypeSlotReference
    required Target target

define type ProfileReference of TypeSlotReference
    required Profile profile

define operator PickTarget of TargetReference
    constructor pick Target
        on Profile

define operator CopyTemplate of ProfileReference
    constructor copyTemplate Profile
        on Profile

define operator ReadScope of TypeSlotReference
    constructor read Scope
        on Profile
`),
  ], [coreLanguageSnapshot]);
  assert.deepEqual(result.diagnostics, []);
  cachedCustomTypeSlotSnapshot = result.snapshot;
  return cachedCustomTypeSlotSnapshot;
}

function environmentSlotSnapshot() {
  const result = buildLanguageSnapshotResultFromSources([
    source("environment_slots.ai", `
extend type Environment
    InfrastructureComponent broker
    InfrastructureComponent publicGateway
    InfrastructureComponent storage
`),
  ], [coreLanguageSnapshot]);
  assert.deepEqual(result.diagnostics, []);
  return result.snapshot;
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText };
}

function itemLabels(result) {
  return new Set(result.items.map((item) => item.label));
}

function lineEndOffsets(source) {
  const result = [];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === "\n") {
      result.push(index);
    }
  }
  result.push(source.length);
  return result;
}

function offset(source, oneBasedLine, zeroBasedColumn) {
  let line = 1;
  let cursor = 0;
  while (line < oneBasedLine && cursor < source.length) {
    if (source[cursor++] === "\n") {
      line++;
    }
  }
  return Math.min(source.length, cursor + zeroBasedColumn);
}
