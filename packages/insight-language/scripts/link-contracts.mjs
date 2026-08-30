import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  mergeLanguageSnapshots,
  ProjectLinkerState,
} from "../build/runtime/index.js";

const cases = [
  linksElementsAcrossContextsAndImports,
  substitutesNamedImportAliasWithRealElement,
  resolvesAnonymousImportWithoutCreatingNamedAlias,
  anonymousImportsToDifferentContextsDoNotBecomeDuplicateEdges,
  keepsNamespacesIndependentAcrossContexts,
  requiresImportForElementDeclaredInAnotherFileOfSameContext,
  importIsVisibleOnlyInsideDeclaringSourceIdentity,
  reportsUndeclaredIdentifierWhenNoImportCanFixReference,
  reportsUnknownNamedImportContext,
  reportsUnknownElementInsideExistingImportedContext,
  reportsDuplicateNamesAcrossFilesOfSameContext,
  extendsElementAcrossFilesOfSameContext,
  allocatesAnonymousIdsAcrossObjectExtensionsInContextNamespace,
  reportsInvalidObjectsInsideObjectExtensions,
  allowsEdgesToSameOrHigherNestingLevel,
  indexesNestedElementsInsideContextNamespace,
  allowsEdgeFromHigherToLowerNestingLevel,
  attachesInlineNotesToLinkedElementsAndEdgesOnly,
  keepsZeroOrMoreAnnotationsOnLinkedElementsAndEdges,
  reportsMissingRequiredAttributes,
  allowsEnumValuesInNamedListAttributes,
  reportsUndeclaredArchitectureConstructorsWhenFrameworkIsLinked,
  exposesDuplicateResolvedEdges,
  notesElementsThatAreNotConnectedByAnyReference,
  doesNotReportParentElementWithNestedElementsAsIsolated,
  warnsWhenHigherLevelEdgeShadowsNextLevelEdgeOfSameType,
  warnsWhenLowerLevelEdgeKeepsSameExternalEndpoint,
  buildsPresentationIndexOutsideTheGraphAndResolvesTypeInheritance,
  validatesPresentationFieldsSectionsAndTargetAttributes,
  linksBaseFrameworkPresentations,
  linksCoreWirePresentationFields,
  allowsTypedReferenceValuesInSingleSlots,
  resolvesCoreInfrastructureRunsOnReferences,
  rejectsReferencesToAnonymousInstances,
  allowsTypedReferenceValuesFromExplicitContexts,
  validatesTypedReferenceSlotCardinalityAndType,
  mergesObjectExtensionsAcrossFiles,
  reportsInvalidObjectExtensions,
  reportsDuplicateArchitectureAttributes,
  acceptsNamedObjectSlotsDeclaredByTypeExtension,
  acceptsAnonymousElementsInSingleObjectSlots,
  createsImplicitAnonymousObjectForSingleConstructorObjectSlots,
  createsImplicitAnonymousDeploymentObjectsFromEnvironmentSlots,
  prefersExactImplicitDeploymentConstructorOverAssignableSubtypes,
  prefersExactNetworkConstructorOverAssignableSubtypes,
  materializesCustomImplicitAnonymousAndExplicitObjectConstructors,
  reportsMissingImplicitObjectConstructor,
  reportsAmbiguousImplicitObjectConstructor,
  rejectsScalarAssignmentForNamedObjectSlots,
  reportsArchitectureTypeMismatchWhenConstructorIsUsedUnderWrongParentType,
  reportsArchitectureTypeMismatchWhenEdgeOperandsDoNotMatchOperatorDefinition,
  acceptsOperatorDefinitionOnBaseElementForDerivedOperands,
  rejectsUnsupportedExplicitEdgeOperatorImplementation,
  rejectsOperatorInvocationsOutsideEdgeLists,
  materializesResolvedElementAndEdgeAttributes,
  reportsUndeclaredArchitectureAttributes,
  reportsMissingRequiredArchitectureAttributes,
  reportsCoreServiceWithoutName,
  notesThatAttributeAnnotationIsDeprecated,
  validatesEnumAttributeValues,
  validatesScalarEnumAttributeValuesAndConstructorDefaults,
  reportsDuplicateNamedSlots,
  appliesConcreteProjectionRulesFromReferenceAttributes,
  rejectsFixedProjectionTerms,
  appliesDeploymentProfileDefaultsToElements,
  reusesDeploymentInfrastructureWithoutOverrides,
  overridesClonedDeploymentUsesLocally,
  clonesDeploymentInfrastructureForReferenceOverrides,
  reusesWireDeploymentInfrastructureWithoutOverrides,
  inheritsDeploymentTargetsForComponentWires,
  appliesAndOverridesWireDeploymentNetworkUses,
  rejectsDeploymentProfilesOnWires,
  rejectsNonNetworkInfrastructureOnWires,
  skipsUnavailableWireNetworksPerDeployment,
  requiresDeploymentProfileTargets,
  rejectsEnvironmentTargetsInDeploymentProfiles,
  rejectsDeploymentProfilesInsideEnvironments,
  rejectsOverlappingDeploymentProfiles,
  isolatesDisjointDeploymentProfilesInSameEnvironment,
  rejectsLocalAppliesToOverrideInDeploymentBlocks,
  doesNotWarnAboutWireDeploymentUntilTheProjectUsesIt,
  warnsAboutMissingAndNonPhysicalWireDeploymentsOnceWireDeploymentIsUsed,
  doesNotRequireDeploymentOnAlreadyPhysicalWires,
  doesNotWarnAboutElementDeploymentUntilTheProjectUsesIt,
  warnsAboutMissingElementDeploymentsWithinTheActiveLogicalLevel,
  warnsWhenElementDeploymentResolvesToNoPhysicalInfrastructure,
  buildsIndexedGraphFromLinkedProject,
  updatesProjectLinkerStateWithGraphImpact,
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
  console.log("link contract fixtures passed");
}

function linksElementsAcrossContextsAndImports() {
  const result = linkWithCore([
    source("archinsight.ai", `
context archinsight
    name = Archinsight

import google from context external_systems
import user from context external_systems

system archinsight_editor
    name = Archinsight Editor
    links:
        -> user

    service backend
        name = Backend API
        component oidc_login_service
            name = OIDC login service
            links:
                -> google

    container repository_store
        name = Repository database
`),
    source("external-systems.ai", `
context external_systems

external actor user
    name = User

external system google
    name = Google
`),
  ]);

  assertNoErrors(result);
  assert.equal(result.imports.length, 2);
  assert.equal(result.elements.find((element) => element.id === "external_systems/user")?.type, "ExternalActor");
  assert(result.elements.find((element) => element.id === "external_systems/user")?.baseTypes.includes("Actor"));
  assert.equal(result.elements.find((element) => element.id === "external_systems/google")?.type, "ExternalSystem");
  assert(result.edges.some((edge) => edge.source === "archinsight/archinsight_editor" && edge.target === "external_systems/user"));
  assert(result.edges.some((edge) => edge.source === "archinsight/oidc_login_service" && edge.target === "external_systems/google"));
}

function substitutesNamedImportAliasWithRealElement() {
  const result = linkWithoutCore([
    source("source.ai", `
context shared

import target from context shared as local_target

system source
    links:
        -> local_target
`),
    source("target.ai", `
context shared

system target
`),
  ]);

  assertNoErrors(result);
  assert.equal(result.imports.length, 1);
  assert.equal(result.imports[0]?.target, "shared/target");
  assert.equal(result.edges[0]?.target, "shared/target");
}

function resolvesAnonymousImportWithoutCreatingNamedAlias() {
  const result = linkWithoutCore([
    source("source.ai", `
context source

system caller
    links:
        -> target from target_context
`),
    source("target.ai", `
context target_context

system target
`),
  ]);

  assertNoErrors(result);
  assert.equal(result.imports.length, 0);
  assert.equal(result.edges[0]?.target, "target_context/target");
}

function anonymousImportsToDifferentContextsDoNotBecomeDuplicateEdges() {
  const result = linkWithoutCore([
    source("source.ai", `
context imports

system source
    links:
        -> target from first_context
        -> target from second_context
`),
    source("first.ai", `
context first_context

system target
`),
    source("second.ai", `
context second_context

system target
`),
  ]);

  assertNoErrors(result);
  assert.equal(result.edges.length, 2);
  assert.equal(result.edges[0]?.target, "first_context/target");
  assert.equal(result.edges[1]?.target, "second_context/target");
  assert.equal(result.duplicateEdges.length, 0);
}

function keepsNamespacesIndependentAcrossContexts() {
  const result = linkWithoutCore([
    source("first.ai", `
context first

system shared
`),
    source("second.ai", `
context second

system shared
`),
  ]);

  assertNoErrors(result);
  assert(result.elements.some((element) => element.id === "first/shared" && element.sourceIdentity === "first.ai"));
  assert(result.elements.some((element) => element.id === "second/shared" && element.sourceIdentity === "second.ai"));
}

function requiresImportForElementDeclaredInAnotherFileOfSameContext() {
  const result = linkWithoutCore([
    source("source.ai", `
context shared

system source
    links:
        -> target
`),
    source("target.ai", `
context shared

system target
`),
  ]);

  assert.equal(countDiagnostics(result, "MISSING_IMPORT"), 1);
  assert.equal(result.edges.length, 0);
}

function importIsVisibleOnlyInsideDeclaringSourceIdentity() {
  const result = linkWithoutCore([
    source("first.ai", `
context shared

import target from context shared

system first
    links:
        -> target
`),
    source("second.ai", `
context shared

system second
    links:
        -> target
`),
    source("target.ai", `
context shared

system target
`),
  ]);

  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0]?.source, "shared/first");
  assert.equal(countDiagnostics(result, "MISSING_IMPORT"), 1);
}

function reportsUndeclaredIdentifierWhenNoImportCanFixReference() {
  const result = linkWithoutCore([
    source("source.ai", `
context shared

system source
    links:
        -> missing
`),
  ]);

  assert.equal(countDiagnostics(result, "UNDECLARED_IDENTIFIER"), 1);
  assert.equal(result.edges.length, 0);
}

function reportsUnknownNamedImportContext() {
  const result = linkWithoutCore([
    source("source.ai", `
context shared

import target from context missing_context
`),
  ]);

  assert.equal(countDiagnostics(result, "UNKNOWN_IMPORT_CONTEXT"), 1);
}

function reportsUnknownElementInsideExistingImportedContext() {
  const result = linkWithoutCore([
    source("source.ai", `
context source

import missing from context target_context
`),
    source("target.ai", `
context target_context

system target
`),
  ]);

  assert.equal(countDiagnostics(result, "UNKNOWN_IMPORTED_ELEMENT"), 1);
}

function reportsDuplicateNamesAcrossFilesOfSameContext() {
  const result = linkWithoutCore([
    source("first.ai", `
context shared

system duplicated
`),
    source("second.ai", `
context shared

system duplicated
`),
  ]);

  assert.equal(countDiagnostics(result, "IDENTIFIER_ALREADY_DECLARED"), 1);
}

function extendsElementAcrossFilesOfSameContext() {
  const result = linkProject({
    snapshot: mergeLanguageSnapshots([
      minimalArchitectureSnapshot(),
      {
        schemaVersion: "services",
        types: [
          { name: "Service", baseType: "Element", attributes: [{ name: "links", type: "List", list: true, listElementType: "Wire" }] },
          { name: "System", attributes: [{ name: "_", type: "List", list: true, listElementType: "Service" }] },
        ],
        constructors: [{ spelling: "service", ownerType: "Service" }],
        operators: [],
        enums: [],
      },
    ]),
    sources: [
      source("base.ai", `
context shared

system app

system target
`),
      source("extension.ai", `
context shared

import target from context shared

extend system app
    service api
        links:
            -> target
`),
    ],
  });

  assertNoErrors(result);
  assert.equal(result.elements.find((element) => element.id === "shared/api")?.parent, "shared/app");
  assert(result.edges.some((edge) => edge.source === "shared/api" && edge.target === "shared/target"));
}

function allocatesAnonymousIdsAcrossObjectExtensionsInContextNamespace() {
  const snapshot = mergeLanguageSnapshots([
    objectSlotSnapshot(),
    {
      schemaVersion: "edge-object-slots",
      types: [
        { name: "Wire", attributes: [{ name: "lead", type: "Member" }] },
      ],
      constructors: [],
      operators: [],
      enums: [],
    },
  ]);
  const result = linkProject({
    snapshot,
    sources: [
      source("base.ai", `
context shared

system source
    name = Source
    lead:
        name = Base Lead
`),
      source("extension.ai", `
context shared

system target
    name = Target

extend system source
    service api
        links:
            -> target
                lead:
                    name = Edge Lead
`),
    ],
  });

  assertNoErrors(result);
  const members = result.elements.filter((element) => element.type === "Member");
  assert.equal(members.length, 2);
  assert.equal(new Set(members.map((element) => element.id)).size, 2);
  assert.deepEqual(
    result.elements.find((element) => element.id === "shared/source")?.attributes.lead,
    [members.find((element) => element.attributes.name?.[0] === "Base Lead")?.id],
  );
  assert.deepEqual(
    result.edges.find((edge) => edge.source === "shared/api" && edge.target === "shared/target")?.attributes.lead,
    [members.find((element) => element.attributes.name?.[0] === "Edge Lead")?.id],
  );
}

function reportsInvalidObjectsInsideObjectExtensions() {
  const result = linkProject({
    snapshot: objectSlotSnapshot(),
    sources: [
      source("base.ai", `
context shared

system source
    name = Source
`),
      source("extension.ai", `
context shared

extend system source
    actor user
        description = Invalid nested actor
`),
    ],
  });

  assert(result.diagnostics.some((diagnostic) =>
    diagnostic.code === "TYPE_MISMATCH"
    && diagnostic.sourceName === "extension.ai"
    && diagnostic.message === "Type 'Actor' is not assignable to expected type 'Service'"
  ));
}

function allowsEdgesToSameOrHigherNestingLevel() {
  const result = linkProject({
    snapshot: mergeLanguageSnapshots([
      minimalArchitectureSnapshot(),
      {
        schemaVersion: "services",
        types: [
          { name: "Service", baseType: "Element", attributes: [{ name: "links", type: "List", list: true, listElementType: "Wire" }] },
          { name: "System", attributes: [{ name: "_", type: "List", list: true, listElementType: "Service" }] },
        ],
        constructors: [{ spelling: "service", ownerType: "Service" }],
        operators: [],
        enums: [],
      },
    ]),
    sources: [
      source("allowed-levels.ai", `
context shared

system parent
    links:
        -> peer

    service child
        links:
            -> parent
            -> sibling

    service sibling

system peer
`),
    ],
  });

  assertNoErrors(result);
  assert.equal(result.edges.length, 3);
}

function indexesNestedElementsInsideContextNamespace() {
  const result = linkProject({
    snapshot: mergeLanguageSnapshots([
      minimalArchitectureSnapshot(),
      {
        schemaVersion: "containers",
        types: [
          { name: "Container", baseType: "Element" },
          { name: "System", attributes: [{ name: "_", type: "List", list: true, listElementType: "Container" }] },
        ],
        constructors: [{ spelling: "container", ownerType: "Container" }],
        operators: [],
        enums: [],
      },
    ]),
    sources: [
      source("nested.ai", `
context nested

system payments
    container api

system caller
    links:
        -> api
`),
    ],
  });

  assertNoErrors(result);
  assert.equal(result.elements.find((element) => element.id === "nested/api")?.parent, "nested/payments");
  assert(result.edges.some((edge) => edge.source === "nested/caller" && edge.target === "nested/api"));
}

function allowsEdgeFromHigherToLowerNestingLevel() {
  const result = linkProject({
    snapshot: mergeLanguageSnapshots([
      minimalArchitectureSnapshot(),
      {
        schemaVersion: "services",
        types: [
          { name: "Service", baseType: "Element" },
          { name: "System", attributes: [{ name: "_", type: "List", list: true, listElementType: "Service" }] },
        ],
        constructors: [{ spelling: "service", ownerType: "Service" }],
        operators: [],
        enums: [],
      },
    ]),
    sources: [
      source("higher-to-lower.ai", `
context shared

system source
    links:
        -> target

system parent
    service target
`),
    ],
  });

  assertNoErrors(result);
  assert.equal(result.edges[0]?.source, "shared/source");
  assert.equal(result.edges[0]?.target, "shared/target");
}

function attachesInlineNotesToLinkedElementsAndEdgesOnly() {
  const result = linkWithoutCore([
    source("notes.ai", `
context shared

system source # Source note
    links:
        -> target # Edge note

system target
`),
  ]);

  assertNoErrors(result);
  assert.equal(result.contexts.find((context) => context.id === "shared")?.note, undefined);
  assert.equal(result.elements.find((element) => element.id === "shared/source")?.note, "Source note");
  assert.equal(result.edges[0]?.note, "Edge note");
}

function keepsZeroOrMoreAnnotationsOnLinkedElementsAndEdges() {
  const result = linkWithoutCore([
    source("annotations.ai", `
context annotations

system plain

@planned
@deprecated(replace after migration)
system source
    links:
        @attribute(style=dotted,arrowhead=diamond)
        -> target # synchronous call

system target
`),
  ]);

  assertNoErrors(result);
  const plain = result.elements.find((element) => element.id === "annotations/plain");
  const sourceElement = result.elements.find((element) => element.id === "annotations/source");
  assert.equal(plain?.annotations, undefined);
  assert.deepEqual(sourceElement?.annotations?.map((annotation) => annotation.name), ["planned", "deprecated"]);
  assert.equal(sourceElement?.annotations?.[1]?.value, "replace after migration");
  assert.equal(result.edges[0]?.annotations?.[0]?.name, "attribute");
  assert.equal(result.edges[0]?.annotations?.[0]?.value, "style=dotted,arrowhead=diamond");
  assert.equal(result.edges[0]?.note, "synchronous call");
}

function reportsMissingRequiredAttributes() {
  const result = linkProject({
    snapshot: infrastructureSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

environment digitalocean
    primaryRegion:
        europe
`),
    ],
  });

  assert.equal(countDiagnostics(result, "REQUIRED_ATTRIBUTE_MISSING"), 1);
}

function allowsEnumValuesInNamedListAttributes() {
  const valid = linkProject({
    snapshot: enumSnapshot(),
    sources: [
      source("valid.ai", `
context archinsight

environment digitalocean
    name = Digital Ocean
    region:
        europe
        usa
`),
    ],
  });
  const invalid = linkProject({
    snapshot: enumSnapshot(),
    sources: [
      source("invalid.ai", `
context archinsight

environment digitalocean
    name = Digital Ocean
    region:
        asia
`),
    ],
  });

  assertNoErrors(valid);
  assert.deepEqual(valid.elements.find((element) => element.id === "archinsight/digitalocean")?.attributes.region, ["europe", "usa"]);
  assert.equal(countDiagnostics(invalid, "ENUM_VALUE_NOT_DECLARED"), 1);
}

function reportsUndeclaredArchitectureConstructorsWhenFrameworkIsLinked() {
  const result = linkProject({
    snapshot: {
      schemaVersion: "context-only",
      types: [
        { name: "Element" },
        { name: "Context", baseType: "Element", attributes: [{ name: "_", type: "List", list: true, listElementType: "Element" }] },
      ],
      constructors: [
        { spelling: "context", ownerType: "Context" },
      ],
      operators: [],
      enums: [],
    },
    sources: [
      source("architecture.ai", `
context shared

system app
`),
    ],
  });

  assert.equal(countDiagnostics(result, "CONSTRUCTOR_NOT_DECLARED"), 1);
  assert.equal(result.elements.find((element) => element.id === "shared/app"), undefined);
}

function exposesDuplicateResolvedEdges() {
  const result = linkWithoutCore([
    source("duplicates.ai", `
context shared

system source
    links:
        -> target
        -> target

system target
`),
  ]);

  assertNoErrors(result);
  assert.equal(result.edges.length, 2);
  assert.equal(result.duplicateEdges.length, 1);
  assert.equal(result.duplicateEdges[0]?.source, "shared/source");
  assert.equal(result.duplicateEdges[0]?.operator, "->");
  assert.equal(result.duplicateEdges[0]?.target, "shared/target");
  assert.equal(result.duplicateEdges[0]?.edges.length, 2);
}

function notesElementsThatAreNotConnectedByAnyReference() {
  const result = linkWithoutCore([
    source("isolated.ai", `
context shared

system source
    links:
        -> target

system target

system sibling
`),
  ]);

  assertNoErrors(result);
  assert(result.diagnostics.some((diagnostic) =>
    diagnostic.level === "NOTE"
    && diagnostic.code === "ISOLATED_ELEMENT"
    && diagnostic.message.includes("sibling")
  ));
}

function doesNotReportParentElementWithNestedElementsAsIsolated() {
  const result = linkProject({
    snapshot: mergeLanguageSnapshots([
      minimalArchitectureSnapshot(),
      {
        schemaVersion: "services",
        types: [
          { name: "Service", baseType: "Element", attributes: [{ name: "links", type: "List", list: true, listElementType: "Wire" }] },
          { name: "System", attributes: [{ name: "_", type: "List", list: true, listElementType: "Service" }] },
        ],
        constructors: [{ spelling: "service", ownerType: "Service" }],
        operators: [],
        enums: [],
      },
    ]),
    sources: [
      source("architecture.ai", `
context shared

system app
    service api
        links:
            -> target

system target
`),
    ],
  });

  assertNoErrors(result);
  assert(!result.diagnostics.some((diagnostic) =>
    diagnostic.level === "NOTE"
    && diagnostic.code === "ISOLATED_ELEMENT"
    && diagnostic.message.includes("app")
  ));
}

function warnsWhenHigherLevelEdgeShadowsNextLevelEdgeOfSameType() {
  const sourceText = `
context shared

system frontend
    links:
        -> backend

    service web
        links:
            +> api

system backend
    service api
`;
  const result = linkProject({
    snapshot: mergeLanguageSnapshots([
      minimalArchitectureSnapshot(),
      {
        schemaVersion: "services",
        types: [
          { name: "Service", baseType: "Element", attributes: [{ name: "links", type: "List", list: true, listElementType: "Wire" }] },
          { name: "System", attributes: [{ name: "_", type: "List", list: true, listElementType: "Service" }] },
        ],
        constructors: [{ spelling: "service", ownerType: "Service" }],
        operators: [{ spelling: "+>", ownerType: "Wire", leftType: "Element", targetType: "Element" }],
        enums: [],
      },
    ]),
    sources: [
      source("shadowed.ai", sourceText),
    ],
  });

  assertNoErrors(result);
  const warning = result.diagnostics.find((diagnostic) =>
    diagnostic.level === "WARNING"
    && diagnostic.code === "EDGE_SHADOWS_LOWER_LEVEL_EDGE"
    && diagnostic.message.includes("frontend")
    && diagnostic.message.includes("web")
  );
  assert(warning !== undefined);
  assert.equal(tokenAt(sourceText, warning.line, warning.column), "->");
}

function warnsWhenLowerLevelEdgeKeepsSameExternalEndpoint() {
  const sourceText = `
context shared

system application
    links:
        -> external

    service backend
        links:
            -> external

system external
`;
  const result = linkProject({
    snapshot: mergeLanguageSnapshots([
      minimalArchitectureSnapshot(),
      {
        schemaVersion: "services",
        types: [
          { name: "Service", baseType: "Element", attributes: [{ name: "links", type: "List", list: true, listElementType: "Wire" }] },
          { name: "System", attributes: [{ name: "_", type: "List", list: true, listElementType: "Service" }] },
        ],
        constructors: [{ spelling: "service", ownerType: "Service" }],
        operators: [],
        enums: [],
      },
    ]),
    sources: [
      source("shadowed-external.ai", sourceText),
    ],
  });

  assertNoErrors(result);
  const warning = result.diagnostics.find((diagnostic) =>
    diagnostic.level === "WARNING"
    && diagnostic.code === "EDGE_SHADOWS_LOWER_LEVEL_EDGE"
    && diagnostic.message.includes("application")
    && diagnostic.message.includes("backend")
  );
  assert(warning !== undefined);
  assert.equal(tokenAt(sourceText, warning.line, warning.column), "->");
}

function doesNotWarnWhenProjectedEdgesShadowLowerLevelEdges() {
  const result = linkProject({
    snapshot: mergeLanguageSnapshots([
      minimalArchitectureSnapshot(),
      {
        schemaVersion: "projected-shadow",
        types: [
          {
            name: "System",
            attributes: [
              { name: "_", type: "List", list: true, listElementType: "Service" },
              { name: "uses", type: "Gateway" },
            ],
          },
          {
            name: "Service",
            baseType: "Element",
            attributes: [{ name: "uses", type: "Gateway" }],
          },
          {
            name: "Gateway",
            baseType: "Element",
            attributes: [{ name: "backend", type: "Infrastructure", required: true }],
            projectionRules: [
              { source: { placement: "source", kind: "from", value: "$from" }, operator: "originalLink", target: { placement: "target", kind: "attribute", value: "backend" } },
            ],
          },
          { name: "Infrastructure", baseType: "Element" },
        ],
        constructors: [
          { spelling: "service", ownerType: "Service" },
          { spelling: "gateway", ownerType: "Gateway" },
          { spelling: "infra", ownerType: "Infrastructure" },
        ],
        operators: [],
        enums: [],
      },
    ]),
    sources: [
      source("projected-shadow.ai", `
context shared

infra backend

system app
    uses:
        gateway _
            backend:
                backend

    service api
        uses:
            gateway _
                backend:
                    backend
`),
    ],
  });

  assertNoErrors(result);
  assert(result.edges.some((edge) => edge.projected === true
    && edge.source === "shared/app"
    && edge.target === "shared/backend"));
  assert(result.edges.some((edge) => edge.projected === true
    && edge.source === "shared/api"
    && edge.target === "shared/backend"));
  assert(!result.diagnostics.some((diagnostic) => diagnostic.code === "EDGE_SHADOWS_LOWER_LEVEL_EDGE"));
}

function buildsPresentationIndexOutsideTheGraphAndResolvesTypeInheritance() {
  const snapshot = buildLanguageSnapshotResultFromSources([
    source("definitions.ai", `
extend type Element
    Text name
    Text technology

define type Context
    constructor context

    List of Element _

define type Container of Element
    constructor container

define presentation Element
    header = name

    light
        fill = "#ffffff"
        stroke = "#333333"

    graphviz
        shape = box
        penwidth = 1

define presentation Container
    subtitle = technology

    light
        fill = "#eeeeee"

    graphviz
        penwidth = 1.2
`),
  ]).snapshot;
  const result = linkProject({
    snapshot,
    sources: [
      source("architecture.ai", `
context shared

container api
`),
    ],
  });

  assertNoErrors(result);
  assert(result.presentations.Element);
  assert(result.presentations.Container);
  assert.equal(result.presentations.Container?.basePresentation, "Element");
  assert.equal(result.presentations.Container?.assignments.header, "name");
  assert.equal(result.presentations.Container?.assignments.subtitle, "technology");
  assert.equal(result.presentations.Container?.sections.light?.fill, "\"#eeeeee\"");
  assert.equal(result.presentations.Container?.sections.light?.stroke, "\"#333333\"");
  assert.equal(result.presentations.Container?.sections.graphviz?.shape, "box");
  assert.equal(result.presentations.Container?.sections.graphviz?.penwidth, "1.2");
}

function validatesPresentationFieldsSectionsAndTargetAttributes() {
  const snapshot = buildLanguageSnapshotResultFromSources([
    source("definitions.ai", `
define type System of Element
    constructor system

    Text name

define presentation System
    title = name
    header = title

    fancy
        fill = "#ffffff"

    graphviz
        bogus = true
`),
  ]).snapshot;
  const result = linkProject({ snapshot, sources: [] });

  assert.equal(countDiagnostics(result, "ATTRIBUTE_NOT_DECLARED"), 4);
  assert(result.diagnostics.some((diagnostic) => diagnostic.message.includes("Presentation field 'title'")));
  assert(result.diagnostics.some((diagnostic) => diagnostic.message.includes("Attribute 'title'")));
  assert(result.diagnostics.some((diagnostic) => diagnostic.message.includes("Presentation section 'fancy'")));
  assert(result.diagnostics.some((diagnostic) => diagnostic.message.includes("Presentation section property 'bogus'")));
}

function linksBaseFrameworkPresentations() {
  const result = linkProject({
    snapshot: coreLanguageSnapshot,
    sources: [],
  });

  assertNoErrors(result);
  for (const name of ["System", "ExternalSystem", "Actor", "Context", "Container", "BoundaryElement"]) {
    assert(result.presentations[name], `${name} presentation is missing`);
  }
  assert.equal(result.presentations.BoundaryElement?.basePresentation, "Element");
  assert.equal(result.presentations.System?.basePresentation, "BoundaryElement");
  assert.equal(result.presentations.ExternalSystem?.basePresentation, "System");
  assert.equal(result.presentations.Wire?.basePresentation, "Edge");
  assert.equal(result.presentations.PhysicalWire?.basePresentation, "Edge");
  assert.equal(result.presentations.ConnectTo?.basePresentation, "PhysicalWire");
}

function linksCoreWirePresentationFields() {
  const result = linkProject({
    snapshot: coreLanguageSnapshot,
    sources: [],
  });

  assertNoErrors(result);
  assert.equal(result.presentations.Wire?.assignments.header, "technology");
  assert.equal(result.presentations.Wire?.assignments.body, "description");
  assert.equal(result.presentations.SyncWire?.assignments.header, "technology");
  assert.equal(result.presentations.SyncWire?.assignments.subtitle, "call");
  assert.equal(result.presentations.SyncWire?.assignments.body, "description");
  assert.equal(result.presentations.AsyncWire?.assignments.header, "technology");
  assert.equal(result.presentations.AsyncWire?.assignments.subtitle, "via");
  assert.equal(result.presentations.AsyncWire?.assignments.body, "description");
  assert.equal(result.presentations.PhysicalWire?.assignments.header, "technology");
  assert.equal(result.presentations.PhysicalWire?.assignments.body, "description");
  assert.equal(result.presentations.ConnectTo?.assignments.header, "technology");
  assert.equal(result.presentations.ConnectTo?.assignments.body, "description");
  assert.equal(result.presentations.ConnectTo?.sections.light?.stroke, "\"#000000\"");
  assert.equal(result.presentations.ReplicateFrom?.sections.graphviz?.style, "dashed");
}

function allowsTypedReferenceValuesInSingleSlots() {
  const result = linkProject({
    snapshot: infrastructureSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

region europe
    name = Europe

environment digitalocean
    name = Digital Ocean
    primaryRegion:
        europe
`),
    ],
  });

  assertNoErrors(result);
  assert.deepEqual(result.elements.find((element) => element.id === "shared/digitalocean")?.attributes.primaryRegion, ["shared/europe"]);
}

function resolvesCoreInfrastructureRunsOnReferences() {
  const snapshot = buildLanguageSnapshotResultFromSources([
    source("framework.ai", `
define type CustomEnvironment of Environment
    Compute compute
    InfrastructureComponent gateway
`),
  ], [coreLanguageSnapshot]);
  const result = linkProject({
    snapshot: snapshot.snapshot,
    sources: [
      source("environment.ai", `
environment prod
    name = Production

deployment production
    compute:
        compute compute
            name = Kubernetes

    gateway:
        infrastructureComponent gateway
            name = Gateway
            runsOn:
                compute
`),
    ],
  });

  assertNoErrors(snapshot);
  assertNoErrors(result);
  const compute = result.elements.find((element) => element.id === "prod/compute");
  const gateway = result.elements.find((element) => element.id === "prod/gateway");
  assert.equal(compute?.type, "Compute");
  assert.equal(gateway?.type, "InfrastructureComponent");
  assert.deepEqual(gateway?.attributes.runsOn, [compute?.id]);
}

function rejectsReferencesToAnonymousInstances() {
  const snapshot = buildLanguageSnapshotResultFromSources([
    source("framework.ai", `
define type CustomEnvironment of Environment
    Compute compute
    InfrastructureComponent gateway
`),
  ], [coreLanguageSnapshot]);
  const result = linkProject({
    snapshot: snapshot.snapshot,
    sources: [
      source("environment.ai", `
environment prod
    name = Production

deployment production
    compute:
        compute _
            name = Kubernetes

    gateway:
        infrastructureComponent gateway
            name = Gateway
            runsOn:
                _
`),
    ],
  });

  assertNoErrors(snapshot);
  const diagnostic = result.diagnostics.find((item) => item.code === "ANONYMOUS_INSTANCE_NOT_REFERENCEABLE");
  assert(diagnostic);
  assert(diagnostic.message.includes("give the target a named id"));
  assert.equal(diagnostic.sourceName, "environment.ai");
}

function allowsTypedReferenceValuesFromExplicitContexts() {
  const result = linkProject({
    snapshot: infrastructureSnapshot(),
    sources: [
      source("regions.ai", `
context regions

region europe
    name = Europe
`),
      source("architecture.ai", `
context shared

environment digitalocean
    name = Digital Ocean
    primaryRegion:
        europe from regions
`),
    ],
  });

  assertNoErrors(result);
  assert.deepEqual(result.elements.find((element) => element.id === "shared/digitalocean")?.attributes.primaryRegion, ["regions/europe"]);
}

function validatesTypedReferenceSlotCardinalityAndType() {
  const tooMany = linkProject({
    snapshot: infrastructureSnapshot(),
    sources: [
      source("too-many.ai", `
context shared

region europe
    name = Europe

region usa
    name = USA

environment digitalocean
    name = Digital Ocean
    primaryRegion:
        europe
        usa
`),
    ],
  });
  const wrongType = linkProject({
    snapshot: infrastructureSnapshot(),
    sources: [
      source("wrong-type.ai", `
context shared

region europe
    name = Europe

environment digitalocean
    name = Digital Ocean
    primaryRegion:
        digitalocean
`),
    ],
  });

  assert(countDiagnostics(tooMany, "TYPE_MISMATCH") >= 1);
  assert(countDiagnostics(wrongType, "TYPE_MISMATCH") >= 1);
}

function mergesObjectExtensionsAcrossFiles() {
  const result = linkProject({
    snapshot: objectSlotSnapshot(),
    sources: [
      source("system.ai", `
context shared

system app
    name = App
`),
      source("service.ai", `
context shared

extend system app
    technology = Java

    service api
        name = API
`),
    ],
  });

  assertNoErrors(result);
  assert.equal(result.elements.find((element) => element.id === "shared/app")?.attributes.technology?.[0], "Java");
  assert.equal(result.elements.find((element) => element.id === "shared/api")?.parent, "shared/app");
}

function reportsInvalidObjectExtensions() {
  const missing = linkProject({
    snapshot: objectSlotSnapshot(),
    sources: [
      source("missing.ai", `
context shared

extend system app
    technology = Java
`),
    ],
  });
  const incompatible = linkProject({
    snapshot: objectSlotSnapshot(),
    sources: [
      source("incompatible.ai", `
context shared

system app
    name = App

extend actor app
    description = Wrong type
`),
    ],
  });

  assert.equal(countDiagnostics(missing, "UNDECLARED_IDENTIFIER"), 1);
  assert.equal(countDiagnostics(incompatible, "TYPE_MISMATCH"), 1);
}

function reportsDuplicateArchitectureAttributes() {
  const result = linkProject({
    snapshot: objectSlotSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

system source
    name = First
    name = Second
`),
    ],
  });

  assert.equal(countDiagnostics(result, "ATTRIBUTE_SHADOWS_PREVIOUS"), 1);
  assert.equal(result.elements.find((element) => element.id === "shared/source")?.attributes.name?.[0], "Second");
}

function acceptsNamedObjectSlotsDeclaredByTypeExtension() {
  const result = linkProject({
    snapshot: objectSlotSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

system source
    name = Source
    lead:
        member bob
            name = Bob
`),
    ],
  });

  assertNoErrors(result);
  assert.equal(result.elements.find((element) => element.id === "shared/bob")?.type, "Member");
  assert.deepEqual(result.elements.find((element) => element.id === "shared/source")?.attributes.lead, ["shared/bob"]);
}

function acceptsAnonymousElementsInSingleObjectSlots() {
  const result = linkProject({
    snapshot: objectSlotSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

system source
    name = Source
    lead:
        member _
            name = Bob
`),
    ],
  });
  const members = result.elements.filter((element) => element.type === "Member");

  assertNoErrors(result);
  assert.equal(members.length, 1);
  assert(members[0]?.id.startsWith("shared/_anonymous_"));
  assert.equal(members[0]?.anonymous, true);
  assert.deepEqual(result.elements.find((element) => element.id === "shared/source")?.attributes.lead, [members[0]?.id]);
}

function createsImplicitAnonymousObjectForSingleConstructorObjectSlots() {
  const result = linkProject({
    snapshot: objectSlotSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

system source
    name = Source
    lead:
        name = Bob
`),
    ],
  });
  const members = result.elements.filter((element) => element.type === "Member");

  assertNoErrors(result);
  assert.equal(members.length, 1);
  assert.equal(members[0]?.constructor, "member");
  assert.equal(members[0]?.anonymous, true);
  assert.deepEqual(members[0]?.attributes.name, ["Bob"]);
  assert.deepEqual(result.elements.find((element) => element.id === "shared/source")?.attributes.lead, [members[0]?.id]);
}

function createsImplicitAnonymousDeploymentObjectsFromEnvironmentSlots() {
  const snapshot = buildLanguageSnapshotResultFromSources([
    source("framework.ai", `
define type IndriveEnvironment of Environment
    ServiceProvider cloud
    Compute compute
    NetworkConnection network

define type OtherEnvironment of Environment
    ServiceProvider csp
    Compute compute

define type ServiceProvider of InfrastructureComponent
    constructor serviceProvider
`),
  ], [coreLanguageSnapshot]);
  const result = linkProject({
    snapshot: snapshot.snapshot,
    sources: [
      source("environment.ai", `
environment ala
    name = ALA

deployment production
    cloud:
        name = AWS Outpost (Freedom, Almaty)

    compute:
        name = EKS (on Outpost)

    network:
        name = Cluster network
`),
    ],
  });

  assertNoErrors(snapshot);
  assertNoErrors(result);
  const environment = result.elements.find((element) => element.id === "ala/ala");
  const deployment = result.elements.find((element) => element.id === "ala/production");
  const cloud = result.elements.find((element) => element.constructor === "serviceProvider");
  const compute = result.elements.find((element) => element.constructor === "compute");
  const network = result.elements.find((element) => element.constructor === "networkConnection");
  assert.equal(environment?.type, "IndriveEnvironment");
  assert.equal(deployment?.type, "Deployment");
  assert.equal(cloud?.anonymous, true);
  assert.equal(compute?.anonymous, true);
  assert.equal(network?.anonymous, true);
  assert.equal(cloud?.parent, "ala/production");
  assert.equal(compute?.parent, "ala/production");
  assert.equal(network?.parent, "ala/production");
  assert.deepEqual(cloud?.attributes.name, ["AWS Outpost (Freedom, Almaty)"]);
  assert.deepEqual(compute?.attributes.name, ["EKS (on Outpost)"]);
  assert.deepEqual(network?.attributes.name, ["Cluster network"]);
  assert.deepEqual(deployment?.attributes._, [cloud?.id, compute?.id, network?.id]);
}

function prefersExactImplicitDeploymentConstructorOverAssignableSubtypes() {
  const snapshot = buildLanguageSnapshotResultFromSources([
    source("framework.ai", `
define type CustomEnvironment of Environment
    InfrastructureComponent cloud

define type Cloud of InfrastructureComponent
    constructor aws

define type Platform of InfrastructureComponent
    constructor gcp
`),
  ], [coreLanguageSnapshot]);
  const result = linkProject({
    snapshot: snapshot.snapshot,
    sources: [
      source("environment.ai", `
environment prod
    name = Production

deployment production
    cloud:
        name = Shared cloud
`),
    ],
  });

  assertNoErrors(snapshot);
  assertNoErrors(result);
  assert.equal(countDiagnostics(result, "ATTRIBUTE_SHADOWS_PREVIOUS"), 0);
  assert.equal(result.elements.filter((element) => element.type === "InfrastructureComponent").length, 1);
  assert.equal(result.elements.filter((element) => element.type === "Cloud").length, 0);
  assert.equal(result.elements.filter((element) => element.type === "Platform").length, 0);
}

function prefersExactNetworkConstructorOverAssignableSubtypes() {
  const snapshot = buildLanguageSnapshotResultFromSources([
    source("framework.ai", `
define type CustomEnvironment of Environment
    NetworkConnection network

define type Vpn of NetworkConnection
    constructor vpn
`),
  ], [coreLanguageSnapshot]);
  const result = linkProject({
    snapshot: snapshot.snapshot,
    sources: [
      source("environment.ai", `
environment prod
    name = Production

deployment production
    network:
        name = Cluster network
`),
    ],
  });

  assertNoErrors(snapshot);
  assertNoErrors(result);
  assert.equal(countDiagnostics(result, "ATTRIBUTE_SHADOWS_PREVIOUS"), 0);
  assert.equal(result.elements.filter((element) => element.type === "NetworkConnection").length, 1);
  assert.equal(result.elements.filter((element) => element.type === "Vpn").length, 0);
}

function materializesCustomImplicitAnonymousAndExplicitObjectConstructors() {
  const result = linkProject({
    snapshot: customObjectConstructorSnapshot(),
    sources: [
      source("architecture.ai", `
context custom

root app
    name = App
    config:
        name = Implicit Config
        primary:
            leaf implicitLeaf
                name = Implicit Leaf

    branch first
        name = First
        branch second
            name = Second
            branch third
                name = Third
                config:
                    config deepNamed
                        name = Deep Named Config
                        primary:
                            leaf _
                                name = Deep Anonymous Leaf

root explicit
    name = Explicit
    config:
        config namedConfig
            name = Named Config
            primary:
                name = Nested Implicit Leaf

root anonymous
    name = Anonymous
    config:
        config _
            name = Anonymous Config
            primary:
                leaf anonymousLeaf
                    name = Anonymous Named Leaf
`),
    ],
  });

  assertNoErrors(result);

  const app = result.elements.find((element) => element.id === "custom/app");
  const first = result.elements.find((element) => element.id === "custom/first");
  const second = result.elements.find((element) => element.id === "custom/second");
  const third = result.elements.find((element) => element.id === "custom/third");
  const namedConfig = result.elements.find((element) => element.id === "custom/namedConfig");
  const deepNamed = result.elements.find((element) => element.id === "custom/deepNamed");
  const appImplicitConfig = result.elements.find((element) => element.type === "Config" && element.parent === "custom/app");
  const anonymousRootConfig = result.elements.find((element) => element.type === "Config" && element.parent === "custom/anonymous");
  const namedConfigImplicitLeaf = result.elements.find((element) => element.type === "Leaf" && element.parent === "custom/namedConfig");
  const deepAnonymousLeaf = result.elements.find((element) => element.type === "Leaf" && element.parent === "custom/deepNamed");

  assert.equal(appImplicitConfig?.anonymous, true);
  assert.deepEqual(app?.attributes.config, [appImplicitConfig?.id]);
  assert.deepEqual(appImplicitConfig?.attributes.primary, ["custom/implicitLeaf"]);
  assert.deepEqual(first?.attributes._, ["custom/second"]);
  assert.deepEqual(second?.attributes._, ["custom/third"]);
  assert.deepEqual(third?.attributes.config, ["custom/deepNamed"]);
  assert.equal(deepNamed?.constructor, "config");
  assert.equal(deepAnonymousLeaf?.anonymous, true);
  assert.deepEqual(deepNamed?.attributes.primary, [deepAnonymousLeaf?.id]);
  assert.deepEqual(deepAnonymousLeaf?.attributes.name, ["Deep Anonymous Leaf"]);
  assert.deepEqual(namedConfig?.attributes.primary, [namedConfigImplicitLeaf?.id]);
  assert.equal(namedConfigImplicitLeaf?.anonymous, true);
  assert.deepEqual(namedConfigImplicitLeaf?.attributes.name, ["Nested Implicit Leaf"]);
  assert.equal(result.elements.find((element) => element.id === "custom/anonymousLeaf")?.type, "Leaf");
  assert.equal(anonymousRootConfig?.anonymous, true);
  assert.deepEqual(result.elements.find((element) => element.id === "custom/anonymous")?.attributes.config, [anonymousRootConfig?.id]);
  assert.deepEqual(anonymousRootConfig?.attributes.primary, ["custom/anonymousLeaf"]);
}

function reportsMissingImplicitObjectConstructor() {
  const result = linkProject({
    snapshot: missingConstructorObjectSlotSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

system source
    name = Source
    profile:
        name = Bob
`),
    ],
  });

  assert.equal(countDiagnostics(result, "CONSTRUCTOR_NOT_DECLARED"), 1);
  assert.equal(result.elements.some((element) => element.type === "Profile"), false);
}

function reportsAmbiguousImplicitObjectConstructor() {
  const result = linkProject({
    snapshot: ambiguousObjectSlotSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

system source
    name = Source
    lead:
        name = Bob
`),
    ],
  });

  assert.equal(countDiagnostics(result, "CONSTRUCTOR_AMBIGUOUS"), 1);
  assert.equal(result.elements.some((element) => element.type === "Member"), false);
}

function rejectsScalarAssignmentForNamedObjectSlots() {
  const result = linkProject({
    snapshot: objectSlotSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

system source
    name = Source
    lead = bob
`),
    ],
  });

  assert.equal(countDiagnostics(result, "TYPE_MISMATCH"), 1);
  assert(result.diagnostics.some((diagnostic) => diagnostic.message.includes("expects a slot")));
}

function reportsArchitectureTypeMismatchWhenConstructorIsUsedUnderWrongParentType() {
  const snapshot = buildLanguageSnapshotResultFromSources([
    source("definitions.ai", `
define type Context
    constructor context

    List of BoundaryElement _

define type BoundaryElement of Element
    # abstract

define type System of BoundaryElement
    constructor system

    List of Container _

define type Container of Element
    constructor container
`),
  ]).snapshot;
  const result = linkProject({
    snapshot,
    sources: [
      source("architecture.ai", `
context shared

container api
`),
    ],
  });

  assert.equal(countDiagnostics(result, "TYPE_MISMATCH"), 1);
  assert.equal(result.elements.find((element) => element.id === "shared/api"), undefined);
}

function reportsArchitectureTypeMismatchWhenEdgeOperandsDoNotMatchOperatorDefinition() {
  const result = linkProject({
    snapshot: typedAttributeSnapshot({ operatorTarget: "System" }),
    sources: [
      source("architecture.ai", `
context shared

system source
    name = Source
    links:
        -> target

container target
`),
    ],
  });

  assert.equal(countDiagnostics(result, "TYPE_MISMATCH"), 1);
  assert.equal(result.edges.length, 0);
}

function acceptsOperatorDefinitionOnBaseElementForDerivedOperands() {
  const result = linkProject({
    snapshot: typedAttributeSnapshot({ operatorTarget: "Element" }),
    sources: [
      source("architecture.ai", `
context shared

system source
    name = Source
    links:
        -> user
        -> api

actor user
    name = User

container api
`),
    ],
  });

  assertNoErrors(result);
  assert.equal(result.edges.length, 2);
}

function rejectsUnsupportedExplicitEdgeOperatorImplementation() {
  const snapshot = buildLanguageSnapshotResultFromSources([
    source("definitions.ai", `
define type Context
    constructor context

    List of Element _

define type System of Element
    constructor system

    required Text name
    List of Wire links

define operator Wire of Edge
    constructor -> Element
        on System

    implementation = "@custom/wire"
`),
  ]).snapshot;
  const result = linkProject({
    snapshot,
    sources: [
      source("architecture.ai", `
context shared

system source
    name = Source
    links:
        -> target

system target
    name = Target
`),
    ],
  });

  assert.equal(countDiagnostics(result, "UNSUPPORTED_OPERATOR_IMPLEMENTATION"), 1);
  assert.equal(result.edges.length, 0);
}

function rejectsOperatorInvocationsOutsideEdgeLists() {
  const result = linkProject({
    snapshot: typedAttributeSnapshot({ operatorTarget: "System" }),
    sources: [
      source("architecture.ai", `
context shared

system source
    name = Source
    -> target

system target
    name = Target
`),
    ],
  });

  assert.equal(countDiagnostics(result, "TYPE_MISMATCH"), 1);
  assert(result.diagnostics.some((diagnostic) => diagnostic.message.includes("Edge list")));
  assert.equal(result.edges.length, 0);
}

function materializesResolvedElementAndEdgeAttributes() {
  const result = linkProject({
    snapshot: typedAttributeSnapshot({ operatorTarget: "System" }),
    sources: [
      source("architecture.ai", `
context shared

system source
    name = Source
    technology = Java
    links:
        -> target
            technology = HTTP

system target
    name = Target
`),
    ],
  });

  assertNoErrors(result);
  const sourceElement = result.elements.find((element) => element.id === "shared/source");
  assert.equal(sourceElement?.type, "System");
  assert.equal(sourceElement?.attributes.name?.[0], "Source");
  assert.equal(sourceElement?.attributes.kind?.[0], "internal");
  assert.equal(sourceElement?.attributes.technology?.[0], "Java");
  assert.equal(result.edges[0]?.type, "Wire");
  assert.equal(result.edges[0]?.attributes.model?.[0], "sync");
  assert.equal(result.edges[0]?.attributes.technology?.[0], "HTTP");
}

function reportsUndeclaredArchitectureAttributes() {
  const result = linkProject({
    snapshot: typedAttributeSnapshot({ operatorTarget: "System" }),
    sources: [
      source("architecture.ai", `
context shared

system source
    name = Source
    color = blue
`),
    ],
  });

  assert.equal(countDiagnostics(result, "ATTRIBUTE_NOT_DECLARED"), 1);
}

function reportsMissingRequiredArchitectureAttributes() {
  const result = linkProject({
    snapshot: typedAttributeSnapshot({ operatorTarget: "System" }),
    sources: [
      source("architecture.ai", `
context shared

system source
`),
    ],
  });

  assert(countDiagnostics(result, "REQUIRED_ATTRIBUTE_MISSING") >= 1);
  const diagnostic = result.diagnostics.find((item) => item.code === "REQUIRED_ATTRIBUTE_MISSING");
  assert.equal(diagnostic?.line, 3);
  assert.equal(diagnostic?.column, 1);
  assert.equal(diagnostic?.endLine, 3);
  assert.equal(diagnostic?.endColumn, 15);
}

function reportsCoreServiceWithoutName() {
  const result = linkWithCore([
    source("architecture.ai", `
context shared

system app
    name = App

    service repository
`),
  ]);

  assert(result.diagnostics.some((diagnostic) =>
    diagnostic.code === "REQUIRED_ATTRIBUTE_MISSING"
    && diagnostic.message.includes("name")
    && diagnostic.message.includes("Service")
  ));
}

function notesThatAttributeAnnotationIsDeprecated() {
  const result = linkWithCore([
    source("architecture.ai", `
context shared

system app
    name = App

    @attribute(width=5)
    service api
        name = API
        links:
            @attribute(style=dotted)
            -> database

    container database
`),
  ]);

  assertNoErrors(result);
  const notes = result.diagnostics.filter((diagnostic) => diagnostic.code === "ATTRIBUTE_ANNOTATION_DEPRECATED");
  assert.equal(notes.length, 2);
  assert(notes.every((diagnostic) => diagnostic.level === "NOTE"));
  assert(notes.every((diagnostic) => diagnostic.message.includes("define presentation")));
}

function validatesEnumAttributeValues() {
  const valid = linkProject({
    snapshot: tierSnapshot(),
    sources: [
      source("valid.ai", `
context shared

system app
    name = App

    service api
        name = API
        tier:
            t1
`),
    ],
  });
  const invalid = linkProject({
    snapshot: tierSnapshot(),
    sources: [
      source("invalid.ai", `
context shared

system app
    name = App

    service api
        name = API
        tier:
            gold
`),
    ],
  });

  assertNoErrors(valid);
  assert(invalid.diagnostics.some((diagnostic) =>
    diagnostic.code === "ENUM_VALUE_NOT_DECLARED"
    && diagnostic.message.includes("gold")
    && diagnostic.message.includes("Tier")
  ));
}

function validatesScalarEnumAttributeValuesAndConstructorDefaults() {
  const valid = linkProject({
    snapshot: coreLanguageSnapshot,
    sources: [source("valid.ai", `
context shared

system app
    name = App
    links:
        -> target

system target
    name = Target
`)],
  });
  const invalid = linkProject({
    snapshot: coreLanguageSnapshot,
    sources: [source("invalid.ai", `
context shared

system app
    name = App
    links:
        -> target
            model = streaming

system target
    name = Target
`)],
  });

  assertNoErrors(valid);
  assert.equal(valid.edges[0]?.attributes.model?.[0], "sync");
  assert(invalid.diagnostics.some((diagnostic) =>
    diagnostic.code === "ENUM_VALUE_NOT_DECLARED"
    && diagnostic.message.includes("streaming")
    && diagnostic.message.includes("WireModel")
  ));
}

function reportsDuplicateNamedSlots() {
  const result = linkProject({
    snapshot: objectSlotSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

system source
    name = Source
    lead:
        member bob
            name = Bob
    lead:
        member alice
            name = Alice
`),
    ],
  });

  assert.equal(countDiagnostics(result, "ATTRIBUTE_SHADOWS_PREVIOUS"), 1);
}

function appliesConcreteProjectionRulesFromReferenceAttributes() {
  const result = linkProject({
    snapshot: concreteProjectionSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

infrastructureComponent cdn
    name = CDN

infrastructureComponent lb
    name = Load Balancer

publicGateway gateway
    name = Gateway
    cdn:
        cdn
    loadBalancer:
        lb
    projection:
        source $from originalLink target cdn
        target cdn connectTo target loadBalancer
            technology = HTTPS
        target loadBalancer connectTo target $this
        target $this connectTo target $to

system api
    name = API
    links:
        -> worker
            technology = HTTP
            call = POST /jobs
            uses:
                gateway

system worker
    name = Worker
`),
    ],
  });

  assertNoErrors(result);
  const originalHop = result.edges.find((edge) => edge.projected === true
    && edge.source === "shared/api"
    && edge.target === "shared/cdn");
  const physicalHop = result.edges.find((edge) => edge.projected === true
    && edge.source === "shared/cdn"
    && edge.target === "shared/lb");
  assert.equal(originalHop?.operator, "->");
  assert.deepEqual(originalHop?.attributes.technology, ["HTTP"]);
  assert.deepEqual(originalHop?.attributes.call, ["POST /jobs"]);
  assert.equal(physicalHop?.operator, "connectTo");
  assert.deepEqual(physicalHop?.attributes.technology, ["HTTPS"]);
}

function rejectsFixedProjectionTerms() {
  const result = linkProject({
    snapshot: concreteProjectionSnapshot(),
    sources: [
      source("latam.ai", `
environment latam
    name = LATAM

infrastructureComponent tgw
    name = LATAM TGW
`),
      source("architecture.ai", `
context shared

infrastructureComponent local_tgw
    name = Local TGW

publicGateway gateway
    name = Gateway
    cdn:
        local_tgw
    loadBalancer:
        local_tgw
    projection:
        source $from originalLink target cdn
        target local_tgw connectTo fixed tgw in latam
            technology = Transit
        fixed tgw in latam connectTo target $to

system api
    name = API
    links:
        -> worker
            uses:
                gateway

system worker
    name = Worker
`),
    ],
  });

  assert(result.diagnostics.some((diagnostic) => diagnostic.code === "SYNTAX_ERROR"));
}

function appliesDeploymentProfileDefaultsToElements() {
  const result = linkDeploymentProfileProject(`
service backend
    name = Backend
    deployment:
        uses globalProfile
`);

  assertNoErrors(result);
  const backend = result.elements.find((element) => element.id === "app/backend");
  assert.deepEqual(backend?.attributes.runsOn?.map((id) => result.elements.find((element) => element.id === id)?.attributes.name?.[0]), ["Kubernetes"]);
  assert.deepEqual(backend?.attributes.uses?.map((id) => result.elements.find((element) => element.id === id)?.attributes.name?.[0]), ["Application database"]);
  assert.deepEqual(backend?.attributes.appliesTo, ["eu/production"]);
}

function reusesDeploymentInfrastructureWithoutOverrides() {
  const result = linkDeploymentProfileProject(`
service frontend
    name = Frontend
    deployment:
        uses globalProfile

service backend
    name = Backend
    deployment:
        uses globalProfile
`);

  assertNoErrors(result);
  const compute = result.elements.find((element) => element.context === "eu" && element.attributes.name?.[0] === "Kubernetes");
  const database = result.elements.find((element) => element.context === "eu" && element.attributes.name?.[0] === "Application database");
  for (const serviceId of ["app/frontend", "app/backend"]) {
    const service = result.elements.find((element) => element.id === serviceId);
    assert.deepEqual(service?.attributes.runsOn, [compute?.id]);
    assert.deepEqual(service?.attributes.uses, [database?.id]);
    assert(result.edges.some((edge) => edge.source === serviceId
      && edge.target === database?.id
      && edge.projected === true));
  }
  assert(!result.elements.some((element) => element.localId.startsWith("_deployment_")));
}

function overridesClonedDeploymentUsesLocally() {
  const result = linkDeploymentProfileProject(`
service backend
    name = Backend
    deployment:
        uses globalProfile
        uses database
            description = mysql://connection_line
`);

  assertNoErrors(result);
  const backend = result.elements.find((element) => element.id === "app/backend");
  const databaseId = backend?.attributes.uses?.find((id) => result.elements.find((element) => element.id === id)?.type === "Storage");
  const database = result.elements.find((element) => element.id === databaseId);
  const originalDatabase = result.elements.find((element) => element.context === "eu" && element.attributes.name?.[0] === "Application database");
  assert.notEqual(database?.id, originalDatabase?.id);
  assert.deepEqual(database?.attributes.name, ["Application database"]);
  assert.deepEqual(database?.attributes.description, ["mysql://connection_line"]);
  assert.deepEqual(originalDatabase?.attributes.description, ["default connection"]);
}

function clonesDeploymentInfrastructureForReferenceOverrides() {
  const snapshot = buildLanguageSnapshotResultFromSources([
    source("deployment-framework.ai", `
define type ReplicatedStorage of Storage
    constructor replicatedStorage
    InfrastructureComponent endpoint

extend type Environment
    ReplicatedStorage database
`),
  ], [coreLanguageSnapshot]);
  const result = linkProject({
    snapshot: snapshot.snapshot,
    sources: [
      source("eu.ai", `
environment eu
    name = EU

deployment production
    database:
        name = Application database
        endpoint:
            infrastructureComponent default_endpoint
                name = Default endpoint
`),
      source("app.ai", `
context app

import eu from environment eu

deploymentProfile globalProfile
    appliesTo:
        production from eu

    uses database

infrastructureComponent private_endpoint
    name = Private endpoint

system application
    name = Application

    service backend
        name = Backend
        deployment:
            uses globalProfile
            uses database
                endpoint:
                    private_endpoint
`),
    ],
  });

  assertNoErrors(snapshot);
  assertNoErrors(result);
  const backend = result.elements.find((element) => element.id === "app/backend");
  const database = result.elements.find((element) => element.id === backend?.attributes.uses?.[0]);
  const originalDatabase = result.elements.find((element) => element.context === "eu" && element.attributes.name?.[0] === "Application database");
  const originalEndpoint = result.elements.find((element) => element.context === "eu" && element.attributes.name?.[0] === "Default endpoint");
  assert.notEqual(database?.id, originalDatabase?.id);
  assert.deepEqual(database?.attributes.endpoint, ["app/private_endpoint"]);
  assert.deepEqual(originalDatabase?.attributes.endpoint, [originalEndpoint?.id]);
  assert(!result.elements.some((element) => element.context === "app" && element.attributes.name?.[0] === "Default endpoint"));
}

function reusesWireDeploymentInfrastructureWithoutOverrides() {
  const result = linkDeploymentProfileProject(`
service frontend
    name = Frontend
    deployment:
        uses globalProfile

    component internalCaller
        name = Internal caller
        links:
            -> internalCallee

    component internalCallee
        name = Internal callee

    links:
        -> backend
            deployment:
                uses internalNetwork

service backend
    name = Backend
    deployment:
        uses globalProfile
`);

  assertNoErrors(result);
  const edge = result.edges.find((candidate) => candidate.source === "app/frontend" && candidate.target === "app/backend" && candidate.projected !== true);
  const network = result.elements.find((element) => element.context === "eu" && element.attributes.name?.[0] === "Cluster network");
  assert.deepEqual(edge?.attributes.uses, [network?.id]);
  assert(!result.elements.some((element) => element.localId.startsWith("_deployment_")));
}

function inheritsDeploymentTargetsForComponentWires() {
  const result = linkDeploymentProfileProject(`
service backend
    name = Backend
    deployment:
        uses globalProfile

    component caller
        name = Caller
        links:
            -> callee
                deployment:
                    uses internalNetwork

    component callee
        name = Callee
`);

  assertNoErrors(result);
  const edge = result.edges.find((candidate) => candidate.source === "app/caller" && candidate.target === "app/callee" && candidate.projected !== true);
  const network = result.elements.find((element) => element.context === "eu" && element.attributes.name?.[0] === "Cluster network");
  assert.deepEqual(edge?.attributes.uses, [network?.id]);
}

function appliesAndOverridesWireDeploymentNetworkUses() {
  const result = linkDeploymentProfileProject(`
service frontend
    name = Frontend
    deployment:
        uses globalProfile
    links:
        -> backend
            deployment:
                uses publicGateway
                    description = Public ingress for this call

service backend
    name = Backend
    deployment:
        uses globalProfile
`);

  assertNoErrors(result);
  const edge = result.edges.find((candidate) => candidate.source === "app/frontend" && candidate.target === "app/backend" && candidate.projected !== true);
  assert.equal(edge?.attributes.uses?.length, 1);
  const gateway = result.elements.find((element) => element.id === edge?.attributes.uses?.[0]);
  const originalGateway = result.elements.find((element) => element.context === "eu" && element.attributes.name?.[0] === "Public gateway");
  assert.notEqual(gateway?.id, originalGateway?.id);
  assert.deepEqual(gateway?.attributes.name, ["Public gateway"]);
  assert.deepEqual(gateway?.attributes.description, ["Public ingress for this call"]);
  assert.deepEqual(originalGateway?.attributes.description, undefined);
  assert(!edge?.attributes.uses?.some((id) => result.elements.find((element) => element.id === id)?.attributes.name?.[0] === "Application database"));
}

function rejectsDeploymentProfilesOnWires() {
  const result = linkDeploymentProfileProject(`
service frontend
    name = Frontend
    deployment:
        uses globalProfile
    links:
        -> backend
            deployment:
                uses globalProfile

service backend
    name = Backend
    deployment:
        uses globalProfile
`);

  assert(result.diagnostics.some((diagnostic) => diagnostic.code === "TYPE_MISMATCH"
    && diagnostic.message.includes("Wire deployment cannot use 'DeploymentProfile'")));
}

function rejectsNonNetworkInfrastructureOnWires() {
  const result = linkDeploymentProfileProject(`
service frontend
    name = Frontend
    deployment:
        uses globalProfile
    links:
        -> backend
            deployment:
                uses database

service backend
    name = Backend
    deployment:
        uses globalProfile
`);

  assert(result.diagnostics.some((diagnostic) => diagnostic.code === "TYPE_MISMATCH"
    && diagnostic.message.includes("Wire deployment can use only 'NetworkConnection'")));
}

function skipsUnavailableWireNetworksPerDeployment() {
  const result = linkDeploymentProfileProject(`
service frontend
    name = Frontend
    deployment:
        uses globalProfile
    links:
        -> backend
            deployment:
                uses missingNetwork

service backend
    name = Backend
    deployment:
        uses globalProfile
`);

  assertNoErrors(result);
  const edge = result.edges.find((candidate) => candidate.source === "app/frontend" && candidate.target === "app/backend" && candidate.projected !== true);
  assert.equal(edge?.attributes.uses, undefined);
}

function requiresDeploymentProfileTargets() {
  const result = linkDeploymentProfileProject("", `
deploymentProfile missingTargets
`);

  assert(result.diagnostics.some((diagnostic) => diagnostic.code === "REQUIRED_ATTRIBUTE_MISSING"
    && diagnostic.message.includes("appliesTo")));
}

function rejectsEnvironmentTargetsInDeploymentProfiles() {
  const result = linkDeploymentProfileProject("", `
deploymentProfile invalidTarget
    appliesTo:
        eu
`);

  assert(result.diagnostics.some((diagnostic) => diagnostic.code === "TYPE_MISMATCH"
    && diagnostic.message.includes("not assignable to expected type 'Deployment'")));
}

function rejectsDeploymentProfilesInsideEnvironments() {
  const result = linkProject({
    snapshot: coreLanguageSnapshot,
    sources: [source("eu.ai", `
environment eu
    name = EU

deployment production

deploymentProfile misplaced
    appliesTo:
        production
`)],
  });

  assert(result.diagnostics.some((diagnostic) => diagnostic.code === "TYPE_MISMATCH"
    && diagnostic.message.includes("'DeploymentProfile' is not assignable to expected type 'DeploymentElement'")));
}

function rejectsOverlappingDeploymentProfiles() {
  const result = linkDeploymentProfileProject(`
service backend
    name = Backend
    deployment:
        uses globalProfile
        uses overlappingProfile
`, `
deploymentProfile overlappingProfile
    appliesTo:
        production from eu

    uses broker
`);

  const overlap = result.diagnostics.find((diagnostic) => diagnostic.code === "DEPLOYMENT_PROFILE_DEPLOYMENT_OVERLAP");
  assert(overlap?.message.includes("overlappingProfile"));
  assert(overlap?.message.includes("globalProfile"));
  assert(overlap?.message.includes("'production from eu'"));
  const backend = result.elements.find((element) => element.id === "app/backend");
  assert(!backend?.attributes.uses?.some((id) => result.elements.find((element) => element.id === id)?.attributes.name?.[0] === "Kafka"));
}

function isolatesDisjointDeploymentProfilesInSameEnvironment() {
  const definitions = buildLanguageSnapshotResultFromSources([
    source("deployment-framework.ai", `
define type TestEnvironment of Environment
    Storage database
    Broker broker
`),
  ], [coreLanguageSnapshot]);
  assertNoErrors(definitions);
  const result = linkProject({
    snapshot: definitions.snapshot,
    sources: [
      source("eu.ai", `
environment eu
    name = EU

deployment production
    database:
        name = Production database

    broker:
        name = Production broker

deployment test
    database:
        name = Test database

    broker:
        name = Test broker
`),
      source("app.ai", `
context app

import eu from environment eu

deploymentProfile productionProfile
    appliesTo:
        production from eu

    uses database

deploymentProfile testProfile
    appliesTo:
        test from eu

    uses broker

system application
    name = Application

    service forward
        name = Forward order
        deployment:
            uses productionProfile
            uses testProfile

    service reverse
        name = Reverse order
        deployment:
            uses testProfile
            uses productionProfile
`),
    ],
  });

  assertNoErrors(result);
  for (const serviceId of ["app/forward", "app/reverse"]) {
    const service = result.elements.find((element) => element.id === serviceId);
    const infrastructureNames = service?.attributes.uses?.map((id) => result.elements.find((element) => element.id === id)?.attributes.name?.[0]);
    assert.deepEqual(new Set(infrastructureNames), new Set(["Production database", "Test broker"]));
  }
}

function rejectsLocalAppliesToOverrideInDeploymentBlocks() {
  const result = linkDeploymentProfileProject(`
service backend
    name = Backend
    deployment:
        uses globalProfile
        appliesTo:
            production from eu
`);

  assert(result.diagnostics.some((diagnostic) =>
    diagnostic.code === "TYPE_MISMATCH"
    && diagnostic.message.includes("Deployment list expects operator")
  ));
}

function doesNotWarnAboutWireDeploymentUntilTheProjectUsesIt() {
  const result = linkWithCore([
    source("app.ai", `
context app

system application
    name = Application

    service frontend
        name = Frontend
        links:
            -> backend

    service backend
        name = Backend
`),
  ]);

  assertNoErrors(result);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code.startsWith("WIRE_")), false);
}

function warnsAboutMissingAndNonPhysicalWireDeploymentsOnceWireDeploymentIsUsed() {
  const result = linkDeploymentProfileProject(`
service frontend
    name = Frontend
    deployment:
        uses globalProfile
    links:
        -> backend
            deployment:
                uses internalNetwork
        -> worker

service backend
    name = Backend
    deployment:
        uses globalProfile

service worker
    name = Worker
    deployment:
        uses globalProfile
`);

  assertNoErrors(result);
  const unprojected = result.diagnostics.find((diagnostic) => diagnostic.code === "WIRE_DEPLOYMENT_NOT_PROJECTED");
  const missing = result.diagnostics.find((diagnostic) => diagnostic.code === "WIRE_MISSING_DEPLOYMENT");
  assert(unprojected?.message.includes("'frontend' to 'backend'"));
  assert(missing?.message.includes("'frontend' to 'worker'"));
  assert.equal(result.diagnostics.some((diagnostic) =>
    diagnostic.code === "WIRE_MISSING_DEPLOYMENT"
    && diagnostic.message.includes("'internalCaller' to 'internalCallee'")
  ), false);
}

function doesNotRequireDeploymentOnAlreadyPhysicalWires() {
  const snapshot = buildLanguageSnapshotResultFromSources([
    source("framework.ai", `
extend type InfrastructureComponent
    List of Wire links
`),
  ], [coreLanguageSnapshot]);
  const result = linkProject({
    snapshot: snapshot.snapshot,
    sources: [
      source("eu.ai", `
environment eu
    name = EU

infrastructureComponent gateway
    name = Gateway
    links:
        -> compute

infrastructureComponent compute
    name = Compute

networkConnection route
    name = Route
    projection:
        source $from originalLink target $to
`),
      source("app.ai", `
context app

import route from environment eu

system source
    name = Source
    links:
        -> target
            deployment:
                uses route

system target
    name = Target
`),
    ],
  });

  assertNoErrors(snapshot);
  assertNoErrors(result);
  assert.equal(result.diagnostics.some((diagnostic) =>
    diagnostic.code === "WIRE_MISSING_DEPLOYMENT"
    && diagnostic.message.includes("'gateway' to 'compute'")
  ), false);
}

function doesNotWarnAboutElementDeploymentUntilTheProjectUsesIt() {
  const result = linkWithCore([
    source("app.ai", `
context app

external actor customer
    name = Customer

system application
    name = Application

    service frontend
        name = Frontend

    service backend
        name = Backend
`),
  ]);

  assertNoErrors(result);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code.startsWith("ELEMENT_")), false);
}

function warnsAboutMissingElementDeploymentsWithinTheActiveLogicalLevel() {
  const result = linkDeploymentProfileProject(`
service frontend
    name = Frontend
    deployment:
        uses globalProfile

    component view
        name = View

service backend
    name = Backend
`, `
external actor customer
    name = Customer
`);

  assertNoErrors(result);
  const frontend = result.elements.find((element) => element.id === "app/frontend");
  const backendWarning = result.diagnostics.find((diagnostic) =>
    diagnostic.code === "ELEMENT_MISSING_DEPLOYMENT"
    && diagnostic.message.includes("'backend'")
  );
  assert.equal(frontend?.deployed, true);
  assert(backendWarning);
  assert.equal(result.diagnostics.some((diagnostic) =>
    diagnostic.code.startsWith("ELEMENT_")
    && (diagnostic.message.includes("'application'")
      || diagnostic.message.includes("'view'")
      || diagnostic.message.includes("'customer'"))
  ), false);
}

function warnsWhenElementDeploymentResolvesToNoPhysicalInfrastructure() {
  const result = linkDeploymentProfileProject(`
service backend
    name = Backend
    deployment:
        uses emptyProfile
`, `
deploymentProfile emptyProfile
    appliesTo:
        production from eu
`);

  assertNoErrors(result);
  const warning = result.diagnostics.find((diagnostic) =>
    diagnostic.code === "ELEMENT_DEPLOYMENT_NOT_PHYSICAL"
    && diagnostic.message.includes("'backend'")
  );
  assert(warning);
}

function appliesProjectionRulesFromElementReferenceAttributes() {
  const result = linkProject({
    snapshot: projectionSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

storage db
    name = Postgres

system api
    name = API
    uses:
        db
`),
    ],
  });

  assertNoErrors(result);
  assert(result.edges.some((edge) => edge.projected === true
    && edge.source === "shared/api"
    && edge.target === "shared/db"));
}

function appliesProjectionRulesFromEdgeReferenceAttributes() {
  const result = linkProject({
    snapshot: projectionSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

broker kafka
    name = Kafka

system api
    name = API
    links:
        ~> worker
            technology = Kafka
            description = Publishes jobs
            uses:
                kafka

system worker
    name = Worker
`),
    ],
  });

  assertNoErrors(result);
  assert(result.edges.some((edge) => edge.projected === true
    && edge.source === "shared/api"
    && edge.target === "shared/kafka"));
  assert(result.edges.some((edge) => edge.projected === true
    && edge.source === "shared/worker"
    && edge.target === "shared/kafka"));
  const producerHop = result.edges.find((edge) => edge.projected === true
    && edge.source === "shared/api"
    && edge.target === "shared/kafka");
  const consumerHop = result.edges.find((edge) => edge.projected === true
    && edge.source === "shared/worker"
    && edge.target === "shared/kafka");
  assert.deepEqual(producerHop?.attributes.technology, ["Kafka"]);
  assert.deepEqual(producerHop?.attributes.description, ["Publishes jobs"]);
  assert.equal(consumerHop?.attributes.technology, undefined);
  assert.equal(consumerHop?.attributes.description, undefined);
}

function appliesProjectionRuleAttributesAndOriginalLink() {
  const result = linkProject({
    snapshot: projectionSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

infrastructureComponent cdn
    name = CDN

infrastructureComponent load_balancer
    name = Load Balancer

publicGateway gateway
    name = Gateway
    cdn:
        cdn
    loadBalancer:
        load_balancer

system api
    name = API
    links:
        -> worker
            technology = HTTP
            call = POST /jobs
            description = Creates a job
            uses:
                gateway

system worker
    name = Worker
`),
    ],
  });

  assertNoErrors(result);
  const originalHop = result.edges.find((edge) => edge.projected === true
    && edge.source === "shared/api"
    && edge.target === "shared/cdn");
  const physicalHop = result.edges.find((edge) => edge.projected === true
    && edge.source === "shared/cdn"
    && edge.target === "shared/load_balancer");
  assert.equal(originalHop?.operator, "->");
  assert.deepEqual(originalHop?.attributes.technology, ["HTTP"]);
  assert.deepEqual(originalHop?.attributes.call, ["POST /jobs"]);
  assert.deepEqual(originalHop?.attributes.description, ["Creates a job"]);
  assert.equal(physicalHop?.operator, "connectTo");
  assert.deepEqual(physicalHop?.attributes.technology, ["HTTPS"]);
  assert.deepEqual(physicalHop?.attributes.description, ["Internal hop"]);
}

function rejectsProjectionRulesThatNeedTargetWhenAttachedToElement() {
  const result = linkProject({
    snapshot: projectionSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

broker kafka
    name = Kafka

system api
    name = API
    uses:
        kafka
`),
    ],
  });

  assert(result.diagnostics.some((diagnostic) =>
    diagnostic.code === "PROJECTION_TARGET_REQUIRED"
    && diagnostic.message.includes("Broker")
    && diagnostic.message.includes("$to")
    && diagnostic.line === 9
    && diagnostic.column === 9
  ));
}

function carriesEdgeAnnotationsToProjectedEdges() {
  const result = linkProject({
    snapshot: projectionSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

broker kafka
    name = Kafka

system api
    name = API
    links:
        @planned
        ~> worker
            uses:
                kafka

system worker
    name = Worker
`),
    ],
  });

  assertNoErrors(result);
  const projected = result.edges.filter((edge) => edge.projected === true
    && (edge.source === "shared/api" || edge.source === "shared/worker")
    && edge.target === "shared/kafka");
  assert.equal(projected.length, 2);
  assert(projected.every((edge) => edge.annotations?.some((annotation) => annotation.name === "planned")));
}

function materializesAnonymousObjectValuesInEdgeReferenceAttributes() {
  const result = linkProject({
    snapshot: projectionSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

system api
    name = API
    links:
        ~> worker
            uses:
                broker _

system worker
    name = Worker
`),
    ],
  });

  const broker = result.elements.find((element) => element.type === "Broker");
  const edge = result.edges.find((candidate) => candidate.source === "shared/api" && candidate.target === "shared/worker");

  assert.equal(countDiagnostics(result, "REQUIRED_ATTRIBUTE_MISSING"), 1);
  assert.equal(broker?.anonymous, true);
  assert.equal(broker?.parent, "shared/api");
  assert.deepEqual(edge?.attributes.uses, [broker?.id]);
}

function skipsProjectionRuleWhenOptionalAttributeIsMissing() {
  const result = linkProject({
    snapshot: optionalProjectionSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

system app
    name = App

    gateway ingress
        name = Ingress
`),
    ],
  });

  assertNoErrors(result);
  assert.equal(result.edges.filter((edge) => edge.projected === true).length, 0);
}

function appliesProjectionRulesThroughReferencedSlotValues() {
  const result = linkProject({
    snapshot: projectionSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

infrastructureComponent lb
    name = Load Balancer

infrastructureComponent cf
    name = Cloudflare

publicGateway envoy
    name = Envoy
    cdn:
        cf
    loadBalancer:
        lb

actor user
    links:
        -> api
            technology = HTTPS
            call = GET /api
            uses:
                envoy

system api
    name = API
`),
    ],
  });

  assertNoErrors(result);
  assert(result.edges.some((edge) => edge.projected === true && edge.source === "shared/user" && edge.target === "shared/cf"));
  assert(result.edges.some((edge) => edge.projected === true && edge.source === "shared/cf" && edge.target === "shared/lb"));
  assert(result.edges.some((edge) => edge.projected === true && edge.source === "shared/lb" && edge.target === "shared/envoy"));
  assert(result.edges.some((edge) => edge.projected === true && edge.source === "shared/envoy" && edge.target === "shared/api"));
  const entryHop = result.edges.find((edge) => edge.projected === true && edge.source === "shared/user" && edge.target === "shared/cf");
  const innerHop = result.edges.find((edge) => edge.projected === true && edge.source === "shared/cf" && edge.target === "shared/lb");
  assert.deepEqual(entryHop?.attributes.technology, ["HTTPS"]);
  assert.deepEqual(entryHop?.attributes.call, ["GET /api"]);
  assert.deepEqual(innerHop?.attributes.technology, ["HTTPS"]);
  assert.deepEqual(innerHop?.attributes.description, ["Internal hop"]);
  assert.equal(innerHop?.attributes.call, undefined);
}

function appliesOwnerIndependentProjectionRulesOncePerProjectionElement() {
  const result = linkProject({
    snapshot: projectionSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

infrastructureComponent prometheus
    name = Prometheus

infrastructureComponent alert_manager
    name = Alert Manager

infrastructureComponent grafana
    name = Grafana

metrics loki
    name = Loki Stack
    collector:
        prometheus
    alert:
        alert_manager
    display:
        grafana

system api
    name = API
    links:
        -> worker
            uses:
                loki

system worker
    name = Worker
    uses:
        loki
`),
    ],
  });

  assertNoErrors(result);
  const projected = result.edges.filter((edge) => edge.projected === true);
  assert.equal(countEdges(projected, "shared/loki", "shared/prometheus"), 1);
  assert.equal(countEdges(projected, "shared/alert_manager", "shared/prometheus"), 1);
  assert.equal(countEdges(projected, "shared/grafana", "shared/prometheus"), 1);
  assert.equal(countEdges(projected, "shared/prometheus", "shared/api"), 1);
  assert.equal(countEdges(projected, "shared/prometheus", "shared/worker"), 1);
}

function mergesAnnotationsIntoDeduplicatedOwnerIndependentProjectedEdges() {
  const result = linkProject({
    snapshot: projectionSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

infrastructureComponent lb
    name = Load Balancer

infrastructureComponent cf
    name = Cloudflare

publicGateway envoy
    name = Envoy
    cdn:
        cf
    loadBalancer:
        lb

system api
    name = API
    links:
        -> worker
            uses:
                envoy

        @planned
        -> planned_worker
            uses:
                envoy

system worker
    name = Worker

system planned_worker
    name = Planned Worker
`),
    ],
  });

  assertNoErrors(result);
  const sharedProjectedEdges = result.edges.filter((edge) => edge.projected === true
    && (edge.source === "shared/cf" || edge.source === "shared/lb")
    && (edge.target === "shared/lb" || edge.target === "shared/envoy"));
  assert.equal(sharedProjectedEdges.length, 2);
  assert(sharedProjectedEdges.every((edge) => edge.annotations?.some((annotation) => annotation.name === "planned")));
}

function buildsIndexedGraphFromLinkedProject() {
  const result = linkProject({
    snapshot: concreteProjectionSnapshot(),
    sources: [
      source("infra.ai", `
context infra

infrastructureComponent cf
    name = Cloudflare

infrastructureComponent lb
    name = Load Balancer

publicGateway envoy
    name = Envoy
    cdn:
        cf
    loadBalancer:
        lb
    projection:
        source $from originalLink target cdn
        target cdn connectTo target loadBalancer
        target loadBalancer connectTo target $this
        target $this connectTo target $to
`),
      source("architecture.ai", `
context shared

import envoy from context infra

actor user
    links:
        -> api
            uses:
                envoy

system api
    name = API
`),
    ],
  });

  assertNoErrors(result);
  const graph = result.graph;
  assert(graph.node("shared"));
  assert(graph.node("architecture.ai"));
  assert(graph.node("shared/user"));
  assert(graph.node("shared/api"));
  assert(graph.node("infra/envoy"));
  assertSetContains(graph.nodesInContext("shared"), ["shared", "shared/user", "shared/api"]);
  assertSetContains(graph.nodesByBaseType("Element"), ["shared/user", "shared/api", "infra/envoy"]);
  assertSetContains(graph.nodesByBaseType("System"), ["shared/api"]);
  assert.equal(graph.nestingLevel("shared"), 0);
  assert.equal(graph.nestingLevel("shared/api"), 1);

  assertSetContains(graph.outgoingRelations("architecture.ai", "CONTRIBUTES"), ["contributes:architecture.ai->shared"]);
  assertSetContains(graph.outgoingRelations("architecture.ai", "IMPORTS"), ["imports:architecture.ai:envoy->infra/envoy"]);
  assert.equal(referencesBetween(graph, "shared/user", "shared/api").length, 1);
  assert.equal(referencesBetween(graph, "shared/user", "infra/cf").filter((relation) => relation.projected === true).length, 1);
  assert.equal(referencesBetween(graph, "infra/lb", "infra/envoy").filter((relation) => relation.projected === true).length, 1);
  assertSetContains(graph.sourceContribution("architecture.ai").referencedNodes, ["infra/envoy", "shared/api", "infra/cf"]);
  assertSetContains(graph.dependentSources("infra/envoy"), ["architecture.ai"]);

  const impact = graph.removeSourceContribution("architecture.ai");
  assertSetContains(impact.removedNodes, ["architecture.ai", "shared/user", "shared/api"]);
  assertSetContains(impact.removedRelations, ["contributes:architecture.ai->shared", "imports:architecture.ai:envoy->infra/envoy"]);
  assert.equal(graph.node("infra/envoy") !== undefined, true);
  assert.equal(graph.sourceContribution("architecture.ai"), undefined);
}

function updatesProjectLinkerStateWithGraphImpact() {
  const state = new ProjectLinkerState({
    snapshot: projectionSnapshot(),
    sources: [
      source("infra.ai", `
context infra

infrastructureComponent cf
    name = Cloudflare

infrastructureComponent lb
    name = Load Balancer

publicGateway envoy
    name = Envoy
    cdn:
        cf
    loadBalancer:
        lb
`),
      source("architecture.ai", `
context shared

import envoy from context infra

actor user
    links:
        -> api
            uses:
                envoy

system api
    name = API
`),
    ],
  });

  assertNoErrors(state.result());
  assertSetContains(state.result().graph.dependentSources("infra/envoy"), ["architecture.ai"]);

  const update = state.replaceSource(source("infra.ai", `
context infra

infrastructureComponent cf
    name = Cloudflare

infrastructureComponent lb
    name = Load Balancer

publicGateway ingress
    name = Envoy
    cdn:
        cf
    loadBalancer:
        lb
`));

  assertSetContains(update.impact.removedNodes, ["infra.ai", "infra/envoy"]);
  assertSetContains(update.impact.dependentSources, ["architecture.ai"]);
  assertSetContains(update.affectedSources, ["infra.ai", "architecture.ai"]);
  assert(update.result.diagnostics.some((diagnostic) =>
    diagnostic.code === "UNKNOWN_IMPORTED_ELEMENT"
    && diagnostic.sourceName === "architecture.ai"
  ));
  assert.equal(update.result.graph.node("infra/envoy"), undefined);
  assert(update.result.graph.node("infra/ingress"));
}

function linkWithCore(sources) {
  return linkProject({
    snapshot: coreLanguageSnapshot,
    sources,
  });
}

function referencesBetween(graph, source, target) {
  return [...graph.relationsConnecting(source, target)]
    .map((relationId) => graph.relation(relationId))
    .filter((relation) => relation?.kind === "REFERENCES");
}

function assertSetContains(actual, expected) {
  const set = new Set(actual);
  for (const value of expected) {
    assert.equal(set.has(value), true, `${value} is missing from ${JSON.stringify([...set])}`);
  }
}

function linkWithoutCore(sources) {
  const snapshot = mergeLanguageSnapshots([
    minimalArchitectureSnapshot(),
    buildLanguageSnapshotResultFromSources([]).snapshot,
  ]);
  return linkProject({ snapshot, sources });
}

function minimalArchitectureSnapshot() {
  return {
    schemaVersion: "minimal",
    types: [
      { name: "Element", attributes: [{ name: "name", type: "Text" }] },
      { name: "Context", baseType: "Element", attributes: [{ name: "_", type: "List", list: true, listElementType: "Element" }] },
      { name: "System", baseType: "Element", attributes: [{ name: "links", type: "List", list: true, listElementType: "Wire" }] },
      { name: "Wire", baseType: "Edge" },
      { name: "Edge" },
      { name: "Text" },
    ],
    constructors: [
      { spelling: "context", ownerType: "Context" },
      { spelling: "system", ownerType: "System" },
    ],
    operators: [
      { spelling: "->", ownerType: "Wire", leftType: "Element", targetType: "Element" },
    ],
    enums: [],
  };
}

function infrastructureSnapshot() {
  return mergeLanguageSnapshots([
    minimalArchitectureSnapshot(),
    {
      schemaVersion: "infrastructure",
      types: [
        { name: "Region", baseType: "Element", attributes: [{ name: "name", type: "Text", required: true }] },
        {
          name: "Environment",
          baseType: "Element",
          attributes: [
            { name: "name", type: "Text", required: true },
            { name: "primaryRegion", type: "Region", required: true },
          ],
        },
      ],
      constructors: [
        { spelling: "region", ownerType: "Region" },
        { spelling: "environment", ownerType: "Environment" },
      ],
      operators: [],
      enums: [],
    },
  ]);
}

function enumSnapshot() {
  return mergeLanguageSnapshots([
    minimalArchitectureSnapshot(),
    {
      schemaVersion: "enum",
      types: [
        { name: "Region" },
        {
          name: "Environment",
          baseType: "Element",
          attributes: [
            { name: "name", type: "Text", required: true },
            { name: "region", type: "List", list: true, listElementType: "Region", required: true },
          ],
        },
      ],
      constructors: [
        { spelling: "environment", ownerType: "Environment" },
      ],
      operators: [],
      enums: [
        { type: "Region", values: ["europe", "usa"] },
      ],
    },
  ]);
}

function objectSlotSnapshot() {
  return mergeLanguageSnapshots([
    minimalArchitectureSnapshot(),
    {
      schemaVersion: "object-slots",
      types: [
        { name: "Actor", baseType: "Element", attributes: [{ name: "description", type: "Text" }] },
        {
          name: "Service",
          baseType: "Element",
          attributes: [
            { name: "technology", type: "Text" },
            { name: "links", type: "List", list: true, listElementType: "Wire" },
          ],
        },
        {
          name: "Member",
          baseType: "Element",
          attributes: [
            { name: "name", type: "Text", required: true },
          ],
        },
        {
          name: "System",
          attributes: [
            { name: "technology", type: "Text" },
            { name: "_", type: "List", list: true, listElementType: "Service" },
            { name: "lead", type: "Member" },
          ],
        },
      ],
      constructors: [
        { spelling: "actor", ownerType: "Actor" },
        { spelling: "service", ownerType: "Service" },
        { spelling: "member", ownerType: "Member" },
      ],
      operators: [],
      enums: [],
    },
  ]);
}

function customObjectConstructorSnapshot() {
  return buildLanguageSnapshotResultFromSources([
    source("custom_object_constructors.ai", `
define type Context
    constructor context

    List of Root _

define type Root of Element
    constructor root

    required Text name
    Config config
    List of Branch _

define type Branch of Element
    constructor branch

    required Text name
    Config config
    List of Branch _

define type Config of Element
    constructor config

    required Text name
    Leaf primary

define type Leaf of Element
    constructor leaf

    required Text name
`),
  ]).snapshot;
}

function missingConstructorObjectSlotSnapshot() {
  return mergeLanguageSnapshots([
    minimalArchitectureSnapshot(),
    {
      schemaVersion: "missing-constructor-object-slot",
      types: [
        {
          name: "Profile",
          baseType: "Element",
          attributes: [
            { name: "name", type: "Text", required: true },
          ],
        },
        {
          name: "System",
          attributes: [
            { name: "profile", type: "Profile" },
          ],
        },
      ],
      constructors: [],
      operators: [],
      enums: [],
    },
  ]);
}

function ambiguousObjectSlotSnapshot() {
  return mergeLanguageSnapshots([
    objectSlotSnapshot(),
    {
      schemaVersion: "ambiguous-object-slot",
      types: [],
      constructors: [
        { spelling: "participant", ownerType: "Member" },
      ],
      operators: [],
      enums: [],
    },
  ]);
}

function typedAttributeSnapshot({ operatorTarget }) {
  return buildLanguageSnapshotResultFromSources([
    source("definitions.ai", `
define type Context
    constructor context

    List of Element _

define type System of Element
    constructor system
        kind = internal

    required Text name
    required Text kind
    Text technology
    List of Wire links

define type Actor of Element
    constructor actor

    required Text name

define type Container of Element
    constructor container

define operator Wire of Edge
    constructor -> ${operatorTarget}
        on System
        model = sync

    required Text model
    Text technology
`),
  ]).snapshot;
}

function tierSnapshot() {
  const definitions = buildLanguageSnapshotResultFromSources([
    source("definitions.ai", `
define type Tier
    required Text name

define enum of Tier
    t1
        name = Tier 1

extend type Service
    Tier tier
`),
  ]);
  assert.deepEqual(definitions.diagnostics, []);
  return mergeLanguageSnapshots([coreLanguageSnapshot, definitions.snapshot]);
}

function concreteProjectionSnapshot() {
  const definitions = buildLanguageSnapshotResultFromSources([
    source("projection-framework.ai", `
define type InfrastructureComponent of Element
    constructor infrastructureComponent

    Text technology
    Text description
    List of PhysicalWire projection

define type ProjectionTerm

define operator PhysicalWire of Edge
    Text technology
    Text description

define type PublicGateway of InfrastructureComponent
    constructor publicGateway

    required InfrastructureComponent cdn
    required InfrastructureComponent loadBalancer

define type Actor of Element
    constructor actor

    List of Wire links

extend type Wire
    Text technology
    Text call
    List of InfrastructureComponent uses

define operator OriginalLink of PhysicalWire
    constructor originalLink ProjectionTerm
        on ProjectionTerm

define operator ConnectTo of PhysicalWire
    constructor connectTo Element
        on Element

    constructor connectTo ProjectionTerm
        on ProjectionTerm
`),
  ], [
    mergeLanguageSnapshots([
      minimalArchitectureSnapshot(),
      {
        schemaVersion: "environment",
        types: [
          { name: "Environment", baseType: "Element", attributes: [{ name: "_", type: "List", list: true, listElementType: "Element" }] },
        ],
        constructors: [
          { spelling: "environment", ownerType: "Environment" },
        ],
        operators: [],
        enums: [],
      },
    ]),
  ]);
  assert.deepEqual(definitions.diagnostics, []);
  return definitions.snapshot;
}

function projectionSnapshot() {
  return mergeLanguageSnapshots([
    minimalArchitectureSnapshot(),
    {
      schemaVersion: "projection",
      types: [
        { name: "InfrastructureComponent", baseType: "Element", attributes: [{ name: "name", type: "Text", required: true }] },
        { name: "Actor", baseType: "Element", attributes: [{ name: "links", type: "List", list: true, listElementType: "Wire" }] },
        {
          name: "Storage",
          baseType: "InfrastructureComponent",
          projectionRules: [
            { source: { placement: "source", kind: "from", value: "$from" }, operator: "originalLink", target: { placement: "target", kind: "this", value: "$this" } },
          ],
        },
        {
          name: "Broker",
          baseType: "InfrastructureComponent",
          projectionRules: [
            { source: { placement: "source", kind: "from", value: "$from" }, operator: "originalLink", target: { placement: "source", kind: "this", value: "$this" } },
            { source: { placement: "target", kind: "to", value: "$to" }, operator: "connectTo", target: { placement: "target", kind: "this", value: "$this" } },
          ],
        },
        { name: "Infrastructure", baseType: "InfrastructureComponent" },
        {
          name: "PublicGateway",
          baseType: "InfrastructureComponent",
          attributes: [
            { name: "cdn", type: "InfrastructureComponent", required: true },
            { name: "loadBalancer", type: "InfrastructureComponent", required: true },
          ],
          projectionRules: [
            { source: { placement: "source", kind: "from", value: "$from" }, operator: "originalLink", target: { placement: "target", kind: "attribute", value: "cdn" } },
            {
              source: { placement: "target", kind: "attribute", value: "cdn" },
              operator: "connectTo",
              target: { placement: "target", kind: "attribute", value: "loadBalancer" },
              attributes: { technology: ["HTTPS"], description: ["Internal hop"] },
            },
            { source: { placement: "target", kind: "attribute", value: "loadBalancer" }, operator: "connectTo", target: { placement: "target", kind: "this", value: "$this" } },
            { source: { placement: "target", kind: "this", value: "$this" }, operator: "connectTo", target: { placement: "target", kind: "to", value: "$to" } },
          ],
        },
        {
          name: "Monitoring",
          baseType: "InfrastructureComponent",
          attributes: [
            { name: "display", type: "InfrastructureComponent" },
            { name: "collector", type: "InfrastructureComponent" },
            { name: "alert", type: "InfrastructureComponent" },
          ],
          projectionRules: [
            { source: { placement: "target", kind: "attribute", value: "collector" }, operator: "connectTo", target: { placement: "source", kind: "from", value: "$from" } },
            { source: { placement: "target", kind: "this", value: "$this" }, operator: "connectTo", target: { placement: "target", kind: "attribute", value: "collector" } },
            { source: { placement: "target", kind: "attribute", value: "alert" }, operator: "connectTo", target: { placement: "target", kind: "attribute", value: "collector" } },
            { source: { placement: "target", kind: "attribute", value: "display" }, operator: "connectTo", target: { placement: "target", kind: "attribute", value: "collector" } },
          ],
        },
      ],
      constructors: [
        { spelling: "actor", ownerType: "Actor" },
        { spelling: "infrastructureComponent", ownerType: "Infrastructure" },
        { spelling: "storage", ownerType: "Storage" },
        { spelling: "broker", ownerType: "Broker" },
        { spelling: "publicGateway", ownerType: "PublicGateway" },
        { spelling: "metrics", ownerType: "Monitoring" },
      ],
      operators: [],
      enums: [],
    },
    {
      schemaVersion: "extensions",
      types: [
        {
          name: "System",
          attributes: [
            { name: "uses", type: "List", list: true, listElementType: "InfrastructureComponent" },
          ],
        },
        {
          name: "Wire",
          attributes: [
            { name: "uses", type: "List", list: true, listElementType: "InfrastructureComponent" },
            { name: "technology", type: "Text" },
            { name: "call", type: "Text" },
            { name: "description", type: "Text" },
          ],
        },
      ],
      constructors: [],
      operators: [
        { spelling: "~>", ownerType: "Wire", leftType: "Element", targetType: "Element" },
        { spelling: "connectTo", ownerType: "Wire", leftType: "Element", targetType: "Element" },
      ],
      enums: [],
    },
  ]);
}

function optionalProjectionSnapshot() {
  return mergeLanguageSnapshots([
    coreLanguageSnapshot,
    {
      schemaVersion: "optional-projection",
      types: [
        { name: "Storage", baseType: "Element", attributes: [{ name: "name", type: "Text", required: true }] },
        {
          name: "Gateway",
          baseType: "Container",
          attributes: [
            { name: "name", type: "Text", required: true },
            { name: "backend", type: "Storage" },
          ],
          projectionRules: [
            { source: { placement: "source", kind: "from", value: "$from" }, operator: "originalLink", target: { placement: "target", kind: "attribute", value: "backend" } },
          ],
        },
      ],
      constructors: [
        { spelling: "storage", ownerType: "Storage" },
        { spelling: "gateway", ownerType: "Gateway" },
      ],
      operators: [],
      enums: [],
    },
  ]);
}

function linkDeploymentProfileProject(appBody, rootBody = "") {
  const definitions = buildLanguageSnapshotResultFromSources([
    source("deployment-framework.ai", `
define type TestEnvironment of Environment
    Compute compute
    Storage database
    Broker broker
    NetworkConnection internalNetwork
    NetworkConnection publicGateway
    NetworkConnection missingNetwork
`),
  ], [coreLanguageSnapshot]);
  assert.deepEqual(definitions.diagnostics, []);
  return linkProject({
    snapshot: definitions.snapshot,
    sources: deploymentProfileSources(appBody, rootBody),
  });
}

function deploymentProfileSources(appBody, rootBody = "") {
  return [
    source("eu.ai", `
environment eu
    name = EU

deployment production
    compute:
        name = Kubernetes

    database:
        name = Application database
        description = default connection
        projection:
            source $from originalLink target $this

    broker:
        name = Kafka

    internalNetwork:
        name = Cluster network

    publicGateway:
        networkConnection sharedGateway
            name = Public gateway
`),
    source("app.ai", `
context app

import eu from environment eu

deploymentProfile globalProfile
    appliesTo:
        production from eu

    runsOn compute
    uses database

${rootBody.trim()}

system application
    name = Application
${indentBlock(appBody.trimStart(), 4)}
`),
  ];
}

function indentBlock(text, spaces) {
  const indent = " ".repeat(spaces);
  return text.split(/\r?\n/).map((line) => line.length === 0 ? line : `${indent}${line}`).join("\n");
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}

function countDiagnostics(result, code) {
  return result.diagnostics.filter((diagnostic) => diagnostic.code === code).length;
}

function countEdges(edges, sourceId, targetId) {
  return edges.filter((edge) => edge.source === sourceId && edge.target === targetId).length;
}

function countEdgesWithOperator(edges, sourceId, operator, targetId) {
  return edges.filter((edge) => edge.source === sourceId && edge.operator === operator && edge.target === targetId).length;
}

function tokenAt(sourceText, oneBasedLine, oneBasedColumn) {
  const line = sourceText.trimStart().split(/\r?\n/)[oneBasedLine - 1] ?? "";
  const suffix = line.slice(Math.max(0, oneBasedColumn - 1));
  const identifier = /^[A-Za-z_][A-Za-z0-9_]*/.exec(suffix);
  if (identifier !== null) {
    return identifier[0];
  }
  const operator = /^[~+\-*\/!?<>=|&:]+/.exec(suffix);
  return operator?.[0] ?? "";
}

function assertNoErrors(result) {
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR");
  assert.deepEqual(errors, []);
}
