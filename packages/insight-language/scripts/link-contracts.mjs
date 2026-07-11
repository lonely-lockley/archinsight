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
  doesNotReportElementsConnectedOnlyByProjectedEdgesAsIsolated,
  doesNotReportElementsConnectedOnlyByResolvedAttributesAsIsolated,
  doesNotReportParentElementWithNestedElementsAsIsolated,
  warnsWhenHigherLevelEdgeShadowsNextLevelEdgeOfSameType,
  warnsWhenLowerLevelEdgeKeepsSameExternalEndpoint,
  doesNotWarnWhenProjectedEdgesShadowLowerLevelEdges,
  buildsPresentationIndexOutsideTheGraphAndResolvesTypeInheritance,
  validatesPresentationFieldsSectionsAndTargetAttributes,
  linksBaseFrameworkPresentations,
  linksCoreWirePresentationFields,
  allowsTypedReferenceValuesInSingleSlots,
  allowsTypedReferenceValuesFromExplicitContexts,
  validatesTypedReferenceSlotCardinalityAndType,
  mergesObjectExtensionsAcrossFiles,
  reportsInvalidObjectExtensions,
  reportsDuplicateArchitectureAttributes,
  acceptsNamedObjectSlotsDeclaredByTypeExtension,
  acceptsAnonymousElementsInSingleObjectSlots,
  createsImplicitAnonymousObjectForSingleConstructorObjectSlots,
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
  reportsDuplicateNamedSlots,
  appliesProjectionRulesFromElementReferenceAttributes,
  appliesProjectionRulesFromEdgeReferenceAttributes,
  appliesProjectionRuleAttributesAndOriginalLink,
  rejectsProjectionRulesThatNeedTargetWhenAttachedToElement,
  carriesEdgeAnnotationsToProjectedEdges,
  materializesAnonymousObjectValuesInEdgeReferenceAttributes,
  skipsProjectionRuleWhenOptionalAttributeIsMissing,
  appliesProjectionRulesThroughReferencedSlotValues,
  appliesOwnerIndependentProjectionRulesOncePerProjectionElement,
  mergesAnnotationsIntoDeduplicatedOwnerIndependentProjectedEdges,
  doesNotSelfProjectSlotDomainElements,
  appliesTypeSlotReferenceProjectionRules,
  projectsPrivateGatewayIntoTargetEnvironmentAcrossSystemContexts,
  projectsBidirectionalAsyncBrokersAcrossSystemContextsAndEnvironments,
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

function doesNotReportElementsConnectedOnlyByProjectedEdgesAsIsolated() {
  const result = linkProject({
    snapshot: mergeLanguageSnapshots([
      coreLanguageSnapshot,
      buildLanguageSnapshotResultFromSources([
        source("deployment-framework.ai", `
extend type Environment
    Storage storage
`),
      ]).snapshot,
    ]),
    sources: [
      source("architecture.ai", `
context shared

environment prod
    name = Production

    storage:
        storage db
            name = Database

system api
    name = API
    deployment:
        environments:
            prod

        uses storage
`),
    ],
  });

  assertNoErrors(result);
  assert(result.edges.some((edge) => edge.projected === true && edge.target === "shared/db"));
  assert(!result.diagnostics.some((diagnostic) =>
    diagnostic.level === "NOTE"
    && diagnostic.code === "ISOLATED_ELEMENT"
    && diagnostic.message.includes("db")
  ));
}

function doesNotReportElementsConnectedOnlyByResolvedAttributesAsIsolated() {
  const result = linkProject({
    snapshot: coreLanguageSnapshot,
    sources: [
      source("architecture.ai", `
context shared

environment prod
    name = Production

deploymentProfile global
    environments:
        prod

system api
    name = API
    deployment:
        usesProfile global
`),
    ],
  });

  assertNoErrors(result);
  assert(!result.diagnostics.some((diagnostic) =>
    diagnostic.level === "NOTE"
    && diagnostic.code === "ISOLATED_ELEMENT"
    && diagnostic.message.includes("global")
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
  assert.equal(Object.keys(result.presentations).length, 2);
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

function doesNotSelfProjectSlotDomainElements() {
  const sources = [
    source("deployment-framework.ai", `
extend type Environment
    InfrastructureComponent compute
    InfrastructureComponent storage
`),
    source("infra.ai", `
context infra

environment eu
    name = Europe

    compute:
        compute kube
            name = Kubernetes

    storage:
        storage db
            name = Database
            runsOn compute
`),
  ];
  const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
  const result = linkProject({ snapshot: snapshot.snapshot, sources });

  assertNoErrors(snapshot);
  assertNoErrors(result);
  assert(result.elements.some((element) => element.id === "infra/eu"), "Expected standalone slot domain element to remain visible");
  assert.deepEqual(result.elements.find((element) => element.id === "infra/db")?.attributes.runsOn, ["infra/kube"]);
  assert.equal(result.edges.filter((edge) => edge.projected === true).length, 0);
}

function appliesTypeSlotReferenceProjectionRules() {
  const sources = [
    source("deployment-framework.ai", `
define type PublicGateway of InfrastructureComponent
    constructor publicGateway
    required InfrastructureComponent cdn
    required InfrastructureComponent loadBalancer
    project:
        source $from originalLink target cdn
        target cdn connectTo target loadBalancer
        target loadBalancer connectTo target $this
        target $this connectTo target $to

extend type Environment
    InfrastructureComponent compute
    InfrastructureComponent broker
    InfrastructureComponent publicGateway

extend type System
    DeploymentProfile deployment
`),
    source("infra.ai", `
context infra

environment eu
    name = Europe
    compute:
        compute kube
            name = Kubernetes
    broker:
        broker kafka
            name = Kafka
    publicGateway:
        publicGateway envoy
            name = Envoy
            cdn:
                infrastructureComponent cdn
                    name = CDN
            loadBalancer:
                infrastructureComponent lb
                    name = Load Balancer

environment us
    name = US
    compute:
        compute ecs
            name = ECS
    broker:
        broker sns
            name = SNS
    publicGateway:
        publicGateway alb
            name = ALB
            cdn:
                infrastructureComponent cdn_us
                    name = CDN US
            loadBalancer:
                infrastructureComponent lb_us
                    name = Load Balancer US
`),
    source("app.ai", `
context app

import eu from context infra
import us from context infra

system api
    name = API
    deployment:
        environments:
            eu
            us

        runsOn compute
    links:
        -> worker
            technology = HTTP
            call = POST /jobs
            deployment:
                environments:
                    eu
                    us

                uses broker
                uses publicGateway

system worker
    name = Worker
    deployment:
        environments:
            eu
            us

        runsOn compute
`),
  ];
  const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
  const result = linkProject({ snapshot: snapshot.snapshot, sources });

  assertNoErrors(snapshot);
  assertNoErrors(result);

  assert(!result.elements.some((element) => element.type === "RunsOn"));
  assert(!result.elements.some((element) => element.type === "Uses"));
  assert(!result.graph.nodes().some((node) => node.kind === "element" && (node.type === "RunsOn" || node.type === "Uses")));
  assert.deepEqual(result.elements.find((element) => element.id === "app/api")?.attributes.runsOn, ["infra/kube", "infra/ecs"]);
  assert(result.elements.find((element) => element.id === "app/api")?.referenceAttributes?.includes("runsOn"));
  const projected = result.edges.filter((edge) => edge.projected === true);
  assert.equal(countEdges(projected, "app/api", "infra/cdn"), 1);
  assert.equal(countEdges(projected, "infra/cdn", "infra/lb"), 1);
  assert.equal(countEdges(projected, "infra/lb", "infra/envoy"), 1);
  assert.equal(countEdges(projected, "infra/envoy", "app/worker"), 1);
  assert.equal(countEdges(projected, "app/api", "infra/cdn_us"), 1);
  assert.equal(countEdges(projected, "infra/cdn_us", "infra/lb_us"), 1);
  assert.equal(countEdges(projected, "infra/lb_us", "infra/alb"), 1);
  assert.equal(countEdges(projected, "infra/alb", "app/worker"), 1);
  assert.equal(countEdges(projected, "app/api", "infra/kafka"), 1);
  assert.equal(countEdges(projected, "app/worker", "infra/kafka"), 1);
  assert.equal(countEdges(projected, "app/api", "infra/sns"), 1);
  assert.equal(countEdges(projected, "app/worker", "infra/sns"), 1);
  const euEntryHop = projected.find((edge) => edge.source === "app/api" && edge.target === "infra/cdn");
  const euInnerHop = projected.find((edge) => edge.source === "infra/cdn" && edge.target === "infra/lb");
  const euBrokerProducerHop = projected.find((edge) => edge.source === "app/api" && edge.target === "infra/kafka");
  const euBrokerConsumerHop = projected.find((edge) => edge.source === "app/worker" && edge.target === "infra/kafka");
  assert.deepEqual(euEntryHop?.attributes.technology, ["HTTP"]);
  assert.deepEqual(euEntryHop?.attributes.call, ["POST /jobs"]);
  assert.equal(euInnerHop?.attributes.technology, undefined);
  assert.equal(euInnerHop?.attributes.call, undefined);
  assert.deepEqual(euBrokerProducerHop?.attributes.technology, ["HTTP"]);
  assert.deepEqual(euBrokerProducerHop?.attributes.call, ["POST /jobs"]);
  assert.equal(euBrokerConsumerHop?.attributes.technology, undefined);
  assert.equal(euBrokerConsumerHop?.attributes.call, undefined);
  assert.equal(projected.filter((edge) => edge.source.startsWith("app/_anonymous_") || edge.target.startsWith("app/_anonymous_")).length, 0);
  assert.equal(projected.filter((edge) => edge.source === "infra/eu" || edge.target === "infra/eu").length, 0);
  assert.equal(projected.filter((edge) => edge.source === "infra/us" || edge.target === "infra/us").length, 0);
}

function projectsPrivateGatewayIntoTargetEnvironmentAcrossSystemContexts() {
  const sources = [
    source("deployment-framework.ai", `
define type PrivateGateway of InfrastructureComponent
    constructor privateGateway

    project:
        source $from originalLink target $this
        target $this connectTo target $to

extend type Environment
    Compute compute
    PrivateGateway privateGateway
`),
    source("infra.ai", `
context infra

environment env_a
    name = Environment A

    compute:
        compute compute_a
            name = Compute A

    privateGateway:
        privateGateway gateway_a
            name = Private Gateway A
            runsOn compute

environment env_b
    name = Environment B

    compute:
        compute compute_b
            name = Compute B

    privateGateway:
        privateGateway gateway_b
            name = Private Gateway B
            runsOn compute
`),
    source("a.ai", `
context system_a

import env_a from context infra
import env_b from context infra
import b from context system_b

system a
    name = System A
    deployment:
        environments:
            env_a

        runsOn compute
    links:
        -> b
            technology = HTTPS
            call = GET /private
            deployment:
                environments:
                    env_a
                    env_b

                uses privateGateway
`),
    source("b.ai", `
context system_b

import env_b from context infra

system b
    name = System B
    deployment:
        environments:
            env_b

        runsOn compute
`),
  ];
  const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
  const result = linkProject({ snapshot: snapshot.snapshot, sources });

  assertNoErrors(snapshot);
  assertNoErrors(result);

  assert.deepEqual(result.elements.find((element) => element.id === "system_a/a")?.attributes.runsOn, ["infra/compute_a"]);
  assert.deepEqual(result.elements.find((element) => element.id === "system_b/b")?.attributes.runsOn, ["infra/compute_b"]);
  const projected = result.edges.filter((edge) => edge.projected === true);
  assert.equal(countEdges(projected, "system_a/a", "infra/gateway_b"), 1);
  assert.equal(countEdges(projected, "infra/gateway_b", "system_b/b"), 1);
  assert.equal(countEdges(projected, "system_a/a", "infra/gateway_a"), 0);
  assert.equal(countEdges(projected, "infra/gateway_a", "system_b/b"), 0);
  const entry = projected.find((edge) => edge.source === "system_a/a" && edge.target === "infra/gateway_b");
  const ingress = projected.find((edge) => edge.source === "infra/gateway_b" && edge.target === "system_b/b");
  assert.equal(entry?.sourceIdentity, "b.ai");
  assert.equal(ingress?.sourceIdentity, "b.ai");
  assert.equal(entry?.projectionScope, "infra/compute_b");
  assert.equal(ingress?.projectionScope, "infra/compute_b");
  assert.deepEqual(entry?.attributes.technology, ["HTTPS"]);
  assert.deepEqual(entry?.attributes.call, ["GET /private"]);
}

function projectsBidirectionalAsyncBrokersAcrossSystemContextsAndEnvironments() {
  const sources = [
    source("deployment-framework.ai", `
define type ReplicatedBroker of InfrastructureComponent
    constructor replicatedBroker

    project:
        source $from originalLink source $this
        target $to connectTo target $this
        target $this replicateFrom source $this

extend type Environment
    Compute compute
    ReplicatedBroker broker
`),
    source("infra.ai", `
context infra

environment env_c
    name = Environment C

    compute:
        compute compute_c
            name = Compute C

    broker:
        replicatedBroker kafka_c
            name = Kafka C
            runsOn compute

environment env_d
    name = Environment D

    compute:
        compute compute_d
            name = Compute D

    broker:
        replicatedBroker kafka_d
            name = Kafka D
            runsOn compute
`),
    source("c.ai", `
context system_c

import env_c from context infra
import env_d from context infra
import d from context system_d

system c
    name = System C
    deployment:
        environments:
            env_c

        runsOn compute
    links:
        ~> d
            technology = Kafka
            via = c.events
            deployment:
                environments:
                    env_c
                    env_d

                uses broker
`),
    source("d.ai", `
context system_d

import env_d from context infra
import env_c from context infra
import c from context system_c

system d
    name = System D
    deployment:
        environments:
            env_d

        runsOn compute
    links:
        ~> c
            technology = Kafka
            via = d.events
            deployment:
                environments:
                    env_d
                    env_c

                uses broker
`),
  ];
  const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
  const result = linkProject({ snapshot: snapshot.snapshot, sources });

  assertNoErrors(snapshot);
  assertNoErrors(result);

  const projected = result.edges.filter((edge) => edge.projected === true);
  assert.equal(countEdgesWithOperator(projected, "system_c/c", "~>", "infra/kafka_c"), 1);
  assert.equal(countEdgesWithOperator(projected, "system_d/d", "connectTo", "infra/kafka_d"), 1);
  assert.equal(countEdgesWithOperator(projected, "infra/kafka_d", "replicateFrom", "infra/kafka_c"), 1);
  assert.equal(countEdgesWithOperator(projected, "system_d/d", "~>", "infra/kafka_d"), 1);
  assert.equal(countEdgesWithOperator(projected, "system_c/c", "connectTo", "infra/kafka_c"), 1);
  assert.equal(countEdgesWithOperator(projected, "infra/kafka_c", "replicateFrom", "infra/kafka_d"), 1);
  assert.equal(countEdgesWithOperator(projected, "system_c/c", "~>", "infra/kafka_d"), 0);
  assert.equal(countEdgesWithOperator(projected, "system_d/d", "~>", "infra/kafka_c"), 0);

  const cProducer = projected.find((edge) => edge.source === "system_c/c" && edge.target === "infra/kafka_c");
  const dConsumer = projected.find((edge) => edge.source === "system_d/d" && edge.target === "infra/kafka_d" && edge.sourceIdentity === "d.ai");
  const dReplication = projected.find((edge) => edge.source === "infra/kafka_d" && edge.target === "infra/kafka_c");
  const dProducer = projected.find((edge) => edge.source === "system_d/d" && edge.target === "infra/kafka_d" && edge.operator === "~>");
  const cConsumer = projected.find((edge) => edge.source === "system_c/c" && edge.target === "infra/kafka_c" && edge.sourceIdentity === "c.ai" && edge.operator === "connectTo");
  const cReplication = projected.find((edge) => edge.source === "infra/kafka_c" && edge.target === "infra/kafka_d");

  assert.equal(cProducer?.operator, "~>");
  assert.equal(cProducer?.sourceIdentity, "c.ai");
  assert.equal(cProducer?.projectionScope, "infra/compute_c");
  assert.deepEqual(cProducer?.attributes.via, ["c.events"]);
  assert.equal(dConsumer?.operator, "connectTo");
  assert.equal(dConsumer?.projectionScope, "infra/compute_d");
  assert.equal(dReplication?.operator, "replicateFrom");
  assert.equal(dReplication?.sourceIdentity, "d.ai");
  assert.equal(dReplication?.projectionScope, "infra/compute_d");

  assert.equal(dProducer?.sourceIdentity, "d.ai");
  assert.equal(dProducer?.projectionScope, "infra/compute_d");
  assert.deepEqual(dProducer?.attributes.via, ["d.events"]);
  assert.equal(cConsumer?.projectionScope, "infra/compute_c");
  assert.equal(cReplication?.operator, "replicateFrom");
  assert.equal(cReplication?.sourceIdentity, "c.ai");
  assert.equal(cReplication?.projectionScope, "infra/compute_c");
}

function buildsIndexedGraphFromLinkedProject() {
  const result = linkProject({
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
      { name: "text" },
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
