import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { IndexedGraph, renderGraphviz, selectGraph } from "../build/runtime/index.js";

const result = relationshipFixture();
const scope = { context: "shared", tab: "model.ai" };
const builtinC1Query = readFileSync(
  new URL("../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/c1.aiq", import.meta.url),
  "utf8",
);

const cases = [
  undirectedMatchesTheUnionOfOutgoingAndIncomingQueries,
  builtinC1NeighborhoodMatchesTheDirectedUnion,
  undirectedPreservesStoredDirectionWithEitherAliasBound,
  undirectedReturnsSelfReferencesOnceAndKeepsParallelEdges,
  graphvizUsesTheStoredDirectionOfUndirectedMatches,
  optionalUndirectedMatchKeepsAnUnrelatedBaseNode,
  undirectedRollupMatchesTheDirectedUnionWithoutReversingEdges,
  optionalUndirectedRollupKeepsAnUnrelatedBaseNode,
  inclusiveSelectorsPreserveTheExactSelectorCategories,
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
  console.log("undirected query contracts passed");
}

function undirectedMatchesTheUnionOfOutgoingAndIncomingQueries() {
  const directed = selectGraph(result, scope, `
    MATCH (base:Service)
    WHERE base.context = $context
    OPTIONAL MATCH (base)-[outbound:REFERENCES {sourceIdentity: $tab}]->(outboundPeer:Service)
    WHERE outbound.operator = 'Wire'
    OPTIONAL MATCH (inboundPeer:Service)-[inbound:REFERENCES {sourceIdentity: $tab}]->(base)
    WHERE inbound.operator = 'Wire'
    RETURN base, outbound, outboundPeer, inbound, inboundPeer
  `);
  const undirected = selectGraph(result, scope, `
    MATCH (base:Service)
    WHERE base.context = $context
    OPTIONAL MATCH (base)-[relationship:REFERENCES {sourceIdentity: $tab}]-(peer:Service)
    WHERE relationship.operator = 'Wire'
    RETURN base, relationship, peer
  `);

  assert.deepEqual(edgeSignatures(undirected), edgeSignatures(directed));
  assert.deepEqual(Object.keys(undirected.elements).sort(), Object.keys(directed.elements).sort());
}

function builtinC1NeighborhoodMatchesTheDirectedUnion() {
  const directed = selectGraph(result, scope, `
    MATCH (system:SystemElement)
    WHERE system.context = $context
    OPTIONAL MATCH (system)-[realOutboundLink:REFERENCES]->(externalSystem:SystemElement)
    OPTIONAL MATCH (sourceSystem:SystemElement)-[realInboundLink:REFERENCES]->(system)
    OPTIONAL MATCH (system)-[rollupOutboundLink:REFERENCES {derived}]->(rollupSystem:SystemElement)
    OPTIONAL MATCH (rollupSourceSystem:SystemElement)-[rollupInboundLink:REFERENCES {derived}]->(system)
    GROUP BY system.parent
    RETURN system, realOutboundLink, externalSystem, realInboundLink, sourceSystem, rollupOutboundLink, rollupSystem, rollupInboundLink, rollupSourceSystem
  `);
  const compact = selectGraph(result, scope, builtinC1Query);

  assert.deepEqual(edgeSignatures(compact), edgeSignatures(directed));
  assert.deepEqual(Object.keys(compact.elements).sort(), Object.keys(directed.elements).sort());
}

function undirectedPreservesStoredDirectionWithEitherAliasBound() {
  const leftBound = selectGraph(result, scope, `
    MATCH (base:Service {id: receiver})
    MATCH (base)-[relationship:REFERENCES]-(peer:Service)
    RETURN base, relationship, peer
  `);
  const rightBound = selectGraph(result, scope, `
    MATCH (peer:Service {id: sender})
    MATCH (base:Service {id: receiver})-[relationship:REFERENCES]-(peer)
    RETURN base, relationship, peer
  `);
  const directedIncoming = selectGraph(result, scope, `
    MATCH (peer:Service {id: sender})-[relationship:REFERENCES]->(base:Service {id: receiver})
    RETURN base, relationship, peer
  `);

  assert.deepEqual(edgeSignatures(leftBound), edgeSignatures(directedIncoming));
  assert.deepEqual(edgeSignatures(rightBound), edgeSignatures(directedIncoming));
  assert(leftBound.edges.every((edge) => edge.source === "shared/sender" && edge.target === "shared/receiver"));
}

function undirectedReturnsSelfReferencesOnceAndKeepsParallelEdges() {
  const graph = selectGraph(result, scope, `
    MATCH (base:Service {id: sender})
    MATCH (base)-[relationship:REFERENCES]-(peer:Service)
    RETURN base, relationship, peer
  `);

  assert.equal(graph.edges.filter((edge) => edge.source === "shared/sender" && edge.target === "shared/sender").length, 1);
  assert.equal(graph.edges.filter((edge) => edge.source === "shared/sender" && edge.target === "shared/receiver").length, 2);
}

function graphvizUsesTheStoredDirectionOfUndirectedMatches() {
  const graph = selectGraph(result, scope, `
    MATCH (base:Service {id: receiver})
    MATCH (base)-[relationship:REFERENCES]-(peer:Service)
    RETURN base, relationship, peer
  `);
  const dot = renderGraphviz(result, graph);

  assert(dot.includes('"shared__sender" -> "shared__receiver"'));
  assert.equal(dot.includes('"shared__receiver" -> "shared__sender"'), false);
}

function optionalUndirectedMatchKeepsAnUnrelatedBaseNode() {
  const graph = selectGraph(result, scope, `
    MATCH (base:Service {id: isolated})
    OPTIONAL MATCH (base)-[relationship:REFERENCES]-(peer:Service)
    RETURN base, relationship, peer
  `);

  assert.deepEqual(Object.keys(graph.elements), ["shared/isolated"]);
  assert.equal(graph.edges.length, 0);
}

function undirectedRollupMatchesTheDirectedUnionWithoutReversingEdges() {
  const outgoing = selectGraph(result, scope, `
    MATCH (base:SystemElement {id: beta})
    MATCH ROLLUP (base)-[outbound:REFERENCES]->(outboundPeer:SystemElement)
    RETURN base, outbound, outboundPeer
  `);
  const incoming = selectGraph(result, scope, `
    MATCH (base:SystemElement {id: beta})
    MATCH ROLLUP (inboundPeer:SystemElement)-[inbound:REFERENCES]->(base)
    RETURN base, inbound, inboundPeer
  `);
  const undirected = selectGraph(result, scope, `
    MATCH (base:SystemElement {id: beta})
    MATCH ROLLUP (base)-[relationship:REFERENCES]-(peer:SystemElement)
    RETURN base, relationship, peer
  `);

  assert.deepEqual(edgeSignatures(undirected), mergeSignatures(outgoing, incoming));
  assert(undirected.edges.every((edge) => edge.source === "shared/alpha" && edge.target === "shared/beta"));
}

function optionalUndirectedRollupKeepsAnUnrelatedBaseNode() {
  const graph = selectGraph(result, scope, `
    MATCH (base:SystemElement {id: gamma})
    OPTIONAL MATCH ROLLUP (base)-[relationship:REFERENCES]-(peer:SystemElement)
    RETURN base, relationship, peer
  `);

  assert.deepEqual(Object.keys(graph.elements), ["shared/gamma"]);
  assert.equal(graph.edges.length, 0);
}

function inclusiveSelectorsPreserveTheExactSelectorCategories() {
  const direct = selectCategory();
  const derived = selectCategory("derived");
  const projected = selectCategory("projected");
  const derivedProjected = selectCategory("derived, projected");
  const withDerived = selectCategory("withDerived");
  const withProjected = selectCategory("withProjected");
  const all = selectCategory("withDerived, withProjected");

  assert.deepEqual(categoryCounts(direct), { direct: 3 });
  assert.deepEqual(categoryCounts(derived), { derived: 6 });
  assert.deepEqual(categoryCounts(projected), { projected: 1 });
  assert.deepEqual(categoryCounts(derivedProjected), { derivedProjected: 3 });
  assert.deepEqual(edgeSignatures(withDerived), mergeSignatures(direct, derived));
  assert.deepEqual(edgeSignatures(withProjected), mergeSignatures(direct, projected));
  assert.deepEqual(edgeSignatures(all), mergeSignatures(direct, derived, projected, derivedProjected));
  assert.deepEqual(categoryCounts(all), {
    derived: 6,
    derivedProjected: 3,
    direct: 3,
    projected: 1,
  });
}

function selectCategory(selectors = "") {
  const selectorBlock = selectors === "" ? "" : ` {${selectors}}`;
  return selectGraph(result, scope, `
    MATCH (source:Element)-[relationship:REFERENCES${selectorBlock}]->(target:Element)
    WHERE source.context = $context
    RETURN source, relationship, target
  `);
}

function categoryCounts(graph) {
  const counts = {};
  for (const edge of graph.edges) {
    const category = edge.derived
      ? edge.projected ? "derivedProjected" : "derived"
      : edge.projected ? "projected" : "direct";
    counts[category] = (counts[category] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function mergeSignatures(...graphs) {
  return graphs.flatMap((graph) => edgeSignatures(graph)).sort();
}

function edgeSignatures(graph) {
  return graph.edges.map((edge) => [
    edge.source,
    edge.target,
    edge.derived ? "derived" : "direct",
    edge.projected ? "projected" : "authored",
    edge.edge.declaration?.line ?? 0,
  ].join("|")).sort();
}

function relationshipFixture() {
  const graph = new IndexedGraph();
  graph.addNode({ kind: "source", id: "model.ai" });
  graph.addNode({ kind: "context", id: "shared" });

  const elements = [
    element("alpha", "System", ["SystemElement", "BoundaryElement", "Element"]),
    element("sender", "Service", ["Container", "ContainerElement", "Element"], "shared/alpha"),
    element("beta", "System", ["SystemElement", "BoundaryElement", "Element"]),
    element("receiver", "Service", ["Container", "ContainerElement", "Element"], "shared/beta"),
    element("gamma", "System", ["SystemElement", "BoundaryElement", "Element"]),
    element("isolated", "Service", ["Container", "ContainerElement", "Element"], "shared/gamma"),
  ];
  for (const item of elements) {
    graph.addNode({
      kind: "element",
      id: item.id,
      context: item.context,
      localId: item.localId,
      constructor: item.constructor,
      type: item.type,
      baseTypes: item.baseTypes,
      nestingLevel: item.parent === undefined ? 1 : 2,
      declarationSource: item.sourceIdentity,
    });
  }

  addContains(graph, "shared/alpha", "shared/sender", "contains-sender");
  addContains(graph, "shared/beta", "shared/receiver", "contains-receiver");
  addContains(graph, "shared/gamma", "shared/isolated", "contains-isolated");
  addContains(graph, "shared", "shared/alpha", "contains-alpha");
  addContains(graph, "shared", "shared/beta", "contains-beta");
  addContains(graph, "shared", "shared/gamma", "contains-gamma");

  const edges = [
    edge("shared/sender", "shared/receiver", 10),
    edge("shared/sender", "shared/receiver", 11),
    edge("shared/sender", "shared/sender", 12),
    edge("shared/sender", "shared/receiver", 13, true),
  ];
  edges.forEach((item) => graph.addRelation({
    id: item.id,
    kind: "REFERENCES",
    source: item.source,
    target: item.target,
    type: item.type,
    ownerSource: item.sourceIdentity,
    ...(item.projected === true ? { projected: true } : {}),
  }));

  return {
    diagnostics: [],
    graph,
    contexts: [{ id: "shared", type: "Context", sourceIdentity: "model.ai", attributes: {} }],
    elements,
    imports: [],
    edges,
    tabRoots: { "model.ai": ["shared"] },
    duplicateEdges: [],
    presentations: {},
  };
}

function element(localId, type, baseTypes, parent = undefined) {
  return {
    id: `shared/${localId}`,
    context: "shared",
    localId,
    type,
    constructor: type[0].toLowerCase() + type.slice(1),
    sourceIdentity: "model.ai",
    ...(parent === undefined ? {} : { parent }),
    baseTypes,
    attributes: { name: [localId] },
  };
}

function edge(source, target, line, projected = false) {
  return {
    id: `edge-${line.toString(16).padStart(32, "0")}`,
    source,
    target,
    operator: "Wire",
    type: "Wire",
    sourceIdentity: "model.ai",
    declaration: { sourceName: "model.ai", line, column: 1 },
    attributes: {},
    ...(projected ? { projected: true } : {}),
  };
}

function addContains(graph, source, target, id) {
  graph.addRelation({
    id,
    kind: "CONTAINS",
    source,
    target,
    ownerSource: "model.ai",
  });
}
