import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { CompletionEngine, ProjectAnalysisSession, selectGraph, createGeneratedInsightSyntaxProvider } from "../build/runtime/index.js";

const definitions = { sourceName: "definitions.ai", source: `define type AppEnvironment of Environment
    Compute compute
    Storage database

define operator Borrow of DeploymentAction
    constructor borrow InfrastructureComponent
        on System or ContainerElement
    capability = "deployment-share"
` };
const regions = ["eu", "sa"].map((region) => ({ sourceName: region + ".ai", source: `environment ${region}
    name = ${region}

deployment production
    compute:
        compute host
            name = Host
    database:
        storage pg
            name = PostgreSQL
            route:
                $from connectTo $this
` }));
const profile = { sourceName: "profile.ai", source: `context shop

deploymentProfile regional
    appliesTo:
        production from eu
        production from sa
    runsOn compute
` };
const consumer = { sourceName: "worker.ai", source: `context shop

system billing
    name = billing

    service worker
        name = Worker
        deployment:
            uses regional
            shares orderLedger from api
` };
const provider = { sourceName: "api.ai", source: `context shop

system orders
    name = orders

    service api
        name = API
        deployment:
            uses regional
            uses database as orderLedger
                name = ABC
            uses database as audit
                name = ABC
` };
const sources = [definitions, ...regions, profile, consumer, provider];
const session = ProjectAnalysisSession.create(sources);
function check(result) {
  assert.deepEqual(result.diagnostics, []);
  const owned = result.elements.find((item) => item.id === "shop/api").attributes.uses;
  const shared = result.elements.find((item) => item.id === "shop/worker").attributes.uses;
  assert.equal(new Set(owned).size, 4);
  assert.equal(new Set(shared).size, 2);
  assert(shared.every((id) => owned.includes(id)));
  assert.deepEqual(result.elements.filter((e) => shared.includes(e.id)).map((e) => e.cloneOf).sort(), ["eu/pg", "sa/pg"]);
  for (const id of shared) {
    for (const source of ["shop/api", "shop/worker"]) {
      assert(result.edges.some((edge) => edge.source === source && edge.target === id), `missing ${source} -> ${id}`);
    }
  }
  return shared;
}
const shared = check(session.analysis().result);

for (const view of ["deployment-container", "deployment-system", "deployment", "c2"]) {
  const query = readFileSync(new URL(`../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/${view}.aiq`, import.meta.url), "utf8");
  const graph = selectGraph(session.analysis().result, {context: "shop", tab: "worker.ai", environment: "eu", view}, query);
  const targets = graph.edges.map((edge) => edge.target).sort();
  if (view === "c2") {
    assert.deepEqual(Object.keys(graph.elements), ["shop/worker"]);
  } else if (view === "deployment-container") {
    assert.deepEqual(targets, [shared[0]]);
    assert.equal(graph.elements[shared[1]], undefined);
  } else {
    assert.deepEqual(targets, [...shared].sort());
  }
}
assert.deepEqual(check(ProjectAnalysisSession.create([...sources].reverse()).analysis().result), shared);
const change = (doc, before, after) => sources.map((item) => item === doc
  ? { ...item, source: item.source.replace(before, after) } : item);
const renamed = change(provider, "as orderLedger", "as orders");
const warm = ProjectAnalysisSession.restore(session.portableSnapshot());
const update = warm.update(renamed);
const cold = ProjectAnalysisSession.create(renamed).analysis();
assert.deepEqual(update.result.diagnostics, cold.result.diagnostics);
assert(update.result.diagnostics.some((d) => d.sourceName === "worker.ai" && d.message.includes("no binding 'orderLedger'")));
assert.deepEqual(check(warm.update(sources).result), shared);
const relabelled = change(provider, "uses database as orderLedger\n                name = ABC",
  "\n            uses database as orderLedger\n                name = New display name");
assert.deepEqual(check(warm.update(relabelled).result), shared);

for (const [input, diagnostic] of [
  [change(consumer, "orderLedger from api", "database from api"), "Ambiguous binding"],
  [change(consumer, "orderLedger from api", "orderLedger from missing"), "Unknown infrastructure owner"],
  [change(consumer, "orderLedger from api", "orderLedger"), "requires 'from <owner>'"],
  [change(consumer, "orderLedger from api", "orderLedger from api\n                name = Other"), "overrides on the owning use"],
  [change(provider, "as audit", "as orderLedger"), "already declared"],
  [change(provider, "uses regional", "uses regional as region"), "Only an infrastructure use"],
  [change(provider, "uses regional", "runsOn host from eu"), "is not deployed in 'sa/production'"],
]) {
  const result = ProjectAnalysisSession.create(input).analysis().result;
  assert(result.diagnostics.some((d) => d.message.includes(diagnostic)), JSON.stringify(result.diagnostics));
}
const shorthand = change(provider, "            uses database as audit\n                name = ABC\n", "")
  .map((item) => item === consumer ? { ...item, source: item.source.replace("shares orderLedger", "shares database") } : item);
const shortResult = ProjectAnalysisSession.create(shorthand).analysis().result;
assert.deepEqual(shortResult.diagnostics, []);
assert.deepEqual(shortResult.elements.find((e) => e.id === "shop/worker").attributes.uses, shared);
const withoutRoute = sources.map((item) => regions.includes(item)
  ? {...item, source: item.source.replace("            route:\n                $from connectTo $this\n", "")} : item);
const inventory = ProjectAnalysisSession.create(withoutRoute).analysis().result;
const detailQuery = readFileSync(new URL("../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/deployment-container.aiq", import.meta.url), "utf8");
const detail = selectGraph(inventory, {context: "shop", tab: "worker.ai", environment: "eu", view: "deployment-container"}, detailQuery);
assert(detail.elements[shared[0]]);
assert(!detail.elements[shared[1]]);
assert.deepEqual(detail.edges, []);

// A routed storage endpoint must resolve to the customized instance in both
// the compact and sectioned route forms.
check(ProjectAnalysisSession.create(sources.map((item) => regions.includes(item)
  ? { ...item, source: item.source.replace("                $from connectTo $this",
    "                outbound:\n                    $from connectTo $this") } : item)).analysis().result);

// Shared inventory and pinned inventory require no owner declarations.
for (const [selection, ids] of [["database", ["eu/pg", "sa/pg"]], ["pg from eu", ["eu/pg"]]]) {
  const input = change(consumer, "shares orderLedger from api", "uses " + selection);
  const result = ProjectAnalysisSession.create(input).analysis().result;
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.elements.find((item) => item.id === "shop/worker").attributes.uses, ids);
}

const noAliases = change(provider, " as orderLedger", "").map((item) => item.sourceName === provider.sourceName
  ? {...item, source: item.source.replace(" as audit", "")} : item === consumer
    ? {...item, source: item.source.replace("shares orderLedger", "shares database")} : item);
const ambiguous = ProjectAnalysisSession.create(noAliases).analysis().result.diagnostics;
assert.equal(ambiguous.length, 2);
for (const d of ambiguous) {
  assert.equal(d.code, "SHARED_INFRASTRUCTURE_UNRESOLVED");
  assert.equal(d.sourceName, consumer.sourceName);
  assert.equal(d.line, 10);
  assert.equal(d.column, 20);
  assert.equal(d.endColumn, 28);
}
const imported = change(consumer, "context shop", "context client\n\nimport api from context shop as owner\nimport regional from context shop")
  .map((item) => item.sourceName === consumer.sourceName
    ? {...item, source: item.source.replace("from api", "from owner")} : item);
const importedSession = ProjectAnalysisSession.create(imported);
assert.deepEqual(importedSession.analysis().diagnostics, []);
const changedLabel = imported.map((item) => item.sourceName === consumer.sourceName
  ? {...item, source: item.source.replace("name = Worker", "name = Worker B")} : item);
const edited = importedSession.update(changedLabel);
assert.deepEqual(edited.diagnostics, []);
assert.deepEqual(edited.result.elements.find((e) => e.id === "client/worker").attributes.uses, shared);
const inherited = sources.map((item) => {
  if (item === profile) return {...item, source: item.source + "    uses database as orderLedger\n        name = ABC\n"};
  if (item === provider) return {...item, source: item.source.replace(/            uses database as orderLedger[\s\S]*/, "")};
  return item;
});
const inheritedResult = ProjectAnalysisSession.create(inherited).analysis().result;
assert.deepEqual(inheritedResult.diagnostics, []);
const providerIds = inheritedResult.elements.find((e) => e.id === "shop/api").attributes.uses;
const consumerIds = inheritedResult.elements.find((e) => e.id === "shop/worker").attributes.uses;
// Both elements instantiate the profile. An explicit share selects the provider's
// customized instance even though the consumer also owns its own profile use.
assert.equal(new Set([...providerIds, ...consumerIds]).size, 4);
assert(providerIds.every((id) => consumerIds.includes(id)));

const engine = new CompletionEngine(createGeneratedInsightSyntaxProvider());
const completion = (fragment) => {
  const source = consumer.source.replace("shares orderLedger from api\n", fragment);
  return engine.complete({sourceName: consumer.sourceName, source, cursorOffset: source.length,
    snapshot: session.analysis().snapshotBuild.snapshot, indexedIdentifiers: new Map([["api", {
      label: "api", type: "System", deploymentUseNames: ["orderLedger", "audit"] }]])}).items.map((i) => i.label);
};
assert.deepEqual(completion("borrow "), ["audit", "orderLedger"]);
assert.deepEqual(completion("borrow orderLedger "), ["from"]);
assert.deepEqual(completion("borrow orderLedger from "), ["api"]);
console.log("shared deployment binding contracts passed");
