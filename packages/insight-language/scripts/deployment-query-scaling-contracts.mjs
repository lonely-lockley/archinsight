import assert from "node:assert/strict";
import { minimumExpansionBudget } from "./query-expansion-budget.mjs";
import { readFileSync } from "node:fs";
import {
  BUILTIN_VIEW_QUERIES,
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  executeQuery,
  linkProject,
  selectGraph,
} from "../build/runtime/index.js";

const reorderedQuery = readFileSync(
  new URL("../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/deployment-container.aiq", import.meta.url),
  "utf8",
);

const environmentCount = 13;
const environmentIds = Array.from({ length: environmentCount }, (_, index) => `r${String(index).padStart(2, "0")}`);
const definitions = source("definitions.ai", `
define type AppEnvironment of Environment
    Compute compute
    NetworkConnection network
    InfrastructureComponent storage
    InfrastructureComponent observability
    InfrastructureComponent publicGateway
    InfrastructureComponent privateGateway
    InfrastructureComponent queue
`);
const sources = [
  definitions,
  ...environmentIds.map(environment),
  source("model.ai", `
context shop

deploymentProfile global
    appliesTo:
${environmentIds.map((id) => `        production from ${id}`).join("\n")}
    runsOn compute

system storefront
    name = Storefront

    service web
        name = Web
        deployment:
            uses global
        links:
            -> api
                deployment:
                    route clusterLocal

    service api
        name = API
        deployment:
            uses global
        links:
            -> worker
                deployment:
                    route clusterLocal

    service worker
        name = Worker
        deployment:
            uses global
        links:
            -> database
                deployment:
                    route clusterLocal

    service database
        name = Database
        deployment:
            uses global
`),
];
const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
assertNoErrors(snapshot.diagnostics);
const result = linkProject({ snapshot: snapshot.snapshot, sources });
assertNoErrors(result.diagnostics);

const placementFirstQuery = `
MATCH (node:Element)
WHERE node.sourceIdentity = $tab
  AND (node IS InfrastructureComponent
    OR node IS SystemElement
    OR ((node IS ContainerElement OR node IS External) AND node.deployed = true))
  AND node.context = node.context
OPTIONAL MATCH (deploymentTarget:InfrastructureComponent)
WHERE deploymentTarget IN node.uses OR deploymentTarget IN node.runsOn
OPTIONAL MATCH ROLLUP (node)-[projectedLink:REFERENCES {projected}]-(projectedPeer:Element)
WHERE (projectedPeer IS InfrastructureComponent
   OR (projectedPeer IS ContainerElement AND projectedPeer.deployed = true)
   OR projectedPeer IS SystemElement
   OR projectedPeer IS External)
  AND projectedPeer.id <> node.id
OPTIONAL MATCH (node)-[directDeploymentLink:REFERENCES]-(directDeploymentTarget:Element)
WHERE node IS InfrastructureComponent
  AND (directDeploymentTarget IS InfrastructureComponent OR directDeploymentTarget IS External)
GROUP BY node.runsOn
RETURN node, deploymentTarget, projectedLink, projectedPeer, directDeploymentLink, directDeploymentTarget
`;

const scope = { context: "shop", tab: "model.ai", view: "deployment-container", environment: "r00" };
const selectedEnvironmentCost = expansionCost(scope, placementFirstQuery);
const allEnvironmentCost = expansionCost(
  { context: "shop", tab: "model.ai", view: "deployment" },
  placementFirstQuery,
);
assert(
  allEnvironmentCost < 10_000,
  `independent optional clauses must not multiply their discovery cost, got ${allEnvironmentCost} expansions`,
);
assert(
  selectedEnvironmentCost < allEnvironmentCost,
  `D2 discovery must apply its environment before expansion (${selectedEnvironmentCost} >= ${allEnvironmentCost})`,
);

const graph = selectGraph(result, scope, placementFirstQuery, { limits: { maxExpansions: 5_000 } });
const reorderedGraph = selectGraph(result, scope, reorderedQuery, { limits: { maxExpansions: 5_000 } });
assert.deepEqual(graphSignature(graph), graphSignature(reorderedGraph), "safe OPTIONAL MATCH reordering must preserve the graph");
assert(Object.keys(graph.elements).some((id) => id.includes("r00")));
assert.equal(Object.keys(graph.elements).some((id) => id.includes("r01")), false);

// Each client placement calls its corresponding API placement. The graph needs both
// collections of matches, even though it never displays their Cartesian product.
for (const count of [8, 68]) {
  const ids = Array.from({ length: count }, (_, i) => `r${i}`);
  const tab = "placements.ai";
  const sources = [definitions, ...ids.map(environment), source(tab, `
context placements
deploymentProfile everywhere
    appliesTo:
${ids.map((id) => `        production from ${id}`).join("\n")}
    runsOn compute
    uses storage

system caller
    name = Caller
    service client
        name = Client
        deployment:
            uses everywhere
        links:
            -> api
                deployment:
                    route clusterLocal

system receiver
    name = Receiver
    service api
        name = API
        deployment:
            uses everywhere
`)];
  const linked = linkProject({ snapshot: snapshot.snapshot, sources });
  assertNoErrors(linked.diagnostics);
  const scope = { context: "placements", tab, view: "deployment-system" };
  const query = BUILTIN_VIEW_QUERIES[scope.view];
  const graph = selectGraph(linked, scope, query, { limits: { maxRows: 24 * count } });
  assert.equal(graph.edges.length, count);
  assert.equal(graph.groups.length, count);
  if (count === 8) {
    // A subsequent match consumes the bindings, forcing ordinary row semantics.
    const fullJoin = query.replace("GROUP BY", "MATCH (node)\nGROUP BY");
    assert.deepEqual(graph, selectGraph(linked, scope, fullJoin));
  }
}

// Growing both the open tab and the graph must not rescan every relationship per seed.
const d1Scope = { context: "shop", tab: "chain.ai", view: "deployment-system" };
const d1 = BUILTIN_VIEW_QUERIES[d1Scope.view];
const chainBudget = expansionCost(d1Scope, d1, linkChain(12));
const chainGraph = selectGraph(linkChain(48), d1Scope, d1, { limits: { maxExpansions: chainBudget * 4 } });
const systemName = (id) => id.split("@@")[0];
assert.deepEqual(
  chainGraph.edges.map((edge) => [systemName(edge.source), systemName(edge.target)]).sort(),
  Array.from({ length: 47 }, (_, index) => [`shop/system_${index}`, `shop/system_${index + 1}`]).sort(),
);

const rebound = executeQuery(result, scope, `
  MATCH (caller:Service)-[wire:REFERENCES]->(callee:Service)
  MATCH ROLLUP (caller)-[wire:REFERENCES]->(callee)
  RETURN TABLE elementId(caller) AS caller, elementId(callee) AS callee ORDER BY caller
`);
assert.deepEqual(rebound.rows, [["shop/api", "shop/worker"], ["shop/web", "shop/api"], ["shop/worker", "shop/database"]]);

const pairs = "MATCH (a:Service) OPTIONAL MATCH (b:Service)";
const tablePairs = executeQuery(result, {}, `${pairs} RETURN TABLE count(*) AS pairs`);
assert.deepEqual(tablePairs.rows, [[16]]);
const connectedPairs = selectGraph(result, {}, `
  ${pairs}
  MATCH (b)-[wire:REFERENCES]->(a)
  RETURN a, b, wire
`);
assert.deepEqual(connectedPairs.edges.map(({ source, target }) => [source, target]).sort(), rebound.rows);

// A failed OPTIONAL MATCH leaves null bindings, which a subsequent ROLLUP must not reopen.
for (const rollup of [
  "(peer)-[found:REFERENCES {projected}]->(missing)",
  "(known)-[absent:REFERENCES {projected}]->(peer)",
]) {
  const table = executeQuery(result, scope, `
    MATCH (known:Service {id: web})
    OPTIONAL MATCH (known)-[absent:REFERENCES]->(missing:Service {id: unknown})
    MATCH ROLLUP ${rollup}
    RETURN TABLE count(*) AS matches
  `);
  assert.deepEqual(table.rows, [[0]]);
}

console.log("deployment query scaling contracts passed");

function linkChain(size) {
  const systems = Array.from({ length: size }, (_, index) => `
system system_${index}
    name = System ${index}
    service api_${index}
        name = API ${index}
        deployment:
            uses local
${index + 1 === size ? "" : `        links:
            -> api_${index + 1}
                deployment:
                    route clusterLocal`}`);
  const sources = [definitions, environment("r00"), source("chain.ai", `
context shop
deploymentProfile local
    appliesTo:
        production from r00
    runsOn compute
${systems.join("\n")}`)];
  const chain = linkProject({ snapshot: snapshot.snapshot, sources });
  assertNoErrors(chain.diagnostics);
  return chain;
}

function expansionCost(scope, query, linked = result) {
  return minimumExpansionBudget((maxExpansions) => selectGraph(linked, scope, query, { limits: { maxExpansions } }), 4_000_000);
}

function graphSignature(graph) {
  return {
    elements: Object.keys(graph.elements).sort(),
    externalElements: [...graph.externalElements].sort(),
    groups: graph.groups
      .map((group) => `${group.owner}:${[...group.elements].sort().join(",")}`)
      .sort(),
    edges: graph.edges
      .map((edge) => `${edge.source}>${edge.target}>${edge.edge.id}`)
      .sort(),
  };
}

function environment(id) {
  return source(`${id}.ai`, `
environment ${id}
    name = Region ${id}

deployment production
    compute:
        compute compute
            name = Compute
    network:
        networkConnection network
            name = Network
            route:
                $from originalLink $to
    storage:
        infrastructureComponent storage
            name = Storage
    observability:
        infrastructureComponent observability
            name = Observability
    publicGateway:
        infrastructureComponent public_gateway
            name = Public Gateway
    privateGateway:
        infrastructureComponent private_gateway
            name = Private Gateway
    queue:
        infrastructureComponent queue
            name = Queue
route clusterLocal
    outbound:
        $from originalLink $to
`);
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
