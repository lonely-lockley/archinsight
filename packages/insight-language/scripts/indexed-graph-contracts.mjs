import assert from "node:assert/strict";
import { IndexedGraph } from "../build/runtime/index.js";

const ELEMENT = "Element";
const SYSTEM = "System";
const CONTAINER = "Container";
const FINTECH = "fintech";

const cases = [
  buildsLayeredContextAndBaseTypeProjections,
  supportsParallelTypedRelationsBetweenTheSameElements,
  removesSourceContributionWithoutScanningOrDeletingForeignNodes,
  cleansContextAndBaseTypeIndexesWhenOwnedNodeIsRemoved,
  keepsDependencyReferenceCountsUntilLastRelationIsRemoved,
  indexesDependencyKindsBeyondReferences,
  rejectsConflictingNodeAndRelationIds,
];

let failures = 0;
for (const testCase of cases) {
  try {
    testCase();
  } catch (error) {
    failures++;
    console.error(`${testCase.name} failed`);
    console.error(error);
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log("indexed graph contract fixtures passed");
}

function buildsLayeredContextAndBaseTypeProjections() {
  const graph = new IndexedGraph();
  const source = "payments.ai";
  const context = contextNode(FINTECH);
  const payments = element(FINTECH, "payments", "system", SYSTEM, [ELEMENT], source);
  const api = element(FINTECH, "api", "container", CONTAINER, [ELEMENT], source, 2);

  graph.addNode(context);
  graph.addNode(sourceNode(source));
  graph.addNode(payments);
  graph.addNode(api);
  const contextToSystem = relation("00000000-0000-0000-0000-000000000001", "CONTAINS", context.id, payments.id, source);
  const systemToContainer = relation("00000000-0000-0000-0000-000000000002", "CONTAINS", payments.id, api.id, source);
  graph.addRelation(contextToSystem);
  graph.addRelation(systemToContainer);

  assertSet(graph.outgoingRelations(context.id, "CONTAINS"), [contextToSystem.id]);
  assertSet(graph.outgoingRelations(payments.id, "CONTAINS"), [systemToContainer.id]);
  assertContainsAll(graph.nodesInContext(FINTECH), [context.id, payments.id, api.id]);
  assertSet(graph.nodesByBaseType(SYSTEM), [payments.id]);
  assertSet(graph.nodesByBaseType(CONTAINER), [api.id]);
  assertContainsAll(graph.nodesByBaseType(ELEMENT), [payments.id, api.id]);
  assert.equal(graph.nestingLevel(context.id), 0);
  assert.equal(graph.nestingLevel(payments.id), 1);
  assert.equal(graph.nestingLevel(api.id), 2);
}

function supportsParallelTypedRelationsBetweenTheSameElements() {
  const graph = new IndexedGraph();
  const sourceIdentity = "links.ai";
  const sourceElement = element(FINTECH, "source", "system", SYSTEM, [ELEMENT], sourceIdentity);
  const targetElement = element(FINTECH, "target", "system", SYSTEM, [ELEMENT], sourceIdentity);
  graph.addNode(sourceElement);
  graph.addNode(targetElement);
  const sync = relation("00000000-0000-0000-0000-000000000003", "REFERENCES", sourceElement.id, targetElement.id, sourceIdentity, "Wire.sync");
  const async = relation("00000000-0000-0000-0000-000000000004", "REFERENCES", sourceElement.id, targetElement.id, sourceIdentity, "Wire.async");
  graph.addRelation(sync);
  graph.addRelation(async);

  assertSet(graph.relationsConnecting(sourceElement.id, targetElement.id), [sync.id, async.id]);
  assertSet(graph.relationsOfKind("REFERENCES"), [sync.id, async.id]);
  assertSet(graph.relationsOfType("Wire.sync"), [sync.id]);
  assertSet(graph.relationsOfType("Wire.async"), [async.id]);
  assertSet(graph.sourceContribution(sourceIdentity).referencedNodes, [targetElement.id]);
}

function removesSourceContributionWithoutScanningOrDeletingForeignNodes() {
  const graph = new IndexedGraph();
  const sourceSource = "source.ai";
  const targetSource = "target.ai";
  const dependentSource = "dependent.ai";
  const context = contextNode(FINTECH);
  const source = element(FINTECH, "source", "system", SYSTEM, [ELEMENT], sourceSource);
  const target = element(FINTECH, "target", "system", SYSTEM, [ELEMENT], targetSource);
  const dependent = element(FINTECH, "dependent", "system", SYSTEM, [ELEMENT], dependentSource);

  graph.addNode(context);
  graph.addNode(sourceNode(sourceSource));
  graph.addNode(sourceNode(targetSource));
  graph.addNode(sourceNode(dependentSource));
  graph.addNode(source);
  graph.addNode(target);
  graph.addNode(dependent);
  const contribution = relation("00000000-0000-0000-0000-000000000005", "CONTRIBUTES", sourceSource, context.id, sourceSource);
  const sourceToTarget = relation("00000000-0000-0000-0000-000000000006", "REFERENCES", source.id, target.id, sourceSource, "Wire.sync");
  const dependentToSource = relation("00000000-0000-0000-0000-000000000007", "REFERENCES", dependent.id, source.id, dependentSource);
  graph.addRelation(contribution);
  graph.addRelation(sourceToTarget);
  graph.addRelation(dependentToSource);

  assertSet(graph.dependentSources(source.id), [dependentSource]);
  assertSet(graph.dependentSources(target.id), [sourceSource]);

  const impact = graph.removeSourceContribution(sourceSource);

  assertContainsAll(impact.removedNodes, [sourceSource, source.id]);
  assertContainsAll(impact.removedRelations, [contribution.id, sourceToTarget.id, dependentToSource.id]);
  assertSet(impact.dependentSources, [dependentSource]);
  assert.ok(graph.node(target.id));
  assert.ok(graph.node(dependent.id));
  assert.equal(graph.sourceContribution(sourceSource), undefined);
  assert.equal(graph.sourceContribution(dependentSource).ownedRelations.size, 0);
  assert.equal(graph.dependentSources(target.id).size, 0);
  assert.equal(graph.relationsOfType("Wire.sync").size, 0);
}

function cleansContextAndBaseTypeIndexesWhenOwnedNodeIsRemoved() {
  const graph = new IndexedGraph();
  const source = "payments.ai";
  const payments = element(FINTECH, "payments", "system", SYSTEM, [ELEMENT], source);
  graph.addNode(payments);

  graph.removeSourceContribution(source);

  assert.equal(graph.nodesInContext(FINTECH).has(payments.id), false);
  assert.equal(graph.nodesByBaseType(SYSTEM).has(payments.id), false);
  assert.equal(graph.nodesByBaseType(ELEMENT).has(payments.id), false);
}

function keepsDependencyReferenceCountsUntilLastRelationIsRemoved() {
  const graph = new IndexedGraph();
  const owner = "owner.ai";
  const targetSource = "target.ai";
  const sourceElement = element(FINTECH, "source", "system", SYSTEM, [ELEMENT], owner);
  const targetElement = element(FINTECH, "target", "system", SYSTEM, [ELEMENT], targetSource);
  graph.addNode(sourceNode(owner));
  graph.addNode(sourceNode(targetSource));
  graph.addNode(sourceElement);
  graph.addNode(targetElement);
  graph.addRelation(relation("00000000-0000-0000-0000-000000000008", "REFERENCES", sourceElement.id, targetElement.id, owner, "Wire.sync"));
  graph.addRelation(relation("00000000-0000-0000-0000-000000000009", "IMPORTS", owner, targetElement.id, owner));

  assertSet(graph.sourceContribution(owner).referencedNodes, [targetElement.id]);
  assertSet(graph.dependentSources(targetElement.id), [owner]);

  graph.removeSourceContribution(owner);

  assert.equal(graph.dependentSources(targetElement.id).size, 0);
}

function indexesDependencyKindsBeyondReferences() {
  const graph = new IndexedGraph();
  const source = "imports.ai";
  const targetSource = "target.ai";
  graph.addNode(sourceNode(source));
  graph.addNode(sourceNode(targetSource));
  graph.addRelation(relation("00000000-0000-0000-0000-000000000010", "IMPORTS", source, targetSource, source));
  graph.addRelation(relation("00000000-0000-0000-0000-000000000011", "INHERITS", targetSource, source, targetSource));

  assertSet(graph.dependentSources(targetSource), [source]);
  assertSet(graph.dependentSources(source), [targetSource]);
  assertSet(graph.sourceContribution(source).referencedNodes, [targetSource]);
  assertSet(graph.sourceContribution(targetSource).referencedNodes, [source]);
}

function rejectsConflictingNodeAndRelationIds() {
  const graph = new IndexedGraph();
  const source = "conflict.ai";
  const first = element(FINTECH, "one", "system", SYSTEM, [ELEMENT], source);
  const second = { ...first, constructor: "container" };
  graph.addNode(first);
  assert.equal(graph.addNode(first), false);
  assert.throws(() => graph.addNode(second), /Conflicting graph node id/);

  const target = element(FINTECH, "target", "system", SYSTEM, [ELEMENT], source);
  graph.addNode(target);
  const firstRelation = relation("00000000-0000-0000-0000-000000000012", "REFERENCES", first.id, target.id, source);
  const secondRelation = relation("00000000-0000-0000-0000-000000000012", "CONTAINS", first.id, target.id, source);
  graph.addRelation(firstRelation);
  assert.equal(graph.addRelation(firstRelation), false);
  assert.throws(() => graph.addRelation(secondRelation), /Conflicting graph relation id/);
}

function contextNode(id) {
  return { kind: "context", id };
}

function sourceNode(id) {
  return { kind: "source", id };
}

function element(context, id, constructor, type, baseTypes, source, nestingLevel = 1) {
  return {
    kind: "element",
    id: `${context}/${id}`,
    context,
    localId: id,
    constructor,
    type,
    baseTypes,
    nestingLevel,
    declarationSource: source,
  };
}

function relation(id, kind, source, target, ownerSource, type = undefined) {
  return type === undefined
    ? { id, kind, source, target, ownerSource }
    : { id, kind, source, target, ownerSource, type };
}

function assertSet(actual, expected) {
  assert.deepEqual(new Set(actual), new Set(expected));
}

function assertContainsAll(actual, expected) {
  const actualSet = new Set(actual);
  for (const value of expected) {
    assert.equal(actualSet.has(value), true, `${String(value)} is missing from ${JSON.stringify([...actualSet])}`);
  }
}
