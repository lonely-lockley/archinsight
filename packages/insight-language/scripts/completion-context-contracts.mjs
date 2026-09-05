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
let cachedDeploymentProfileSnapshot;

const cases = [
  importContextCompletionUsesProvidedContextIds,
  typedSlotCompletionUsesIndexedImportAliasTypes,
  wireUsesCompletionMarksOnlyImportedIdentifiersAsImported,
  topLevelCompletionSuggestsEnvironmentKeyword,
  contextBodySuggestsExternalPrefixOperatorAtLineStart,
  contextBodySuggestsObjectExtensionAtLineStart,
  annotationCompletionWorksAfterAtPrefix,
  customPrefixOperatorsCompleteFromCurrentOwnerAndExpectedElementType,
  anonymousObjectInEdgeReferenceListSuggestsItsAttributes,
  customTypeSlotReferenceOperatorsUseCurrentOwnerType,
  customTypeSlotReferenceOperatorTargetsUseOperatorTargetType,
  customTypeSlotReferenceOperatorsWorkInDeepNestedObjects,
  customConstructorsCompleteInImplicitNamedAndAnonymousObjectSlots,
  edgeListOperatorsCompleteAfterNestedObjectAttribute,
  wireAttributesCompleteAfterNestedObjectAttribute,
  projectionRulesCompleteTextualOperatorsTermsAndAttributes,
  contextualReferenceListsAndAnonymousOperatorsUseDeclarations,
  deploymentProfilesCompleteDeclaredActionsAndContextualMembers,
  deploymentBlocksCompleteProfilesAndInfrastructureSlots,
  filledSingleReferenceSlotsDoNotSuggestNestedAttributes,
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
          { name: "Broker", baseType: "NetworkConnection" },
          { name: "Wire", attributes: [{ name: "uses", type: "List", list: true, listElementType: "InfrastructureComponent" }] },
        ],
      },
    ]),
  });
  const labels = itemLabels(result);

  assert(labels.has("name"), [...labels].join(", "));
}

function topLevelCompletionSuggestsEnvironmentKeyword() {
  const result = complete("", 0);
  const labels = itemLabels(result);

  assert(labels.has("environment"), [...labels].join(", "));
  assert(labels.has("context"), [...labels].join(", "));
}

function edgeListOperatorsCompleteAfterNestedObjectAttribute() {
  const sourceWithCursor = `
context test

system system_a
    name = System A

    service service_a
        name = Service A
        links:
            -> target
                description = Calls target
            __CURSOR__
`.trimStart();
  const cursorOffset = sourceWithCursor.indexOf("__CURSOR__");
  const source = sourceWithCursor.replace("__CURSOR__", "");
  const result = complete(source, cursorOffset);
  const labels = itemLabels(result);

  assert(labels.has("->"), [...labels].join(", "));
  assert(labels.has("~>"), [...labels].join(", "));
  assert(!labels.has("connectTo"), [...labels].join(", "));
  assert(!labels.has("replicateFrom"), [...labels].join(", "));
}

function wireAttributesCompleteAfterNestedObjectAttribute() {
  const sourceWithCursor = `
context test

system system_a
    name = System A

    service service_a
        name = Service A
        links:
            -> target
                description = Calls target
                __CURSOR__
`.trimStart();
  const cursorOffset = sourceWithCursor.indexOf("__CURSOR__");
  const source = sourceWithCursor.replace("__CURSOR__", "");
  const result = complete(source, cursorOffset);
  const labels = itemLabels(result);

  assert(labels.has("technology"), [...labels].join(", "));
}

function projectionRulesCompleteTextualOperatorsTermsAndAttributes() {
  const snapshot = mergeLanguageSnapshots([
    coreLanguageSnapshot,
    {
      schemaVersion: "projection-completion",
      operators: [],
      enums: [],
      types: [
        {
          name: "IndriveEnvironment",
          baseType: "Environment",
          attributes: [
            { name: "cloud", type: "ServiceProvider", required: true },
            { name: "compute", type: "Compute", required: true },
            { name: "network", type: "NetworkConnection", required: true },
            { name: "publicGateway", type: "PublicGateway", required: true },
          ],
        },
        { name: "CustomRuntime", baseType: "DeploymentElement" },
        { name: "ServiceProvider", baseType: "InfrastructureComponent" },
        { name: "Compute", baseType: "InfrastructureComponent" },
        { name: "InfrastructureComponent", baseType: "Element" },
        {
          name: "PublicGateway",
          baseType: "InfrastructureComponent",
          attributes: [
            { name: "cdn", type: "InfrastructureComponent", required: true },
            { name: "loadBalancer", type: "InfrastructureComponent", required: true },
          ],
        },
      ],
      constructors: [
        { spelling: "runtime", ownerType: "CustomRuntime" },
        { spelling: "publicGateway", ownerType: "PublicGateway" },
      ],
    },
  ]);

  assertProjectionCompletion("__CURSOR__", {
    snapshot,
    includes: ["source", "target"],
    excludes: ["$from", "connectTo"],
  });
  assertProjectionCompletion("source __CURSOR__", {
    snapshot,
    includes: ["$from", "$to", "$this", "cdn", "loadBalancer"],
    excludes: ["source", "target", "fixed", "connectTo", "projection", "name"],
  });
  assertProjectionCompletion("source $from __CURSOR__", {
    snapshot,
    includes: ["originalLink", "connectTo", "replicateFrom"],
    excludes: ["source", "target", "fixed", "$to", "->"],
  });
  assertProjectionCompletion("source $from connectTo __CURSOR__", {
    snapshot,
    includes: ["source", "target"],
    excludes: ["$from", "connectTo"],
  });
  assertProjectionCompletion("source $from connectTo target __CURSOR__", {
    snapshot,
    includes: ["$to", "$this", "cdn", "loadBalancer"],
    excludes: ["source", "target", "fixed", "connectTo", "projection", "name"],
  });

  assertProjectionCompletion("__CURSOR__source $from connectTo target cdn", {
    snapshot,
    includes: ["source", "target"],
    excludes: ["$from", "connectTo"],
  });
  assertProjectionCompletion("source __CURSOR__$from connectTo target cdn", {
    snapshot,
    includes: ["$from", "$to", "$this", "cdn", "loadBalancer"],
    excludes: ["source", "target", "fixed", "connectTo", "projection", "name"],
  });
  assertProjectionCompletion("source $from __CURSOR__connectTo target cdn", {
    snapshot,
    includes: ["originalLink", "connectTo", "replicateFrom"],
    excludes: ["source", "target", "fixed", "$to", "->"],
  });
  assertProjectionCompletion("source $from connectTo __CURSOR__target cdn", {
    snapshot,
    includes: ["source", "target"],
    excludes: ["$from", "connectTo"],
  });
  assertProjectionCompletion("source $from connectTo target __CURSOR__cdn", {
    snapshot,
    includes: ["$to", "$this", "cdn", "loadBalancer"],
    excludes: ["source", "target", "fixed", "connectTo", "projection", "name"],
  });
  assertNestedDeploymentProjectionCompletion("source __CURSOR__", {
    snapshot,
    includes: ["$from", "$to", "$this", "cdn", "loadBalancer", "cloud", "compute", "network"],
    excludes: ["source", "target", "fixed", "connectTo", "projection", "name"],
  });
  assertCustomRuntimeProjectionCompletion("source __CURSOR__", {
    snapshot,
    includes: ["$from", "$to", "$this", "cdn", "loadBalancer", "cloud", "compute", "network"],
    excludes: ["source", "target", "fixed", "connectTo", "projection", "name"],
  });

  assertProjectionRelationAttributes(`
context infra

publicGateway gateway
    projection:
        source $from connectTo target cdn
            __CURSOR__
	`, { snapshot, includes: ["technology", "description"] });
  assertProjectionRelationAttributes(`
context infra

publicGateway gateway
    projection:
        source $from originalLink target cdn
            __CURSOR__
	`, { snapshot, includes: ["technology", "description", "call", "via"] });
  assertProjectionRelationAttributes(`
context infra

publicGateway gateway
    projection:
        target cdn replicateFrom target loadBalancer
            __CURSOR__
	`, { snapshot, includes: ["technology", "description"] });
}

function deploymentBlocksCompleteProfilesAndInfrastructureSlots() {
  const snapshot = deploymentProfileSnapshot();
  const elementBody = itemLabels(completeAtMarker(`
context app

import eu from environment eu

deploymentProfile globalProfile
    appliesTo:
        production from eu

    runsOn compute
    uses internalNetwork
    uses database

system application
    name = Application

    service backend
        name = Backend
        deployment:
            __CURSOR__
`, { snapshot, contextIds: ["eu"] }));
  assert(elementBody.has("uses"), [...elementBody].join(", "));
  assert(elementBody.has("runsOn"), [...elementBody].join(", "));
  assert(!elementBody.has("->"), [...elementBody].join(", "));

  const elementTarget = itemLabels(completeAtMarker(`
context app

import eu from environment eu

deploymentProfile globalProfile
    appliesTo:
        production from eu

system application
    name = Application

    service backend
        name = Backend
        deployment:
            uses __CURSOR__
`, { snapshot, contextIds: ["eu"] }));
  for (const expected of ["globalProfile", "compute", "database", "internalNetwork", "publicGateway"]) {
    assert(elementTarget.has(expected), `${expected} missing from ${[...elementTarget].join(", ")}`);
  }

  const wireBody = itemLabels(completeAtMarker(`
context app

deploymentProfile globalProfile
    appliesTo:
        production from eu

system application
    name = Application

    service frontend
        name = Frontend
        links:
            -> backend
                deployment:
                    __CURSOR__

    service backend
        name = Backend
`, { snapshot, contextIds: ["eu"] }));
  assert(wireBody.has("uses"), [...wireBody].join(", "));
  assert(!wireBody.has("runsOn"), [...wireBody].join(", "));

  const wireTarget = itemLabels(completeAtMarker(`
context app

deploymentProfile globalProfile
    appliesTo:
        production from eu

system application
    name = Application

    service frontend
        name = Frontend
        links:
            -> backend
                deployment:
                    uses __CURSOR__

    service backend
        name = Backend
`, { snapshot, contextIds: ["eu"] }));
  assert(!wireTarget.has("globalProfile"), [...wireTarget].join(", "));
  assert(wireTarget.has("internalNetwork"), [...wireTarget].join(", "));
  assert(wireTarget.has("publicGateway"), [...wireTarget].join(", "));
  assert(wireTarget.has("broker"), [...wireTarget].join(", "));
  assert(!wireTarget.has("database"), [...wireTarget].join(", "));

  const elementOverrideBody = itemLabels(completeAtMarker(`
context app

import eu from environment eu

deploymentProfile globalProfile
    appliesTo:
        production from eu

system application
    name = Application

    service backend
        name = Backend
        deployment:
            uses globalProfile
            uses database
                __CURSOR__
`, { snapshot, contextIds: ["eu"] }));
  for (const expected of ["name", "technology", "description", "address"]) {
    assert(elementOverrideBody.has(expected), `${expected} missing from ${[...elementOverrideBody].join(", ")}`);
  }
  assert(!elementOverrideBody.has("appliesTo"), [...elementOverrideBody].join(", "));

  const wireOverrideBody = itemLabels(completeAtMarker(`
context app

deploymentProfile globalProfile
    appliesTo:
        production from eu

system application
    name = Application

    service frontend
        name = Frontend
        links:
            -> backend
                deployment:
                    uses publicGateway
                        __CURSOR__

    service backend
        name = Backend
`, { snapshot, contextIds: ["eu"] }));
  for (const expected of ["name", "technology", "description", "cidr"]) {
    assert(wireOverrideBody.has(expected), `${expected} missing from ${[...wireOverrideBody].join(", ")}`);
  }
  assert(!wireOverrideBody.has("appliesTo"), [...wireOverrideBody].join(", "));
}

function deploymentProfilesCompleteDeclaredActionsAndContextualMembers() {
  const snapshot = deploymentProfileSnapshot();
  const contextualIdentifiers = [
    { label: "production", type: "Deployment", contextId: "eu" },
    { label: "production", type: "Deployment", contextId: "sa" },
    { label: "test", type: "Deployment", contextId: "eu" },
    { label: "unrelated", type: "System", contextId: "other" },
  ];
  const options = { snapshot, contextualIdentifiers, contextIds: ["eu", "sa", "other"] };

  const newProfileBody = itemLabels(completeAtMarker(`
context app

deploymentProfile regional
    __CURSOR__
`, options));
  for (const expected of ["appliesTo", "uses", "runsOn"]) {
    assert(newProfileBody.has(expected), `${expected} missing from ${[...newProfileBody].join(", ")}`);
  }
  assert(!newProfileBody.has("deployment"), [...newProfileBody].join(", "));

  const actionBody = itemLabels(completeAtMarker(`
context app

deploymentProfile regional
    appliesTo:
        production from eu
    __CURSOR__
`, options));
  assert.deepEqual([...actionBody].sort(), ["runsOn", "uses"]);

  const memberIds = itemLabels(completeAtMarker(`
context app

deploymentProfile regional
    appliesTo:
        __CURSOR__
`, options));
  assert.deepEqual([...memberIds].sort(), ["production", "test"]);

  const fromKeyword = itemLabels(completeAtMarker(`
context app

deploymentProfile regional
    appliesTo:
        production __CURSOR__
`, options));
  assert.deepEqual([...fromKeyword], ["from"]);

  const memberContexts = itemLabels(completeAtMarker(`
context app

deploymentProfile regional
    appliesTo:
        production from __CURSOR__
`, options));
  assert.deepEqual([...memberContexts].sort(), ["eu", "sa"]);

  const useTargets = itemLabels(completeAtMarker(`
context app

deploymentProfile regional
    appliesTo:
        production from eu
    uses __CURSOR__
`, options));
  assert.deepEqual([...useTargets].sort(), [
    "broker",
    "compute",
    "database",
    "internalNetwork",
    "publicGateway",
    "regional",
  ]);

  const placementTargets = itemLabels(completeAtMarker(`
context app

deploymentProfile regional
    appliesTo:
        production from eu
    runsOn __CURSOR__
`, options));
  assert.deepEqual([...placementTargets].sort(), [
    "broker",
    "compute",
    "database",
    "internalNetwork",
    "publicGateway",
  ]);
}

function contextualReferenceListsAndAnonymousOperatorsUseDeclarations() {
  const definitions = buildLanguageSnapshotResultFromSources([
    source("declarative_reference_completion.ai", `
define type ReleaseTarget of BoundaryElement
    constructor releaseTarget

define operator HostAssignment of Edge
    constructor assignHost InfrastructureComponent
        on RolloutPolicy

    capability = "deployment-placement"

define type RolloutPolicy of BoundaryElement
    constructor rolloutPolicy

    required List of ReleaseTarget members
        capability = "reference-only"
    List of ReleaseTarget drafts
    List of HostAssignment _

define type PolicyGroup of BoundaryElement
    constructor policyGroup

    List of RolloutPolicy _

define type ReleaseCollection of BoundaryElement
    constructor releaseCollection

    List of ReleaseTarget _

define type RolloutEnvironment of Environment
    Compute host
`),
  ], [coreLanguageSnapshot]);
  assert.deepEqual(definitions.diagnostics, []);

  const contextualIdentifiers = [
    { label: "releaseA", type: "ReleaseTarget", contextId: "eu" },
    { label: "releaseA", type: "ReleaseTarget", contextId: "sa" },
    { label: "releaseB", type: "ReleaseTarget", contextId: "eu" },
    { label: "wrongType", type: "System", contextId: "eu" },
  ];
  const options = {
    snapshot: definitions.snapshot,
    contextualIdentifiers,
    contextIds: ["eu", "sa"],
  };

  const bodyItems = itemLabels(completeAtMarker(`
context app

rolloutPolicy current
    __CURSOR__
`, options));
  assert.deepEqual([...bodyItems].sort(), ["assignHost", "members"]);

  const referenceItems = itemLabels(completeAtMarker(`
context app

rolloutPolicy current
    members:
        __CURSOR__
`, options));
  assert.deepEqual([...referenceItems].sort(), ["releaseA", "releaseB"]);

  const nestedReferenceItems = itemLabels(completeAtMarker(`
context app

policyGroup group
    rolloutPolicy current
        members:
            __CURSOR__
`, options));
  assert.deepEqual([...nestedReferenceItems].sort(), ["releaseA", "releaseB"]);

  const emptyReferenceItems = itemLabels(completeAtMarker(`
context app

rolloutPolicy current
    members:
        __CURSOR__
`, { snapshot: definitions.snapshot }));
  assert.deepEqual([...emptyReferenceItems], []);

  const ordinaryListItems = itemLabels(completeAtMarker(`
context app

rolloutPolicy current
    drafts:
        __CURSOR__
`, options));
  assert.deepEqual([...ordinaryListItems].sort(), ["releaseA", "releaseB", "releaseTarget"]);

  const nonEdgeContainerItems = itemLabels(completeAtMarker(`
context app

releaseCollection releases
    __CURSOR__
`, options));
  assert(nonEdgeContainerItems.has("releaseTarget"), [...nonEdgeContainerItems].join(", "));
  for (const forbidden of ["assignHost", "runsOn", "uses"]) {
    assert(!nonEdgeContainerItems.has(forbidden), `${forbidden} leaked into ${[...nonEdgeContainerItems].join(", ")}`);
  }

  const fromKeyword = itemLabels(completeAtMarker(`
context app

rolloutPolicy current
    members:
        releaseA __CURSOR__
`, options));
  assert.deepEqual([...fromKeyword], ["from"]);

  const contexts = itemLabels(completeAtMarker(`
context app

rolloutPolicy current
    members:
        releaseA from __CURSOR__
`, options));
  assert.deepEqual([...contexts].sort(), ["eu", "sa"]);

  const operatorTargets = itemLabels(completeAtMarker(`
context app

rolloutPolicy current
    members:
        releaseA from eu
    assignHost __CURSOR__
`, options));
  assert.deepEqual([...operatorTargets], ["host"]);

  const operatorBody = itemLabels(completeAtMarker(`
context app

rolloutPolicy current
    members:
        releaseA from eu
    assignHost host
        __CURSOR__
`, options));
  for (const expected of ["address", "components", "description", "name", "runsOn", "technology"]) {
    assert(operatorBody.has(expected), `${expected} missing from ${[...operatorBody].join(", ")}`);
  }
  assert(!operatorBody.has("members"), [...operatorBody].join(", "));
}

function filledSingleReferenceSlotsDoNotSuggestNestedAttributes() {
  const definitions = buildLanguageSnapshotResultFromSources([
    source("custom.ai", `
define type CustomNode of BoundaryElement
    constructor customNode

    required Text name
    CustomNode parent
    List of CustomNode peers

define type CompletionEnvironment of Environment
    ServiceProvider csp
    Compute compute

define type ServiceProvider of InfrastructureComponent
    constructor serviceProvider
`),
  ], [coreLanguageSnapshot]);
  assert.deepEqual(definitions.diagnostics, []);

  const filledSingleSlotLabels = itemLabels(completeAtMarker(`
context custom

customNode root
    name = Root

customNode child
    name = Child
    parent:
        root
        __CURSOR__
`, { snapshot: definitions.snapshot }));
  assert.deepEqual(
    [...filledSingleSlotLabels],
    [],
    `filled single reference slot leaked: ${[...filledSingleSlotLabels].join(", ")}`,
  );

  const invalidNestedSlotLabels = itemLabels(completeAtMarker(`
context custom

customNode root
    name = Root

customNode child
    name = Child
    parent:
        root
        parent:
            __CURSOR__
`, { snapshot: definitions.snapshot }));
  assert.deepEqual(
    [...invalidNestedSlotLabels],
    [],
    `invalid nested reference slot leaked: ${[...invalidNestedSlotLabels].join(", ")}`,
  );

  const listSlotLabels = itemLabels(completeAtMarker(`
context custom

customNode root
    name = Root

customNode child
    name = Child
    peers:
        root
        __CURSOR__
`, { snapshot: definitions.snapshot }));

  assert(listSlotLabels.has("root"), `list reference slot lost candidates: ${[...listSlotLabels].join(", ")}`);
  assert(!listSlotLabels.has("parent"), `list reference slot leaked object attributes: ${[...listSlotLabels].join(", ")}`);

  const infrastructureSlotLabels = itemLabels(completeAtMarker(`
environment example
    name = Example

deployment production
    csp:
        serviceProvider csp
            name = Provider

    compute:
        compute compute
            name = Kubernetes
            runsOn:
                csp
                __CURSOR__
`, { snapshot: definitions.snapshot }));
  assert.deepEqual(
    [...infrastructureSlotLabels],
    [],
    `filled infrastructure reference slot leaked: ${[...infrastructureSlotLabels].join(", ")}`,
  );

  const infrastructureValueCompletion = completeAtMarker(`
environment example
    name = Example

deployment production
    csp:
        serviceProvider csp
            name = Provider

    compute:
        compute compute
            name = Kubernetes
            runsOn:
                __CURSOR__csp
`, { snapshot: definitions.snapshot });
  const infrastructureValueLabels = itemLabels(infrastructureValueCompletion);
  assert.deepEqual(
    [...infrastructureValueLabels].sort(),
    ["compute", "csp"],
    `reference value completion candidates changed; rules: ${infrastructureValueCompletion.ruleStack.join(" > ")}`,
  );
}

function assertProjectionCompletion(line, { snapshot, includes, excludes }) {
  const labels = itemLabels(completeAtMarker(`
context infra

publicGateway gateway
    projection:
        ${line}
`, { snapshot, contextIds: ["latam"] }));
  for (const label of includes) {
    assert(labels.has(label), `${label} not found in ${[...labels].join(", ")}`);
  }
  for (const label of excludes) {
    assert(!labels.has(label), `${label} should not be present in ${[...labels].join(", ")}`);
  }
}

function assertNestedDeploymentProjectionCompletion(line, { snapshot, includes, excludes }) {
  const labels = itemLabels(completeAtMarker(`
environment ala
    name = Almaty

deployment production
    cloud:
        name = AWS Outpost

    compute:
        name = EKS

    network:
        name = Cluster network

    publicGateway:
        publicGateway publicGateway
            cdn:
                infrastructureComponent cdn
                    name = CloudFront
            projection:
                ${line}
`, { snapshot }));
  for (const label of includes) {
    assert(labels.has(label), `${label} not found in ${[...labels].join(", ")}`);
  }
  for (const label of excludes) {
    assert(!labels.has(label), `${label} should not be present in ${[...labels].join(", ")}`);
  }
}

function assertCustomRuntimeProjectionCompletion(line, { snapshot, includes, excludes }) {
  const labels = itemLabels(completeAtMarker(`
environment ala
    name = Almaty

runtime production
    cloud:
        name = AWS Outpost

    compute:
        name = EKS

    network:
        name = Cluster network

    publicGateway:
        publicGateway publicGateway
            cdn:
                infrastructureComponent cdn
                    name = CloudFront
            projection:
                ${line}
`, { snapshot, contextIds: ["latam"] }));
  for (const label of includes) {
    assert(labels.has(label), `${label} not found in ${[...labels].join(", ")}`);
  }
  for (const label of excludes) {
    assert(!labels.has(label), `${label} should not be present in ${[...labels].join(", ")}`);
  }
}

function assertProjectionRelationAttributes(source, options) {
  const attributeLabels = itemLabels(completeAtMarker(source, options));
  for (const expected of options.includes) {
    assert(attributeLabels.has(expected), `${expected} missing from ${[...attributeLabels].join(", ")}`);
  }
  for (const excluded of options.excludes ?? []) {
    assert(!attributeLabels.has(excluded), `${excluded} should not be present in ${[...attributeLabels].join(", ")}`);
  }
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

function completeAtMarker(sourceWithCursor, overrides = {}) {
  const cursorOffset = sourceWithCursor.indexOf("__CURSOR__");
  assert.notEqual(cursorOffset, -1);
  const source = sourceWithCursor.replace("__CURSOR__", "").trimStart();
  return complete(source, cursorOffset - (sourceWithCursor.length - sourceWithCursor.trimStart().length), overrides);
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

function deploymentProfileSnapshot() {
  if (cachedDeploymentProfileSnapshot !== undefined) {
    return cachedDeploymentProfileSnapshot;
  }
  const result = buildLanguageSnapshotResultFromSources([
    source("deployment_profile_completion.ai", `
define type MysqlDatabase of Storage
    constructor mysqlDatabase

    Text address

define type PublicGateway of NetworkConnection
    constructor publicGateway

    Text cidr

define type TestEnvironment of Environment
    Compute compute
    MysqlDatabase database
    Broker broker
    NetworkConnection internalNetwork
    PublicGateway publicGateway
`),
  ], [coreLanguageSnapshot]);
  assert.deepEqual(result.diagnostics, []);
  cachedDeploymentProfileSnapshot = result.snapshot;
  return cachedDeploymentProfileSnapshot;
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
