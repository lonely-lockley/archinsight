import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  executeQuery,
  linkProject,
  selectGraph,
} from "../build/runtime/index.js";

const definitions = buildLanguageSnapshotResultFromSources([
  source("definitions.ai", `
define type AppEnvironment of Environment
    Compute compute
    NetworkConnection network

define operator Published of AsyncWire
    constructor publish Element
        on Element
        model = async
`),
], [coreLanguageSnapshot]);
assertNoErrors(definitions.diagnostics);

const linked = linkProject({
  snapshot: definitions.snapshot,
  sources: [
    infrastructure("cluster_a", "k8s_a", "net_a", "A"),
    infrastructure("cluster_b", "k8s_b", "net_b", "B"),
    source("model.ai", `
context shop

deploymentProfile regional
    appliesTo:
        production from cluster_a
        production from cluster_b

    runsOn compute

system storefront
    name = Storefront

    service producer
        name = Producer
        deployment:
            uses regional

    service consumer
        name = Consumer
        deployment:
            uses regional
        links:
            publish producer
                via = orders.created
                deployment:
                    uses network
`),
  ],
});
assertNoErrors(linked.diagnostics);

assertParity({
  where: "infrastructure IN service.runsOn",
  graphReturn: "service, infrastructure",
  tableReturn: "elementId(service) AS service, elementId(infrastructure) AS infrastructure",
  expectedGraphIds: ["cluster_a/k8s_a", "cluster_b/k8s_b", "shop/consumer", "shop/producer"],
  expectedRows: [
    ["shop/consumer", "cluster_a/k8s_a"],
    ["shop/consumer", "cluster_b/k8s_b"],
    ["shop/producer", "cluster_a/k8s_a"],
    ["shop/producer", "cluster_b/k8s_b"],
  ],
  matches: `MATCH (service:ContainerElement)
MATCH (infrastructure:InfrastructureComponent)`,
});

assertParity({
  where: "compute IN network.runsOn",
  graphReturn: "network, compute",
  tableReturn: "elementId(network) AS network, elementId(compute) AS compute",
  expectedGraphIds: ["cluster_a/k8s_a", "cluster_a/net_a", "cluster_b/k8s_b", "cluster_b/net_b"],
  expectedRows: [
    ["cluster_a/net_a", "cluster_a/k8s_a"],
    ["cluster_b/net_b", "cluster_b/k8s_b"],
  ],
  matches: `MATCH (network:NetworkConnection)
MATCH (compute:Compute)`,
});

assertParity({
  where: "network.runsOn = compute",
  graphReturn: "network, compute",
  tableReturn: "elementId(network) AS network, elementId(compute) AS compute",
  expectedGraphIds: ["cluster_a/k8s_a", "cluster_a/net_a", "cluster_b/k8s_b", "cluster_b/net_b"],
  expectedRows: [
    ["cluster_a/net_a", "cluster_a/k8s_a"],
    ["cluster_b/net_b", "cluster_b/k8s_b"],
  ],
  matches: `MATCH (network:NetworkConnection)
MATCH (compute:Compute)`,
});

assertParity({
  where: "network.runsOn IN ['cluster_a/k8s_a']",
  graphReturn: "network",
  tableReturn: "elementId(network) AS network",
  expectedGraphIds: ["cluster_a/net_a"],
  expectedRows: [["cluster_a/net_a"]],
  matches: "MATCH (network:NetworkConnection)",
});

assertParity({
  where: "infrastructure IN event.uses",
  graphReturn: "consumer, event, producer, infrastructure",
  tableReturn: "elementId(consumer) AS consumer, elementId(infrastructure) AS infrastructure",
  expectedGraphIds: ["cluster_a/net_a", "cluster_b/net_b", "shop/consumer", "shop/producer"],
  expectedRows: [
    ["shop/consumer", "cluster_a/net_a"],
    ["shop/consumer", "cluster_b/net_b"],
  ],
  matches: `MATCH (consumer:Element)-[event:REFERENCES]->(producer:Element)
MATCH (infrastructure:InfrastructureComponent)`,
});

assertParity({
  where: "event IS AsyncWire",
  graphReturn: "consumer, event, producer",
  tableReturn: "elementId(consumer) AS consumer, event.type AS type",
  expectedGraphIds: ["shop/consumer", "shop/producer"],
  expectedRows: [["shop/consumer", "Published"]],
  matches: "MATCH (consumer:Element)-[event:REFERENCES]->(producer:Element)",
});

assertParity({
  where: "compute IS InfrastructureComponent",
  graphReturn: "compute",
  tableReturn: "elementId(compute) AS compute",
  expectedGraphIds: ["cluster_a/k8s_a", "cluster_b/k8s_b"],
  expectedRows: [["cluster_a/k8s_a"], ["cluster_b/k8s_b"]],
  matches: "MATCH (compute:Compute)",
});

const placements = executeQuery(linked, {}, `
MATCH (service:ContainerElement)
WHERE elementId(service) = 'shop/consumer'
UNWIND service.runsOn AS infrastructure
RETURN TABLE infrastructure
`);
assert.equal(placements.kind, "table");
assert.equal(placements.columns[0]?.type, "node");
assert.deepEqual(placements.rows.map(([node]) => ({ id: node.id, type: node.type, labels: node.labels })), [
  { id: "cluster_a/k8s_a", type: "Compute", labels: ["Element", "Compute", "InfrastructureComponent", "DeploymentElement", "BoundaryElement"] },
  { id: "cluster_b/k8s_b", type: "Compute", labels: ["Element", "Compute", "InfrastructureComponent", "DeploymentElement", "BoundaryElement"] },
]);

const missing = executeQuery(linked, {}, `
MATCH (service:ContainerElement)
MATCH (infrastructure:InfrastructureComponent)
WHERE infrastructure IN service.missing
RETURN TABLE elementId(service) AS service
`);
assert.deepEqual(missing.kind === "table" ? missing.rows : [], []);

console.log("query predicate parity contracts passed");

function assertParity({ matches, where, graphReturn, tableReturn, expectedGraphIds, expectedRows }) {
  const graph = selectGraph(linked, {}, `${matches}\nWHERE ${where}\nRETURN ${graphReturn}`);
  assert.deepEqual(Object.keys(graph.elements).sort(), expectedGraphIds);
  const table = executeQuery(linked, {}, `${matches}\nWHERE ${where}\nRETURN TABLE ${tableReturn}`);
  assert.deepEqual(
    table.kind === "table" ? [...table.rows].sort(compareRows) : [],
    [...expectedRows].sort(compareRows),
  );
}

function compareRows(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function infrastructure(context, compute, network, label) {
  return source(`infra-${label.toLowerCase()}.ai`, `
environment ${context}
    name = Cluster ${label}

deployment production
    compute:
        compute ${compute}
            name = Kubernetes ${label}

    network:
        networkConnection ${network}
            name = Network ${label}
            runsOn:
                ${compute}
            projection:
                source $from originalLink target $to
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
