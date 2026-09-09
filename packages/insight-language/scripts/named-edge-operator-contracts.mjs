import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  CompletionEngine,
  coreLanguageSnapshot,
  createGeneratedInsightSyntaxProvider,
  linkProject,
  mergeLanguageSnapshots,
  parseInsightSource,
  renderGraphviz,
  selectGraph,
  semanticHighlightInsight,
} from "../build/runtime/index.js";

const source = (sourceName, source) => ({ sourceName, source });
const definitions = buildLanguageSnapshotResultFromSources([source("operators.ai", `
define operator PublishOperator of Wire
    constructor publish System
        on System
    constructor publish Service
        on System
    constructor publish Service
        on Service
    constructor %> System
        on System
        model = sync
`)], [coreLanguageSnapshot]);
assert.deepEqual(definitions.diagnostics, []);
const snapshot = JSON.parse(JSON.stringify(definitions.snapshot));

const deploymentDefinitions = buildLanguageSnapshotResultFromSources([source("placement.ai", `
define operator HostPlacement of DeploymentAction
    constructor place InfrastructureComponent
        on System
    capability = "deployment-placement"
`)], [snapshot]);
assert.deepEqual(deploymentDefinitions.diagnostics, []);
for (const operator of ["uses", "runsOn", "place"]) {
  for (const suffix of ["", " ", "\n", " \n"]) {
    const result = linkProject({ snapshot: deploymentDefinitions.snapshot, sources: [source("deployment.ai", `context test
system tt
    name = Fff
    deployment:
        ${operator}${suffix}`)] });
    assert.deepEqual(result.diagnostics, [{
      code: "IDENTIFIER_REQUIRED", message: "Target identifier is required",
      sourceName: "deployment.ai", line: 5, column: 9, endLine: 5, endColumn: 9 + operator.length,
    }]);
    assert.equal(result.edges.length, 0);
  }
}

for (const [value, code] of [["publish", "TYPE_MISMATCH"], ["unknown", "UNDECLARED_IDENTIFIER"], ["uses from elsewhere", "UNDECLARED_IDENTIFIER"]]) {
  const result = linkProject({ snapshot, sources: [source("deployment.ai", `context test
system tt
    name = Fff
    deployment:
        ${value}
`)] });
  assert.deepEqual(result.diagnostics.map(({ code }) => code), [code]);
}

for (const [operator, suffix] of ["publish", "->", "~>", "%>"].flatMap((operator) =>
  ["", " ", "\n", " \n"].map((suffix) => [operator, suffix]))) {
  const model = source("incomplete.ai", `context test
system tt
    name = Fff
    links:
        ${operator}${suffix}`);
  const result = linkProject({ snapshot, sources: [model] });
  assert.deepEqual(result.diagnostics, [{
    code: "IDENTIFIER_REQUIRED", message: "Target identifier is required",
    sourceName: "incomplete.ai", line: 5, column: 9, endLine: 5, endColumn: 9 + operator.length,
  }]);
  assert.equal(result.edges.length, 0);
  assert.deepEqual(result.elements.map(({ id }) => id), ["test/tt"]);
  if (operator !== "publish") {
    const parsed = parseInsightSource(model);
    assert.deepEqual(parsed.diagnostics, []);
    assert.equal(parsed.metadata.reliable, true);
    assert.deepEqual(semanticHighlightInsight(model.source, snapshot).filter(({ line }) => line === 4), [
      { line: 4, column: 8, length: operator.length, type: "operator" },
    ]);
  }
}

for (const operator of ["->", "~>", "%>"]) {
  const result = linkProject({ snapshot, sources: [source("recovered-symbol.ai", `context test
system caller
    name = Caller
    links:
        ${operator} # unfinished
            technology = HTTP
        ${operator} receiver
system receiver
    name = Receiver
`)] });
  assert.deepEqual(result.diagnostics, [{
    code: "IDENTIFIER_REQUIRED", message: "Target identifier is required",
    sourceName: "recovered-symbol.ai", line: 5, column: 9, endLine: 5, endColumn: 11,
  }]);
  assert.deepEqual(result.edges.map(({ operator, source, target, attributes }) => ({ operator, source, target, attributes })), [{
    operator, source: "test/caller", target: "test/receiver", attributes: { model: [operator === "~>" ? "async" : "sync"] },
  }]);
}

for (const [body, code, message] of [
  ["    deployment:\n        ->\n", "TYPE_MISMATCH", "Operator '->' is not compatible with 'System' (expected 'DeploymentAction')"],
  ["    links:\n        -> receiver\n            deployment:\n                ->\n", "TYPE_MISMATCH", "Operator '->' is not compatible with 'SyncWire' (expected 'DeploymentAction')"],
]) {
  const result = linkProject({ snapshot, sources: [source("deployment-symbol.ai", `context test
system caller
    name = Caller
${body}system receiver
    name = Receiver
`)] });
  const errors = result.diagnostics.filter(({ level }) => (level ?? "ERROR") === "ERROR");
  assert.deepEqual(errors.map(({ code, message }) => ({ code, message })), [
    { code, message },
  ]);
}

for (const invocation of ["publish google", "publish google from external_systems"]) {
  const model = source("model.ai", `context test
import google from context external_systems
system tt
    name = Fff
    links:
        ${invocation}
            model = async
            description = Published
`);
  assert.deepEqual(parseInsightSource(model).diagnostics, []);
  const linked = linkProject({ snapshot, sources: [model, source("external.ai", `context external_systems
system google
    name = Google
`)] });
  assert.deepEqual(linked.diagnostics, []);
  assert.deepEqual(linked.edges.map(({ source, target, operator, type, attributes }) =>
    ({ source, target, operator, type, attributes })), [{
    source: "test/tt", target: "external_systems/google", operator: "publish", type: "PublishOperator",
    attributes: { model: ["async"], description: ["Published"] },
  }]);
  assert.deepEqual(linked.elements.map(({ id }) => id).sort(), ["external_systems/google", "test/tt"]);
  const tokens = semanticHighlightInsight(model.source, snapshot).filter(({ line }) => line === 5);
  assert.deepEqual(tokens.slice(0, 2).map(({ type, modifiers }) => ({ type, modifiers })), [
    { type: "operator", modifiers: undefined }, { type: "variable", modifiers: undefined },
  ]);
}

// Narrow built-in types, inherited types, and unrelated project vocabularies use
// the same dispatch. A Service cannot publish to a System with these overloads.
for (const [owner, target, valid] of [
  ["system", "system", true], ["system", "service", true],
  ["service", "service", true], ["service", "system", false],
  ["container", "service", false], ["system", "container", false],
]) {
  const ownerIndent = owner === "system" ? "" : "    ";
  const targetIndent = target === "system" ? "" : "    ";
  const model = source("matrix.ai", `context test
system root
    name = Root
${ownerIndent}${owner} caller
${ownerIndent}    name = Caller
${ownerIndent}    links:
${ownerIndent}        publish receiver
${ownerIndent}            model = async
${targetIndent}${target} receiver
${targetIndent}    name = Receiver
`);
  const result = linkProject({ snapshot, sources: [model] });
  const errors = result.diagnostics.filter(({ level }) => level === undefined || level === "ERROR");
  assert.equal(result.edges.length, valid ? 1 : 0, `${owner} -> ${target}`);
  assert.deepEqual(errors.map(({ code }) => code), valid ? [] : ["TYPE_MISMATCH"]);
  if (!valid) {
    const line = model.source.split("\n").findIndex((line) => line.includes("publish receiver")) + 1;
    const column = model.source.split("\n")[line - 1].indexOf("publish") + 1;
    assert.deepEqual(errors[0], owner === "container" ? {
      code: "TYPE_MISMATCH",
      message: "Operator 'publish' is not compatible with 'Container' (expected 'Wire')",
      sourceName: "matrix.ai", line, column, endLine: line, endColumn: column + "publish".length,
    } : {
      code: "TYPE_MISMATCH",
      message: `Operator 'publish' cannot be applied from '${owner[0].toUpperCase() + owner.slice(1)}' to '${target[0].toUpperCase() + target.slice(1)}'`,
      sourceName: "matrix.ai", line, column, endLine: line, endColumn: column + "publish receiver".length,
    });
  }
}

const missing = linkProject({ snapshot, sources: [source("missing.ai", `context test
system caller
    name = Caller
    links:
        publish missing
`)] });
assert.equal(missing.edges.length, 0);
assert.deepEqual(missing.diagnostics, [{
  code: "UNDECLARED_IDENTIFIER", message: "Element 'missing' is not declared", sourceName: "missing.ai",
  line: 5, column: 17, endLine: 5, endColumn: 24,
}]);

// The unmodified report also omits Wire's required model. Once dispatch works,
// this must produce the actual attribute diagnostic on the invocation header.
const noModel = linkProject({ snapshot, sources: [source("no-model.ai", `context test
system caller
    name = Caller
    links:
        publish receiver
system receiver
    name = Receiver
`)] });
assert.deepEqual(noModel.diagnostics, [{
  code: "REQUIRED_ATTRIBUTE_MISSING", message: "Required attribute 'model' is missing on type 'PublishOperator'",
  sourceName: "no-model.ai", line: 5, column: 9, endLine: 5, endColumn: 25,
}]);

const optionalModelSnapshot = {
  ...snapshot,
  types: snapshot.types.map((type) => type.name !== "Wire" ? type : {
    ...type,
    attributes: type.attributes.map((attribute) => {
      if (attribute.name !== "model") return attribute;
      const { required, ...optional } = attribute;
      return optional;
    }),
  }),
};
const optionalModel = linkProject({ snapshot: optionalModelSnapshot, sources: [
  source("optional-model.ai", `context test
import google from context external_systems
system tt
    name = Fff
    links:
        publish google
`),
  source("external.ai", `context external_systems
system google
    name = Google
`),
] });
assert.deepEqual(optionalModel.diagnostics, []);
assert.equal(optionalModel.edges.length, 1);
assert.equal(optionalModel.edges[0].type, "PublishOperator");
assert.equal(optionalModel.edges[0].attributes.model, undefined);
const graph = selectGraph(optionalModel, { context: "test" },
  "MATCH (n:System)-[r]->(m:System) WHERE n.context = $context RETURN n, r, m");
assert.deepEqual(Object.keys(graph.elements).sort(), ["external_systems/google", "test/tt"]);
assert.equal(graph.edges.length, 1);
assert(renderGraphviz(optionalModel, graph).includes('"test/tt" -> "external_systems/google"'));
assert.equal(snapshot.types.find(({ name }) => name === "Wire").attributes.find(({ name }) => name === "model").required, true);

const custom = buildLanguageSnapshotResultFromSources([source("custom.ai", `
define type Endpoint of BoundaryElement
    constructor endpoint
    List of Wire routes
    List of Delivery deliveries
    List of Endpoint peers
    List of Endpoint _
define type NarrowEndpoint of Endpoint
    constructor narrowEndpoint
define type SpecializedEndpoint of NarrowEndpoint
    constructor specializedEndpoint
define operator Delivery of Wire
    constructor delivers NarrowEndpoint
        on NarrowEndpoint
        model = async
`)], [coreLanguageSnapshot]);
assert.deepEqual(custom.diagnostics, []);
for (const [owner, list, operator, expectedType] of [
  ["endpoint", "routes", "delivers", "Wire"],
  ["narrowEndpoint", "routes", "connectTo", "Wire"],
  ["narrowEndpoint", "deliveries", "publish", "Delivery"],
]) {
  const result = linkProject({ snapshot: mergeLanguageSnapshots([snapshot, custom.snapshot]), sources: [source("incompatible.ai", `context test
${owner} caller
    ${list}:
        ${operator}
`)] });
  assert.deepEqual(result.diagnostics, [{
    code: "TYPE_MISMATCH",
    message: `Operator '${operator}' is not compatible with '${owner === "endpoint" ? "Endpoint" : "NarrowEndpoint"}' (expected '${expectedType}')`,
    sourceName: "incompatible.ai", line: 4, column: 9, endLine: 4, endColumn: 9 + operator.length,
  }]);
  assert.equal(result.edges.length, 0);
}
const recovered = linkProject({ snapshot: custom.snapshot, sources: [source("recovery.ai", `context test
endpoint root
    narrowEndpoint caller
        routes:
            delivers
            delivers receiver
    narrowEndpoint receiver
`)] });
assert.deepEqual(recovered.diagnostics, [{
  code: "IDENTIFIER_REQUIRED", message: "Target identifier is required",
  sourceName: "recovery.ai", line: 5, column: 13, endLine: 5, endColumn: 21,
}]);
assert.deepEqual(recovered.edges.map(({ source, target }) => ({ source, target })), [
  { source: "test/caller", target: "test/receiver" },
]);

// A reference in an ordinary element list can share an operator's spelling.
for (const reference of ["delivers", "delivers from remote"]) {
  const result = linkProject({ snapshot: custom.snapshot, sources: [
    source("references.ai", `context test
import delivers from context remote
endpoint caller
    peers:
        ${reference}
`),
    source("remote.ai", "context remote\nendpoint delivers\n"),
  ] });
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.elements.find(({ id }) => id === "test/caller").attributes.peers, ["remote/delivers"]);
}

const unknown = linkProject({ snapshot: custom.snapshot, sources: [source("unknown.ai", `context test
narrowEndpoint caller
    routes:
        missing
`)] });
assert.deepEqual(unknown.diagnostics.map(({ code, message }) => ({ code, message })), [
  { code: "UNDECLARED_IDENTIFIER", message: "Element 'missing' is not declared" },
]);

for (const declaration of ["narrowEndpoint caller", "narrowEndpoint _", "specializedEndpoint caller"]) {
  const model = source("custom-model.ai", `context test
endpoint root
    endpoint nested
        ${declaration}
            routes:
                delivers receiver
        narrowEndpoint receiver
`);
  const result = linkProject({ snapshot: custom.snapshot, sources: [model] });
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.edges.map(({ operator, type, target }) => ({ operator, type, target })), [
    { operator: "delivers", type: "Delivery", target: "test/receiver" },
  ]);
}

const completion = new CompletionEngine(createGeneratedInsightSyntaxProvider());
for (const operator of ["->", "~>", "%>"]) {
  for (const target of ["__CURSOR__", "__CURSOR__receiver", "rec__CURSOR__eiver", "receiver__CURSOR__"]) {
    const marked = `context test
system receiver
    name = Receiver
system caller
    name = Caller
    links:
        ${operator} ${target}`;
    const result = completion.complete({
      sourceName: "symbol-completion.ai", source: marked.replace("__CURSOR__", ""),
      cursorOffset: marked.indexOf("__CURSOR__"), snapshot,
    });
    assert.deepEqual(result.items.map(({ label }) => label).sort(), target.startsWith("__CURSOR__") ? ["caller", "receiver"] : ["receiver"]);
  }
}
const completionPrefix = `context test
endpoint broad
narrowEndpoint receiver
narrowEndpoint caller
    routes:
        `;
for (const [line, expected] of [
  ["__CURSOR__", ["->", "@deprecated", "@planned", "delivers", "~>"]],
  ["delivers __CURSOR__", ["caller", "receiver"]],
  ["delivers __CURSOR__receiver", ["caller", "receiver"]],
  ["delivers rec__CURSOR__eiver", ["receiver"]],
  ["delivers receiver__CURSOR__", ["receiver"]],
]) {
  const marked = completionPrefix + line;
  const result = completion.complete({
    sourceName: "completion.ai", source: marked.replace("__CURSOR__", ""),
    cursorOffset: marked.indexOf("__CURSOR__"), snapshot: custom.snapshot,
  });
  assert.deepEqual(result.items.map(({ label }) => label).sort(), expected.sort(), line);
}
const body = `context test
system receiver
    name = Receiver
system caller
    name = Caller
    links:
        publish receiver
            `;
assert.deepEqual(completion.complete({ sourceName: "body.ai", source: body, cursorOffset: body.length, snapshot })
  .items.map(({ label }) => label).sort(), ["deployment", "description", "model", "technology", "uses"]);

console.log("named edge operator contracts passed");
