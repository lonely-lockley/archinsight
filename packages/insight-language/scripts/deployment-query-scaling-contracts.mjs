import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
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
                    uses network

    service api
        name = API
        deployment:
            uses global
        links:
            -> worker
                deployment:
                    uses network

    service worker
        name = Worker
        deployment:
            uses global
        links:
            -> database
                deployment:
                    uses network

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
const selectedEnvironmentCost = minimumExpansionBudget(scope, placementFirstQuery);
const allEnvironmentCost = minimumExpansionBudget(
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

console.log("deployment query scaling contracts passed");

function minimumExpansionBudget(queryScope, query) {
  let lower = 1;
  let upper = 4_000_000;
  while (lower < upper) {
    const candidate = Math.floor((lower + upper) / 2);
    try {
      selectGraph(result, queryScope, query, { limits: { maxExpansions: candidate } });
      upper = candidate;
    } catch (error) {
      if (!/AIQ_BUDGET_EXCEEDED.*maxExpansions/.test(String(error))) throw error;
      lower = candidate + 1;
    }
  }
  return lower;
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
            projection:
                source $from originalLink target $to
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
`);
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
