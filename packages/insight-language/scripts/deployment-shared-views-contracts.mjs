import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ProjectAnalysisSession, selectGraph, executeQuery } from "../build/runtime/index.js";

const regions = ["r0", "r1"];
const definitions = { sourceName: "framework.ai", source: "extend type Environment\n    Compute compute\n    Storage storage\n" };
const environments = regions.map((r) => ({ sourceName: r + ".ai", source: `environment ${r}
    name = ${r}

deployment production
    compute:
        compute k8s_${r}
            name = Host
    storage:
        storage aurora_${r}
            name = Inventory
            route:
                $from originalLink $this
` }));
const header = `context shop
deploymentProfile regional
    appliesTo:
        production from r0
        production from r1
    runsOn compute
`;
const ownerSystem = "system orders_sys\n    name = Orders\n";
const api = `    service api
        name = API
        deployment:
            uses regional
            uses storage as ledger
                name = Ledger
`;
const consumer = `    service consumer
        name = Consumer
        deployment:
            uses regional
            shares ledger from api
`;
const billing = "system billing_sys\n    name = Billing\n";
const model = (source, sourceName = "model.ai") => ({source, sourceName});
const link = (...models) => ProjectAnalysisSession.create([definitions, ...environments, ...models]).analysis().result;
const graph = (result, view, tab = "model.ai", context = "shop") => selectGraph(result,
  { view, context, tab, ...(view === "deployment-container" && {environment: "r0"}) },
  readFileSync(new URL(`../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/${view}.aiq`, import.meta.url), "utf8"));
const scenarios = [
  { inputs: [model(header + ownerSystem + api + consumer)], context: "shop", system: "orders_sys" },
  { inputs: [model(header + ownerSystem + api + billing + consumer)], context: "shop", system: "billing_sys" },
  { inputs: [model(header + ownerSystem + api), model("context pay\nimport api from context shop\nimport regional from context shop\n" + billing + consumer, "consumer.ai")], context: "pay", system: "billing_sys" },
];
for (const {inputs, context, system} of scenarios) {
  const result = link(...inputs);
  assert(!result.diagnostics.some((d) => (d.level ?? "ERROR") === "ERROR"));
  const clones = Object.fromEntries(result.elements.filter((e) => e.cloneOf && e.type === "Storage").map((e) => [e.infrastructureEnvironment, e.id]));
  for (const input of inputs) {
    for (const view of ["deployment", "deployment-container", "deployment-system"]) {
      const g = graph(result, view, input.sourceName, input === inputs[0] ? "shop" : context);
      const expected = new Map();
      for (const r of view === "deployment-container" ? ["r0"] : regions) {
        const add = (service, sourceSystem) => {
          const drawn = view === "deployment-system" ? sourceSystem : service;
          const key = drawn + "@@" + r + "/k8s_" + r + " -> " + clones[r];
          expected.set(key, [...(expected.get(key) ?? []), service]);
        };
        if (input === inputs[0]) add("shop/api", "shop/orders_sys");
        add(context + "/consumer", context + "/" + system);
      }
      const keys = g.edges.map((e) => e.source + " -> " + e.target).sort();
      assert.deepEqual(keys, [...expected.keys()].sort(), view + " " + input.sourceName);
      for (const e of g.edges) {
        assert.deepEqual(e.edge.projectionOrigins.map((o) => o.source).sort(), expected.get(e.source + " -> " + e.target).sort());
      }
    }
  }
}

const systemDeployment = `    deployment:
        uses regional
        uses storage
            name = System ledger
`;
const bareChild = api.replace("uses storage as ledger\n                name = Ledger", "uses storage");
const parentModel = header + ownerSystem + systemDeployment;
const conflictCode = "DEPLOYMENT_OWNERSHIP_CONFLICT";
const plainPlacement = "    deployment:\n        uses regional\n";
const aliasDeployment = systemDeployment.replace("uses storage", "uses storage as order_db");
const sharesFromSystem = bareChild.replace("uses storage", "shares order_db from orders_sys")
  + consumer.replace("ledger from api", "order_db from orders_sys");

for (const [parent, children, expectedChildren] of [
  [plainPlacement, bareChild.replace("            uses storage\n", ""), ["api"]],
  [aliasDeployment, sharesFromSystem, ["api", "consumer"]],
  [aliasDeployment, bareChild, ["api"]],
  [systemDeployment, bareChild, ["api"]],
]) {
  const prefix = header + ownerSystem + parent;
  const result = link(model(prefix + children));
  const errors = result.diagnostics.filter((d) => (d.level ?? "ERROR") === "ERROR");
  assert.deepEqual(errors.map((d) => d.code), expectedChildren.map(() => conflictCode));
  for (const [i, error] of errors.entries()) {
    assert(error.message.includes("shop/orders_sys") && error.message.includes("shop/" + expectedChildren[i]));
    const lines = (prefix + children).split("\n");
    assert.equal(lines[error.line - 1].slice(error.column - 1, error.endColumn - 1), "uses regional");
    assert.equal(error.sourceName, "model.ai");
    assert(error.message.includes("model.ai:" + (lines.indexOf("        uses regional") + 1) + ":9"));
  }
}

const splitProfiles = regions.map((r) => `deploymentProfile only_${r}
    appliesTo:
        production from ${r}
    runsOn compute
`).join("");
const separateRegions = model("context shop\n" + splitProfiles + ownerSystem
  + plainPlacement.replace("regional", "only_r0") + bareChild.replace("regional", "only_r1"));
assert.deepEqual(link(separateRegions).diagnostics.map((d) => d.code), [conflictCode]);

const externalConsumers = billing + sharesFromSystem;
const passiveChild = "    service checkout\n        name = Checkout\n";
const systemShared = link(model(header + ownerSystem + aliasDeployment + passiveChild + externalConsumers));
assert.deepEqual(systemShared.diagnostics.filter((d) => (d.level ?? "ERROR") === "ERROR"
  || d.code === "ELEMENT_MISSING_DEPLOYMENT"), []);
for (const view of ["deployment-system", "deployment-container", "deployment"]) {
  const edges = graph(systemShared, view).edges;
  const expected = {};
  for (const r of view === "deployment-container" ? ["r0"] : regions) {
    const clone = systemShared.elements.find((e) => e.bindingOwner === "shop/orders_sys" && e.infrastructureEnvironment === r);
    assert.equal(clone.binding, "order_db");
    const owners = ["orders_sys", "api", "consumer"];
    for (const id of owners) {
      const drawn = view === "deployment-system" && id !== "orders_sys" ? "billing_sys" : id;
      (expected[`shop/${drawn}@@${r}/k8s_${r} -> ${clone.id}`] ??= []).push("shop/" + id);
    }
  }
  assert.equal(edges.length, Object.keys(expected).length, view);
  for (const e of edges) assert.deepEqual(e.edge.projectionOrigins.map((o) => o.source).sort(),
    expected[e.source + " -> " + e.target].sort(), view);
}

// The system owns only the logical relationship. Its route selection does not
// compete with the deployment declared by its container.
const routedRegions = environments.map((doc) => ({...doc, source: doc.source +
  "\nroute localPath\n    outbound:\n        $from originalLink $to\n"}));
const wire = "    links:\n        -> partner\n            deployment:\n                route localPath\n";
const wireOnly = model(header + "external " + ownerSystem + wire + api + "system partner\n    name = Partner\n" + plainPlacement);
const routed = ProjectAnalysisSession.create([definitions, ...routedRegions, wireOnly]).analysis().result;
assert.deepEqual(routed.diagnostics.filter((d) => (d.level ?? "ERROR") === "ERROR"), []);

const queryable = link(model(header + ownerSystem + api + consumer));
const table = executeQuery(queryable, {}, `MATCH (db:Storage) WHERE db.binding = 'ledger' AND db.bindingOwner = 'shop/api'
MATCH (user:Service) WHERE db IN user.uses
RETURN TABLE elementId(user) AS consumer, db.cloneOf AS inventory`);
assert.deepEqual(table.rows.map((row) => row.join(":")).sort(), ["api", "consumer"].flatMap((u) =>
  regions.map((r) => "shop/" + u + ":" + r + "/aurora_" + r)));
assert.equal(queryable.elements.filter((e) => e.binding === "ledger" && e.bindingOwner === "shop/api").length, 2);

const renamedConsumer = model("context pay\nimport api from context shop as provider\nimport regional from context shop\n"
  + billing + consumer.replace("ledger from api", "storage from provider"), "consumer.ai");
const renamed = link(model(header + ownerSystem + api), renamedConsumer);
for (const [tab, context] of [["model.ai", "shop"], ["consumer.ai", "pay"]]) {
  const d2 = graph(renamed, "deployment-container", tab, context);
  const incoming = d2.edges.filter((e) => e.source === "pay/consumer@@r0/k8s_r0");
  assert.equal(incoming.length, 1);
  assert.equal(d2.elements[incoming[0].target].bindingOwner, "shop/api");
}

const base = model(parentModel + passiveChild);
const extension = model("context shop\nextend service checkout\n    deployment:\n        uses regional\n", "extend.ai");
const valid = [definitions, ...environments, base];
const invalid = [extension, ...valid];
const session = ProjectAnalysisSession.restore(ProjectAnalysisSession.create(valid).portableSnapshot());
for (const sources of [invalid, valid, [...valid, extension]]) {
  const diagnostics = session.update(sources).diagnostics.filter((d) => d.code === conflictCode);
  assert.deepEqual(diagnostics, ProjectAnalysisSession.create(sources).analysis().result.diagnostics.filter((d) => d.code === conflictCode));
  assert.deepEqual(diagnostics.map((d) => [d.sourceName, d.line, d.column, d.endColumn]),
    sources.includes(extension) ? [["extend.ai", 4, 9, 22]] : []);
}

const mixedSlots = [
  ["Storage", "cache", "storage"],
  ["Broker", "events", "broker"],
  ["InfrastructureComponent", "secrets", "infrastructureComponent"],
];
const multiSlotDefinitions = {...definitions, source: definitions.source +
  mixedSlots.map(([type, slot]) => `    ${type} ${slot}\n`).join("")};
const multiSlotEnvironments = environments.map((environment) => ({...environment, source: environment.source +
  mixedSlots.map(([, slot, constructor]) => `    ${slot}:
        ${constructor} ${slot}_inventory
            name = ${slot}
            route:
                $from originalLink $this
`).join("")}));
const multiSlotSources = [multiSlotDefinitions, ...multiSlotEnvironments, model(header + ownerSystem + api +
  mixedSlots.map(([, slot]) => `            uses ${slot} as app_${slot}\n                name = App ${slot}\n`).join("") +
  consumer + mixedSlots.map(([, slot]) => `            shares app_${slot} from api\n`).join(""))];
const multi = ProjectAnalysisSession.create(multiSlotSources).analysis().result;
assert(!multi.diagnostics.some((d) => (d.level ?? "ERROR") === "ERROR"));
const physical = graph(multi, "deployment-container");
for (const source of ["api", "consumer"]) {
  assert.deepEqual(physical.edges.filter((e) => e.source === "shop/" + source + "@@r0/k8s_r0")
    .map((e) => physical.elements[e.target].binding).sort(), ["app_cache", "app_events", "app_secrets", "ledger"]);
}

// A profile supplies the binding to each owner independently. Rendering the
// consumer keeps the profile-derived resource as the actual endpoint too.
const namedProfile = header + "deploymentProfile storageOwner\n    appliesTo:\n" +
  regions.map((r) => "        production from " + r + "\n").join("") +
  "    runsOn compute\n    uses storage as ledger\n        name = Ledger\n";
const fromProfile = link(model(namedProfile + ownerSystem + api.replace(/uses regional[\s\S]*/, "uses storageOwner\n") + consumer));
const profileEdges = graph(fromProfile, "deployment-container").edges;
assert.deepEqual(profileEdges.map((e) => e.source).sort(), ["shop/api@@r0/k8s_r0", "shop/consumer@@r0/k8s_r0"]);
assert.equal(new Set(profileEdges.map((e) => e.target)).size, 1);
assert.equal(fromProfile.elements.find((e) => e.id === profileEdges[0].target).bindingOwner, "shop/api");

console.log("shared infrastructure view, diagnostic and query contracts passed");
