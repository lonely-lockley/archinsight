import assert from "node:assert/strict";
import { IndexedGraph, renderGraphviz, selectGraph } from "../build/runtime/index.js";

const result = reverseFixture();
const scope = { context: "shared", tab: "model.ai" };

const cases = [
  reversePatternMatchesTheEquivalentOutgoingPattern,
  reversePatternRespectsBoundAliases,
  reversePatternKeepsSelfReferencesAndParallelEdgesDistinct,
  optionalReversePatternKeepsAnUnrelatedBaseNode,
  reverseRollupMatchesTheEquivalentOutgoingRollup,
  reversePatternSupportsEverySelectorCategory,
  graphvizRendersTheStoredDirectionOfReverseMatches,
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
  console.log("reverse query contracts passed");
}

function reversePatternMatchesTheEquivalentOutgoingPattern() {
  const outgoing = selectGraph(result, scope, `
    MATCH (source:Service {id: sender})-[relationship:REFERENCES {sourceIdentity: $tab}]->(target:Service {id: receiver})
    WHERE relationship.operator = 'Wire'
    RETURN source, relationship, target
  `);
  const incoming = selectGraph(result, scope, `
    MATCH (target:Service {id: receiver})<-[relationship:REFERENCES {sourceIdentity: $tab}]-(source:Service {id: sender})
    WHERE relationship.operator = 'Wire'
    RETURN target, relationship, source
  `);

  assert.deepEqual(edgeSignatures(incoming), edgeSignatures(outgoing));
  assert(incoming.edges.every((edge) => edge.source === "shared/sender" && edge.target === "shared/receiver"));
}

function reversePatternRespectsBoundAliases() {
  const graph = selectGraph(result, scope, `
    MATCH (source:Service {id: sender})
    MATCH (target:Service {id: receiver})<-[relationship:REFERENCES]-(source)
    RETURN target, relationship, source
  `);

  assert.equal(graph.edges.length, 2);
  assert(graph.edges.every((edge) => edge.source === "shared/sender" && edge.target === "shared/receiver"));
}

function reversePatternKeepsSelfReferencesAndParallelEdgesDistinct() {
  const self = selectGraph(result, scope, `
    MATCH (target:Service {id: sender})<-[relationship:REFERENCES]-(source:Service)
    RETURN target, relationship, source
  `);
  const parallel = selectGraph(result, scope, `
    MATCH (target:Service {id: receiver})<-[relationship:REFERENCES]-(source:Service)
    RETURN target, relationship, source
  `);

  assert.equal(self.edges.filter((edge) => edge.source === edge.target).length, 1);
  assert.equal(parallel.edges.length, 2);
}

function optionalReversePatternKeepsAnUnrelatedBaseNode() {
  const graph = selectGraph(result, scope, `
    MATCH (target:Service {id: isolated})
    OPTIONAL MATCH (target)<-[relationship:REFERENCES]-(source:Service)
    RETURN target, relationship, source
  `);

  assert.deepEqual(Object.keys(graph.elements), ["shared/isolated"]);
  assert.equal(graph.edges.length, 0);
}

function reverseRollupMatchesTheEquivalentOutgoingRollup() {
  const outgoing = selectGraph(result, scope, `
    MATCH (target:SystemElement {id: beta})
    MATCH ROLLUP (source:SystemElement)-[relationship:REFERENCES]->(target)
    RETURN source, relationship, target
  `);
  const incoming = selectGraph(result, scope, `
    MATCH (target:SystemElement {id: beta})
    MATCH ROLLUP (target)<-[relationship:REFERENCES]-(source:SystemElement)
    RETURN target, relationship, source
  `);

  assert.deepEqual(edgeSignatures(incoming), edgeSignatures(outgoing));
  assert(incoming.edges.every((edge) => edge.source === "shared/alpha" && edge.target === "shared/beta"));
}

function reversePatternSupportsEverySelectorCategory() {
  const outgoing = selectGraph(result, scope, `
    MATCH (source:Element)-[relationship:REFERENCES {withDerived, withProjected}]->(target:Element)
    WHERE source.context = $context
    RETURN source, relationship, target
  `);
  const incoming = selectGraph(result, scope, `
    MATCH (target:Element)<-[relationship:REFERENCES {withDerived, withProjected}]-(source:Element)
    WHERE source.context = $context
    RETURN target, relationship, source
  `);

  assert.deepEqual(edgeSignatures(incoming), edgeSignatures(outgoing));
  assert.deepEqual(categoryCounts(incoming), {
    derived: 6,
    derivedProjected: 3,
    direct: 3,
    projected: 1,
  });
}

function graphvizRendersTheStoredDirectionOfReverseMatches() {
  const graph = selectGraph(result, scope, `
    MATCH (target:Service {id: receiver})<-[relationship:REFERENCES]-(source:Service)
    RETURN target, relationship, source
  `);
  const dot = renderGraphviz(result, graph);

  assert(dot.includes('"shared__sender" -> "shared__receiver"'));
  assert.equal(dot.includes('"shared__receiver" -> "shared__sender"'), false);
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

function edgeSignatures(graph) {
  return graph.edges.map((edge) => [
    edge.source,
    edge.target,
    edge.derived ? "derived" : "direct",
    edge.projected ? "projected" : "authored",
    edge.edge.declaration?.line ?? 0,
  ].join("|")).sort();
}

function reverseFixture() {
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

  addContains(graph, "shared", "shared/alpha", "contains-alpha");
  addContains(graph, "shared/alpha", "shared/sender", "contains-sender");
  addContains(graph, "shared", "shared/beta", "contains-beta");
  addContains(graph, "shared/beta", "shared/receiver", "contains-receiver");
  addContains(graph, "shared", "shared/gamma", "contains-gamma");
  addContains(graph, "shared/gamma", "shared/isolated", "contains-isolated");

  const edges = [
    edge("shared/sender", "shared/receiver", 10),
    edge("shared/sender", "shared/receiver", 11),
    edge("shared/sender", "shared/sender", 12),
    edge("shared/sender", "shared/receiver", 13, true),
  ];
  edges.forEach((item, index) => graph.addRelation({
    id: `references:${linkedEdgeKey(item)}:${index}`,
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

function linkedEdgeKey(item) {
  return [
    item.sourceIdentity,
    item.source,
    item.target,
    item.operator,
    item.type,
    item.projected === true ? "projected" : "real",
    item.projectionScope ?? "",
  ].join("\0");
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
