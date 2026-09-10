import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources, CompletionEngine, coreLanguageSnapshot,
  createGeneratedInsightSyntaxProvider, linkProject,
} from "../build/runtime/index.js";
import { TypeSystem } from "../build/runtime/type-system.js";

const built = buildLanguageSnapshotResultFromSources([{ sourceName: "custom.ai", source: `
define type Catalog of System
    constructor catalog
        kind = internal

define type Worker of Service
    constructor worker

define type Part of Component
    constructor part

    List of DeploymentAction actions
    List of Token code

define type Token of CodeElement
    constructor token

    Text name

define type Person of Actor
    constructor person
        kind = internal

define type Rack of Compute
    constructor rack

define type Policy of DeploymentProfile
    constructor policy
` }], [coreLanguageSnapshot]);
assert.deepEqual(built.diagnostics, []);
// Exercise the serialized vocabulary consumed by every client.
const snapshot = JSON.parse(JSON.stringify(built.snapshot));
const types = new TypeSystem(snapshot);
const engine = new CompletionEngine(createGeneratedInsightSyntaxProvider());
const allowedOwners = ["System", "ExternalSystem", "Catalog", "ContainerElement", "Container", "Service", "Worker", "Wire", "SyncWire", "AsyncWire"];
const forbiddenOwners = ["Element", "BoundaryElement", "SystemElement", "Actor", "Person", "ComponentElement", "Component", "Part", "CodeElement", "Token", "DeploymentProfile", "Policy", "DeploymentElement", "Deployment", "Environment", "InfrastructureComponent", "Compute", "Rack"];
for (const owner of allowedOwners) {
  assert.equal(types.attribute(owner, "deployment")?.listElementType, "DeploymentAction", owner);
  assert.deepEqual(types.attribute(owner, "deployment")?.capabilities, ["deployment-actions"], owner);
}
for (const owner of forbiddenOwners) {
  assert.equal(types.attribute(owner, "deployment"), undefined, `${owner} must not expose deployment`);
}
for (const owner of ["System", "Catalog", "ContainerElement", "Worker", "DeploymentProfile", "Policy", "Wire", "SyncWire", ...forbiddenOwners.filter((owner) => !["DeploymentProfile", "Policy"].includes(owner))]) {
  const actual = types.operatorConstructorsFrom(owner, "DeploymentAction")
    .map((operator) => `${operator.spelling} ${operator.targetType}`).sort();
  const expected = ["DeploymentProfile", "Policy"].includes(owner)
    ? ["runsOn InfrastructureComponent", "uses InfrastructureComponent"]
    : ["Wire", "SyncWire"].includes(owner)
    ? ["uses NetworkConnection"]
    : ["System", "Catalog", "ContainerElement", "Worker"].includes(owner)
    ? ["runsOn InfrastructureComponent", "uses DeploymentProfile", "uses InfrastructureComponent"]
    : [];
  assert.deepEqual(actual, expected, owner);
}

const environment = { sourceName: "infra.ai", source: `environment region
    name = Region

deployment release
    compute host
        name = Host
    networkConnection network
        name = Network
` };
const preamble = `context domain

import host from environment region
import network from environment region

policy profile
    appliesTo:
        release from region
    runsOn host

`;
const ownerCases = [
  ["Catalog", "catalog app\n    name = App\n", 4, true],
  ["Worker", "catalog app\n    name = App\n    worker worker1\n        name = Worker\n", 8, true],
  ["Worker", "catalog app\n    name = App\n    worker _\n        name = Worker\n", 8, true],
  ["Part", "catalog app\n    name = App\n    worker worker1\n        name = Worker\n        part part1\n            name = Part\n", 12, false],
  ["Token", "catalog app\n    name = App\n    worker worker1\n        name = Worker\n        part part1\n            name = Part\n            code:\n                token token1\n                    name = Token\n", 20, false],
  ["Person", "person user\n    name = User\n", 4, false],
  ["Policy", "policy other\n    appliesTo:\n        release from region\n", 4, false],
  ["Rack", "rack machine\n    name = Machine\n", 4, false],
];
const complete = (source) => engine.complete({ sourceName: "model.ai", source,
  cursorOffset: source.length, snapshot }).items;
const errors = (result) => result.diagnostics.filter(({ level }) => (level ?? "ERROR") === "ERROR");
const link = (source) => linkProject({ snapshot, sources: [{ sourceName: "model.ai", source }, environment] });
for (const [owner, header, depth, allowed] of ownerCases) {
  const indent = " ".repeat(depth);
  const before = preamble + header;
  for (const prefix of ["", "d", "deployment"]) {
    const candidates = complete(before + indent + prefix).map(({ label }) => label);
    assert.equal(candidates.includes("deployment"), allowed, `${owner}: ${JSON.stringify(prefix)}`);
  }
  if (allowed) {
    assert.deepEqual(complete(before + indent + "deployment:\n" + indent + "    ")
      .filter(({ kind }) => kind === "OPERATOR").map(({ label }) => label).sort(), ["runsOn", "uses"], owner);
    for (const action of ["uses profile", "runsOn host", "uses network"]) {
      const result = link(before + indent + "deployment:\n" + indent + "    " + action + "\n");
      assert.deepEqual(errors(result), [], `${owner}: ${action}`);
      const deployed = result.elements.filter(({ type, attributes }) => type === owner &&
        (attributes.runsOn?.length || attributes.uses?.length));
      assert.equal(deployed.length, 1, `${owner}: ${action}`);
    }
  } else {
    const result = link(before + indent + "deployment:\n" + indent + "    runsOn host\n");
    const line = before.split("\n").length;
    assert.deepEqual(errors(result).filter(({ code }) => code === "ATTRIBUTE_NOT_DECLARED"), [{
      code: "ATTRIBUTE_NOT_DECLARED", message: `Attribute 'deployment' is not declared on type '${owner}'`,
      sourceName: "model.ai", line, column: depth + 1, endLine: line, endColumn: depth + 11,
    }], owner);
    assert(!result.elements.some(({ type, attributes }) => type === owner && attributes.runsOn?.length), owner);
  }
}
// Declaring an action slot on a component does not bypass core operator owner constraints.
const part = ownerCases.find(([owner]) => owner === "Part");
const partActions = preamble + part[1] + "            actions:\n                ";
assert.deepEqual(complete(partActions).filter(({ kind }) => kind === "OPERATOR"), []);
for (const action of ["runsOn host", "uses host", "uses profile"]) {
  const line = partActions.split("\n").length;
  const spelling = action.split(" ")[0];
  assert.deepEqual(errors(link(partActions + action + "\n")), [{
    code: "TYPE_MISMATCH", message: `Operator '${spelling}' is not compatible with 'Part' (expected 'DeploymentAction')`,
    sourceName: "model.ai", line, column: 17, endLine: line, endColumn: 17 + spelling.length,
  }]);
}
const profileBody = preamble + "policy other\n    appliesTo:\n        release from region\n    ";
assert.deepEqual(complete(profileBody).filter(({ kind }) => kind === "OPERATOR").map(({ label }) => label).sort(), ["runsOn", "uses"]);
assert.deepEqual(errors(link(profileBody + "uses network\n")), []);
const profileLine = profileBody.split("\n").length;
assert.deepEqual(errors(link(profileBody + "uses profile\n\ncatalog app\n    name = App\n    deployment:\n        uses other\n")), [{
  code: "TYPE_MISMATCH", message: "Operator 'uses' cannot be applied from 'Policy' to 'Policy'",
  sourceName: "model.ai", line: profileLine, column: 5, endLine: profileLine, endColumn: 18,
}]);
for (const [owner, header] of [
  ["Environment", "environment local\n    name = Local\n"],
  ["Deployment", "environment local\n    name = Local\n\ndeployment localRelease\n    name = Release\n"],
]) {
  assert(!complete(header + "    ").some(({ label, kind }) => label === "deployment" && kind === "ATTRIBUTE"), owner);
}
// Infrastructure placement references remain distinct from deployment action blocks.
assert.deepEqual(errors(link(preamble + "rack machine\n    name = Machine\n    runsOn:\n        host\n")), []);

console.log("deployment owner scope contracts passed");
