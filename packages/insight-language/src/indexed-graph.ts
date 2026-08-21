export const RELATION_KINDS = [
  "DECLARES",
  "CONTRIBUTES",
  "CONTAINS",
  "REFERENCES",
  "IMPORTS",
  "INHERITS",
] as const;

export type RelationKind = typeof RELATION_KINDS[number];

export type GraphNodeId = string;
export type SourceNodeId = string;
export type ContextNodeId = string;
export type TypeNodeId = string;
export type RelationId = string;

export interface ContextGraphNode {
  readonly kind: "context";
  readonly id: ContextNodeId;
}

export interface SourceGraphNode {
  readonly kind: "source";
  readonly id: SourceNodeId;
}

export interface TypeGraphNode {
  readonly kind: "type";
  readonly id: TypeNodeId;
  readonly baseTypes: readonly TypeNodeId[];
  readonly ownerSource?: SourceNodeId;
}

export interface ElementGraphNode {
  readonly kind: "element";
  readonly id: GraphNodeId;
  readonly context: ContextNodeId;
  readonly localId: string;
  readonly constructor: string;
  readonly type: TypeNodeId;
  readonly baseTypes: readonly TypeNodeId[];
  readonly nestingLevel: number;
  readonly note?: string;
  readonly declarationSource: SourceNodeId;
}

export type GraphNode = ContextGraphNode | SourceGraphNode | TypeGraphNode | ElementGraphNode;

export interface GraphRelation {
  readonly id: RelationId;
  readonly kind: RelationKind;
  readonly source: GraphNodeId;
  readonly target: GraphNodeId;
  readonly type?: string;
  readonly ownerSource: SourceNodeId;
  readonly note?: string;
  readonly derived?: boolean;
  readonly projected?: boolean;
}

export interface SourceContribution {
  readonly source: SourceNodeId;
  readonly ownedNodes: ReadonlySet<GraphNodeId>;
  readonly ownedRelations: ReadonlySet<RelationId>;
  readonly referencedNodes: ReadonlySet<GraphNodeId>;
}

export interface GraphUpdateImpact {
  readonly removedNodes: ReadonlySet<GraphNodeId>;
  readonly removedRelations: ReadonlySet<RelationId>;
  readonly dependentSources: ReadonlySet<SourceNodeId>;
}

interface MutableSourceContribution {
  readonly source: SourceNodeId;
  readonly ownedNodes: Set<GraphNodeId>;
  readonly ownedRelations: Set<RelationId>;
  readonly referenceCounts: Map<GraphNodeId, number>;
}

export class IndexedGraph {
  private readonly nodesById = new Map<GraphNodeId, GraphNode>();
  private readonly relationsById = new Map<RelationId, GraphRelation>();
  private readonly outgoingRelationsByNode = new Map<GraphNodeId, Set<RelationId>>();
  private readonly incomingRelationsByNode = new Map<GraphNodeId, Set<RelationId>>();
  private readonly dependentSourcesByNode = new Map<GraphNodeId, Set<SourceNodeId>>();
  private readonly contributionsBySource = new Map<SourceNodeId, MutableSourceContribution>();
  private readonly contextIndex = new Map<ContextNodeId, Set<GraphNodeId>>();
  private readonly baseTypeIndex = new Map<TypeNodeId, Set<GraphNodeId>>();
  private readonly relationsByKindIndex = new Map<RelationKind, Set<RelationId>>();
  private readonly relationsByTypeIndex = new Map<string, Set<RelationId>>();

  addNode(node: GraphNode): boolean {
    const previous = this.nodesById.get(node.id);
    if (previous !== undefined) {
      if (sameNode(previous, node)) {
        return false;
      }
      throw new Error(`Conflicting graph node id: ${node.id}`);
    }

    validateNode(node);
    this.nodesById.set(node.id, node);
    this.outgoingRelationsByNode.set(node.id, new Set());
    this.incomingRelationsByNode.set(node.id, new Set());

    const ownerSource = nodeOwnerSource(node);
    if (ownerSource !== undefined) {
      this.contribution(ownerSource).ownedNodes.add(node.id);
    }
    const context = nodeContext(node);
    if (context !== undefined) {
      addToIndex(this.contextIndex, context, node.id);
    }
    for (const type of indexedTypes(node)) {
      addToIndex(this.baseTypeIndex, type, node.id);
    }

    return true;
  }

  addRelation(relation: GraphRelation): boolean {
    this.requireNode(relation.source);
    this.requireNode(relation.target);

    const previous = this.relationsById.get(relation.id);
    if (previous !== undefined) {
      if (sameRelation(previous, relation)) {
        return false;
      }
      throw new Error(`Conflicting graph relation id: ${relation.id}`);
    }

    this.relationsById.set(relation.id, relation);
    this.outgoingRelationsByNode.get(relation.source)?.add(relation.id);
    this.incomingRelationsByNode.get(relation.target)?.add(relation.id);
    this.contribution(relation.ownerSource).ownedRelations.add(relation.id);
    addToIndex(this.relationsByKindIndex, relation.kind, relation.id);
    if (relation.type !== undefined) {
      addToIndex(this.relationsByTypeIndex, relation.type, relation.id);
    }
    if (isDependency(relation.kind)) {
      this.registerDependency(relation.ownerSource, relation.target);
    }

    return true;
  }

  removeSourceContribution(source: SourceNodeId): GraphUpdateImpact {
    const contribution = this.contributionsBySource.get(source);
    if (contribution === undefined) {
      return emptyImpact();
    }

    const removedNodes = new Set<GraphNodeId>();
    const removedRelations = new Set<RelationId>();
    const dependentSources = new Set<SourceNodeId>();

    for (const node of [...contribution.ownedNodes]) {
      for (const dependentSource of this.dependentSources(node)) {
        dependentSources.add(dependentSource);
      }
    }
    for (const relation of [...contribution.ownedRelations]) {
      this.removeRelation(relation, removedRelations);
    }
    for (const node of [...contribution.ownedNodes]) {
      this.removeNode(node, removedNodes, removedRelations, dependentSources, source);
    }

    this.contributionsBySource.delete(source);
    dependentSources.delete(source);
    return {
      removedNodes,
      removedRelations,
      dependentSources,
    };
  }

  node(id: GraphNodeId): GraphNode | undefined {
    return this.nodesById.get(id);
  }

  relation(id: RelationId): GraphRelation | undefined {
    return this.relationsById.get(id);
  }

  sourceContribution(source: SourceNodeId): SourceContribution | undefined {
    const contribution = this.contributionsBySource.get(source);
    if (contribution === undefined) {
      return undefined;
    }
    return {
      source: contribution.source,
      ownedNodes: copySet(contribution.ownedNodes),
      ownedRelations: copySet(contribution.ownedRelations),
      referencedNodes: new Set(contribution.referenceCounts.keys()),
    };
  }

  dependentSources(node: GraphNodeId): ReadonlySet<SourceNodeId> {
    return copySet(this.dependentSourcesByNode.get(node));
  }

  nodesInContext(context: ContextNodeId): ReadonlySet<GraphNodeId> {
    return copySet(this.contextIndex.get(context));
  }

  nodesByBaseType(type: TypeNodeId): ReadonlySet<GraphNodeId> {
    return copySet(this.baseTypeIndex.get(type));
  }

  nestingLevel(node: GraphNodeId): number | undefined {
    const graphNode = this.requireNode(node);
    if (graphNode.kind === "context") {
      return 0;
    }
    if (graphNode.kind === "element") {
      return graphNode.nestingLevel;
    }
    return undefined;
  }

  relationsOfKind(kind: RelationKind): ReadonlySet<RelationId> {
    return copySet(this.relationsByKindIndex.get(kind));
  }

  relationsOfType(type: string): ReadonlySet<RelationId> {
    return copySet(this.relationsByTypeIndex.get(type));
  }

  successors(node: GraphNodeId): ReadonlySet<GraphNodeId> {
    this.requireNode(node);
    const result = new Set<GraphNodeId>();
    for (const relationId of this.outgoingRelationsByNode.get(node) ?? []) {
      const relation = this.relationsById.get(relationId);
      if (relation !== undefined) {
        result.add(relation.target);
      }
    }
    return result;
  }

  predecessors(node: GraphNodeId): ReadonlySet<GraphNodeId> {
    this.requireNode(node);
    const result = new Set<GraphNodeId>();
    for (const relationId of this.incomingRelationsByNode.get(node) ?? []) {
      const relation = this.relationsById.get(relationId);
      if (relation !== undefined) {
        result.add(relation.source);
      }
    }
    return result;
  }

  incidentRelations(node: GraphNodeId): ReadonlySet<RelationId> {
    this.requireNode(node);
    return new Set([
      ...(this.outgoingRelationsByNode.get(node) ?? []),
      ...(this.incomingRelationsByNode.get(node) ?? []),
    ]);
  }

  outgoingRelations(node: GraphNodeId, kind: RelationKind): ReadonlySet<RelationId> {
    this.requireNode(node);
    return this.filterRelations(this.outgoingRelationsByNode.get(node) ?? new Set(), kind);
  }

  incomingRelations(node: GraphNodeId, kind: RelationKind): ReadonlySet<RelationId> {
    this.requireNode(node);
    return this.filterRelations(this.incomingRelationsByNode.get(node) ?? new Set(), kind);
  }

  relationsConnecting(source: GraphNodeId, target: GraphNodeId): ReadonlySet<RelationId> {
    this.requireNode(source);
    this.requireNode(target);
    const result = new Set<RelationId>();
    for (const relationId of this.outgoingRelationsByNode.get(source) ?? []) {
      const relation = this.relationsById.get(relationId);
      if (relation?.target === target) {
        result.add(relationId);
      }
    }
    return result;
  }

  nodes(): readonly GraphNode[] {
    return [...this.nodesById.values()];
  }

  relations(): readonly GraphRelation[] {
    return [...this.relationsById.values()];
  }

  clone(): IndexedGraph {
    const graph = new IndexedGraph();
    for (const node of this.nodes()) {
      graph.addNode(node);
    }
    for (const relation of this.relations()) {
      graph.addRelation(relation);
    }
    return graph;
  }

  private removeNode(
    nodeId: GraphNodeId,
    removedNodes: Set<GraphNodeId>,
    removedRelations: Set<RelationId>,
    dependentSources: Set<SourceNodeId>,
    removedSource: SourceNodeId,
  ): void {
    const node = this.nodesById.get(nodeId);
    if (node === undefined) {
      return;
    }

    for (const relationId of [...this.incidentRelations(nodeId)]) {
      const relation = this.relationsById.get(relationId);
      if (relation !== undefined && relation.ownerSource !== removedSource) {
        dependentSources.add(relation.ownerSource);
      }
      this.removeRelation(relationId, removedRelations);
    }

    this.nodesById.delete(nodeId);
    this.outgoingRelationsByNode.delete(nodeId);
    this.incomingRelationsByNode.delete(nodeId);
    const ownerSource = nodeOwnerSource(node);
    if (ownerSource !== undefined) {
      this.contributionsBySource.get(ownerSource)?.ownedNodes.delete(nodeId);
    }
    const context = nodeContext(node);
    if (context !== undefined) {
      removeFromIndex(this.contextIndex, context, nodeId);
    }
    for (const type of indexedTypes(node)) {
      removeFromIndex(this.baseTypeIndex, type, nodeId);
    }
    this.dependentSourcesByNode.delete(nodeId);
    removedNodes.add(nodeId);
  }

  private removeRelation(relationId: RelationId, removedRelations: Set<RelationId>): void {
    const relation = this.relationsById.get(relationId);
    if (relation === undefined) {
      return;
    }

    this.relationsById.delete(relationId);
    this.outgoingRelationsByNode.get(relation.source)?.delete(relationId);
    this.incomingRelationsByNode.get(relation.target)?.delete(relationId);
    removeFromIndex(this.relationsByKindIndex, relation.kind, relationId);
    if (relation.type !== undefined) {
      removeFromIndex(this.relationsByTypeIndex, relation.type, relationId);
    }
    this.contributionsBySource.get(relation.ownerSource)?.ownedRelations.delete(relationId);
    if (isDependency(relation.kind)) {
      this.unregisterDependency(relation.ownerSource, relation.target);
    }
    removedRelations.add(relationId);
  }

  private registerDependency(source: SourceNodeId, target: GraphNodeId): void {
    const contribution = this.contribution(source);
    contribution.referenceCounts.set(target, (contribution.referenceCounts.get(target) ?? 0) + 1);
    addToIndex(this.dependentSourcesByNode, target, source);
  }

  private unregisterDependency(source: SourceNodeId, target: GraphNodeId): void {
    const contribution = this.contributionsBySource.get(source);
    if (contribution === undefined) {
      return;
    }
    const count = contribution.referenceCounts.get(target);
    if (count === undefined) {
      return;
    }
    if (count === 1) {
      contribution.referenceCounts.delete(target);
      removeFromIndex(this.dependentSourcesByNode, target, source);
    } else {
      contribution.referenceCounts.set(target, count - 1);
    }
  }

  private contribution(source: SourceNodeId): MutableSourceContribution {
    let contribution = this.contributionsBySource.get(source);
    if (contribution === undefined) {
      contribution = {
        source,
        ownedNodes: new Set(),
        ownedRelations: new Set(),
        referenceCounts: new Map(),
      };
      this.contributionsBySource.set(source, contribution);
    }
    return contribution;
  }

  private requireNode(node: GraphNodeId): GraphNode {
    const graphNode = this.nodesById.get(node);
    if (graphNode === undefined) {
      throw new Error(`Unknown graph node: ${node}`);
    }
    return graphNode;
  }

  private filterRelations(relationIds: Iterable<RelationId>, kind: RelationKind): ReadonlySet<RelationId> {
    const result = new Set<RelationId>();
    for (const relationId of relationIds) {
      if (this.relationsById.get(relationId)?.kind === kind) {
        result.add(relationId);
      }
    }
    return result;
  }
}

function validateNode(node: GraphNode): void {
  if (node.kind === "element" && node.nestingLevel < 1) {
    throw new Error("Element nesting level must be positive");
  }
}

function nodeOwnerSource(node: GraphNode): SourceNodeId | undefined {
  switch (node.kind) {
    case "context":
      return undefined;
    case "source":
      return node.id;
    case "type":
      return node.ownerSource;
    case "element":
      return node.declarationSource;
  }
}

function nodeContext(node: GraphNode): ContextNodeId | undefined {
  switch (node.kind) {
    case "context":
      return node.id;
    case "element":
      return node.context;
    case "source":
    case "type":
      return undefined;
  }
}

function indexedTypes(node: GraphNode): readonly TypeNodeId[] {
  switch (node.kind) {
    case "type":
      return [node.id, ...node.baseTypes];
    case "element":
      return [node.type, ...node.baseTypes];
    case "context":
    case "source":
      return [];
  }
}

function isDependency(kind: RelationKind): boolean {
  return kind === "REFERENCES" || kind === "IMPORTS" || kind === "INHERITS";
}

function addToIndex<K, V>(index: Map<K, Set<V>>, key: K, value: V): void {
  let values = index.get(key);
  if (values === undefined) {
    values = new Set();
    index.set(key, values);
  }
  values.add(value);
}

function removeFromIndex<K, V>(index: Map<K, Set<V>>, key: K, value: V): void {
  const values = index.get(key);
  if (values === undefined) {
    return;
  }
  values.delete(value);
  if (values.size === 0) {
    index.delete(key);
  }
}

function copySet<T>(values: ReadonlySet<T> | undefined): ReadonlySet<T> {
  return values === undefined ? new Set() : new Set(values);
}

function emptyImpact(): GraphUpdateImpact {
  return {
    removedNodes: new Set(),
    removedRelations: new Set(),
    dependentSources: new Set(),
  };
}

function sameNode(left: GraphNode, right: GraphNode): boolean {
  return JSON.stringify(normalizeNode(left)) === JSON.stringify(normalizeNode(right));
}

function sameRelation(left: GraphRelation, right: GraphRelation): boolean {
  return JSON.stringify(normalizeRelation(left)) === JSON.stringify(normalizeRelation(right));
}

function normalizeNode(node: GraphNode): unknown {
  if (node.kind === "element" || node.kind === "type") {
    return {
      ...node,
      baseTypes: [...node.baseTypes].sort(),
    };
  }
  return node;
}

function normalizeRelation(relation: GraphRelation): unknown {
  return {
    ...relation,
    derived: relation.derived ?? false,
    projected: relation.projected ?? false,
  };
}
