import assert from "node:assert/strict";
import { BUILTIN_VIEW_QUERIES, ProjectAnalysisSession, executeQuery, selectGraph, selectPathGraph } from "../build/runtime/index.js";

const source = (sourceName, source) => ({sourceName, source});
const framework = source("framework.ai", `extend type Environment
    Compute compute
    InfrastructureComponent cdn
    InfrastructureComponent loadBalancer
`);
const environment = (region) => source(region + ".ai", `environment ${region}
    name = ${region}

deployment production
    compute:
        compute host
            name = Host
    cdn:
        infrastructureComponent cdn_node
            name = CDN
    loadBalancer:
        infrastructureComponent lb
            name = LB

route ingressPath
    inbound:
        $from originalLink cdn
        cdn connectTo loadBalancer
            technology = HTTPS
        loadBalancer connectTo $to
`);
const model = source("model.ai", `context app

deploymentProfile regional
    appliesTo:
        production from r0
        production from r1
    runsOn compute

external actor customer
    name = Customer
    links:
        -> api
            deployment:
                route ingressPath

system shop
    name = Shop
    service api
        name = API
        deployment:
            uses regional
`);
const sources = [framework, environment("r0"), environment("r1"), model];
const cold = (files) => ProjectAnalysisSession.create(files).analysis().result;
const edits = (files, filename, before, after) => files.map((file) => file.sourceName === filename
  ? source(filename, file.source.replace(before, after)) : file);
const scope = { context: "app", tab: "model.ai", view: "deployment-container", environment: "r0" };
const d2 = (result) => selectGraph(result, scope, BUILTIN_VIEW_QUERIES["deployment-container"]);
const state = ProjectAnalysisSession.restore(ProjectAnalysisSession.create(sources).portableSnapshot());
for (const label of ["HTTP2", "HTTPS"]) {
  const files = edits(sources, "r0.ai", "technology = HTTPS", "technology = " + label);
  for (const result of [cold(files), state.update(files).result]) {
    const hop = d2(result).edges.find((edge) => edge.source === "r0/cdn_node" && edge.target === "r0/lb");
    assert.deepEqual(hop?.edge.attributes.technology, [label]);
  }
}

const linked = cold(sources);
const actorPath = selectPathGraph(linked, "app/customer", "app/api", scope, {sourceEnvironment: "r0"});
assert.deepEqual(actorPath.edges.map((e) => [e.source, e.target]), [
  ["app/customer", "r0/cdn_node"], ["r0/cdn_node", "r0/lb"], ["r0/lb", "app/api@@r0/host"],
]);
const origins = executeQuery(linked, {}, `MATCH (a:Element)-[p:REFERENCES {projected}]->(b:Element)
WHERE p.projectionRoot = 'r0/ingressPath'
RETURN TABLE DISTINCT p.originSource AS caller, p.originTarget AS callee`);
assert.deepEqual(origins.rows, [["app/customer", "app/api"]]);

const empty = edits(sources, "model.ai", "                route ingressPath", "");
assert(!cold(empty).diagnostics.some((d) => (d.level ?? "ERROR") === "ERROR"));
const placedCaller = edits(sources, "model.ai", "external actor customer\n    name = Customer",
  "system client\n    name = Client\n    deployment:\n        uses regional");
const noTarget = edits(placedCaller, "model.ai", "name = API\n        deployment:\n            uses regional", "name = API");
const errors = cold(noTarget).diagnostics.filter((d) => d.code === "ROUTE_TARGET_DEPLOYMENT_MISSING");
assert.equal(errors.length, 1);
assert.match(errors[0].message, /not deployed in any environment/);

const junction = edits(sources, "r0.ai", "    inbound:\n        $from originalLink cdn\n        cdn connectTo loadBalancer\n            technology = HTTPS\n        loadBalancer connectTo $to",
  "    outbound:\n        $from originalLink cdn\n        cdn connectTo $to\n    inbound:\n        $from connectTo cdn\n        cdn connectTo $to");
const joined = cold(junction);
assert.equal(joined.diagnostics.filter((d) => d.code === "ROUTE_REDUNDANT_JUNCTION" && d.level === "WARNING").length, 1);
assert(!joined.edges.some((e) => e.projected && e.source === e.target));
assert(d2(joined).edges.some((e) => e.source === "r0/cdn_node" && e.target === "app/api@@r0/host"));

for (const statement of [":bad", "route in", "source $from connectTo gateway"]) {
  const malformed = edits(sources, "model.ai", "            uses regional", "            " + statement);
  const result = cold(malformed);
  assert(result.diagnostics.some((d) => d.code === "SYNTAX_ERROR"));
  assert(result.elements.some((e) => e.id === "app/api"), statement);
  assert(!result.diagnostics.some((d) => d.code === "UNDECLARED_IDENTIFIER" || d.message.includes("Unknown operator 'api'")), statement);
}

const emptyElement = edits(sources, "model.ai", "            uses regional", "");
assert(!cold(emptyElement).diagnostics.some((d) => d.code === "SYNTAX_ERROR"));
const custom = [...sources, source("custom.ai", "define type SpecialService of Service\n    Text ticket\n")];
const customResult = cold(custom);
assert.deepEqual(executeQuery(customResult, {}, "MATCH (s:Service) RETURN TABLE s.ticket AS ticket").rows, [[null]]);
assert.throws(() => executeQuery(customResult, {}, "MATCH (s:System) RETURN TABLE s.ticket AS ticket"), {code: "AIQ_UNKNOWN_PROPERTY"});
for (const suffix of ["RETURN a, w, b", "RETURN TABLE elementId(a) AS a"]) {
  const query = `MATCH (a:Element)-[w:REFERENCES]->(b:Element)
WHERE w IS AsyncWire AND w.nonexistentAttribute = 'x'
${suffix}`;
  assert.throws(() => executeQuery(customResult, {}, query), (error) => error.code === "AIQ_UNKNOWN_PROPERTY"
    && error.range.line === 2 && error.message.includes("AsyncWire"));
}

const secondActor = `
external actor guest
    name = Guest
    links:
        -> api
            deployment:
                route ingressPath
`;
const addGuest = (files) => files.map((file) => file.sourceName === "model.ai"
  ? source(file.sourceName, file.source + secondActor) : file);
const shared = executeQuery(cold(addGuest(sources)), {}, `MATCH (a:Element)-[p:REFERENCES {projected}]->(b:Element)
WHERE elementId(a) = 'r0/cdn_node' AND elementId(b) = 'r0/lb'
RETURN TABLE p.originSource AS caller, p.originTarget AS callee ORDER BY caller`);
assert.deepEqual(shared.rows, [["app/customer", "app/api"], ["app/guest", "app/api"]]);
assert.equal(cold(addGuest(junction)).diagnostics.filter((d) => d.code === "ROUTE_REDUNDANT_JUNCTION").length, 1);

const outbound = edits(placedCaller, "r0.ai", "    inbound:", "    outbound:");
const outboundSession = ProjectAnalysisSession.create(outbound);
const labelled = edits(outbound, "r0.ai", "technology = HTTPS", "description = via gateway");
const firstUpdate = outboundSession.update(labelled);
const hop = d2(firstUpdate.result).edges.find((edge) => edge.source === "r0/cdn_node" && edge.target === "r0/lb");
assert.deepEqual(hop?.edge.attributes.description, ["via gateway"]);
assert.equal(hop.edge.attributes.technology, undefined);
assert.deepEqual(d2(firstUpdate.result), d2(cold(labelled)));

const brokenRef = edits(sources, "model.ai", "-> api", "-> missing");
const badChild = edits(brokenRef, "model.ai", "            uses regional", "            :bad");
assert(cold(badChild).diagnostics.some((d) => d.code === "UNDECLARED_IDENTIFIER" && d.message.includes("missing")));
