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
extend type System
    List of Edge actions
`)], [coreLanguageSnapshot]);
assert.deepEqual(built.diagnostics, []);
const snapshot = JSON.parse(JSON.stringify(built.snapshot));
const types = new TypeSystem(snapshot);
for (const [owner, attribute, expected] of [
  ["System", "links", "Wire"], ["Service", "links", "Wire"],
  ["InfrastructureComponent", "projection", "PhysicalWire"],
  ["System", "deployment", "DeploymentAction"], ["ContainerElement", "deployment", "DeploymentAction"], ["Wire", "deployment", "DeploymentAction"],
  ["DeploymentProfile", "_", "DeploymentAction"], ["System", "actions", "Edge"],
]) {
  assert.equal(types.attribute(owner, attribute)?.listElementType, expected);
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
  ["networkConnection caller\n    name = Caller\n    projection:\n", "NetworkConnection", "projection", "PhysicalWire", "        "],
  ["system caller\n    name = Caller\n    deployment:\n", "System", "deployment", "DeploymentAction", "        "],
  ["deploymentProfile caller\n    appliesTo:\n        production from infra\n", "DeploymentProfile", "_", "DeploymentAction", "    "],
  ["system caller\n    name = Caller\n    actions:\n", "System", "actions", "Edge", "        "],
]) {
  const before = endpoints + header;
  const line = before.split("\n").length;
  const completion = engine.complete({ sourceName: "model.ai", source: before + indent,
    cursorOffset: before.length + indent.length, snapshot });
  const expectedOperators = operators.filter(([, , family]) => expectedType === "Edge" || family === expectedType).map(([spelling]) => spelling).sort();
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

console.log("core operator family contracts passed");
