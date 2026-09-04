import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  selectGraph,
} from "../build/runtime/index.js";

const definitions = buildLanguageSnapshotResultFromSources([
  source("definitions.ai", `
define type AppEnvironment of Environment
    Compute compute
    Storage storage
    NetworkConnection network
`),
], [coreLanguageSnapshot]);
assertNoErrors(definitions.diagnostics);

const result = linkProject({
  snapshot: definitions.snapshot,
  sources: [
    source("infra.ai", `
environment eu
    name = Europe

deployment production
    compute:
        compute kubernetes
            name = Kubernetes

    storage:
        storage database
            name = Database
            runsOn:
                kubernetes
            projection:
                source $from originalLink target $this

    network:
        networkConnection service_network
            name = Service network
            runsOn:
                kubernetes
            projection:
                source $from originalLink target $to
`),
    source("model.ai", `
context shop

deploymentProfile regional
    appliesTo:
        production from eu

    runsOn compute

external system vendor
    name = Vendor

system storefront
    name = Storefront

    service web
        name = Web
        deployment:
            uses regional
        links:
            -> api
                technology = gRPC
                deployment:
                    uses network

    service api
        name = API
        deployment:
            uses regional
            uses storage
        links:
            -> vendor
                technology = HTTPS
                deployment:
                    uses network
`),
  ],
});
assertNoErrors(result.diagnostics);

const referenceIds = new Set(result.graph.relationsOfKind("REFERENCES"));
assert.deepEqual(
  referenceIds,
  new Set(result.edges.map((edge) => edge.id)),
  "authored and projected relationships must use the same IDs in the linked model and graph",
);
assert.equal(referenceIds.size, result.edges.length, "projected relationships must have unique IDs");

const allProjected = selectByProjectionRoot("CONTAINS '/'");
assert.equal(allProjected.edges.length, 3, "a true metadata predicate must keep every projected edge");
assert.deepEqual(
  new Set(allProjected.edges.map((item) => item.edge.projectionRoot)),
  new Set(["eu/service_network", "eu/database"]),
  "relationship filtering and JSON output must expose the same projection roots",
);

const storageOnly = selectByProjectionRoot("= 'eu/database'");
assert.deepEqual(
  storageOnly.edges.map((item) => `${item.source}->${item.target}`),
  ["shop/api->eu/database"],
  "an exact metadata predicate must select only the matching physical path",
);
assert.equal(storageOnly.edges[0]?.edge.projectionRoot, "eu/database");

const missing = selectByProjectionRoot("= 'missing/environment'");
assert.equal(missing.edges.length, 0, "an explicit relationship match with no results must not inject authored edges");

const nodeOnly = selectGraph(
  result,
  { context: "shop", tab: "model.ai" },
  "MATCH (node:ContainerElement) WHERE node.sourceIdentity = $tab RETURN node",
);
assert.deepEqual(
  nodeOnly.edges.map((item) => `${item.source}->${item.target}`),
  ["shop/web->shop/api"],
  "a node-only query must continue to complete authored edges between selected nodes",
);

console.log("relationship metadata query contracts passed");

function selectByProjectionRoot(predicate) {
  return selectGraph(result, { context: "shop", tab: "model.ai" }, `
MATCH (node:Element)
WHERE node.sourceIdentity = $tab
  AND (node IS InfrastructureComponent
    OR ((node IS ContainerElement OR node IS External) AND node.deployed = true))
OPTIONAL MATCH ROLLUP (node)-[projectedLink:REFERENCES {projected}]-(projectedPeer:Element)
WHERE (projectedPeer IS InfrastructureComponent
   OR (projectedPeer IS ContainerElement AND projectedPeer.deployed = true)
   OR projectedPeer IS External)
  AND projectedPeer.id <> node.id
  AND projectedLink.projectionRoot ${predicate}
RETURN node, projectedLink, projectedPeer
  `);
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"),
    [],
  );
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
