import assert from "node:assert/strict";
import {
  diffRenderGraphs,
  renderDiagramDiffGraphviz,
  selectIsolatedDiagramDiff,
} from "../build/runtime/index.js";

const unchanged = element("sample/unchanged", "Unchanged");
const changedBefore = element("sample/changed", "Before");
const changedAfter = element("sample/changed", "After");
const removed = { ...element("sample/removed", "Removed"), annotations: [{ name: "deprecated" }] };
const added = { ...element("sample/added", "Added"), annotations: [{ name: "planned" }] };
const beforeEdge = edge("unstable-before-id", unchanged.id, changedBefore.id, "HTTP");
const afterEdge = edge("unstable-after-id", unchanged.id, changedAfter.id, "gRPC");
const removedEdge = annotatedEdge(edge("removed-edge", changedBefore.id, removed.id, "HTTP"), "deprecated");
const addedEdge = annotatedEdge(edge("added-edge", changedAfter.id, added.id, "HTTP"), "planned");

const before = graph([unchanged, changedBefore, removed], [beforeEdge, removedEdge]);
const after = graph([unchanged, changedAfter, added], [afterEdge, addedEdge]);
const diff = diffRenderGraphs(before, after);

assert.equal(diff.schemaVersion, "diagram-diff.v1");
assert.equal(diff.elements[unchanged.id].status, "unchanged");
assert.equal(diff.elements[changedBefore.id].status, "changed");
assert.equal(diff.elements[removed.id].status, "removed");
assert.equal(diff.elements[added.id].status, "added");
assert.deepEqual(diff.summary.elements, { added: 1, removed: 1, changed: 1, unchanged: 1 });
assert.deepEqual(diff.summary.edges, { added: 1, removed: 1, changed: 1, unchanged: 0 });
assert.deepEqual(Object.keys(diff.graph.elements).sort(), [added.id, changedAfter.id, removed.id, unchanged.id].sort());
assert.equal(diff.graph.edges.length, 3);
assert.equal(diff.elements[changedBefore.id].changeId, `element:${changedBefore.id}`);
assert(diff.elements[changedBefore.id].origins.some((origin) =>
  origin.side === "before" && origin.sourceName === "model.ai" && origin.precision === "declaration"
));
assert(diff.edges.every((entry) => entry.changeId.startsWith("edge:")));

const isolated = selectIsolatedDiagramDiff(diff, changedBefore.id);
assert(isolated.elements[removed.id], "diff isolate must keep a removed direct neighbour");
assert(isolated.edges.some((entry) => entry.status === "removed" && entry.rendered.target === removed.id));
assert.equal(isolated.graph.layout.kind, "isolate");

const stableIdOnly = diffRenderGraphs(
  graph([unchanged, changedBefore], [beforeEdge]),
  graph([unchanged, changedBefore], [{ ...beforeEdge, edge: { ...beforeEdge.edge, id: "line-shifted-id" } }]),
);
assert.equal(stableIdOnly.summary.edges.unchanged, 1, "line-dependent linked edge IDs must not create diff noise");

const dot = renderDiagramDiffGraphviz(result(before), result(after), diff, "light");
assert.doesNotMatch(dot, /fillcolor="#(?:c8e6c9|ffcdd2|fff59d)"/);
assert.match(dot, /fillcolor="#0e8006",color="#2e7d32"|color="#2e7d32"[\s\S]*fillcolor="#0e8006"/);
assert.match(dot, /fillcolor="#a80808",color="#c62828"|color="#c62828"[\s\S]*fillcolor="#a80808"/);
assert.match(dot, /color="#f9a825"/);
assert.doesNotMatch(dot, /color="#[0-9a-fA-F]{6}:/);
assert.match(dot, /<font color="#2e7d32" point-size="11px"><b>\+<\/b><\/font>/);
assert.match(dot, /<font color="#c62828" point-size="11px"><b>−<\/b><\/font>/);
assert.match(dot, /<font color="#f9a825" point-size="11px"><b>~<\/b><\/font>/);
assert.throws(
  () => renderDiagramDiffGraphviz(
    { ...result(before), diagnostics: [{ code: "BROKEN", message: "broken", sourceName: "model.ai", line: 1, column: 0 }] },
    result(after),
    diff,
  ),
  /invalid link result/,
);

console.log("diagram diff contracts passed");

function graph(elements, edges) {
  return {
    context: "sample",
    elements: Object.fromEntries(elements.map((item) => [item.id, item])),
    edges,
    groups: [],
    externalElements: [],
  };
}

function element(id, name) {
  return {
    id,
    context: "sample",
    localId: id.split("/").at(-1),
    type: "System",
    constructor: "system",
    sourceIdentity: "model.ai",
    baseTypes: ["Element"],
    attributes: { name: [name] },
    declaration: { sourceName: "model.ai", line: id.endsWith("changed") ? 5 : 2, column: 1, endLine: id.endsWith("changed") ? 7 : 3, endColumn: 1 },
  };
}

function edge(id, source, target, technology) {
  return {
    edge: {
      id,
      source,
      target,
      operator: "->",
      type: "SyncRelationship",
      sourceIdentity: "model.ai",
      attributes: { technology: [technology] },
      declaration: { sourceName: "model.ai", line: 8, column: 1, endLine: 9, endColumn: 1 },
    },
    source,
    target,
    derived: true,
    projected: false,
  };
}

function annotatedEdge(value, name) {
  return { ...value, edge: { ...value.edge, annotations: [{ name }] } };
}

function result(renderGraph) {
  return {
    diagnostics: [],
    graph: {},
    contexts: [{ id: "sample", type: "Context", sourceIdentity: "model.ai", attributes: {} }],
    elements: Object.values(renderGraph.elements),
    imports: [],
    edges: renderGraph.edges.map((item) => item.edge),
    tabRoots: {},
    duplicateEdges: [],
    presentations: {
      Context: presentation("Context"),
      Element: presentation("Element"),
      System: presentation("System"),
      Edge: presentation("Edge"),
      SyncRelationship: presentation("SyncRelationship"),
    },
  };
}

function presentation(name) {
  return {
    name,
    assignments: { header: "name", subtitle: "technology" },
    sections: {
      light: { fill: "#ffffff", stroke: "#000000", text: "#000000" },
      dark: { fill: "#000000", stroke: "#ffffff", text: "#ffffff" },
      graphviz: { style: "rounded,filled" },
    },
  };
}
