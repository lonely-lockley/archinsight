import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources, coreLanguageSnapshot,
  CompletionEngine, createGeneratedInsightSyntaxProvider, linkProject,
  ProjectAnalysisSession, renderGraphviz, selectGraph, semanticHighlightInsight,
} from "../build/runtime/index.js";

const source = (sourceName, source) => ({ sourceName, source });
const completion = new CompletionEngine(createGeneratedInsightSyntaxProvider());
let baseline;
for (const spelling of [
  { call: "deliver", place: "assignHost", carry: "transport" },
  { call: "+>", place: "@>", carry: "%>" },
]) {
  const definitions = source("types.ai", `define type Port of BoundaryElement
    constructor port
    Text name
    List of Message routes
    List of Edge actions
    List of Port _

define operator Message of Wire
    constructor ${spelling.call} Port
        on Port
        model = async
    List of Edge steps

define operator HostAssignment of Edge
    constructor ${spelling.place} InfrastructureComponent
        on Port
    capability = "deployment-placement"

define operator Transport of Edge
    constructor ${spelling.carry} NetworkConnection
        on Wire
    capability = "deployment-use"
`);
  const built = buildLanguageSnapshotResultFromSources([definitions], [coreLanguageSnapshot]);
  assert.deepEqual(built.diagnostics, []);
  const model = source("model.ai", `context test
compute host
    name = Host
networkConnection channel
    name = Channel
port root
    name = Root
    port nested
        name = Nested
        port caller
            name = Caller
            routes:
                ${spelling.call} target
                    description = Delivery
                    steps:
                        ${spelling.carry} channel
            actions:
                ${spelling.place} host
port target
    name = Target
`);
  const result = linkProject({ snapshot: built.snapshot, sources: [model] });
  assert.deepEqual(errors(result), []);
  assert.equal(result.edges.length, 1);
  assert.deepEqual(result.elements.find(({ id }) => id === "test/caller").attributes.runsOn, ["test/host"]);
  assert.deepEqual(result.edges[0].attributes.uses, ["test/channel"]);
  const shape = {
    elements: result.elements.map(({ id, type, attributes }) => ({ id, type, attributes })),
    edges: result.edges.map(({ source, target, type, attributes }) => ({ source, target, type, attributes })),
  };
  if (baseline === undefined) baseline = shape;
  else assert.deepEqual(shape, baseline, "operator spelling must not change execution or attributes");
  const graph = selectGraph(result, { context: "test" }, "MATCH (a:Port)-[r]->(b:Port) RETURN a, r, b");
  assert.deepEqual(graph.edges.map(({ source, target }) => ({ source, target })), [{ source: "test/caller", target: "test/target" }]);
  assert(renderGraphviz(result, graph).includes('"test/caller" -> "test/target"'));

  for (const [role, target] of [["call", "target"], ["place", "host"], ["carry", "channel"]]) {
    const invocation = `${spelling[role]} ${target}`;
    const start = model.source.indexOf(invocation);
    const line = model.source.slice(0, start).split("\n").length;
    const column = start - model.source.lastIndexOf("\n", start) - 1;
    const token = semanticHighlightInsight(model.source, built.snapshot).find((token) => token.line === line - 1 && token.column === column);
    assert.equal(token?.type, "operator");
    for (const suffix of ["", " "]) {
      const incomplete = source(model.sourceName, model.source.replace(invocation, spelling[role] + suffix));
      const linked = linkProject({ snapshot: built.snapshot, sources: [incomplete] });
      assert.deepEqual(errors(linked), [{
        code: "IDENTIFIER_REQUIRED", message: "Target identifier is required", sourceName: model.sourceName,
        line, column: column + 1, endLine: line, endColumn: column + 1 + spelling[role].length,
      }]);
    }
    for (const prefix of ["", target.slice(0, 2), target]) {
      const edited = model.source.replace(invocation, spelling[role] + " " + prefix);
      const completed = completion.complete({ sourceName: model.sourceName, source: edited,
        cursorOffset: start + spelling[role].length + 1 + prefix.length, snapshot: built.snapshot });
      const labels = completed.items.map(({ label }) => label);
      assert(labels.includes(target), `${role}: ${labels.join(", ")}`);
      for (const forbidden of role === "call" ? ["host", "channel"] : role === "carry" ? ["host", "root"] : ["root", "target"]) {
        assert(!labels.includes(forbidden), `${role} leaked ${forbidden}`);
      }
    }
  }
  const session = ProjectAnalysisSession.create([definitions, model]);
  const incomplete = { ...model, source: model.source.replace(`${spelling.call} target`, spelling.call) };
  assert.deepEqual(errors(session.update([definitions, incomplete])).map(({ code }) => code), ["IDENTIFIER_REQUIRED"]);
  assert.deepEqual(errors(session.update([definitions, model])), []);
}

for (const operator of ["readSlot", "%>"]) {
  const built = buildLanguageSnapshotResultFromSources([source("slots.ai", `define type Shelf of BoundaryElement
    constructor shelf
    Text name
    List of ReadSlot references
    List of ReadSlot _
define type Domain of Element
    constructor domain
    Shelf primary
    Shelf secondary
define operator ReadSlot of TypeSlotReference
    constructor ${operator} Domain
        on Shelf
define operator OtherSlot of TypeSlotReference
    constructor excludedSlot Domain
        on Shelf
`)], [coreLanguageSnapshot]);
  assert.deepEqual(built.diagnostics, []);
  for (const list of ["references", "_"]) {
    const header = `context test\nshelf owner\n    name = Owner\n${list === "_" ? "" : "    references:\n"}`;
    const indent = list === "_" ? "    " : "        ";
    const model = source("slots-model.ai", header + indent + operator + " primary\n");
    const candidates = completion.complete({ ...model, source: header + indent, cursorOffset: header.length + indent.length, snapshot: built.snapshot }).items.map(({ label }) => label);
    assert(candidates.includes(operator));
    assert(!candidates.includes("excludedSlot"));
    const linked = linkProject({ snapshot: built.snapshot, sources: [model] });
    assert.deepEqual(errors(linked), []);
    assert.equal(linked.elements.find(({ id }) => id === "test/owner").attributes[list]?.length, 1);
    assert.deepEqual(linked.edges, []);
    const incomplete = source(model.sourceName, header + indent + operator);
    assert.deepEqual(errors(linkProject({ snapshot: built.snapshot, sources: [incomplete] })).map(({ code, message }) => ({ code, message })),
      [{ code: "IDENTIFIER_REQUIRED", message: "Target identifier is required" }]);
    const edited = header + indent + operator + " ";
    const labels = completion.complete({ ...model, source: edited, cursorOffset: edited.length, snapshot: built.snapshot }).items.map(({ label }) => label);
    assert.deepEqual(labels.sort(), ["deployment", "primary", "secondary"]);
    const tokens = semanticHighlightInsight(model.source, built.snapshot);
    assert.equal(tokens.find(({ line, column }) => line === header.split("\n").length - 1 && column === indent.length)?.type, "operator");
    const invalid = source(model.sourceName, header + indent + operator + " absent\n");
    const diagnostics = errors(linkProject({ snapshot: built.snapshot, sources: [invalid] }));
    assert.equal(diagnostics[0]?.code, "ATTRIBUTE_NOT_DECLARED");
    assert.equal(diagnostics[0]?.column, indent.length + operator.length + 2);
    assert.equal(diagnostics[0]?.endColumn, indent.length + operator.length + 8);
  }
}

for (const operator of ["mark", "%>"]) {
  const built = buildLanguageSnapshotResultFromSources([source("prefix.ai", `define type Parent of BoundaryElement
    constructor parent
    Text name
    List of Child entries
    List of Child _
define type Child of Element
    constructor child
    Text name
    Text tag
define operator Marked of Child
    constructor ${operator} Child
        on Parent
        tag = marked
    Text markedOnly
`)], [coreLanguageSnapshot]);
  assert.deepEqual(built.diagnostics, []);
  for (const list of ["entries", "_"]) {
    const model = source("prefix-model.ai", `context test\nparent owner\n    name = Owner\n${list === "_" ? "" : "    entries:\n"}${list === "_" ? "    " : "        "}${operator} child value\n${list === "_" ? "        " : "            "}name = Value\n`);
    const linked = linkProject({ snapshot: built.snapshot, sources: [model] });
    assert.deepEqual(errors(linked), []);
    assert.equal(linked.elements.find(({ id }) => id === "test/value")?.type, "Marked");
    assert.deepEqual(linked.elements.find(({ id }) => id === "test/value")?.attributes.tag, ["marked"]);
    const bodyIndent = list === "_" ? "        " : "            ";
    const edited = model.source + bodyIndent;
    const labels = completion.complete({ ...model, source: edited, cursorOffset: edited.length, snapshot: built.snapshot }).items.map(({ label }) => label);
    assert(labels.includes("markedOnly"));
    assert(!labels.includes("entries"));
  }
}

for (const operator of ["dispatch", "%>"]) {
  const message = `define operator Message of Wire
    constructor ${operator} Port
        on Port
        model = sync
    List of HostAssignment hops
`;
  const placement = `define operator HostAssignment of Edge
    constructor ${operator} InfrastructureComponent
        on Port
    constructor ${operator} InfrastructureComponent
        on Message
    capability = "deployment-placement"
`;
  const use = `define operator HostUse of Edge
    constructor ${operator} Compute
        on Port
    capability = "deployment-use"
`;
  for (const operators of [message + placement + use, use + placement + message]) {
    const built = buildLanguageSnapshotResultFromSources([source("overloads.ai", `define type Port of BoundaryElement
    constructor port
    Text name
    List of Edge mixed
    List of HostAssignment narrow
${operators}`)], [coreLanguageSnapshot]);
    assert.deepEqual(built.diagnostics, []);
    const model = source("overloads-model.ai", `context test
port caller
    name = Caller
    mixed:
        ${operator} target
        ${operator} host
    narrow:
        ${operator} host
port target
    name = Target
compute host
    name = Host
`);
    const linked = linkProject({ snapshot: built.snapshot, sources: [model] });
    assert.deepEqual(errors(linked), []);
    assert.deepEqual(linked.edges.map(({ type, source, target }) => ({ type, source, target })), [{ type: "Message", source: "test/caller", target: "test/target" }]);
    const caller = linked.elements.find(({ id }) => id === "test/caller");
    assert.deepEqual(caller.attributes.uses, ["test/host"]);
    assert.deepEqual(caller.attributes.runsOn, ["test/host"]);
  }
}

console.log("operator spelling parity contracts passed");
function errors(result) {
  return result.diagnostics.filter(({ level }) => (level ?? "ERROR") === "ERROR");
}
