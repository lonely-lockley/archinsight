import type { LinkedEdge } from "./contracts.js";
import {
  IndexedGraph,
  type GraphNode,
  type GraphRelation,
  type RelationKind,
} from "./indexed-graph.js";
import type { ParsedDocument, ParsedElement, ResolvedImport } from "./project-linker.js";
import type { TypeSystem } from "./type-system.js";

const ELEMENT_TYPE = "Element";

export function buildIndexedGraph(
  documents: readonly ParsedDocument[],
  elements: readonly ParsedElement[],
  imports: readonly ResolvedImport[],
  edges: readonly LinkedEdge[],
  typeSystem: TypeSystem,
): IndexedGraph {
  const graph = new IndexedGraph();
  for (const type of typeSystem.declaredTypes()) {
    addNode(graph, { kind: "type", id: type, baseTypes: typeSystem.baseTypes(type) });
  }
  if (typeSystem.declaredTypes().size === 0) {
    addNode(graph, { kind: "type", id: ELEMENT_TYPE, baseTypes: [] });
  }
  for (const document of documents) {
    addNode(graph, { kind: "context", id: document.context.id });
    addNode(graph, { kind: "source", id: document.sourceName });
    addRelation(graph, relation(
      `contributes:${document.sourceName}->${document.context.id}`,
      "CONTRIBUTES",
      document.sourceName,
      document.context.id,
      document.sourceName,
    ));
  }
  const graphElements = elements.filter((element) => element.graphElement !== false);
  const elementsById = new Map(graphElements.map((element) => [element.id, element]));
  for (const element of graphElements) {
    addNode(graph, elementNode(element, typeSystem, elementsById));
  }
  for (const element of graphElements) {
    addRelation(graph, relation(
      `declares:${element.sourceName}->${element.id}`,
      "DECLARES",
      element.sourceName,
      element.id,
      element.sourceName,
    ));
    addRelation(graph, relation(
      `contains:${element.parent ?? element.context}->${element.id}`,
      "CONTAINS",
      element.parent ?? element.context,
      element.id,
      element.sourceName,
    ));
  }
  for (const imported of imports) {
    addRelation(graph, relation(
      `imports:${imported.sourceName}:${imported.alias}->${imported.target}`,
      "IMPORTS",
      imported.sourceName,
      imported.target,
      imported.sourceName,
    ));
  }
  for (const edge of edges) {
    addRelation(graph, relation(
      edge.id,
      "REFERENCES",
      edge.source,
      edge.target,
      edge.sourceIdentity,
      edge.type,
      edge.projected === true,
    ));
  }
  return graph;
}

function elementNode(
  element: ParsedElement,
  typeSystem: TypeSystem,
  elementsById: ReadonlyMap<string, ParsedElement>,
): GraphNode {
  return {
    kind: "element",
    id: element.id,
    context: element.context,
    localId: element.localId,
    constructor: element.constructor,
    type: element.type,
    baseTypes: typeSystem.baseTypes(element.type),
    nestingLevel: nestingLevel(element, elementsById),
    ...(element.note === undefined ? {} : { note: element.note }),
    declarationSource: element.sourceName,
  };
}

function nestingLevel(element: ParsedElement, elementsById: ReadonlyMap<string, ParsedElement>): number {
  let level = 1;
  let parent = element.parent === undefined ? undefined : elementsById.get(element.parent);
  const visited = new Set<string>([element.id]);
  while (parent !== undefined && !visited.has(parent.id)) {
    visited.add(parent.id);
    level++;
    parent = parent.parent === undefined ? undefined : elementsById.get(parent.parent);
  }
  return level;
}

function relation(
  id: string,
  kind: RelationKind,
  source: string,
  target: string,
  ownerSource: string,
  type?: string,
  projected = false,
): GraphRelation {
  return {
    id,
    kind,
    source,
    target,
    ownerSource,
    ...(type === undefined ? {} : { type }),
    ...(projected ? { projected: true } : {}),
  };
}

function addNode(graph: IndexedGraph, node: GraphNode): void {
  if (graph.node(node.id) === undefined) {
    graph.addNode(node);
  }
}

function addRelation(graph: IndexedGraph, item: GraphRelation): void {
  if (graph.relation(item.id) === undefined
      && graph.node(item.source) !== undefined
      && graph.node(item.target) !== undefined) {
    graph.addRelation(item);
  }
}
