import assert from "node:assert/strict";
import {
  coreLanguageSnapshot,
  linkProject,
  selectGraph,
} from "../build/runtime/index.js";

const model = source("model.ai", `
context shop

system storefront
    name = Storefront

    service api
        name = API
        links:
            -> database
                technology = JDBC
            -> database
                technology = HTTPS

    container database
        name = Database
`);
const unrelated = source("unrelated.ai", `
context unrelated

system reporting
    name = Reporting
`);

const result = linkProject({ snapshot: coreLanguageSnapshot, sources: [model, unrelated] });
assertNoErrors(result.diagnostics);

const authoredEdges = result.edges.filter((edge) => edge.sourceIdentity === "model.ai");
assert.equal(authoredEdges.length, 2, "parallel authored relationships must remain distinct");
assert.equal(new Set(authoredEdges.map((edge) => edge.id)).size, 2, "every repeated relationship needs its own identity");
assert(authoredEdges.every((edge) => /^edge-[0-9a-f]{32}$/.test(edge.id)), "relationship IDs must be opaque");
assert.deepEqual(
  new Set(references(result)),
  new Set(result.edges.map((edge) => edge.id)),
  "the rich relationship and graph relation must share one identity",
);

const relinked = linkProject({ snapshot: coreLanguageSnapshot, sources: [unrelated, model] });
assertNoErrors(relinked.diagnostics);
assert.deepEqual(
  edgeIdentityByTechnology(relinked),
  edgeIdentityByTechnology(result),
  "relationship identity must not depend on project source iteration order",
);

const selected = selectGraph(
  { ...result, edges: [...result.edges].reverse() },
  { context: "shop", tab: "model.ai" },
  "MATCH (s:Service)-[r:REFERENCES]->(t:Container) WHERE r.technology = 'HTTPS' RETURN s, r, t",
);
assert.deepEqual(
  selected.edges.map((edge) => edge.edge.attributes.technology?.[0]),
  ["HTTPS"],
  "query metadata lookup must use relationship identity rather than edge array order",
);

console.log("relationship identity contracts passed");

function references(linked) {
  return [...linked.graph.relationsOfKind("REFERENCES")];
}

function edgeIdentityByTechnology(linked) {
  return Object.fromEntries(linked.edges
    .filter((edge) => edge.sourceIdentity === "model.ai")
    .map((edge) => [edge.attributes.technology?.[0], edge.id]));
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"),
    [],
  );
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
