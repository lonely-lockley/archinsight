import assert from "node:assert/strict";
import {
  coreLanguageSnapshot,
  executeQuery,
  formatQueryTableCsv,
  linkProject,
  parseQuery,
  selectGraph,
} from "../build/runtime/index.js";

const linked = linkProject({
  snapshot: coreLanguageSnapshot,
  sources: [{ sourceName: "architecture.ai", source: `
context shared

system app
    name = App

    service producer
        name = Producer

    service consumer
        name = Consumer
        links:
            -> producer
            ~> producer
                via = orders.created
                technology = Kafka

    service isolated
        name = Isolated
` }],
});
assert.deepEqual(linked.diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);

const inventory = executeQuery(linked, { context: "shared" }, `
MATCH (service:Service)
WHERE service.context = $context
RETURN TABLE elementId(service) AS service, service.type AS type
ORDER BY service
`);
assert.equal(inventory.kind, "table");
assert.deepEqual(inventory.columns.map((column) => column.name), ["service", "type"]);
assert.deepEqual(inventory.rows, [
  ["shared/consumer", "Service"],
  ["shared/isolated", "Service"],
  ["shared/producer", "Service"],
]);
assert.equal(inventory.metadata.rowCount, 3);

const allSystems = executeQuery(linked, {}, `
MATCH (system:System)
RETURN TABLE elementId(system) AS id, system.name AS name
ORDER BY id
`);
assert.deepEqual(allSystems.kind === "table" ? allSystems.rows : [], [["shared/app", "App"]]);

const systemType = executeQuery(linked, {}, `
MATCH (type:Type)
WHERE type.type = 'System'
RETURN TABLE type.type AS type
`);
assert.deepEqual(systemType.kind === "table" ? systemType.rows : [], [["System"]]);

const selected = executeQuery(linked, {}, `
MATCH (service:Service)
WHERE elementId(service) = $element
RETURN TABLE elementId(service) AS service
`, { element: "shared/consumer" });
assert.deepEqual(selected.kind === "table" ? selected.rows : [], [["shared/consumer"]]);
const minimumExpansionBudget = (query, parameters = {}) => {
  let lower = 1;
  let upper = 4096;
  while (lower < upper) {
    const candidate = Math.floor((lower + upper) / 2);
    try {
      executeQuery(linked, {}, query, parameters, { limits: { maxExpansions: candidate } });
      upper = candidate;
    } catch (error) {
      if (!/AIQ_BUDGET_EXCEEDED.*maxExpansions/.test(String(error))) throw error;
      lower = candidate + 1;
    }
  }
  return lower;
};
const anchoredExpansions = minimumExpansionBudget(`
MATCH (service:Service)
WHERE elementId(service) = $element
RETURN TABLE elementId(service) AS service
`, { element: "shared/consumer" });
const scannedExpansions = minimumExpansionBudget(`
MATCH (service:Service)
WHERE service.id = 'consumer'
RETURN TABLE elementId(service) AS service
`);
assert(anchoredExpansions < scannedExpansions, "elementId equality must use the full-id node anchor");
assert.throws(() => executeQuery(linked, {}, `
MATCH (service:Service)
WHERE elementId(service) = $element
RETURN TABLE elementId(service) AS service
`), /Missing query parameter.*\$element/);

const counts = executeQuery(linked, { context: "shared" }, `
MATCH (service:Service)
WHERE service.context = $context
RETURN TABLE service.type AS type, count(*) AS total
ORDER BY type
`);
assert.deepEqual(counts.kind === "table" ? counts.rows : [], [["Service", 3]]);

const topics = executeQuery(linked, { context: "shared" }, `
MATCH (consumer:Element)-[event:REFERENCES]->(producer:Element)
WHERE consumer.context = $context
  AND event IS AsyncWire
  AND event.technology CONTAINS $technology
UNWIND event.via AS topic
WITH DISTINCT topic, elementId(producer) AS producer, elementId(consumer) AS consumer
ORDER BY topic, producer, consumer
RETURN TABLE topic,
             collect(DISTINCT producer) AS producers,
             collect(DISTINCT consumer) AS consumers,
             count(DISTINCT consumer) AS consumerCount
ORDER BY topic
`, { technology: "Kafka" });
assert.deepEqual(topics.kind === "table" ? topics.rows : [], [[
  "orders.created",
  ["shared/producer"],
  ["shared/consumer"],
  1,
]]);

const roots = executeQuery(linked, { context: "shared" }, `
MATCH (service:Service)
WHERE service.context = $context
OPTIONAL MATCH (service)<-[dependency:REFERENCES]-(consumer:ContainerElement)
WITH service, dependency
WHERE dependency IS NULL
RETURN TABLE elementId(service) AS service
ORDER BY service
`);
assert.deepEqual(roots.kind === "table" ? roots.rows : [], [
  ["shared/consumer"],
  ["shared/isolated"],
]);

const optionalNullStaysBound = executeQuery(linked, {}, `
MATCH (service:Service {id: isolated})
OPTIONAL MATCH (service)-[:REFERENCES]->(missing:Element)
MATCH (missing)-[:REFERENCES]->(next:Element)
RETURN TABLE elementId(next) AS next
`);
assert.deepEqual(optionalNullStaysBound.kind === "table" ? optionalNullStaysBound.rows : [], []);

const contextual = parseQuery("MATCH (TABLE:Element) RETURN TABLE");
assert.equal(contextual.kind, "graph");
assert.doesNotThrow(() => selectGraph(linked, {}, "MATCH (TABLE:Element) RETURN TABLE"));

const unwind = executeQuery(linked, {}, `
UNWIND ['b', 'a', 'a'] AS item
RETURN TABLE DISTINCT item
ORDER BY item
`);
assert.deepEqual(unwind.kind === "table" ? unwind.rows : [], [["a"], ["b"]]);

const collected = executeQuery(linked, {}, `
UNWIND ['b', 'a', 'a'] AS item
WITH item
ORDER BY item
RETURN TABLE collect(DISTINCT item) AS items,
             count(DISTINCT item) AS total
`);
assert.deepEqual(collected.kind === "table" ? collected.rows : [], [[['a', 'b'], 2]]);

const emptyAggregate = executeQuery(linked, {}, `
MATCH (service:Service {id: missing})
RETURN TABLE count(*) AS total,
             sum(1) AS sum,
             collect(service) AS services,
             avg(1) AS average
`);
assert.deepEqual(emptyAggregate.kind === "table" ? emptyAggregate.rows : [], [[0, 0, [], null]]);

const nullFilter = executeQuery(linked, {}, `
MATCH (service:Service)
WHERE service.context = 'shared'
WITH service, service.missing AS missing
WHERE missing IS NULL
RETURN TABLE elementId(service) AS service
ORDER BY service
LIMIT 1
`);
assert.deepEqual(nullFilter.kind === "table" ? nullFilter.rows : [], [["shared/consumer"]]);

const conversions = executeQuery(linked, {}, `
UNWIND ['1', '2', 'x'] AS value
WITH toInteger(value) AS number
WHERE number IS NOT NULL
RETURN TABLE sum(number) AS total
`);
assert.deepEqual(conversions.kind === "table" ? conversions.rows : [], [[3]]);

const shortest = executeQuery(linked, {}, `
MATCH (from:Element)
WHERE elementId(from) = $from
MATCH (to:Element)
WHERE elementId(to) = $to
MATCH path = shortestPath((from)-[:REFERENCES*1..]->(to))
RETURN TABLE length(path) AS hops,
             [node IN nodes(path) | elementId(node)] AS nodes,
             path AS evidence
`, { from: "shared/consumer", to: "shared/producer" });
assert.equal(shortest.kind, "table");
assert.equal(shortest.rows[0][0], 1);
assert.deepEqual(shortest.rows[0][1], ["shared/consumer", "shared/producer"]);
assert.equal(shortest.rows[0][2].kind, "path");
assert.equal(shortest.rows[0][2].steps[0].direction, "forward");

const impact = executeQuery(linked, {}, `
MATCH (changed:Element)
WHERE elementId(changed) = $element
MATCH path = shortestPath((changed)<-[:REFERENCES*1..]-(affected:Service))
RETURN TABLE elementId(affected) AS affected, length(path) AS hops
ORDER BY affected
`, { element: "shared/producer" });
assert.deepEqual(impact.kind === "table" ? impact.rows : [], [["shared/consumer", 1]]);

const steps = executeQuery(linked, {}, `
MATCH (from:Element)
WHERE elementId(from) = $from
MATCH (to:Element)
WHERE elementId(to) = $to
MATCH path = shortestPath((from)-[:REFERENCES*1..]->(to))
UNWIND path.steps AS step
RETURN TABLE step.index AS position,
             step.from AS from,
             step.to AS to,
             step.direction AS direction
ORDER BY position
`, { from: "shared/consumer", to: "shared/producer" });
assert.deepEqual(steps.kind === "table" ? steps.rows : [], [[0, "shared/consumer", "shared/producer", "forward"]]);

const pathGraph = selectGraph(linked, {}, `
MATCH (from:Element {id: consumer})
MATCH (to:Element {id: producer})
MATCH path = shortestPath((from)-[:REFERENCES*1..]->(to))
RETURN path
`);
assert.equal(pathGraph.edges.length, 1);
assert(pathGraph.elements["shared/consumer"]);
assert(pathGraph.elements["shared/producer"]);

const alternate = linkProject({ snapshot: coreLanguageSnapshot, sources: [{ sourceName: "alternate.ai", source: `
context paths
system app
    name = App
    service a
        name = A
        links:
            -> b
            -> c
    service b
        name = Blocked
        links:
            -> d
    service c
        name = C
        links:
            -> e
    service e
        name = E
        links:
            -> d
    service d
        name = D
` }] });
assert.deepEqual(alternate.diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
const allowedShortest = executeQuery(alternate, {}, `
MATCH (from:Element)
WHERE elementId(from) = $from
MATCH (to:Element)
WHERE elementId(to) = $to
MATCH p = shortestPath((from)-[:REFERENCES*1..]->(to))
WHERE all(n IN nodes(p) WHERE n.name <> 'Blocked')
RETURN TABLE length(p) AS hops
`, { from: "paths/a", to: "paths/d" });
assert.deepEqual(allowedShortest.kind === "table" ? allowedShortest.rows : [], [[3]]);
const reachable = executeQuery(alternate, {}, `
MATCH (from:Element)
WHERE elementId(from) = $from
MATCH (from)-[:REFERENCES*1..3]->(to:Element)
RETURN TABLE DISTINCT elementId(to) AS target
ORDER BY target
`, { from: "paths/a" });
assert.deepEqual(reachable.kind === "table" ? reachable.rows : [], [["paths/b"], ["paths/c"], ["paths/d"], ["paths/e"]]);
const unboundedReachable = executeQuery(alternate, {}, `
MATCH (from:Element)
WHERE elementId(from) = $from
MATCH (from)-[:REFERENCES*1..]->(to:Element)
RETURN TABLE DISTINCT elementId(to) AS target
ORDER BY target
`, { from: "paths/a" });
assert.deepEqual(unboundedReachable.kind === "table" ? unboundedReachable.rows : [], [["paths/b"], ["paths/c"], ["paths/d"], ["paths/e"]]);
const unboundedPairs = executeQuery(alternate, {}, `
MATCH (from:Element)
WHERE from.id IN ['a', 'b']
MATCH (from)-[:REFERENCES*1..]->(to:Element)
RETURN TABLE DISTINCT elementId(from) AS source, elementId(to) AS target
ORDER BY source, target
`);
assert.deepEqual(unboundedPairs.kind === "table" ? unboundedPairs.rows : [], [
  ["paths/a", "paths/b"],
  ["paths/a", "paths/c"],
  ["paths/a", "paths/d"],
  ["paths/a", "paths/e"],
  ["paths/b", "paths/d"],
]);
const unboundedSetToSet = executeQuery(alternate, {}, `
MATCH (from:Element)
WHERE elementId(from) IN $from
MATCH (from)-[:REFERENCES*1..]->(to:Element)
WHERE elementId(to) IN $to
RETURN TABLE DISTINCT elementId(from) AS source, elementId(to) AS target
ORDER BY source, target
`, { from: ["paths/a", "paths/b"], to: ["paths/d"] });
assert.deepEqual(unboundedSetToSet.kind === "table" ? unboundedSetToSet.rows : [], [
  ["paths/a", "paths/d"],
  ["paths/b", "paths/d"],
]);
const globallyDistinctTargets = executeQuery(alternate, {}, `
MATCH (from:Element)
WHERE from.id IN ['a', 'b']
MATCH (from)-[:REFERENCES*1..]->(to:Element)
RETURN TABLE DISTINCT elementId(to) AS target
ORDER BY target
`);
assert.deepEqual(globallyDistinctTargets.kind === "table" ? globallyDistinctTargets.rows : [], [
  ["paths/b"], ["paths/c"], ["paths/d"], ["paths/e"],
]);
const filteredUnboundedTargets = executeQuery(alternate, {}, `
MATCH (from:Element)
WHERE elementId(from) = $from
MATCH (from)-[:REFERENCES*1..]->(to:Element)
WHERE to.name <> 'Blocked'
RETURN TABLE DISTINCT elementId(to) AS target
ORDER BY target
`, { from: "paths/a" });
assert.deepEqual(filteredUnboundedTargets.kind === "table" ? filteredUnboundedTargets.rows : [], [
  ["paths/c"], ["paths/d"], ["paths/e"],
]);
assert.throws(() => parseQuery(`
MATCH path = (from:Element)-[:REFERENCES*1..]->(to:Element)
RETURN TABLE path
`), /endpoint-only RETURN TABLE DISTINCT reachability: a path alias would materialize path evidence/);
assert.throws(() => parseQuery(`
MATCH path = (from:Element)-[:REFERENCES*1..]->(to:Element)
RETURN TABLE DISTINCT elementId(to) AS target
`), /a path alias would materialize path evidence/);
assert.throws(() => parseQuery(`
MATCH (from:Element)-[dependency:REFERENCES*1..]->(to:Element)
RETURN TABLE DISTINCT elementId(to) AS target
`), /a relationship alias would materialize path evidence/);
assert.throws(() => parseQuery(`
MATCH (from:Element)-[:REFERENCES*1..]->(to:Element)
RETURN TABLE elementId(to) AS target
`), /RETURN TABLE must use DISTINCT/);
assert.throws(() => parseQuery(`
MATCH (from:Element)-[:REFERENCES*1..]->(to:Element)
WITH DISTINCT from, to
RETURN TABLE DISTINCT elementId(from) AS source, elementId(to) AS target
`), /unbounded path MATCH must be the final input clause/);

assert.throws(() => parseQuery(`
MATCH (from:Element)
MATCH path = shortestPath((from)-[:REFERENCES*1.. {withProjected}]->(to:Element))
RETURN path
`), /AIQ_PROJECTED_TRAVERSAL_UNSUPPORTED/);
assert.throws(() => parseQuery(`MATCH (n:Element) RETURN TABLE elementId(n) AS id SKIP 1`), /AIQ_SKIP_REQUIRES_ORDER_BY/);
assert.throws(() => parseQuery(`MATCH (n:Element) RETURN TABLE elementId(n) AS id ORDER BY missing`), /unknown projected alias 'missing'/);
assert.throws(() => parseQuery(`MATCH (n:Element) RETURN TABLE typo(n) AS value`), /AIQ_UNKNOWN_FUNCTION/);
assert.throws(() => parseQuery(`MATCH (n:Element) RETURN TABLE size(n, n) AS value`), /AIQ_FUNCTION_SIGNATURE/);
assert.throws(() => parseQuery(`MATCH (n:Element) RETURN TABLE missing AS value`), /AIQ_UNKNOWN_ALIAS/);
assert.throws(() => parseQuery(`MATCH p = (a)-[:REFERENCES*1..3]->(b) RETURN TABLE p.typo AS value`), /AIQ_UNKNOWN_PROPERTY/);
assert.throws(() => selectGraph(linked, {}, `MATCH p = (source:SourceIdentity)-[:DECLARES*1..1]->(target) RETURN p`), /AIQ_UNRENDERABLE_PATH/);

assert.throws(() => executeQuery(linked, { context: "shared" }, `
MATCH (service:Service)
WHERE service.context = $context
RETURN TABLE elementId(service) AS service
`, {}, { limits: { maxRows: 1 } }), /AIQ_BUDGET_EXCEEDED.*maxRows=1/);
assert.throws(() => executeQuery(linked, {}, `
UNWIND [1, 2, 3] AS value
RETURN TABLE value
`, {}, { limits: { maxRows: 2 } }), /AIQ_BUDGET_EXCEEDED.*maxRows=2/);

assert.throws(() => executeQuery(linked, { context: "shared" }, `
MATCH (service:Service)
WHERE service.context = $context
RETURN TABLE elementId(service) AS service
`, {}, { limits: { maxOutputBytes: 10 } }), /AIQ_OUTPUT_TOO_LARGE/);
assert.throws(() => executeQuery(linked, { context: "shared" }, `
MATCH (service:Service)
WHERE service.context = $context
RETURN TABLE elementId(service) AS service
`, {}, { signal: AbortSignal.abort() }), /AIQ_CANCELLED/);

try {
  executeQuery(linked, {}, `
UNWIND [1] AS value
WITH value
WHERE value < '2'
RETURN TABLE value
`);
  assert.fail("mixed ordered comparison must fail");
} catch (error) {
  assert.equal(error.code, "AIQ_TYPE_ERROR");
  assert.equal(error.range.line, 4);
  assert(error.range.startOffset > 0);
}

assert.equal(formatQueryTableCsv({
  schemaVersion: "aiq-table.v1",
  kind: "table",
  columns: [{ name: "text", type: "string", nullable: true }, { name: "value", type: "any", nullable: true }],
  rows: [["comma, quote \" and\nnewline Ω", null], ["", ["a", "b"]]],
  metadata: { context: null, source: null, executionComplete: true, rowCount: 2, skip: 0, limit: null, pathScopes: [], warnings: [] },
}), 'text,value\r\n"comma, quote "" and\nnewline Ω",\r\n,"[""a"",""b""]"\r\n');

const oracleEdges = [
  ["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"],
  ["c", "e"], ["d", "f"], ["e", "f"], ["f", "c"],
];
const oracleNodes = [...new Set(oracleEdges.flat())];
const oracleSource = (order) => `
context oracle
system graph
    name = Graph
${order.map((node) => `    service ${node}
        name = ${node.toUpperCase()}${oracleEdges.some(([from]) => from === node) ? `
        links:${oracleEdges.filter(([from]) => from === node).map(([, to]) => `
            -> ${to}`).join("")}` : ""}`).join("\n")}
`;
const oracleReachable = (start, max) => {
  const reached = new Set();
  const visit = (node, depth, used) => {
    if (depth >= max) return;
    oracleEdges.forEach(([from, to], index) => {
      if (from !== node || used.has(index)) return;
      reached.add(to);
      visit(to, depth + 1, new Set([...used, index]));
    });
  };
  visit(start, 0, new Set());
  return [...reached].map((node) => `oracle/${node}`).sort();
};
const oracleDistance = (start, target) => {
  const queue = [[start, 0]];
  const visited = new Set([start]);
  for (let index = 0; index < queue.length; index++) {
    const [node, distance] = queue[index];
    if (node === target) return distance;
    for (const [from, to] of oracleEdges) {
      if (from === node && !visited.has(to)) {
        visited.add(to);
        queue.push([to, distance + 1]);
      }
    }
  }
  return undefined;
};
for (const order of [oracleNodes, [...oracleNodes].reverse()]) {
  const oracle = linkProject({ snapshot: coreLanguageSnapshot, sources: [{ sourceName: "oracle.ai", source: oracleSource(order) }] });
  assert.deepEqual(oracle.diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
  for (const start of oracleNodes) {
    const result = executeQuery(oracle, {}, `
MATCH (from:Element)
WHERE elementId(from) = $from
MATCH (from)-[:REFERENCES*1..6 {authored}]->(to:Element)
RETURN TABLE DISTINCT elementId(to) AS target
ORDER BY target
`, { from: `oracle/${start}` });
    assert.deepEqual(result.kind === "table" ? result.rows.map(([target]) => target) : [], oracleReachable(start, 6));
  }
  const cyclicReachability = executeQuery(oracle, {}, `
MATCH (from:Element)
WHERE elementId(from) = 'oracle/f'
MATCH (from)-[:REFERENCES*1..]->(to:Element)
RETURN TABLE DISTINCT elementId(from) AS source, elementId(to) AS target
ORDER BY source, target
`);
  assert.deepEqual(cyclicReachability.kind === "table" ? cyclicReachability.rows : [], [
    ["oracle/f", "oracle/c"],
    ["oracle/f", "oracle/d"],
    ["oracle/f", "oracle/e"],
    ["oracle/f", "oracle/f"],
  ]);
  const incomingReachability = executeQuery(oracle, {}, `
MATCH (from:Element)
WHERE elementId(from) = 'oracle/d'
MATCH (from)<-[:REFERENCES*1..]-(to:Element)
RETURN TABLE DISTINCT elementId(to) AS target
ORDER BY target
`);
  assert.deepEqual(incomingReachability.kind === "table" ? incomingReachability.rows : [],
    oracleNodes.map((node) => [`oracle/${node}`]).sort(([left], [right]) => left.localeCompare(right)));
  const undirectedReachability = executeQuery(oracle, {}, `
MATCH (from:Element)
WHERE elementId(from) = 'oracle/b'
MATCH (from)-[:REFERENCES*1..]-(to:Element)
RETURN TABLE DISTINCT elementId(to) AS target
ORDER BY target
`);
  assert.deepEqual(undirectedReachability.kind === "table" ? undirectedReachability.rows : [],
    oracleNodes.map((node) => [`oracle/${node}`]).sort(([left], [right]) => left.localeCompare(right)));
  for (const [start, target] of [["a", "f"], ["f", "d"], ["b", "e"]]) {
    const result = executeQuery(oracle, {}, `
MATCH (from:Element)
WHERE elementId(from) = $from
MATCH (to:Element)
WHERE elementId(to) = $to
MATCH p = shortestPath((from)-[:REFERENCES*1..6 {authored}]->(to))
RETURN TABLE length(p) AS hops
`, { from: `oracle/${start}`, to: `oracle/${target}` });
    const distance = oracleDistance(start, target);
    assert.deepEqual(result.kind === "table" ? result.rows : [], distance === undefined ? [] : [[distance]]);
  }
}

const generatedProject = (context, nodes, edges) => linkProject({
  snapshot: coreLanguageSnapshot,
  sources: [{ sourceName: `${context}.ai`, source: `
context ${context}
system graph
    name = Graph
${nodes.map((node) => `    service ${node}
        name = ${node}${edges.some(([from]) => from === node) ? `
        links:${edges.filter(([from]) => from === node).map(([, to]) => `
            -> ${to}`).join("")}` : ""}`).join("\n")}
` }],
});

const chainNodes = Array.from({ length: 40 }, (_, index) => `n${index}`);
const chain = generatedProject("chain", chainNodes, chainNodes.slice(1).map((node, index) => [`n${index}`, node]));
assert.deepEqual(chain.diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
const longShortest = executeQuery(chain, {}, `
MATCH (from:Element)
WHERE elementId(from) = 'chain/n0'
MATCH (to:Element)
WHERE elementId(to) = 'chain/n39'
MATCH p = shortestPath((from)-[:REFERENCES*1..]->(to))
RETURN TABLE length(p) AS hops
`);
assert.deepEqual(longShortest.kind === "table" ? longShortest.rows : [], [[39]]);

const starLeaves = Array.from({ length: 150 }, (_, index) => `leaf${index}`);
const star = generatedProject("star", ["hub", ...starLeaves], starLeaves.map((leaf) => ["hub", leaf]));
assert.deepEqual(star.diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
const wideReachability = executeQuery(star, {}, `
MATCH (from:Element)
WHERE elementId(from) = 'star/hub'
MATCH (from)-[:REFERENCES*1..]->(to:Element)
RETURN TABLE DISTINCT elementId(to) AS target
ORDER BY target
`);
assert.equal(wideReachability.kind === "table" ? wideReachability.rows.length : 0, 150);

const denseNodes = Array.from({ length: 8 }, (_, index) => `d${index}`);
const denseEdges = denseNodes.flatMap((from) => denseNodes.filter((to) => to !== from).map((to) => [from, to]));
const dense = generatedProject("dense", denseNodes, denseEdges);
assert.deepEqual(dense.diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
assert.throws(() => executeQuery(dense, {}, `
MATCH (from:Element)
WHERE elementId(from) = 'dense/d0'
MATCH p = (from)-[:REFERENCES*1..4]->(to:Element)
RETURN TABLE p.steps AS steps
`, {}, { limits: { maxExpansions: 100 } }), /AIQ_BUDGET_EXCEEDED.*maxExpansions=100/);

assert.throws(() => executeQuery(linked, {}, `
UNWIND [1, 2, 3, 4] AS value
RETURN TABLE collect(value) AS values
`, {}, { limits: { maxValues: 10 } }), /AIQ_BUDGET_EXCEEDED.*maxValues=10/);
assert.throws(() => executeQuery(linked, {}, `
UNWIND [3, 2, 1] AS value
WITH value
ORDER BY value
RETURN TABLE value
`, {}, { limits: { maxValues: 8 } }), /AIQ_BUDGET_EXCEEDED.*maxValues=8/);

console.log("table query contracts passed");
