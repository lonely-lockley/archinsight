import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  mergeLanguageSnapshots,
  selectGraph,
  selectGraphs,
} from "../build/runtime/index.js";

const builtinC4Query = readFileSync(
  new URL("../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/c4.aiq", import.meta.url),
  "utf8",
);

const cases = [
  selectsElementsWithCypherLabelsAndProperties,
  labelsAreCaseSensitive,
  selectsReferencesReturnedByCypher,
  keepsParallelReferencesBetweenSameElements,
  projectedRelationshipsRequireProjectedSelector,
  c4StyleQueryReturnsRealAndProjectedEdges,
  c4QueryReturnsDirectDeploymentEdgesOnlyFromDeploymentElements,
  c4QueryReturnsTargetOwnedIncomingGatewayPath,
  rollsChildReferencesUpToOwningElementForQuery,
  rollsProjectedReferencesUpToOwningElementForQuery,
  rollsNestedReferencesUpToOwningSystems,
  rollsNestedReferencesUpToOwningContexts,
  doesNotRollInternalNestedReferencesIntoOwningSystemSelfEdges,
  relationshipsWithoutDerivedSelectorUseDefaultNonDerivedEdges,
  optionalMatchKeepsPreviouslySelectedNodeWhenRelationshipIsMissing,
  optionalMatchWhereFiltersOptionalPatternOnly,
  rollupMatchSelectsNearestAcceptedEndpoints,
  rollupMatchUsesProjectedOriginsForInternalProjectionFragments,
  filtersWithWhereAndBuiltinVariables,
  missingScopeValuesDoNotMatchMissingOrDefinedProperties,
  filtersWithWhereOr,
  supportsWhereParenthesesAndNot,
  supportsRelationshipPropertyPredicates,
  supportsRelationshipContextPredicates,
  supportsIsPredicates,
  supportsInPredicates,
  supportsCypherNotEqualsOperator,
  filtersRelationshipsWithWhere,
  supportsTabPerScope,
  groupsSelectedElementsByImmediateParentElement,
  doesNotGroupSelectedElementsWithoutGroupBy,
  groupsSelectedElementsBySelectedContextForWideDefaultQuery,
  doesNotAddContextClusterWhenContextIsNotSelected,
  groupsSelectedElementsByScalarAttribute,
  groupsSelectedElementsByTypedReferenceAttribute,
  groupsSelectedElementsByImportedTypedReferenceAttribute,
  groupsSelectedElementsByTypedReferenceAttributeFromExtension,
  typedReferenceImplementationsMaterializeRunsOnGroups,
  groupsSelectedElementsByListValuedReferenceAttribute,
  groupsSelectedElementsBySingleEntryListValuedTypedReferenceAttribute,
  groupsSelectedElementsByMultiEntryListValuedTypedReferenceAttribute,
  sourceIdentitySelectsElementsDeclaredInCurrentTab,
  tabSourceIdentityIncludesTopLevelSubtreesAndExtensionTargets,
  tabSourceIdentityFiltersRelationshipsByOriginSubtree,
  contextContainsSelectsElementsDeclaredInsideCurrentContext,
  untypedRelationshipsMatchAllGraphRelationsAndRespectDirection,
  writesGraphOnceForMultipleContextSelections,
  selectsEachContextScopeIndependently,
  filtersBaseNodeAndKeepsIncomingExternalRelationshipsWithDistinctAliases,
  c1QueryMarksNeighborContextSystemsAsExternal,
  c1QueryKeepsDeploymentElementsOutOfSystemLandscape,
  rejectsWriteCypher,
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
  console.log("query contract fixtures passed");
}

function selectsElementsWithCypherLabelsAndProperties() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App

    service api
        name = API

    container db
        name = DB
`));

  const graph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:Service {id: 'api', context: $context}) RETURN n",
  );

  assertNoErrors(result);
  assert(graph.elements["shared/api"]);
  assert.equal(graph.elements["shared/app"], undefined);
  assert.equal(graph.elements["shared/db"], undefined);
  assert.equal(graph.edges.length, 0);
}

function labelsAreCaseSensitive() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App

    service api
        name = API
`));

  const exact = selectGraph(result, { context: "shared" }, "MATCH (n:Service) WHERE n.context = $context RETURN n");
  const lowercase = selectGraph(result, { context: "shared" }, "MATCH (n:service) WHERE n.context = $context RETURN n");

  assertNoErrors(result);
  assert(exact.elements["shared/api"]);
  assert.equal(Object.keys(lowercase.elements).length, 0);
}

function selectsReferencesReturnedByCypher() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App

    service api
        name = API
        links:
            -> db

    container db
        name = DB
`));

  const graph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (s:Service)-[r:REFERENCES]->(t:Container) RETURN s, r, t",
  );

  assertNoErrors(result);
  assert(graph.elements["shared/api"]);
  assert(graph.elements["shared/db"]);
  assert.equal(graph.edges.length, 1);
}

function keepsParallelReferencesBetweenSameElements() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App
    links:
        -> target # reads
        -> target # writes

system target
    name = Target
`));

  const graph = selectGraph(
    result,
    { context: "shared", tab: "architecture.ai" },
    `
    MATCH (n)
    OPTIONAL MATCH (n)-[r]->(m)
    WHERE n.sourceIdentity = $tab
    RETURN n, r, m
    `,
  );

  assertNoErrors(result);
  assert.equal(result.edges.length, 2);
  assert.equal(graph.edges.length, 2);
}

function projectedRelationshipsRequireProjectedSelector() {
  const result = linkProject({
    snapshot: projectionSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

storage db
    name = Database

system app
    name = App
    uses:
        db
`),
    ],
  });

  const defaultGraph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:System)-[r:REFERENCES]->(m:InfrastructureComponent) WHERE n.context = $context RETURN n, r, m",
  );
  const projectedGraph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:System)-[r:REFERENCES {projected}]->(m:InfrastructureComponent) WHERE n.context = $context RETURN n, r, m",
  );

  assertNoErrors(result);
  assert.equal(defaultGraph.edges.length, 0);
  assert.equal(projectedGraph.edges.length, 1);
  assert.equal(projectedGraph.edges[0]?.source, "shared/app");
  assert.equal(projectedGraph.edges[0]?.target, "shared/db");
}

function c4StyleQueryReturnsRealAndProjectedEdges() {
  const result = linkProject({
    snapshot: projectionSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

storage db
    name = Database

system app
    name = App
    uses:
        db
    links:
        -> worker

system worker
    name = Worker
`),
    ],
  });

  const graph = selectGraph(
    result,
    { context: "shared", tab: "architecture.ai" },
    `
    MATCH (node:Element)
    WHERE node.sourceIdentity = $tab
    OPTIONAL MATCH (node)-[link]->(target)
    OPTIONAL MATCH (node)-[projectedLink {projected}]->(projectedTarget)
    GROUP BY node.parent
    RETURN node, link, target, projectedLink, projectedTarget
    `,
  );

  assertNoErrors(result);
  assert.equal(graph.edges.filter((edge) => edge.edge.projected === true).length, 1);
  assert.equal(graph.edges.filter((edge) => edge.edge.projected !== true).length, 1);
  assert(graph.elements["shared/db"], "Expected projected target to be selected");
  assert(graph.elements["shared/worker"], "Expected real target to be selected");
}

function c4QueryReturnsDirectDeploymentEdgesOnlyFromDeploymentElements() {
  const snapshot = buildLanguageSnapshotResultFromSources([
    source("deployment_links.ai", `
extend type Environment
    List of InfrastructureComponent _

extend type InfrastructureComponent
    List of Wire links
`),
  ], [coreLanguageSnapshot]);
  const result = linkProject({
    snapshot: snapshot.snapshot,
    sources: [
      source("architecture.ai", `
context shared

environment prod
    name = Production

    infrastructureComponent gateway
        name = Gateway
        links:
            -> compute

    infrastructureComponent compute
        name = Compute

system app
    name = App

    service frontend
        name = Frontend
        links:
            -> backend

    service backend
        name = Backend
`),
    ],
  });

  const graph = selectGraph(
    result,
    { context: "shared", tab: "architecture.ai" },
    `
    MATCH (node:Element)
    WHERE node.sourceIdentity = $tab
      AND (node IS DeploymentElement OR node IS ContainerElement)
    OPTIONAL MATCH ROLLUP (node)-[projectedLink {projected, sourceIdentity: $tab}]->(projectedTarget:Element)
    WHERE projectedTarget IS DeploymentElement
       OR projectedTarget IS ContainerElement
       OR projectedTarget IS External
    OPTIONAL MATCH (node)-[directDeploymentLink {sourceIdentity: $tab}]->(directDeploymentTarget:Element)
    WHERE node IS DeploymentElement
      AND (directDeploymentTarget IS DeploymentElement OR directDeploymentTarget IS External)
    GROUP BY node.runsOn
    RETURN node, projectedLink, projectedTarget, directDeploymentLink, directDeploymentTarget
    `,
  );

  assertNoErrors(snapshot);
  assertNoErrors(result);
  assert(graph.elements["shared/gateway"]);
  assert(graph.elements["shared/compute"]);
  assert(graph.elements["shared/frontend"]);
  assert(graph.elements["shared/backend"]);
  assert(graph.edges.some((edge) => edge.source === "shared/gateway" && edge.target === "shared/compute" && edge.edge.projected !== true));
  assert(!graph.edges.some((edge) => edge.source === "shared/frontend" && edge.target === "shared/backend"));
}

function c4QueryReturnsTargetOwnedIncomingGatewayPath() {
  const sources = [
    source("framework.ai", `
extend type Environment
    Compute compute
    NetworkConnection network
    PrivateGateway privateGateway

define type PrivateGateway of InfrastructureComponent
    constructor privateGateway

    project:
        source $from originalLink target $this
        target $this connectTo target $to
`),
    source("infra.ai", `
context infra

environment sourceEnv
    name = Source Env

    compute:
        compute sourceCompute
            name = Source Compute

    network:
        networkConnection sourceNetwork
            name = Source Network

environment targetEnv
    name = Target Env

    compute:
        compute targetCompute
            name = Target Compute

    privateGateway:
        privateGateway targetGateway
            name = Target Private Gateway
            runsOn compute

deploymentProfile sourceProfile
    environments:
        sourceEnv

    runsOn compute

deploymentProfile targetProfile
    environments:
        targetEnv

    runsOn compute
`),
    source("source-system.ai", `
context services

import target from context services
import payment from context external
import sourceProfile from context infra
import targetProfile from context infra

system sourceSystem
    name = Source System

    service caller
        name = Caller
        deployment:
            usesProfile sourceProfile
        links:
            -> target from services
                technology = HTTPS
                deployment:
                    environmentsFrom sourceProfile
                    environmentsFrom targetProfile
                    uses privateGateway
            -> payment from external
                technology = HTTPS
                deployment:
                    environmentsFrom sourceProfile
                    uses network
`),
    source("target-system.ai", `
context services

import targetProfile from context infra

system targetSystem
    name = Target System

    service target
        name = Target
        deployment:
            usesProfile targetProfile
`),
    source("external.ai", `
context external

external system payment
    name = Payment Provider
`),
  ];
  const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
  const result = linkProject({
    snapshot: snapshot.snapshot,
    sources,
  });

  const graph = selectGraph(
    result,
    { context: "services", tab: "target-system.ai" },
    builtinC4Query,
  );

  assertNoErrors(snapshot);
  assertNoErrors(result);
  assert(graph.elements["services/target"]);
  assert(graph.elements["services/caller"], "Expected C4 target tab to include incoming caller");
  assert(graph.elements["infra/targetGateway"], "Expected C4 target tab to include target private gateway");
  assert(graph.edges.some((edge) => edge.source === "services/caller" && edge.target === "infra/targetGateway"));
  assert(graph.edges.some((edge) => edge.source === "infra/targetGateway" && edge.target === "services/target"));
  assert(!graph.edges.some((edge) => edge.source === "services/caller" && edge.target === "services/target"));

  const sourceGraph = selectGraph(
    result,
    { context: "services", tab: "source-system.ai" },
    builtinC4Query,
  );

  assert(sourceGraph.elements["external/payment"], "Expected source C4 tab to keep outgoing external projections");
  assert(sourceGraph.elements["services/target"], "Expected source C4 tab to keep cross-system logical peer target");
  assert(sourceGraph.edges.some((edge) => edge.source === "services/caller" && edge.target === "services/target"));
  assert(!sourceGraph.elements["infra/targetGateway"], "Expected source C4 tab not to include target-owned private gateway");
}

function rollsChildReferencesUpToOwningElementForQuery() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App

    service api
        name = API
        links:
            -> google

external system google
    name = Google
`));

  const graph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:System)-[r:REFERENCES {derived}]->(m:System) WHERE n.context = $context RETURN n, r, m",
  );

  assertNoErrors(result);
  assert(graph.elements["shared/app"]);
  assert(graph.elements["shared/google"]);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0]?.source, "shared/app");
  assert.equal(graph.edges[0]?.target, "shared/google");
}

function rollsProjectedReferencesUpToOwningElementForQuery() {
  const result = linkProject({
    snapshot: projectedRollupSnapshot(),
    sources: [source("architecture.ai", `
context shared

storage db
    name = Database

system app
    name = App

    container api
        name = API

        component resources
            name = Resources
            uses:
                db
`)],
  });

  const directGraph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:Component)-[r:REFERENCES {projected}]->(m:Storage) WHERE n.context = $context RETURN n, r, m",
  );
  const rolledGraph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:Container)-[r:REFERENCES {projected, derived}]->(m:Storage) WHERE n.context = $context RETURN n, r, m",
  );
  const nonProjectedDerivedGraph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:Container)-[r:REFERENCES {derived}]->(m:Storage) WHERE n.context = $context RETURN n, r, m",
  );

  assertNoErrors(result);
  assert.equal(directGraph.edges.length, 1);
  assert.equal(directGraph.edges[0]?.source, "shared/resources");
  assert.equal(directGraph.edges[0]?.target, "shared/db");
  assert.equal(rolledGraph.edges.length, 1);
  assert.equal(rolledGraph.edges[0]?.source, "shared/api");
  assert.equal(rolledGraph.edges[0]?.target, "shared/db");
  assert.equal(rolledGraph.edges[0]?.edge.projected, true);
  assert.equal(nonProjectedDerivedGraph.edges.length, 0);
}

function rollsNestedReferencesUpToOwningSystems() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App

    service api
        name = API
        links:
            -> worker

system backend
    name = Backend

    service worker
        name = Worker
`));

  const graph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:System)-[r:REFERENCES {derived}]->(m:System) WHERE n.context = $context RETURN n, r, m",
  );

  assertNoErrors(result);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0]?.source, "shared/app");
  assert.equal(graph.edges[0]?.target, "shared/backend");
}

function rollsNestedReferencesUpToOwningContexts() {
  const result = linkWithCore(
    source("first.ai", `
context first

import worker from context second

system app
    name = App

    service api
        name = API
        links:
            -> worker
`),
    source("second.ai", `
context second

system backend
    name = Backend

    service worker
        name = Worker
`),
  );

  const graph = selectGraph(
    result,
    { context: "first" },
    "MATCH (n:Context)-[r:REFERENCES {derived}]->(m:Context) WHERE n.id = $context RETURN n, r, m",
  );

  assertNoErrors(result);
  assert(graph.elements.first);
  assert(graph.elements.second);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0]?.source, "first");
  assert.equal(graph.edges[0]?.target, "second");
}

function doesNotRollInternalNestedReferencesIntoOwningSystemSelfEdges() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App

    service api
        name = API
        links:
            -> worker

    service worker
        name = Worker
`));

  const graph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:System)-[r:REFERENCES {derived}]->(m:System) WHERE n.context = $context RETURN n, r, m",
  );

  assertNoErrors(result);
  assert.equal(graph.edges.length, 0);
}

function relationshipsWithoutDerivedSelectorUseDefaultNonDerivedEdges() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App

    service api
        name = API
        links:
            -> worker

system backend
    name = Backend

    service worker
        name = Worker
`));

  const graph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:System)-[r:REFERENCES]->(m:System) WHERE n.context = $context RETURN n, r, m",
  );

  assertNoErrors(result);
  assert.equal(Object.keys(graph.elements).length, 0);
  assert.equal(graph.edges.length, 0);
}

function optionalMatchKeepsPreviouslySelectedNodeWhenRelationshipIsMissing() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App
`));

  const graph = selectGraph(
    result,
    { context: "shared" },
    `
    MATCH (n:System)
    OPTIONAL MATCH (n)-[r:REFERENCES]->(m:System)
    WHERE n.context = $context
    RETURN n, r, m
    `,
  );

  assertNoErrors(result);
  assert(graph.elements["shared/app"]);
  assert.equal(graph.edges.length, 0);
}

function optionalMatchWhereFiltersOptionalPatternOnly() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App
`));

  const graph = selectGraph(
    result,
    { context: "shared" },
    `
    MATCH (n:System)
    WHERE n.context = $context
    OPTIONAL MATCH (n)-[r:REFERENCES]->(m:System)
    WHERE m.id = 'missing'
    RETURN n, r, m
    `,
  );

  assertNoErrors(result);
  assert(graph.elements["shared/app"]);
  assert.equal(graph.edges.length, 0);
}

function rollupMatchSelectsNearestAcceptedEndpoints() {
  const result = linkProject({
    snapshot: projectedRollupSnapshot(),
    sources: [source("architecture.ai", `
context shared

storage db
    name = Database

system app
    name = App

    container api
        name = API

        component resources
            name = Resources
            uses:
                db
`)],
  });

  const graph = selectGraph(
    result,
    { context: "shared" },
    `
    MATCH (n:Container)
    WHERE n.context = $context
    OPTIONAL MATCH ROLLUP (n)-[r {projected}]->(m:Storage)
    WHERE m IS Storage
    RETURN n, r, m
    `,
  );

  assertNoErrors(result);
  assert(graph.edges.some((edge) => edge.source === "shared/api" && edge.target === "shared/db"));
  assert.equal(graph.elements["shared/resources"], undefined);
}

function rollupMatchUsesProjectedOriginsForInternalProjectionFragments() {
  const result = linkProject({
    snapshot: projectedOriginRollupSnapshot(),
    sources: [source("architecture.ai", `
context shared

infraHop proxy
    name = Proxy

gateway gateway
    name = Gateway
    hop:
        proxy

system app
    name = App

    container frontend
        name = Frontend
        links:
            -> backend
                uses:
                    gateway

    container backend
        name = Backend
`)],
  });

  const graph = selectGraph(
    result,
    { context: "shared" },
    `
    MATCH (n:Container)
    WHERE n.context = $context
    OPTIONAL MATCH ROLLUP (n)-[r {projected}]->(m:InfrastructureComponent)
    WHERE m IS InfrastructureComponent
    RETURN n, r, m
    `,
  );

  assertNoErrors(result);
  assert(graph.edges.some((edge) => edge.source === "shared/frontend" && edge.target === "shared/proxy"));
}

function filtersWithWhereAndBuiltinVariables() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App

    service api
        name = API
        technology = Java, REST

    container db
        name = DB
`));

  const graph = selectGraph(
    result,
    { context: "shared", tab: "architecture.ai" },
    "MATCH (n:Service) WHERE n.context = $context AND n.sourceIdentity = $tab AND n.technology CONTAINS 'Java' RETURN n",
  );

  assertNoErrors(result);
  assert(graph.elements["shared/api"]);
  assert.equal(graph.elements["shared/app"], undefined);
  assert.equal(graph.elements["shared/db"], undefined);
}

function missingScopeValuesDoNotMatchMissingOrDefinedProperties() {
  const result = linkWithCore(
    source("definitions.ai", `
define type Broker of InfrastructureComponent
    constructor broker
`),
    source("architecture.ai", `
context shared

system app
    name = App
`),
  );

  const c1 = selectGraph(
    result,
    { tab: "definitions.ai" },
    "MATCH (system:SystemElement) WHERE system.context = $context RETURN system",
  );
  const missingOnBothSides = selectGraph(
    result,
    { tab: "definitions.ai" },
    "MATCH (system:SystemElement) WHERE system.missing = $context RETURN system",
  );

  assertNoErrors(result);
  assert.equal(Object.keys(c1.elements).length, 0);
  assert.equal(Object.keys(missingOnBothSides.elements).length, 0);
}

function filtersWithWhereOr() {
  const result = linkWithCore(
    source("business.ai", `
context business

system app
    name = App
`),
    source("infra.ai", `
context infra

system database
    name = Database
`),
  );

  const graph = selectGraph(
    result,
    { context: "business", tab: "business.ai" },
    "MATCH (n:System) WHERE n.sourceIdentity = $tab OR n.context = 'infra' RETURN n",
  );

  assertNoErrors(result);
  assert(graph.elements["business/app"]);
  assert(graph.elements["infra/database"]);
}

function supportsWhereParenthesesAndNot() {
  const result = linkWithCore(
    source("business.ai", `
context business

system app
    name = App

system worker
    name = Worker
`),
    source("infra.ai", `
context infra

system database
    name = Database
`),
  );

  const graph = selectGraph(
    result,
    { context: "business", tab: "business.ai" },
    `
    MATCH (n:System)
    WHERE (n.sourceIdentity = $tab OR n.context = 'infra') AND NOT (n.id = 'worker' OR n.context = 'infra')
    RETURN n
    `,
  );

  assertNoErrors(result);
  assert(graph.elements["business/app"]);
  assert.equal(graph.elements["business/worker"], undefined);
  assert.equal(graph.elements["infra/database"], undefined);
}

function supportsRelationshipPropertyPredicates() {
  const result = linkWithCore(
    source("first.ai", `
context first

system app
    name = App
    links:
        -> worker

system worker
    name = Worker
`),
    source("second.ai", `
context second

system api
    name = API
    links:
        -> peer

system peer
    name = Peer
`),
  );

  const graph = selectGraph(
    result,
    { tab: "first.ai" },
    `
    MATCH (n:System)
    WHERE n.id IN ['app', 'api']
    OPTIONAL MATCH (n)-[r {sourceIdentity: $tab}]->(m:System)
    RETURN n, r, m
    `,
  );

  assertNoErrors(result);
  assert(graph.elements["first/app"]);
  assert(graph.elements["second/api"]);
  assert(graph.elements["first/worker"]);
  assert.equal(graph.elements["second/peer"], undefined);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0]?.edge.sourceIdentity, "first.ai");
}

function supportsRelationshipContextPredicates() {
  const result = linkWithCore(
    source("first.ai", `
context first

system app
    name = App
    links:
        -> worker

system worker
    name = Worker
`),
    source("second.ai", `
context second

system api
    name = API
    links:
        -> peer

system peer
    name = Peer
`),
  );

  const graph = selectGraph(
    result,
    { context: "first" },
    `
    MATCH (n:System)
    WHERE n.id IN ['app', 'api']
    OPTIONAL MATCH (n)-[r {context: $context}]->(m:System)
    RETURN n, r, m
    `,
  );

  assertNoErrors(result);
  assert(graph.elements["first/app"]);
  assert(graph.elements["second/api"]);
  assert(graph.elements["first/worker"]);
  assert.equal(graph.elements["second/peer"], undefined);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0]?.edge.sourceIdentity, "first.ai");
}

function supportsIsPredicates() {
  const result = linkProject({
    snapshot: contextAcceptsAnyElementSnapshot(),
    sources: [source("architecture.ai", `
context shared

external actor user
    name = User

system app
    name = App

infrastructureComponent kube
    name = Kubernetes
`)],
  });

  const graph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:Element) WHERE n IS External OR n IS DeploymentElement RETURN n",
  );

  assertNoErrors(result);
  assert(graph.elements["shared/user"]);
  assert(graph.elements["shared/kube"]);
  assert.equal(graph.elements["shared/app"], undefined);
}

function supportsInPredicates() {
  const result = linkProject({
    snapshot: contextAcceptsAnyElementSnapshot(),
    sources: [source("architecture.ai", `
context shared

external actor user
    name = User

system app
    name = App

infrastructureComponent kube
    name = Kubernetes
`)],
  });

  const graph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:Element) WHERE n.constructor IN ['actor', 'system'] AND NOT ('DeploymentElement' IN n.baseTypes) RETURN n",
  );

  assertNoErrors(result);
  assert(graph.elements["shared/user"]);
  assert(graph.elements["shared/app"]);
  assert.equal(graph.elements["shared/kube"], undefined);
}

function supportsCypherNotEqualsOperator() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App

system worker
    name = Worker
`));

  const graph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:System) WHERE n.id <> 'worker' RETURN n",
  );

  assertNoErrors(result);
  assert(graph.elements["shared/app"]);
  assert.equal(graph.elements["shared/worker"], undefined);
}

function filtersRelationshipsWithWhere() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App

    service api
        name = API
        links:
            ~> db
                model = async

    container db
        name = DB
`));

  const graph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (s:Service)-[r:REFERENCES]->(t:Container) WHERE r.model = 'async' RETURN s, r, t",
  );

  assertNoErrors(result);
  assert(graph.elements["shared/api"]);
  assert(graph.elements["shared/db"]);
  assert.equal(graph.edges.length, 1);
}

function supportsTabPerScope() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App
`));

  const graph = selectGraph(
    result,
    { context: "shared", tab: "architecture.ai" },
    "MATCH (n:Element) WHERE $tab = 'architecture.ai' RETURN n",
  );

  assertNoErrors(result);
  assert(graph.elements["shared/app"]);
}

function groupsSelectedElementsByImmediateParentElement() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App

    service api
        name = API

    container db
        name = DB
`));

  const graph = selectGraph(
    result,
    { context: "shared", tab: "architecture.ai" },
    "MATCH (n:Element) WHERE n.sourceIdentity = $tab GROUP BY n.parent RETURN n",
  );

  assertNoErrors(result);
  assert(graph.elements["shared/api"]);
  assert(graph.elements["shared/db"]);
  assert.deepEqual(graph.groups.find((group) => group.owner === "shared/app")?.elements.toSorted(), ["shared/api", "shared/db"]);
}

function doesNotGroupSelectedElementsWithoutGroupBy() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App

    service api
        name = API
`));

  const graph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:Element) WHERE n.context = $context RETURN n",
  );

  assertNoErrors(result);
  assert(graph.elements["shared/app"]);
  assert(graph.elements["shared/api"]);
  assert.deepEqual(graph.groups, []);
}

function groupsSelectedElementsBySelectedContextForWideDefaultQuery() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App

    service api
        name = API
`));

  const graph = selectGraph(
    result,
    { context: "shared", tab: "architecture.ai" },
    `
    MATCH (n)
    OPTIONAL MATCH (n)-[r]->(m)
    WHERE n.context = $context
    GROUP BY n.parent
    RETURN n, r, m
    `,
  );

  assertNoErrors(result);
  assert(graph.elements.shared);
  assert.deepEqual(graph.groups.find((group) => group.owner === "shared")?.elements, ["shared/app"]);
  assert.deepEqual(graph.groups.find((group) => group.owner === "shared/app")?.elements, ["shared/api"]);
}

function doesNotAddContextClusterWhenContextIsNotSelected() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App
`));

  const graph = selectGraph(
    result,
    { context: "shared", tab: "architecture.ai" },
    "MATCH (n:Element) WHERE n.context = $context RETURN n",
  );

  assertNoErrors(result);
  assert.equal(graph.elements.shared, undefined);
  assert.equal(graph.groups.find((group) => group.owner === "shared"), undefined);
}

function groupsSelectedElementsByScalarAttribute() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App

    service api
        name = API
        technology = Java

    service worker
        name = Worker
        technology = Java
`));

  const graph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:Service) WHERE n.context = $context GROUP BY n.technology RETURN n",
  );

  assertNoErrors(result);
  assert.deepEqual(graph.groups.find((group) => group.owner === "scalar__Java")?.elements.toSorted(), ["shared/api", "shared/worker"]);
}

function groupsSelectedElementsByTypedReferenceAttribute() {
  const result = linkProject({
    snapshot: infraGroupingSnapshot(false),
    sources: [source("architecture.ai", `
context shared

compute kube
    name = Kubernetes

system app
    name = App

    service api
        name = API
        runsOn:
            kube
`)],
  });

  const graph = selectGraph(
    result,
    { context: "shared", tab: "architecture.ai" },
    "MATCH (node:Service) WHERE node.sourceIdentity = $tab GROUP BY node.runsOn RETURN node",
  );

  assertNoErrors(result);
  assert.deepEqual(graph.groups.find((group) => group.owner === "shared/kube")?.elements, ["shared/api"]);
}

function groupsSelectedElementsByImportedTypedReferenceAttribute() {
  const result = linkProject({
    snapshot: infraGroupingSnapshot(false),
    sources: [
      source("infra.ai", `
context infra

compute kube
    name = Kubernetes
`),
      source("architecture.ai", `
context shared

import kube from context infra

system app
    name = App

    service api
        name = API
        runsOn:
            kube
`),
    ],
  });

  const graph = selectGraph(
    result,
    { context: "shared", tab: "architecture.ai" },
    "MATCH (node:Service) WHERE node.sourceIdentity = $tab GROUP BY node.runsOn RETURN node",
  );

  assertNoErrors(result);
  assert.deepEqual(graph.groups.find((group) => group.owner === "infra/kube")?.elements, ["shared/api"]);
}

function groupsSelectedElementsByTypedReferenceAttributeFromExtension() {
  const result = linkProject({
    snapshot: infraGroupingSnapshot(false),
    sources: [source("architecture.ai", `
context shared

compute kube
    name = Kubernetes

system app
    name = App

    service api
        name = API

extend service api
    runsOn:
        kube
`)],
  });

  const graph = selectGraph(
    result,
    { context: "shared", tab: "architecture.ai" },
    "MATCH (node:Service) WHERE node.sourceIdentity = $tab GROUP BY node.runsOn RETURN node",
  );

  assertNoErrors(result);
  assert.deepEqual(graph.groups.find((group) => group.owner === "shared/kube")?.elements, ["shared/api"]);
}

function typedReferenceImplementationsMaterializeRunsOnGroups() {
  const sources = [
    source("test.ai", `
extend type Context
    List of Element _

extend type Environment
    InfrastructureComponent region
    InfrastructureComponent compute
    InfrastructureComponent broker
    InfrastructureComponent storage

extend type System
    DeploymentProfile deployment

extend type Wire
    DeploymentProfile deployment
`),
    source("test2.ai", `
context infra

infrastructureComponent euRegion
    name = Europe Region

infrastructureComponent usRegion
    name = United States Region

environment eu
    name = Europe
    region:
        euRegion

    compute:
        compute kube
            name = Kubernetes
            runsOn region

    broker:
        broker kafka
            name = Kafka
            runsOn compute

    storage:
        storage db
            name = Postgres
            runsOn compute

environment us
    name = United States
    region:
        usRegion

    compute:
        compute ecs
            name = ECS
            runsOn region

    broker:
        broker kafkaUs
            name = Kafka US
            runsOn compute

    storage:
        storage dbUs
            name = Postgres US
            runsOn compute
`),
    source("infrastructure.ai", `
context infrastructure

environment prod
    name = Production

    compute:
        compute kubeProd
            name = Kubernetes Production

    broker:
        broker kafkaProd
            name = Kafka Production

    storage:
        storage dbProd
            name = Postgres Production
`),
    source("test3.ai", `
context test

import eu from context infra
import us from context infra

deploymentProfile global
    environments:
        eu
        us
    runsOn compute

service api
    name = API
    deployment:
        usesProfile global
        uses storage
    links:
        -> worker
            deployment:
                environmentsFrom global
                uses broker

service worker
    name = Worker
    deployment:
        usesProfile global
`),
  ];
  const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
  const result = linkProject({
    snapshot: snapshot.snapshot,
    sources,
  });

  const graph = selectGraph(
    result,
    { context: "test", tab: "test3.ai" },
    `
    MATCH (node:Element)
    WHERE node.sourceIdentity = $tab
      AND (node IS DeploymentElement OR node IS ContainerElement)
    OPTIONAL MATCH ROLLUP (node)-[projectedLink {projected, sourceIdentity: $tab}]->(projectedTarget:Element)
    WHERE projectedTarget IS DeploymentElement
       OR projectedTarget IS ContainerElement
       OR projectedTarget IS External
    OPTIONAL MATCH (node)-[directDeploymentLink {sourceIdentity: $tab}]->(directDeploymentTarget:Element)
    WHERE node IS DeploymentElement
      AND (directDeploymentTarget IS DeploymentElement OR directDeploymentTarget IS External)
    GROUP BY node.runsOn
    RETURN node, projectedLink, projectedTarget, directDeploymentLink, directDeploymentTarget
    `,
  );

  assertNoErrors(snapshot);
  assertNoErrors(result);
  assert.deepEqual(result.elements.find((element) => element.id === "test/api")?.attributes.runsOn, ["infra/kube", "infra/ecs"]);
  assert.deepEqual(result.elements.find((element) => element.id === "test/worker")?.attributes.runsOn, ["infra/kube", "infra/ecs"]);
  const euComputeGroup = graph.groups.find((group) => group.owner === "infra/kube");
  const usComputeGroup = graph.groups.find((group) => group.owner === "infra/ecs");
  const euRegionGroup = graph.groups.find((group) => group.owner === "infra/euRegion");
  const usRegionGroup = graph.groups.find((group) => group.owner === "infra/usRegion");
  assert(euComputeGroup !== undefined, "Expected C4 group for EU compute runsOn target");
  assert(usComputeGroup !== undefined, "Expected C4 group for US compute runsOn target");
  assert(euRegionGroup !== undefined, "Expected C4 group for EU compute parent");
  assert(usRegionGroup !== undefined, "Expected C4 group for US compute parent");
  assert(euComputeGroup.elements.includes("test/api@@infra/kube"));
  assert(euComputeGroup.elements.includes("test/worker@@infra/kube"));
  assert(euComputeGroup.elements.includes("infra/kafka"));
  assert(euComputeGroup.elements.includes("infra/db"));
  assert(usComputeGroup.elements.includes("test/api@@infra/ecs"));
  assert(usComputeGroup.elements.includes("test/worker@@infra/ecs"));
  assert(usComputeGroup.elements.includes("infra/kafkaUs"));
  assert(usComputeGroup.elements.includes("infra/dbUs"));
  assert(euRegionGroup.elements.includes("infra/kube"));
  assert(usRegionGroup.elements.includes("infra/ecs"));
  assert.equal(graph.elements["test/api"], undefined);
  assert.equal(graph.elements["test/worker"], undefined);
  assert.equal(graph.edges.filter((edge) => edge.edge.projected === true).length, 6);
  assert.equal(graph.edges.filter((edge) => edge.edge.projected !== true).length, 0);
  assert(graph.edges.some((edge) => edge.source === "test/api@@infra/kube" && edge.target === "infra/db"));
  assert(graph.edges.some((edge) => edge.source === "test/api@@infra/ecs" && edge.target === "infra/dbUs"));
  assert(graph.edges.some((edge) => edge.source === "test/api@@infra/kube" && edge.target === "infra/kafka"));
  assert(graph.edges.some((edge) => edge.source === "test/worker@@infra/kube" && edge.target === "infra/kafka"));
  assert(!graph.externalElements.includes("infra/kafka"));
  assert(!graph.externalElements.includes("infra/db"));
  assert(!graph.externalElements.includes("infra/kafkaUs"));
  assert(!graph.externalElements.includes("infra/dbUs"));
  assert.equal(graph.elements["infrastructure/prod"], undefined);
  assert.equal(graph.elements["infrastructure/kubeProd"], undefined);
  assert.equal(graph.elements["infrastructure/kafkaProd"], undefined);
  assert.equal(graph.elements["infrastructure/dbProd"], undefined);

  const infraGraph = selectGraph(
    result,
    { context: "infra", tab: "test2.ai" },
    `
    MATCH (node:Element)
    WHERE node.sourceIdentity = $tab
      AND (node IS DeploymentElement OR node IS ContainerElement)
    OPTIONAL MATCH ROLLUP (node)-[projectedLink {projected, sourceIdentity: $tab}]->(projectedTarget:Element)
    WHERE projectedTarget IS DeploymentElement
       OR projectedTarget IS ContainerElement
       OR projectedTarget IS External
    OPTIONAL MATCH (node)-[directDeploymentLink {sourceIdentity: $tab}]->(directDeploymentTarget:Element)
    WHERE node IS DeploymentElement
      AND (directDeploymentTarget IS DeploymentElement OR directDeploymentTarget IS External)
    GROUP BY node.runsOn
    RETURN node, projectedLink, projectedTarget, directDeploymentLink, directDeploymentTarget
    `,
  );

  assert(infraGraph.elements["infra/euRegion"]);
  assert(infraGraph.elements["infra/usRegion"]);
  assert.equal(infraGraph.elements["test/api"], undefined);
  assert.equal(infraGraph.elements["test/worker"], undefined);
  assert.equal(infraGraph.elements["infrastructure/prod"], undefined);
  assert.equal(infraGraph.elements["infrastructure/kubeProd"], undefined);
  assert.equal(infraGraph.edges.filter((edge) => edge.edge.projected === true).length, 0);
}

function groupsSelectedElementsByListValuedReferenceAttribute() {
  const result = linkProject({
    snapshot: projectionSnapshot(),
    sources: [
      source("architecture.ai", `
context shared

storage db
    name = Database

storage cache
    name = Cache

system app
    name = App
    uses:
        db
        cache
`),
    ],
  });

  const graph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:System) WHERE n.context = $context GROUP BY n.uses RETURN n",
  );

  assertNoErrors(result);
  assert.deepEqual(graph.groups.find((group) => group.owner === "shared/db")?.elements, ["shared/app@@shared/db"]);
  assert.deepEqual(graph.groups.find((group) => group.owner === "shared/cache")?.elements, ["shared/app@@shared/cache"]);
  assert.equal(graph.elements["shared/app"], undefined);
  assert.deepEqual(graph.elements["shared/app@@shared/db"]?.attributes.projectedFrom, ["shared/app"]);
  assert.deepEqual(graph.elements["shared/app@@shared/cache"]?.attributes.projectedFrom, ["shared/app"]);
}

function groupsSelectedElementsBySingleEntryListValuedTypedReferenceAttribute() {
  const result = linkProject({
    snapshot: infraGroupingSnapshot(true),
    sources: [source("architecture.ai", `
context shared

compute kube
    name = Kubernetes

system app
    name = App

    service api
        name = API
        runsOn:
            kube
`)],
  });

  const graph = selectGraph(
    result,
    { context: "shared", tab: "architecture.ai" },
    "MATCH (node:Service) WHERE node.sourceIdentity = $tab GROUP BY node.runsOn RETURN node",
  );

  assertNoErrors(result);
  assert.deepEqual(graph.groups.find((group) => group.owner === "shared/kube")?.elements, ["shared/api"]);
}

function groupsSelectedElementsByMultiEntryListValuedTypedReferenceAttribute() {
  const result = linkProject({
    snapshot: infraGroupingSnapshot(true),
    sources: [source("architecture.ai", `
context shared

compute kube
    name = Kubernetes

compute ecs
    name = ECS

system app
    name = App

    service api
        name = API
        runsOn:
            kube
            ecs
`)],
  });

  const graph = selectGraph(
    result,
    { context: "shared", tab: "architecture.ai" },
    "MATCH (node:Service) WHERE node.sourceIdentity = $tab GROUP BY node.runsOn RETURN node",
  );

  assertNoErrors(result);
  assert.deepEqual(graph.groups.find((group) => group.owner === "shared/kube")?.elements, ["shared/api@@shared/kube"]);
  assert.deepEqual(graph.groups.find((group) => group.owner === "shared/ecs")?.elements, ["shared/api@@shared/ecs"]);
  assert.equal(graph.elements["shared/api"], undefined);
  assert.deepEqual(graph.elements["shared/api@@shared/kube"]?.attributes.projectedFrom, ["shared/api"]);
  assert.deepEqual(graph.elements["shared/api@@shared/ecs"]?.attributes.projectedFrom, ["shared/api"]);
}

function sourceIdentitySelectsElementsDeclaredInCurrentTab() {
  const result = linkWithCore(
    source("first.ai", `
context shared

system app
    name = App
`),
    source("second.ai", `
context shared

system api
    name = API
`),
  );

  const graph = selectGraph(
    result,
    { context: "shared", tab: "first.ai" },
    "MATCH (s:SourceIdentity)-[r:DECLARES]->(n:System) WHERE s.id = $tab RETURN n",
  );

  assertNoErrors(result);
  assert(graph.elements["shared/app"]);
  assert.equal(graph.elements["shared/api"], undefined);
}

function tabSourceIdentityIncludesTopLevelSubtreesAndExtensionTargets() {
  const result = linkWithCore(
    source("main.ai", `
context shared

system app
    name = App

    service api
        name = API
`),
    source("split.ai", `
context shared

system unrelated
    name = Unrelated

extend service api
    component handler
        name = Handler
`),
  );

  const mainGraph = selectGraph(
    result,
    { context: "shared", tab: "main.ai" },
    "MATCH (n:Element) WHERE n.sourceIdentity = $tab RETURN n",
  );
  const splitGraph = selectGraph(
    result,
    { context: "shared", tab: "split.ai" },
    "MATCH (n:Element) WHERE n.sourceIdentity = $tab RETURN n",
  );

  assertNoErrors(result);
  assert(mainGraph.elements["shared/app"]);
  assert(mainGraph.elements["shared/api"]);
  assert(mainGraph.elements["shared/handler"]);
  assert.equal(mainGraph.elements["shared/unrelated"], undefined);
  assert(splitGraph.elements["shared/api"]);
  assert(splitGraph.elements["shared/handler"]);
  assert(splitGraph.elements["shared/unrelated"]);
  assert.equal(splitGraph.elements["shared/app"], undefined);
}

function tabSourceIdentityFiltersRelationshipsByOriginSubtree() {
  const result = linkWithCore(
    source("main.ai", `
context shared

system app
    name = App

    service api
        name = API

system dependency
    name = Dependency
`),
    source("split.ai", `
context shared

import dependency from context shared

system unrelated
    name = Unrelated

    service other
        name = Other
        links:
            -> collaborator

    service collaborator
        name = Collaborator

extend service api
    component handler
        name = Handler
        links:
            -> dependency
`),
  );

  const graph = selectGraph(
    result,
    { context: "shared", tab: "main.ai" },
    "MATCH (n:Element)-[r {sourceIdentity: $tab}]->(m:Element) RETURN n, r, m",
  );

  assertNoErrors(result);
  assert(graph.edges.some((edge) => edge.source === "shared/handler" && edge.target === "shared/dependency"));
  assert(!graph.edges.some((edge) => edge.source === "shared/other" && edge.target === "shared/collaborator"));
}

function contextContainsSelectsElementsDeclaredInsideCurrentContext() {
  const result = linkWithCore(
    source("external.ai", `
context external_systems

external system google
    name = Google
`),
    source("shared.ai", `
context shared

import google from context external_systems

system app
    name = App
    links:
        -> peer
        -> google

system peer
    name = Peer
`),
  );

  const graph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (c:Context)-[r:CONTAINS]->(n:System) WHERE c.id = $context RETURN n",
  );

  assertNoErrors(result);
  assert(graph.elements["shared/app"]);
  assert(graph.elements["shared/peer"]);
  assert.equal(graph.elements["external_systems/google"], undefined);
  assert.equal(graph.edges.length, 1);
}

function untypedRelationshipsMatchAllGraphRelationsAndRespectDirection() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App
    links:
        -> peer

system peer
    name = Peer
`));

  const graph = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:System)-[r]->(m:System) WHERE n.context = $context RETURN n, r, m",
  );
  const reverse = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:System)-[r]->(m:System) WHERE n.id = 'peer' RETURN n, r, m",
  );
  const contains = selectGraph(
    result,
    { context: "shared" },
    "MATCH (n:Context)-[r]->(m:System) WHERE n.id = $context RETURN n, r, m",
  );

  assertNoErrors(result);
  assert(graph.elements["shared/app"]);
  assert(graph.elements["shared/peer"]);
  assert.equal(graph.edges.length, 1);
  assert.equal(Object.keys(reverse.elements).length, 0);
  assert.equal(reverse.edges.length, 0);
  assert(contains.elements.shared);
  assert(contains.elements["shared/app"]);
  assert(contains.elements["shared/peer"]);
  assert.equal(contains.edges.length, 1);
}

function writesGraphOnceForMultipleContextSelections() {
  const result = linkWithCore(
    source("first.ai", `
context first

system app
    name = First
`),
    source("second.ai", `
context second

system api
    name = Second
`),
  );
  const firstScope = { context: "first" };
  const secondScope = { context: "second" };
  const graphs = selectGraphs(
    result,
    [firstScope, secondScope],
    "MATCH (n:Element {context: $context}) RETURN n",
  );

  assertNoErrors(result);
  const first = graphs.get(firstScope);
  const second = graphs.get(secondScope);
  assert(first?.elements["first/app"]);
  assert.equal(first?.elements["second/api"], undefined);
  assert(second?.elements["second/api"]);
  assert.equal(second?.elements["first/app"], undefined);
}

function selectsEachContextScopeIndependently() {
  const result = linkWithCore(
    source("first.ai", `
context first

system app
    name = First
`),
    source("second.ai", `
context second

system api
    name = Second
`),
  );

  const first = selectGraph(result, { context: "first" }, "MATCH (n:Element {context: $context}) RETURN n");
  const second = selectGraph(result, { context: "second" }, "MATCH (n:Element {context: $context}) RETURN n");

  assertNoErrors(result);
  assert(first.elements["first/app"]);
  assert.equal(first.elements["second/api"], undefined);
  assert(second.elements["second/api"]);
  assert.equal(second.elements["first/app"], undefined);
}

function filtersBaseNodeAndKeepsIncomingExternalRelationshipsWithDistinctAliases() {
  const result = linkWithCore(
    source("external.ai", `
context external_systems

import app from context shared

external system google
    name = Google
    links:
        -> app
`),
    source("shared.ai", `
context shared

system app
    name = App
    links:
        -> peer

system peer
    name = Peer
`),
  );

  const graph = selectGraph(
    result,
    { context: "shared" },
    `
    MATCH (n:System)
    WHERE n.context = $context
    OPTIONAL MATCH (n)-[out]->(outNode:System)
    OPTIONAL MATCH (inNode:System)-[in]->(n)
    GROUP BY n.parent
    RETURN n, out, outNode, in, inNode
    `,
  );

  assertNoErrors(result);
  assert(graph.elements["shared/app"]);
  assert(graph.elements["shared/peer"]);
  assert(graph.elements["external_systems/google"]);
  assert.equal(graph.edges.length, 2);
  assert(graph.externalElements.includes("external_systems/google"));
  assert(!graph.externalElements.includes("shared/app"));
  assert(!graph.externalElements.includes("shared/peer"));
  assert.deepEqual(graph.groups.find((group) => group.owner === "shared")?.elements.toSorted(), ["shared/app", "shared/peer"]);
}

function c1QueryMarksNeighborContextSystemsAsExternal() {
  const result = linkWithCore(
    source("core.ai", `
context core

import payments from context payments

system app
    name = Core App
    links:
        -> payments
`),
    source("payments.ai", `
context payments

system payments
    name = Payments
`),
  );

  const graph = selectGraph(
    result,
    { context: "core" },
    `
    MATCH (system:SystemElement)
    WHERE system.context = $context
    OPTIONAL MATCH (system)-[realOutboundLink]->(externalSystem:SystemElement)
    OPTIONAL MATCH (sourceSystem:SystemElement)-[realInboundLink]->(system)
    OPTIONAL MATCH (system)-[rollupOutboundLink {derived}]->(rollupSystem:SystemElement)
    OPTIONAL MATCH (rollupSourceSystem:SystemElement)-[rollupInboundLink {derived}]->(system)
    GROUP BY system.parent
    RETURN system, realOutboundLink, externalSystem, realInboundLink, sourceSystem, rollupOutboundLink, rollupSystem, rollupInboundLink, rollupSourceSystem
    `,
  );

  assertNoErrors(result);
  assert(graph.elements["core/app"]);
  assert(graph.elements["payments/payments"]);
  assert(graph.externalElements.includes("payments/payments"));
  assert(!graph.externalElements.includes("core/app"));
}

function c1QueryKeepsDeploymentElementsOutOfSystemLandscape() {
  const sources = [
    source("definitions.ai", `
extend type Wire
    List of InfrastructureComponent uses
`),
    source("architecture.ai", `
context shared

actor user
    name = User
    links:
        -> api
            uses:
                broker _
                    name = Request Broker

system api
    name = API
`),
  ];
  const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
  const result = linkProject({
    snapshot: snapshot.snapshot,
    sources,
  });

  const graph = selectGraph(
    result,
    { context: "shared" },
    `
    MATCH (system:SystemElement)
    WHERE system.context = $context
    OPTIONAL MATCH (system)-[realOutboundLink]->(externalSystem:SystemElement)
    OPTIONAL MATCH (sourceSystem:SystemElement)-[realInboundLink]->(system)
    OPTIONAL MATCH (system)-[rollupOutboundLink {derived}]->(rollupSystem:SystemElement)
    OPTIONAL MATCH (rollupSourceSystem:SystemElement)-[rollupInboundLink {derived}]->(system)
    GROUP BY system.parent
    RETURN system, realOutboundLink, externalSystem, realInboundLink, sourceSystem, rollupOutboundLink, rollupSystem, rollupInboundLink, rollupSourceSystem
    `,
  );

  assertNoErrors(snapshot);
  assertNoErrors(result);
  assert(graph.elements["shared/user"]);
  assert(graph.elements["shared/api"]);
  assert.equal(Object.values(graph.elements).some((element) => element.type === "Broker"), false);
}

function rejectsWriteCypher() {
  const result = linkWithCore(source("architecture.ai", `
context shared

system app
    name = App
`));

  assert.throws(
    () => selectGraph(result, { context: "shared" }, "CREATE (n:System) RETURN n"),
    /Unsupported|write/i,
  );
}

function linkWithCore(...sources) {
  return linkProject({
    snapshot: coreLanguageSnapshot,
    sources,
  });
}

function projectionSnapshot() {
  return mergeLanguageSnapshots([
    minimalArchitectureSnapshot(),
    {
      schemaVersion: "projection",
      types: [
        { name: "InfrastructureComponent", baseType: "Element", attributes: [{ name: "name", type: "Text", required: true }] },
        {
          name: "Storage",
          baseType: "InfrastructureComponent",
          projectionRules: [
            { source: { placement: "source", kind: "from", value: "$from" }, operator: "originalLink", target: { placement: "target", kind: "this", value: "$this" } },
          ],
        },
        {
          name: "System",
          attributes: [
            { name: "uses", type: "List", list: true, listElementType: "InfrastructureComponent" },
          ],
        },
      ],
      constructors: [
        { spelling: "storage", ownerType: "Storage" },
      ],
      operators: [],
      enums: [],
    },
  ]);
}

function projectedRollupSnapshot() {
  return mergeLanguageSnapshots([
    minimalArchitectureSnapshot(),
    {
      schemaVersion: "projected-rollup",
      types: [
        {
          name: "System",
          attributes: [
            { name: "_", type: "List", list: true, listElementType: "Container" },
          ],
        },
        {
          name: "Container",
          baseType: "Element",
          attributes: [
            { name: "name", type: "Text" },
            { name: "_", type: "List", list: true, listElementType: "Component" },
          ],
        },
        {
          name: "Component",
          baseType: "Element",
          attributes: [
            { name: "name", type: "Text" },
            { name: "uses", type: "List", list: true, listElementType: "InfrastructureComponent" },
          ],
        },
        { name: "InfrastructureComponent", baseType: "Element", attributes: [{ name: "name", type: "Text", required: true }] },
        {
          name: "Storage",
          baseType: "InfrastructureComponent",
          projectionRules: [
            { source: { placement: "source", kind: "from", value: "$from" }, operator: "originalLink", target: { placement: "target", kind: "this", value: "$this" } },
          ],
        },
      ],
      constructors: [
        { spelling: "container", ownerType: "Container" },
        { spelling: "component", ownerType: "Component" },
        { spelling: "storage", ownerType: "Storage" },
      ],
      operators: [],
      enums: [],
    },
  ]);
}

function projectedOriginRollupSnapshot() {
  return mergeLanguageSnapshots([
    projectedRollupSnapshot(),
    {
      schemaVersion: "projected-origin-rollup",
      types: [
        {
          name: "Container",
          attributes: [
            { name: "links", type: "List", list: true, listElementType: "Wire" },
          ],
        },
        {
          name: "Wire",
          attributes: [
            { name: "uses", type: "List", list: true, listElementType: "InfrastructureComponent" },
          ],
        },
        {
          name: "InfrastructureComponent",
          attributes: [
            { name: "hop", type: "InfrastructureComponent" },
          ],
        },
        {
          name: "Gateway",
          baseType: "InfrastructureComponent",
          projectionRules: [
            { source: { placement: "source", kind: "from", value: "$from" }, operator: "originalLink", target: { placement: "target", kind: "attribute", value: "hop" } },
            { source: { placement: "target", kind: "attribute", value: "hop" }, operator: "connectTo", target: { placement: "target", kind: "this", value: "$this" } },
            { source: { placement: "target", kind: "this", value: "$this" }, operator: "connectTo", target: { placement: "target", kind: "to", value: "$to" } },
          ],
        },
        { name: "InfraHop", baseType: "InfrastructureComponent" },
      ],
      constructors: [
        { spelling: "gateway", ownerType: "Gateway" },
        { spelling: "infraHop", ownerType: "InfraHop" },
      ],
      operators: [],
      enums: [],
    },
  ]);
}

function infraGroupingSnapshot(list) {
  return mergeLanguageSnapshots([
    coreLanguageSnapshot,
    contextAcceptsAnyElementExtension(),
    {
      schemaVersion: "infra-grouping",
      types: [
        {
          name: "Service",
          attributes: [
            list
              ? { name: "runsOn", type: "List", list: true, listElementType: "Compute" }
              : { name: "runsOn", type: "Compute" },
          ],
        },
      ],
      constructors: [],
      operators: [],
      enums: [],
    },
  ]);
}

function contextAcceptsAnyElementSnapshot() {
  return mergeLanguageSnapshots([
    coreLanguageSnapshot,
    contextAcceptsAnyElementExtension(),
  ]);
}

function contextAcceptsAnyElementExtension() {
  return {
    schemaVersion: "context-any-element",
    types: [
      { name: "Context", attributes: [{ name: "_", type: "List", list: true, listElementType: "Element" }] },
    ],
    constructors: [],
    operators: [],
    enums: [],
  };
}

function minimalArchitectureSnapshot() {
  return {
    schemaVersion: "minimal",
    types: [
      { name: "Element" },
      { name: "Context", baseType: "Element", attributes: [{ name: "_", type: "List", list: true, listElementType: "Element" }] },
      { name: "System", baseType: "Element", attributes: [
        { name: "name", type: "Text" },
        { name: "links", type: "List", list: true, listElementType: "Wire" },
      ] },
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

function source(sourceName, sourceText) {
  return {
    sourceName,
    source: sourceText,
  };
}

function assertNoErrors(result) {
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR");
  assert.deepEqual(errors, []);
}
