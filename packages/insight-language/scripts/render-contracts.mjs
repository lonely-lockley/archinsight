import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  mergeLanguageSnapshots,
  renderGraphviz,
  selectGraph,
} from "../build/runtime/index.js";

const cases = [
  rendersFixedContextCypherProjection,
  rendersFixedSourceIdentityCypherProjection,
  quotesGraphIdsThatAreNotPlainIdentifiers,
  rendersEdgesFromGroupOwnersThroughClusterAnchors,
  rendersParallelEdgesBetweenSameElementsAsDistinctEdges,
  rendersRelativeExternalElementsWithoutTheirViewClusters,
  preservesProjectPresentationWhenElementIsRelativelyExternal,
  rendersScalarGroupByAsSyntheticCluster,
  rendersNestedAttributeObjectsAsNestedClusters,
  skipsElementsWithInvisibleGraphvizPresentation,
  rendersSelectedContextAsClusterForWideDefaultQuery,
  rendersStorageWithDatabaseShape,
  rendersBrokersAsDashedBoxes,
  rendersSystemsServicesAndComponentsAsRoundedBoxes,
  rendersGroupOwnerClusterWhenOwnerIsNotReturned,
  wrapsLongDisplayTextBlocks,
  rendersLegacyAnnotationsAsGraphvizOverrides,
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
  console.log("render contract fixtures passed");
}

function rendersFixedContextCypherProjection() {
  const result = linkWithCore(
    source("source.ai", `
context source

system app
    name = App
    links:
        -> google from external_systems
            technology = HTTP
`),
    source("external.ai", `
context external_systems

external system google
    name = Google
    description = OAuth provider
`),
  );
  const projection = selectGraph(result, { context: "source" }, `
MATCH (n:System)
OPTIONAL MATCH (n)-[r]->(m:System)
WHERE n.context = $context
RETURN n, r, m
`);
  const dot = renderGraphviz(result, projection, "light");

  assertNoErrors(result);
  assert.equal(Object.keys(projection.elements).length, 2);
  assert.equal(projection.edges.length, 1);
  assert(dot.includes('digraph "source"'));
  assert(dot.includes("App"));
  assert(dot.includes("Google"));
  assert(dot.includes("HTTP"));
  assert(dot.includes("\"source__app\" -> \"external_systems__google\""));
  assert(dot.includes("rankdir=TB"));
  assert(dot.includes("shape=\"box\""));
}

function rendersFixedSourceIdentityCypherProjection() {
  const result = linkWithCore(
    source("source.ai", `
context source
    name = Source Context

import google from context external_systems

system app
    name = App

    service api # API note
        name = API
        technology = Java
        links:
            -> database # Edge note
                technology = JDBC
            -> google
                technology = HTTP

    container database
        technology = Postgres
`),
    source("external.ai", `
context external_systems

external system google
    name = Google
    description = OAuth provider
`),
  );
  const projection = selectGraph(result, { context: "source", tab: "source.ai" }, `
MATCH (n:Element)
WHERE n.sourceIdentity = $tab
OPTIONAL MATCH (n:Element)-[r]->(m:Element)
GROUP BY n.parent
RETURN n, r, m
`);
  const dot = renderGraphviz(result, projection, "light");

  assertNoErrors(result);
  assert.equal(Object.keys(projection.elements).length, 4);
  assert.equal(projection.edges.length, 2);
  assert.equal(projection.groups.length, 2);
  assert(dot.includes('subgraph "cluster_source"'));
  assert(dot.includes("Source Context"));
  assert(dot.includes('subgraph "cluster_source__app"'));
  assert(dot.includes("URL=\"insight://goto?source=source.ai&line="));
  assert(dot.includes("style=\"dotted\""));
  assert(dot.includes("API"));
  assert(dot.includes("API note"));
  assert(dot.includes("Edge note"));
  assert(dot.includes("cellborder=\"1\""));
  assert(dot.includes("width=\"120\" height=\"44\""));
  assert(!dot.includes("fixedsize=\"true\""));
  assert(dot.includes("shape=\"note\""));
  assert(dot.includes("fillcolor=\"#faf6a2\""));
  assert(dot.includes("dir=\"none\""));
  assert(dot.includes("\"source__api_note\" -> \"source__api\""));
  assert(/"source__api_note" \[.*URL="insight:\/\/goto\?source=source\.ai&line=\d+&column=\d+"/.test(dot));
  assert(dot.includes("Postgres"));
  assert(dot.includes("Google"));
  assert(dot.includes("JDBC"));
  assert(dot.includes("HTTP"));
  assert(dot.includes("\"source__api\" -> \"source__database\""));
  assert(dot.includes("\"source__api\" -> \"external_systems__google\""));
}

function quotesGraphIdsThatAreNotPlainIdentifiers() {
  const result = linkProject({
    snapshot: coreLanguageSnapshot,
    sources: [
      source("definitions.ai", `
define type Widget of BoundaryElement
    constructor widget

    required Text name
`),
    ],
  });
  const projection = selectGraph(result, { context: "definitions.ai" }, "MATCH (n:Context) WHERE n.context = $context RETURN n");
  const dot = renderGraphviz(result, projection, "light");

  assertNoErrors(result);
  assert(dot.startsWith('digraph "definitions.ai" {'));
}

function rendersEdgesFromGroupOwnersThroughClusterAnchors() {
  const result = linkWithCore(
    source("source.ai", `
context source

import google from context external_systems

system app
    name = App
    links:
        -> google
            technology = HTTP

    service api
        name = API
`),
    source("external.ai", `
context external_systems

external system google
    name = Google
    description = OAuth provider
`),
  );
  const projection = selectGraph(result, { context: "source", tab: "source.ai" }, `
MATCH (n:Element)
OPTIONAL MATCH (n)-[r]->(m)
WHERE n.sourceIdentity = $tab
GROUP BY n.parent
RETURN n, r, m
`);
  const dot = renderGraphviz(result, projection, "light");

  assertNoErrors(result);
  assert(dot.includes("compound=true"));
  assert(dot.includes("\"source__app__cluster_anchor\" [label=\"\",shape=\"point\",width=\"0\",height=\"0\",style=\"invis\"]"));
  assert(dot.includes("\"source__app__cluster_anchor\" -> \"external_systems__google\""));
  assert(dot.includes("ltail=\"cluster_source__app\""));
  assert(!dot.includes("\"source__app\" -> \"external_systems__google\""));
}

function rendersParallelEdgesBetweenSameElementsAsDistinctEdges() {
  const result = linkWithCore(source("source.ai", `
context source

system app
    name = App
    links:
        -> target
        -> target

system target
    name = Target
`));
  const projection = selectGraph(result, { context: "source", tab: "source.ai" }, `
MATCH (n)
OPTIONAL MATCH (n)-[r]->(m)
WHERE n.sourceIdentity = $tab
RETURN n, r, m
`);
  const dot = renderGraphviz(result, projection, "light");

  assertNoErrors(result);
  assert.equal(projection.edges.length, 2);
  assert.equal(countOccurrences(dot, "\"source__app\" -> \"source__target\""), 2);
  assert.equal(countOccurrences(dot, "id=\"edge__"), 2);
  assert(dot.includes("URL=\"insight://goto?source=source.ai"));
  assert(dot.includes("&line="));
  assert(dot.includes("&column="));
  assert(dot.includes("concentrate=false"));
}

function rendersRelativeExternalElementsWithoutTheirViewClusters() {
  const result = linkWithCore(
    source("source.ai", `
context source

system app
    name = App
`),
    source("external.ai", `
context external_systems

import app from context source

system partner
    name = Partner
    links:
        -> app
`),
  );
  const projection = selectGraph(result, { context: "source" }, `
MATCH (n:Element)
WHERE n.context = $context
OPTIONAL MATCH (n)-[out]->(outNode:Element)
OPTIONAL MATCH (inNode:Element)-[in]->(n)
RETURN n, out, outNode, in, inNode
`);
  const dot = renderGraphviz(result, projection, "light");

  assertNoErrors(result);
  assert(projection.externalElements.includes("external_systems/partner"));
  assert(dot.includes("Partner"));
  assert(dot.includes("\"external_systems__partner\" ["));
  assert(dot.includes("fillcolor=\"#999999\""));
  assert(!dot.includes('subgraph "cluster_external_systems"'));
  assert(dot.includes("\"external_systems__partner\" -> \"source__app\""));
}

function preservesProjectPresentationWhenElementIsRelativelyExternal() {
  const result = linkWithCoreDefinitions(
    source("definitions.ai", `
define type PartnerActor of Actor
    constructor partnerActor
        kind = internal

define presentation PartnerActor
    header = name
    body = description

    light
        fill = "#123456"

    graphviz
        shape = ellipse
        style = filled,dashed
`),
    source("source.ai", `
context source

system app
    name = App
`),
    source("partner.ai", `
context partners

import app from context source

partnerActor vendor
    name = Vendor
    description = Identity provider
    links:
        -> app
`),
  );
  const projection = selectGraph(result, { context: "source" }, `
MATCH (n:Element)
WHERE n.context = $context
OPTIONAL MATCH (external:Element)-[incoming]->(n)
RETURN n, external, incoming
`);
  const dot = renderGraphviz(result, projection, "light");
  const vendor = dot.split("\n").find((line) => line.includes('"partners__vendor" ['));

  assertNoErrors(result);
  assert(projection.externalElements.includes("partners/vendor"));
  assert(vendor?.includes("Vendor"), vendor);
  assert(vendor?.includes("Identity provider"), vendor);
  assert(vendor?.includes('fillcolor="#999999"'), vendor);
  assert(vendor?.includes('shape="ellipse"'), vendor);
  assert(vendor?.includes('style="filled,dashed"'), vendor);
}

function rendersScalarGroupByAsSyntheticCluster() {
  const result = linkWithCore(source("source.ai", `
context source

system app
    name = App

    service api
        name = API
        technology = Java

    service worker
        name = Worker
        technology = Java
`));
  const projection = selectGraph(
    result,
    { context: "source" },
    "MATCH (n:Service) WHERE n.context = $context GROUP BY n.technology RETURN n",
  );
  const dot = renderGraphviz(result, projection, "light");

  assertNoErrors(result);
  assert.equal(projection.groups.length, 1);
  assert(dot.includes('subgraph "cluster_scalar__Java"'));
  assert(dot.includes("<b>Java</b>"));
  assert(dot.includes("\"source__api\" ["));
  assert(dot.includes("\"source__worker\" ["));
  assert(!dot.includes("\"scalar__Java\" ["));
  assert(!dot.includes("__cluster_anchor"));
}

function rendersNestedAttributeObjectsAsNestedClusters() {
  const snapshot = mergeLanguageSnapshots([
    coreLanguageSnapshot,
    buildLanguageSnapshotResultFromSources([source("definitions.ai", `
define type Test
    constructor test

    required Text ggg

define type TestContainer of BoundaryElement
    constructor cont

    required Test kkk
    required List of TestContainer lll

define presentation Test
    header = ggg

    light
        fill = "#438dd5"
        stroke = "#f4f4f4"
        text = "#f4f4f4"

    dark
        fill = "#5A189A"
        stroke = "#2e2e2e"
        text = "#f4f4f4"

    graphviz
        shape = box
        style = filled
`)]).snapshot,
  ]);
  const result = linkProject({
    snapshot,
    sources: [source("source.ai", `
context f

cont l
    kkk:
        test _
            ggg = lslkfjbv
    lll:
        cont i
            kkk:
                test _
                    ggg = eufbv
            lll:
                # empty
`)],
  });
  const projection = selectGraph(
    result,
    { context: "f", tab: "source.ai" },
    "MATCH (n:Element) WHERE n.sourceIdentity = $tab GROUP BY n.parent RETURN n",
  );
  const dot = renderGraphviz(result, projection, "light");

  assertNoErrors(result);
  assert.equal(projection.groups.length, 3);
  assert(dot.includes('\n  subgraph "cluster_f"'));
  assert(dot.includes('\n    subgraph "cluster_f__l"'));
  assert(dot.includes('\n      subgraph "cluster_f__i"'));
  assert(!dot.includes('\n  subgraph "cluster_f__l"'));
  assert(!dot.includes('\n  subgraph "cluster_f__i"'));
  assert(dot.includes("lslkfjbv"));
  assert(dot.includes("eufbv"));
}

function skipsElementsWithInvisibleGraphvizPresentation() {
  const snapshot = mergeLanguageSnapshots([
    coreLanguageSnapshot,
    buildLanguageSnapshotResultFromSources([source("definitions.ai", `
define type HiddenSystem of System
    constructor hidden

define presentation HiddenSystem
    header = name

    graphviz
        visible = false
`)]).snapshot,
  ]);
  const result = linkProject({
    snapshot,
    sources: [source("source.ai", `
context source

system app
    name = App
    links:
        -> secret

hidden secret
    name = Secret
    kind = internal
`)],
  });
  const projection = selectGraph(result, { context: "source" }, `
MATCH (n:System)
OPTIONAL MATCH (n)-[r]->(m:System)
WHERE n.context = $context
RETURN n, r, m
`);
  const dot = renderGraphviz(result, projection, "light");

  assertNoErrors(result);
  assert(dot.includes("App"));
  assert(!dot.includes("Secret"));
  assert(!dot.includes("\"source__secret\" ["));
  assert(!dot.includes("\"source__app\" -> \"source__secret\""));
}

function rendersSelectedContextAsClusterForWideDefaultQuery() {
  const result = linkWithCore(source("source.ai", `
context source

system app
    name = App

    service api
        name = API
`));
  const projection = selectGraph(result, { context: "source", tab: "source.ai" }, `
MATCH (n)
OPTIONAL MATCH (n)-[r]->(m)
WHERE n.context = $context
GROUP BY n.parent
RETURN n, r, m
`);
  const dot = renderGraphviz(result, projection, "light");

  assertNoErrors(result);
  assert(dot.includes('\n  subgraph "cluster_source"'));
  assert(dot.includes('\n    subgraph "cluster_source__app"'));
  assert(!dot.includes("\"source\" ["));
  assert(dot.includes("App"));
  assert(dot.includes("API"));
}

function rendersStorageWithDatabaseShape() {
  const result = linkWithCoreDefinitions(
    source("definitions.ai", `
extend type Environment
    Storage storage
`),
    source("source.ai", `
context source

environment prod
    name = Production

    storage:
        storage db
            name = Database
`),
  );
  const projection = selectGraph(result, { context: "source" }, "MATCH (n:Storage) WHERE n.context = $context RETURN n");
  assertNoErrors(result);
  const dot = renderGraphviz(result, projection, "light");

  assert(dot.includes("Database"));
  assert(dot.includes("shape=\"cylinder\""));
}

function rendersBrokersAsDashedBoxes() {
  const result = linkWithCoreDefinitions(
    source("definitions.ai", `
extend type Environment
    Broker broker
`),
    source("source.ai", `
context source

environment prod
    name = Production

    broker:
        broker kafka
            name = Kafka
`),
  );
  const projection = selectGraph(result, { context: "source" }, "MATCH (n:Broker) WHERE n.context = $context RETURN n");
  assertNoErrors(result);
  const dot = renderGraphviz(result, projection, "light");

  assert(dot.includes("Kafka"));
  assert(dot.includes("shape=\"box\""));
  assert(dot.includes("style=\"filled,dashed\""));
  assert(!dot.includes("style=\"filled,rounded\""));
}

function rendersSystemsServicesAndComponentsAsRoundedBoxes() {
  const result = linkWithCore(source("source.ai", `
context source

system app
    name = App

    service api
        name = API

        component handler
            name = Handler
`));
  const projection = selectGraph(result, { context: "source" }, "MATCH (n:Element) WHERE n.context = $context RETURN n");
  const dot = renderGraphviz(result, projection, "light");

  assertNoErrors(result);
  assert(dot.includes("\"source__app\" ["));
  assert(dot.includes("shape=\"box\""));
  assert(!dot.includes("shape=\"component\""));
  assert(!dot.includes("penwidth=\"1.8\""));
  assert(dot.includes("<font point-size=\"9px\">{system}</font>"));
  assert(dot.includes("\"source__api\" ["));
  assert(dot.includes("style=\"filled,rounded\""));
  assert(dot.includes("<font point-size=\"9px\">{service}</font>"));
  assert(dot.includes("\"source__handler\" ["));
  assert(!dot.includes("style=\"filled,rounded,dashed\""));
  assert(dot.includes("<font point-size=\"9px\">{component}</font>"));
}

function rendersGroupOwnerClusterWhenOwnerIsNotReturned() {
  const result = linkWithCore(source("source.ai", `
context source

system app
    name = App
`));
  const projection = selectGraph(
    result,
    { context: "source" },
    "MATCH (n:System) WHERE n.context = $context GROUP BY n.parent RETURN n",
  );
  const dot = renderGraphviz(result, projection, "light");

  assertNoErrors(result);
  assert(dot.includes('\n  subgraph "cluster_source"'));
  assert(!dot.includes("\"source\" ["));
  assert(dot.includes("App"));
}

function wrapsLongDisplayTextBlocks() {
  const result = linkWithCore(source("source.ai", `
context source

system app # Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu
    name = Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu
    technology = Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu
    description = Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu
    links:
        -> target # Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu
            technology = Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu
            call = Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu
            description = Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu

system target
    name = Target
`));
  const projection = selectGraph(result, { context: "source" }, `
MATCH (n:System)
OPTIONAL MATCH (n)-[r]->(m:System)
WHERE n.context = $context
RETURN n, r, m
`);
  const dot = renderGraphviz(result, projection, "light");

  assertNoErrors(result);
  assert(dot.includes("Alpha beta gamma delta epsilon zeta eta theta iota<br/>kappa lambda mu"));
  assert.equal(countOccurrences(dot, "Alpha beta gamma delta epsilon zeta eta theta iota<br/>kappa lambda mu"), 8);
  assert(dot.includes("<font color=\"#000000\" point-size=\"10px\">Alpha beta gamma delta epsilon zeta eta theta iota<br/>kappa lambda mu</font>"));
}

function rendersLegacyAnnotationsAsGraphvizOverrides() {
  const result = linkWithCore(source("source.ai", `
context source

system app
    name = App

    @planned
    service api
        name = API
        links:
            @attribute(style=dotted,arrowhead=diamond)
            -> database
                technology = JDBC

    @deprecated
    container database
        technology = Postgres
`));
  const projection = selectGraph(result, { context: "source", tab: "source.ai" }, `
MATCH (n:Element)
OPTIONAL MATCH (n:Element)-[r]->(m:Element)
WHERE n.sourceIdentity = $tab
RETURN n, r, m
`);
  const dot = renderGraphviz(result, projection, "light");

  assertNoErrors(result);
  assert(dot.includes("fillcolor=\"#0e8006\""));
  assert(dot.includes("fillcolor=\"#a80808\""));
  assert(dot.includes("style=\"dotted\""));
  assert(dot.includes("arrowhead=\"diamond\""));
}

function linkWithCore(...sources) {
  return linkProject({
    snapshot: coreLanguageSnapshot,
    sources,
  });
}

function linkWithCoreDefinitions(definitions, ...sources) {
  const snapshot = mergeLanguageSnapshots([
    coreLanguageSnapshot,
    buildLanguageSnapshotResultFromSources([definitions], [coreLanguageSnapshot]).snapshot,
  ]);
  return linkProject({
    snapshot,
    sources,
  });
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

function countOccurrences(value, needle) {
  let count = 0;
  let offset = 0;
  while ((offset = value.indexOf(needle, offset)) >= 0) {
    count++;
    offset += needle.length;
  }
  return count;
}
