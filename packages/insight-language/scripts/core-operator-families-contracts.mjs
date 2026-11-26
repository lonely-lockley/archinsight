import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources, coreLanguageSnapshot,
  CompletionEngine, createGeneratedInsightSyntaxProvider, linkProject,
  semanticHighlightInsight,
} from "../build/runtime/index.js";
import { TypeSystem } from "../build/runtime/type-system.js";

const source = (sourceName, source) => ({ sourceName, source });
const built = buildLanguageSnapshotResultFromSources([source("families.ai", `
define operator Published of Wire
    constructor publish System
        on System
        model = async
define operator HostAssignment of DeploymentAction
    constructor hostOn InfrastructureComponent
        on Element
    constructor %> InfrastructureComponent
        on Element
    capability = "deployment-placement"
define operator LegacyAssignment of Edge
    constructor legacyHost InfrastructureComponent
        on Element
    capability = "deployment-placement"
extend type Storage
    Projection accessPath
extend type System
    List of Edge actions
`)], [coreLanguageSnapshot]);
assert.deepEqual(built.diagnostics, []);
const snapshot = JSON.parse(JSON.stringify(built.snapshot));
const types = new TypeSystem(snapshot);
for (const [owner, attribute, expected] of [
  ["System", "links", "Wire"], ["Service", "links", "Wire"],
  ["System", "deployment", "DeploymentAction"], ["ContainerElement", "deployment", "DeploymentAction"], ["Wire", "deployment", "DeploymentAction"],
  ["DeploymentProfile", "_", "DeploymentAction"], ["System", "actions", "Edge"],
]) {
  assert.equal(types.attribute(owner, attribute)?.listElementType, expected);
}
assert.equal(types.attribute("InfrastructureComponent", "route")?.type, "Projection");
assert.equal(types.attribute("InfrastructureComponent", "projection"), undefined);
assert.equal(types.anonymousListAttribute("Projection")?.listElementType, "PhysicalWire");
for (const section of ["outbound", "transit", "inbound"]) {
  assert.equal(types.attribute("Projection", section)?.listElementType, "PhysicalWire");
}
for (const type of ["Wire", "PhysicalWire", "DeploymentAction"]) {
  assert(types.isAssignable(type, "Edge"));
  for (const other of ["Wire", "PhysicalWire", "DeploymentAction"].filter((other) => other !== type)) {
    assert(!types.isAssignable(type, other));
  }
}
for (const type of ["DeploymentProfileUse", "InfrastructureUse", "InfrastructurePlacement", "HostAssignment"]) {
  assert(types.isAssignable(type, "DeploymentAction"));
}
assert(!types.isAssignable("LegacyAssignment", "DeploymentAction"));

const engine = new CompletionEngine(createGeneratedInsightSyntaxProvider());
const endpoints = `context test
system receiver
    name = Receiver
compute host
    name = Host
`;
const environment = source("infra.ai", `environment infra
    name = Infra
deployment production
    name = Production
`);
const operators = [
  ["->", "receiver", "Wire"], ["~>", "receiver", "Wire"], ["publish", "receiver", "Wire"],
  ["connectTo", "host", "PhysicalWire"], ["replicateFrom", "host", "PhysicalWire"],
  ["uses", "host", "DeploymentAction"], ["runsOn", "host", "DeploymentAction"],
  ["hostOn", "host", "DeploymentAction"], ["%>", "host", "DeploymentAction"],
  ["legacyHost", "host", "Edge"],
];
for (const [header, ownerType, list, expectedType, indent] of [
  ["system caller\n    name = Caller\n    links:\n", "System", "links", "Wire", "        "],
  ["system caller\n    name = Caller\n    deployment:\n", "System", "deployment", "DeploymentAction", "        "],
  ["deploymentProfile caller\n    appliesTo:\n        production from infra\n", "DeploymentProfile", "_", "DeploymentAction", "    "],
  ["system caller\n    name = Caller\n    actions:\n", "System", "actions", "Edge", "        "],
]) {
  const before = endpoints + header;
  const line = before.split("\n").length;
  const completion = engine.complete({ sourceName: "model.ai", source: before + indent,
    cursorOffset: before.length + indent.length, snapshot });
  const expectedOperators = operators.filter(([, , family]) => expectedType === "Edge" || family === expectedType).map(([spelling]) => spelling).sort();
  if (ownerType === "System" && expectedType !== "Wire") expectedOperators.push("shares");
  expectedOperators.sort();
  assert.deepEqual(completion.items.filter(({ kind }) => kind === "OPERATOR").map(({ label }) => label).sort(), expectedOperators);
  for (const [spelling, target, family] of operators) {
    const valid = expectedType === "Edge" || family === expectedType;
    const model = source("model.ai", before + indent + spelling + " " + target + "\n");
    const result = linkProject({ snapshot, sources: [model, environment] });
    const errors = result.diagnostics.filter(({ level }) => (level ?? "ERROR") === "ERROR");
    if (valid) {
      assert.deepEqual(errors, [], `${ownerType}.${list}: ${spelling}`);
      const isAction = family === "DeploymentAction" || family === "Edge";
      assert.equal(result.edges.length, isAction ? 0 : 1);
      if (isAction && ownerType !== "DeploymentProfile") {
        const caller = result.elements.find(({ id }) => id === "test/caller");
        assert.deepEqual(caller.attributes[spelling === "uses" ? "uses" : "runsOn"], ["test/host"]);
      }
    } else {
      assert.deepEqual(errors, [{ code: "TYPE_MISMATCH",
        message: `Operator '${spelling}' is not compatible with '${ownerType}' (expected '${expectedType}')`,
        sourceName: "model.ai", line, column: indent.length + 1, endLine: line, endColumn: indent.length + spelling.length + 1,
      }]);
      assert.deepEqual(result.edges, []);
    }
    if (!valid) continue;
    for (const suffix of ["", " ", "\n"]) {
      const incomplete = source(model.sourceName, before + indent + spelling + suffix);
      const diagnostics = linkProject({ snapshot, sources: [incomplete, environment] }).diagnostics
        .filter(({ level }) => (level ?? "ERROR") === "ERROR");
      assert.deepEqual(diagnostics, [{ code: "IDENTIFIER_REQUIRED", message: "Target identifier is required",
        sourceName: model.sourceName, line, column: indent.length + 1, endLine: line, endColumn: indent.length + spelling.length + 1,
      }]);
      assert.equal(semanticHighlightInsight(incomplete.source, snapshot).find((token) => token.line === line - 1 && token.column === indent.length)?.type, "operator");
    }
  }
}

const storageSource = "context test\nstorage database\n    name = DB\n";
const storageCursor = storageSource + "    ";
const storageItems = engine.complete({ sourceName: "storage.ai", source: storageCursor, cursorOffset: storageCursor.length, snapshot }).items;
assert(storageItems.some(item => item.label === "route"));
assert(!storageItems.some(item => item.label === "projection"));
const componentRoute = block => linkProject({snapshot, sources: [source("storage.ai", storageSource + block + "\n")]});
for (const body of ["        $from originalLink $this", ...["_", "localPath"].map(id =>
  `        projection ${id}\n            $from originalLink $this`)]) {
  const linked = componentRoute("    route:\n" + body);
  assert.deepEqual(linked.diagnostics.filter(d => (d.level ?? "ERROR") === "ERROR"), []);
  const owner = linked.elements.find(element => element.id === "test/database");
  const [routeId] = owner.attributes.route;
  assert(linked.elements.some(element => element.id === routeId && element.type === "Projection" && element.parent === owner.id));
}
for (const field of ["route", "accessPath"]) {
  for (const section of ["outbound", "transit", "inbound"]) {
    const text = storageSource + `    ${field}:\n        ${section}:\n            $from `;
    const items = engine.complete({ sourceName: "storage.ai", source: text, cursorOffset: text.length, snapshot }).items;
    assert.deepEqual(items.map(item => item.label).sort(), ["connectTo", "originalLink", "replicateFrom"]);
  }
}
const repeated = componentRoute("    route:\n        $from originalLink $this\n    route:\n        $this connectTo $from");
assert(repeated.diagnostics.some(d => d.code === "ATTRIBUTE_SHADOWS_PREVIOUS" && d.line === 6));
const legacy = componentRoute("    projection:\n        $from originalLink $this");
assert(legacy.diagnostics.some(d => d.code === "ATTRIBUTE_NOT_DECLARED" && d.line === 4 && d.column === 5));

const projectionHeader = endpoints + "networkConnection caller\n    name = Caller\n    route:\n";
const projectionCompletion = engine.complete({
  sourceName: "projection.ai",
  source: projectionHeader + "        ",
  cursorOffset: projectionHeader.length + 8,
  snapshot,
});
assert.deepEqual(
  projectionCompletion.items.filter(({ kind }) => kind === "OPERATOR").map(({ label }) => label),
  [],
);
assert(projectionCompletion.items.some(({ label }) => label === "$from"));
for (const spelling of ["connectTo", "replicateFrom"]) {
  const result = linkProject({
    snapshot,
    sources: [source("projection.ai", `${projectionHeader}        $from ${spelling} $this\n`), environment],
  });
  assert.deepEqual(result.diagnostics.filter(({ level }) => (level ?? "ERROR") === "ERROR"), []);
}

console.log("core operator family contracts passed");
