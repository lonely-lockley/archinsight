import assert from "node:assert/strict";
import { completeAiq, coreLanguageSnapshot } from "../build/runtime/index.js";

const snapshot = {
  ...coreLanguageSnapshot,
  types: [...coreLanguageSnapshot.types, {
    name: "PaymentService",
    baseType: "Service",
    attributes: [{ name: "owner", type: "String" }, { name: "topics", type: "String", list: true }],
  }],
};

const property = completeAiq({
  source: "MATCH (service:PaymentService) RETURN TABLE service.ow",
  cursorOffset: "MATCH (service:PaymentService) RETURN TABLE service.ow".length,
  snapshot,
});
assert.equal(property.replacementStartOffset, property.replacementEndOffset - 2);
assert.deepEqual(property.items.map((item) => item.label), ["owner"]);

const scope = completeAiq({
  source: "MATCH (service:PaymentService) WITH service AS kept RETURN TABLE ",
  cursorOffset: "MATCH (service:PaymentService) WITH service AS kept RETURN TABLE ".length,
  snapshot,
});
assert(scope.items.some((item) => item.label === "kept"));
assert(!scope.items.some((item) => item.label === "service"));

const types = completeAiq({ source: "MATCH (n:Pay", cursorOffset: 12, snapshot });
assert(types.items.some((item) => item.label === "PaymentService"));

const parameters = completeAiq({ source: "WHERE n.id = $se", cursorOffset: 16, snapshot, parameters: ["service"] });
assert.deepEqual(parameters.items.map((item) => item.label), ["$service"]);

const functions = completeAiq({ source: "MATCH (n:Element) RETURN TABLE co", cursorOffset: 35, snapshot });
assert(functions.items.some((item) => item.label === "coalesce"));
assert(functions.items.some((item) => item.label === "collect"));
assert(!functions.items.some((item) => item.label === "MATCH"));

const graphReturn = completeAiq({ source: "MATCH (n:Element) RETURN ", cursorOffset: "MATCH (n:Element) RETURN ".length, snapshot });
assert(graphReturn.items.some((item) => item.label === "n"));
assert(graphReturn.items.some((item) => item.label === "TABLE"));
assert(!graphReturn.items.some((item) => item.label === "collect"));

const relationshipKind = completeAiq({ source: "MATCH (a)-[:REF", cursorOffset: "MATCH (a)-[:REF".length, snapshot });
assert.deepEqual(relationshipKind.items.map((item) => item.label), ["REFERENCES"]);

const selector = completeAiq({ source: "MATCH (a)-[:REFERENCES*1..3 {with", cursorOffset: "MATCH (a)-[:REFERENCES*1..3 {with".length, snapshot });
assert.deepEqual(selector.items.map((item) => item.label), ["withDerived"]);

const pathSelectors = completeAiq({ source: "MATCH (a)-[:REFERENCES*1..3 {", cursorOffset: "MATCH (a)-[:REFERENCES*1..3 {".length, snapshot });
assert.deepEqual(pathSelectors.items.map((item) => item.label), ["derived", "withDerived"]);

const renamedProperty = completeAiq({
  source: "MATCH (service:PaymentService) WITH service AS kept RETURN TABLE kept.to",
  cursorOffset: "MATCH (service:PaymentService) WITH service AS kept RETURN TABLE kept.to".length,
  snapshot,
});
assert(renamedProperty.items.some((item) => item.label === "topics"));
assert(!renamedProperty.items.some((item) => item.label === "target"));

const pathStep = completeAiq({
  source: "MATCH p = (a)-[:REFERENCES*1..3]->(b) UNWIND p.steps AS step RETURN TABLE step.di",
  cursorOffset: "MATCH p = (a)-[:REFERENCES*1..3]->(b) UNWIND p.steps AS step RETURN TABLE step.di".length,
  snapshot,
});
assert.deepEqual(pathStep.items.map((item) => item.label), ["direction"]);

const listLocal = completeAiq({
  source: "MATCH p = (a)-[:REFERENCES*1..3]->(b) RETURN TABLE [node IN nodes(p) | node.lo",
  cursorOffset: "MATCH p = (a)-[:REFERENCES*1..3]->(b) RETURN TABLE [node IN nodes(p) | node.lo".length,
  snapshot,
});
assert(listLocal.items.some((item) => item.label === "localId"));
assert(!listLocal.items.some((item) => item.label === "steps"));

const quantifierLocal = completeAiq({
  source: "MATCH p = (a)-[:REFERENCES*1..3]->(b) WHERE all(node IN nodes(p) WHERE node.na",
  cursorOffset: "MATCH p = (a)-[:REFERENCES*1..3]->(b) WHERE all(node IN nodes(p) WHERE node.na".length,
  snapshot,
});
assert(quantifierLocal.items.some((item) => item.label === "name"));

const incompleteMatch = completeAiq({
  source: "MATCH (service:PaymentService RETURN TABLE service.ow",
  cursorOffset: "MATCH (service:PaymentService RETURN TABLE service.ow".length,
  snapshot,
});
assert.deepEqual(incompleteMatch.items.map((item) => item.label), ["owner"]);

const insertion = completeAiq({ source: "MATCH (n:Element) RETURN TABLE co", cursorOffset: 35, snapshot });
const coalesce = insertion.items.find((item) => item.label === "coalesce");
assert(coalesce);
assert.equal(
  "MATCH (n:Element) RETURN TABLE co".slice(0, insertion.replacementStartOffset)
    + coalesce.insertText
    + "MATCH (n:Element) RETURN TABLE co".slice(insertion.replacementEndOffset),
  "MATCH (n:Element) RETURN TABLE coalesce(",
);

const stringSource = "MATCH (n) WHERE n.name = 'co";
const insideString = completeAiq({ source: stringSource, cursorOffset: stringSource.length, snapshot });
assert.deepEqual(insideString.items, []);

const commentAliases = completeAiq({
  source: "# MATCH (ghost:PaymentService)\nMATCH (real:PaymentService) RETURN TABLE ",
  cursorOffset: "# MATCH (ghost:PaymentService)\nMATCH (real:PaymentService) RETURN TABLE ".length,
  snapshot,
});
assert(commentAliases.items.some((item) => item.label === "real"));
assert(!commentAliases.items.some((item) => item.label === "ghost"));
