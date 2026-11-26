import assert from "node:assert/strict";
import { BUILTIN_VIEW_QUERIES, ProjectAnalysisSession, selectGraph } from "../build/runtime/index.js";

const regions = ["r0", "r1"];
const source = (sourceName, source) => ({ sourceName, source });
const framework = source("framework.ai", "extend type Environment\n    Compute compute\n    Broker broker\n");
const environments = regions.map((r) => source(r + ".ai", `environment ${r}
    name = ${r}

deployment production
    compute:
        compute host
            name = Cluster
    broker:
        broker kafka
            name = Kafka

route local
    outbound:
        $from originalLink $to

route events
    outbound:
        $to connectTo broker
        broker originalLink $from
`));
const header = `context shop
deploymentProfile regional
    appliesTo:
        production from r0
        production from r1
    runsOn compute

system orders_sys
    name = Orders
`;
const whole = "    deployment:\n        uses regional\n";
const api = "    service api\n        name = API\n";
const individually = "        deployment:\n            uses regional\n";
const billing = "system billing_sys\n    name = Billing\n    service billing\n        name = Billing\n";
const wire = (peer, op, route) => `        links:
            ${op} ${peer}
                description = to ${peer}
                deployment:
                    route ${route}
`;
const inputs = (op, route, placedAsWhole = true) => [framework, ...environments, source("model.ai",
  header + (placedAsWhole ? whole + api : api + individually) + wire("billing", op, route)
  + billing + individually + wire("api", op, route))];
const graph = (result, view, region) => selectGraph(result, {
  view, tab: "model.ai", context: "shop", ...(region && {environment: region}),
}, BUILTIN_VIEW_QUERIES[view]);
const pairs = (graph) => graph.edges.map((e) => [e.source, e.target].join(" -> ")).sort();
const session = ProjectAnalysisSession.create(inputs("->", "local"));
for (const [op, route, wholeSystem] of [["->", "local", true], ["~>", "events", true], ["~>", "events", false], ["->", "local", true]]) {
  const files = inputs(op, route, wholeSystem);
  const result = session.update(files).result;
  const cold = ProjectAnalysisSession.create(files).analysis().result;
  for (const edge of result.edges.filter((e) => e.projected)) {
    assert(edge.projectionOrigins.every((o) => ["shop/api", "shop/billing"].includes(o.source)
      && ["shop/api", "shop/billing"].includes(o.target) && o.source !== o.target));
  }
  assert.deepEqual(result.diagnostics.filter((d) => d.level !== "NOTE"), []);
  assert.deepEqual(pairs(graph(result, "c2")), ["shop/api -> shop/billing", "shop/billing -> shop/api"]);
  for (const [view, region] of [["deployment", undefined], ["deployment-system", undefined],
    ["deployment-container", "r0"], ["deployment-container", "r1"]]) {
    const rendered = graph(result, view, region);
    const expected = (region ? [region] : regions).flatMap((r) => {
      const owner = `shop/${wholeSystem || view === "deployment-system" ? "orders_sys" : "api"}@@${r}/host`;
      const peer = `shop/${view === "deployment-system" ? "billing_sys" : "billing"}@@${r}/host`;
      const broker = r + "/kafka";
      const directions = op === "->" ? [[owner, peer], [peer, owner]]
        : [[owner, broker], [broker, peer], [peer, broker], [broker, owner]];
      return directions.map(([a, b]) => a + " -> " + b);
    }).sort();
    assert.deepEqual(pairs(rendered), expected, [op, view, region, wholeSystem].join(" "));
    assert(!Object.hasOwn(rendered.elements, "shop/api") && !Object.hasOwn(rendered.elements, "shop/orders_sys"));
    assert.deepEqual(pairs(graph(cold, view, region)), expected);
  }
}

const extension = source("api.ai", "context shop\nimport billing from context shop\nextend service api\n"
  + wire("billing", "->", "local").replace(/^    /gm, ""));
const split = ProjectAnalysisSession.create([framework, ...environments, source("model.ai",
  header + whole + api + "    service sibling\n        name = Sibling\n" + wire("other", "->", "local")
  + billing + individually + "    service other\n        name = Other\n" + individually), extension]).analysis().result;
assert.deepEqual(split.diagnostics.filter((d) => d.level !== "NOTE"), []);
for (const view of ["deployment", "deployment-system", "deployment-container"]) {
  const selected = selectGraph(split, {view, tab: extension.sourceName, context: "shop", environment: "r0"},
    BUILTIN_VIEW_QUERIES[view]);
  const peer = view === "deployment-system" ? "billing_sys" : "billing";
  const expected = (view === "deployment-container" ? ["r0"] : regions)
    .map((r) => `shop/orders_sys@@${r}/host -> shop/${peer}@@${r}/host`);
  assert.deepEqual(pairs(selected), expected, view + " on an extension");
}

const unavailable = inputs("->", "local").map((doc) => doc.sourceName !== "model.ai" ? doc :
  source(doc.sourceName, doc.source.replace("    deployment:\n        uses regional\n", "")));
const missing = ProjectAnalysisSession.create(unavailable).analysis().result;
assert(missing.diagnostics.some((d) => d.code === "ROUTE_ENDPOINT_NOT_PLACED"));
assert(!missing.edges.some((e) => e.projected));

const higherWire = wire("billing", "->", "local").replace(/^    /gm, "").replace("to billing", "system-level");
const shadowedFiles = inputs("->", "local").map((doc) => doc.sourceName === "model.ai"
  ? source(doc.sourceName, doc.source.replace(api, higherWire + api)) : doc);
const shadowed = ProjectAnalysisSession.create(shadowedFiles).analysis().result;
assert(shadowed.diagnostics.some((d) => d.code === "EDGE_SHADOWS_LOWER_LEVEL_EDGE"));
for (const view of ["deployment", "deployment-system", "deployment-container"]) {
  const rendered = graph(shadowed, view, "r0");
  const outgoing = rendered.edges.filter((e) => e.source.startsWith("shop/orders_sys@@"));
  assert.deepEqual(outgoing.map((e) => e.edge.attributes.description),
    (view === "deployment-container" ? ["r0"] : regions).map(() => ["system-level"]));
}
