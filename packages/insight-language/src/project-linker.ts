import type {
  LanguageDiagnostic,
  LinkedContext,
  LinkedEdge,
  LinkedElement,
  LinkedAnnotation,
  LinkedImport,
  LinkProjectRequest,
  LinkProjectResult,
  ConstructorDefinition,
  OperatorDefinition,
  OperatorImplementationRegistry,
  OperatorImplementationV1,
  DuplicateLinkedEdgeGroup,
  ProjectionSection,
  ProjectionRuleDefinition,
  ProjectionOrigin,
  ProjectionTermDefinition,
  SourceLocation,
} from "./contracts.js";
import { InsightParser } from "./generated/InsightParser.js";
import { elementTypeOrKindIsExplicitlyExternal } from "./externality.js";
import {
  aggregateGroupAttribute,
  aggregateMemberType,
  isDocumentAggregateMember,
  resolveDocumentAggregateRoot,
} from "./document-aggregate.js";
import { IndexedGraph } from "./indexed-graph.js";
import { linkedEdgeId } from "./linked-edge-id.js";
import { isOperatorInvocation, operatorInvocationDiagnostic, readOperatorInvocation } from "./operator-invocation.js";
import { syntheticLinkedLocalId } from "./linked-identity.js";
import { buildIndexedGraph } from "./linked-project-index.js";
import { buildPresentationIndex } from "./presentation-resolver.js";
import {
  CORE_EDGE_IMPLEMENTATION,
  CORE_ELEMENT_IMPLEMENTATION,
  coreOperatorImplementationRegistry,
} from "./operator-implementation-registry.js";
import {
  directChildrenByRule,
  directTerminalTokens,
  firstChildByRule,
  firstDescendantByRule,
  parseInsightSource,
  hydrateParsedSource,
  portableParsedSource,
  sourceRangeOf,
  tokenText,
  tokenType as tokenTypeOf,
  type AntlrParseTreeLike,
  type ParsedSource,
  type PortableParsedSource,
  type SourceAnalysisMetadata,
} from "./parser-facade.js";
import { CONTEXT, EDGE, NOTHING, TypeSystem } from "./type-system.js";
import {
  ATTRIBUTE_CAPABILITIES,
  OPERATOR_CAPABILITIES,
  TYPE_CAPABILITIES,
} from "./semantic-capabilities.js";
import { resolveExplicitIcon } from "@archinsight/icons";
import {
  measureLinkPhase,
  type ProjectLinkerProfiler,
} from "./project-linker-profiler.js";

const ELEMENT_TYPE = "Element";
const ACTOR_TYPE = "Actor";
const APPLIES_TO_ATTRIBUTE = "appliesTo";
const RUNS_ON_ATTRIBUTE = "runsOn";
const USES_ATTRIBUTE = "uses";

export interface ParsedDocument {
  readonly sourceName: string;
  readonly documentRoot?: ParsedElement;
  readonly context: ParsedContext;
  readonly imports: readonly ParsedImport[];
  readonly elements: readonly ParsedElement[];
  readonly edges: readonly ParsedEdge[];
  readonly extensions: readonly ParsedExtension[];
  readonly diagnostics: readonly LanguageDiagnostic[];
}

interface ParsedContext {
  readonly id: string;
  readonly type: string;
  readonly synthetic: boolean;
  readonly line: number;
  readonly column: number;
  readonly endLine?: number;
  readonly endColumn?: number;
  readonly scalarAttributes: Record<string, string>;
  readonly scalarAttributePositions: Record<string, SourcePosition>;
  readonly assignedScalarAttributes: Set<string>;
}

interface ParsedImport {
  readonly sourceName: string;
  readonly importedId: string;
  readonly sourceContext: string;
  readonly alias: string;
  readonly importedLine: number;
  readonly importedColumn: number;
  readonly importedEndLine?: number;
  readonly importedEndColumn?: number;
  readonly contextLine: number;
  readonly contextColumn: number;
  readonly contextEndLine?: number;
  readonly contextEndColumn?: number;
}

export interface ParsedElement {
  readonly id: string;
  readonly context: string;
  readonly localId: string;
  slotName?: string;
  readonly type: string;
  readonly constructor: string;
  readonly sourceName: string;
  readonly anonymous: boolean;
  readonly synthetic?: boolean;
  readonly cloneOf?: string;
  graphElement?: boolean;
  projectionRoot?: boolean;
  readonly projectionRules: ProjectionRuleDefinition[];
  readonly operatorDefinition?: OperatorDefinition;
  readonly parent?: string;
  readonly attributes: Record<string, ParsedAttributeValue[]>;
  readonly referenceAttributePositions: Record<string, SourcePosition>;
  readonly scalarAttributes: Record<string, string>;
  readonly scalarAttributePositions: Record<string, SourcePosition>;
  readonly assignedScalarAttributes: Set<string>;
  readonly deploymentActions: ParsedDeploymentAction[];
  readonly note?: string;
  readonly noteSource?: SourceLocation;
  readonly annotations: readonly LinkedAnnotation[];
  readonly line: number;
  readonly column: number;
  readonly endLine?: number;
  readonly endColumn?: number;
  readonly idLine: number;
  readonly idColumn: number;
  readonly idEndLine?: number;
  readonly idEndColumn?: number;
}

interface ParsedEdge {
  readonly sourceName: string;
  readonly source: string;
  readonly sourceType: string;
  readonly expectedType?: string;
  readonly operator: string;
  readonly targetId: string;
  readonly targetLine: number;
  readonly targetColumn: number;
  readonly targetEndLine?: number;
  readonly targetEndColumn?: number;
  readonly targetContext?: string;
  readonly attributes: Record<string, ParsedAttributeValue[]>;
  readonly referenceAttributePositions: Record<string, SourcePosition>;
  readonly scalarAttributes: Record<string, string>;
  readonly scalarAttributePositions: Record<string, SourcePosition>;
  readonly assignedScalarAttributes: Set<string>;
  readonly deploymentActions: ParsedDeploymentAction[];
  readonly note?: string;
  readonly noteSource?: SourceLocation;
  readonly annotations: readonly LinkedAnnotation[];
  readonly line: number;
  readonly column: number;
}

interface ParsedAttributeValue {
  readonly targetId: string;
  readonly targetContext?: string;
  readonly line: number;
  readonly column: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

interface ParsedDeploymentAction {
  readonly routeEnvironment?: SourcePosition & { readonly id: string };
  readonly sourceName: string;
  readonly ownerId: string;
  readonly ownerType: string;
  readonly expectedType: string;
  readonly operator: string;
  readonly targetId: string;
  readonly targetContext?: string;
  readonly targetLine: number;
  readonly targetColumn: number;
  readonly targetEndLine?: number;
  readonly targetEndColumn?: number;
  readonly attributes: Record<string, ParsedAttributeValue[]>;
  readonly referenceAttributePositions: Record<string, SourcePosition>;
  readonly scalarAttributes: Record<string, string>;
  readonly scalarAttributePositions: Record<string, SourcePosition>;
  readonly assignedScalarAttributes: Set<string>;
  readonly inherited?: boolean;
  readonly line: number;
  readonly column: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

interface SourcePosition {
  readonly line: number;
  readonly column: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

interface ParsedExtension {
  readonly sourceName: string;
  readonly context: string;
  readonly constructor: string;
  readonly constructorLine: number;
  readonly constructorColumn: number;
  readonly constructorEndLine?: number;
  readonly constructorEndColumn?: number;
  readonly targetId: string;
  readonly targetLine: number;
  readonly targetColumn: number;
  readonly targetEndLine?: number;
  readonly targetEndColumn?: number;
  readonly body?: RuleNode;
  readonly line: number;
  readonly column: number;
}

interface MutableParsedDocument {
  readonly sourceName: string;
  documentRoot?: ParsedElement;
  readonly context: ParsedContext;
  readonly imports: ParsedImport[];
  readonly elements: ParsedElement[];
  readonly edges: ParsedEdge[];
  readonly pendingInvocations: PendingListInvocation[];
  readonly extensions: ParsedExtension[];
  readonly diagnostics: LanguageDiagnostic[];
  readonly operatorImplementations: OperatorImplementationRegistry;
}

interface PendingListInvocation {
  readonly node: RuleNode;
  readonly owner: ParsedElement;
  readonly ownerType: string;
  readonly expectedType: string;
  readonly annotations: readonly LinkedAnnotation[];
  readonly deploymentActions: ParsedDeploymentAction[];
}

export interface ResolvedImport {
  readonly sourceName: string;
  readonly alias: string;
  readonly importedId: string;
  readonly sourceContext: string;
  readonly target: string;
  readonly importedLine: number;
  readonly importedColumn: number;
  readonly importedEndLine?: number;
  readonly importedEndColumn?: number;
  readonly element?: ParsedElement;
}

interface ResolvedReferenceValue {
  readonly id: string;
  readonly element?: ParsedElement;
  readonly deploymentId?: string;
  readonly line?: number;
  readonly column?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

interface ProjectionScope {
  readonly sourcePlacement?: string;
  readonly targetPlacement?: string;
}

interface PendingProjection {
  readonly sourceIdentity: string;
  readonly fromId: string;
  readonly toId: string;
  readonly attributes: Readonly<Record<string, readonly ResolvedReferenceValue[]>>;
  readonly projectedAttributes?: Readonly<Record<string, readonly string[]>>;
  readonly projectedOperator?: string;
  readonly annotations?: readonly LinkedAnnotation[];
  readonly coverage?: WireDeploymentCoverage;
  readonly projectionOrigin: ProjectionOrigin;
  readonly routeActions?: readonly ParsedDeploymentAction[];
}

interface WireDeploymentCoverage {
  readonly parsed: ParsedEdge;
  readonly linked: LinkedEdge;
  readonly deploymentDefined: boolean;
  projected: boolean;
}

interface DeploymentExpansionContext {
  readonly nestedSlots: Map<string, ResolvedReferenceValue[]>;
  readonly sourceElementsBySourceAndLocalId: ReadonlyMap<string, ParsedElement>;
  readonly elementsByContextAndLocalId: ReadonlyMap<string, readonly ParsedElement[]>;
  readonly importsBySourceAndAlias: ReadonlyMap<string, ResolvedImport>;
  readonly linkedElementsById: Map<string, ParsedElement>;
  readonly resolvedElementAttributes: Map<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>;
  readonly effectiveDeploymentsByElementId: Map<string, readonly ParsedElement[]>;
  readonly typeSystem: TypeSystem;
  readonly diagnostics: LanguageDiagnostic[];
  readonly elements: ParsedElement[];
  cloneId(owner: ParsedElement, source: ParsedElement, action: ParsedDeploymentAction): string;
}

interface DeploymentUse {
  readonly element: ParsedElement;
  readonly deploymentId?: string;
  readonly action: ParsedDeploymentAction;
  readonly inherited: boolean;
}

interface DeploymentApplication {
  readonly deployments: readonly ParsedElement[];
  readonly runsOn: readonly DeploymentUse[];
  readonly uses: readonly DeploymentUse[];
}

interface DeploymentApplicationState {
  deployments: ParsedElement[];
  readonly profileByDeploymentId: Map<string, ParsedElement>;
  readonly runsOn: DeploymentUse[];
  readonly usesByKey: Map<string, DeploymentUse>;
}

interface EdgeMaterializationInput {
  readonly edge: ParsedEdge;
  readonly operator: OperatorDefinition;
  readonly target: ParsedElement;
  readonly edgeType: string;
  readonly edgeScalarAttributes: Readonly<Record<string, string>>;
  readonly edgeAttributes: Readonly<Record<string, readonly ResolvedReferenceValue[]>>;
  readonly typeSystem: TypeSystem;
  readonly from: LinkedElement;
  readonly to: LinkedElement;
}

interface EdgeMaterializationResult {
  readonly edge?: LinkedEdge;
  readonly diagnostics?: readonly LanguageDiagnostic[];
}

interface ElementPrefixInput {
  readonly operator: OperatorDefinition;
  readonly prefix: string;
  readonly sourceName: string;
  readonly sourcePosition: SourcePosition;
}

interface ElementPrefixResult {
  readonly accepted: boolean;
  readonly diagnostics?: readonly LanguageDiagnostic[];
}

interface LinkOperatorImplementation {
  materializeEdge(input: EdgeMaterializationInput): EdgeMaterializationResult;
  applyElementPrefix(input: ElementPrefixInput): ElementPrefixResult;
}

interface LinkingWorkspace {
  readonly profiler?: ProjectLinkerProfiler;
  readonly documents: readonly ParsedDocument[];
  readonly elements: ParsedElement[];
  readonly imports: readonly ResolvedImport[];
  readonly diagnostics: LanguageDiagnostic[];
  readonly typeSystem: TypeSystem;
  readonly elementsByContextAndLocalId: ReadonlyMap<string, readonly ParsedElement[]>;
  readonly sourceElementsBySourceAndLocalId: ReadonlyMap<string, ParsedElement>;
  readonly importsBySourceAndAlias: ReadonlyMap<string, ResolvedImport>;
  readonly linkedEdges: LinkedEdge[];
  readonly ownerIndependentProjectionKeys: Set<string>;
  readonly pendingProjections: PendingProjection[];
  readonly wireDeploymentCoverage: WireDeploymentCoverage[];
  readonly deployedElementIds: Set<string>;
  readonly linkedElementsById: ReadonlyMap<string, ParsedElement>;
  readonly resolvedElementAttributes: Map<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>;
  readonly computedElementSemanticAttributeNames: Map<string, Readonly<Record<string, string>>>;
  readonly deploymentContext: DeploymentExpansionContext;
  readonly operatorImplementations: OperatorImplementationRegistry;
}

export function linkProject(request: LinkProjectRequest): LinkProjectResult {
  return linkProjectWithSourceCache(request, new ProjectLinkerSourceCache());
}

export class ProjectLinkerSourceCache {
  private readonly entries: Map<string, {
    readonly source: string;
    parsed?: ParsedSource;
    readonly portable?: PortableParsedSource;
  }>;
  private parseMisses: number;

  constructor(
    entries: ReadonlyMap<string, {
      readonly source: string;
      readonly parsed?: ParsedSource;
      readonly portable?: PortableParsedSource;
    }> = new Map(),
    parseMisses = 0,
  ) {
    this.entries = new Map(entries);
    this.parseMisses = parseMisses;
  }

  fork(): ProjectLinkerSourceCache {
    return new ProjectLinkerSourceCache(this.entries, this.parseMisses);
  }

  parseCount(): number {
    return this.parseMisses;
  }

  portableParsedSources(): readonly PortableParsedSource[] {
    return [...this.entries.values()]
      .map((entry) => entry.portable ?? portableParsedSource(entry.parsed!))
      .sort((left, right) => left.sourceName.localeCompare(right.sourceName));
  }

  delete(sourceName: string): void {
    this.entries.delete(sourceName);
  }

  prime(parsed: ParsedSource): void {
    this.entries.set(parsed.sourceName, { source: parsed.source, parsed });
  }

  primePortable(portable: PortableParsedSource): void {
    this.entries.set(portable.sourceName, { source: portable.source, portable });
  }

  metadata(sourceName: string, source: string): SourceAnalysisMetadata {
    const cached = this.entries.get(sourceName);
    if (cached?.source === source) {
      return (cached.parsed ?? cached.portable!).metadata;
    }
    return this.parse(sourceName, source).metadata;
  }

  parse(sourceName: string, source: string): ParsedSource {
    const cached = this.entries.get(sourceName);
    if (cached?.source === source) {
      if (cached.parsed !== undefined) return cached.parsed;
      const parsed = hydrateParsedSource(cached.portable!);
      cached.parsed = parsed;
      return parsed;
    }
    const parsed = parseInsightSource({ sourceName, source });
    this.entries.set(sourceName, { source, parsed });
    this.parseMisses += 1;
    return parsed;
  }
}

export function linkProjectWithSourceCache(
  request: LinkProjectRequest,
  sourceCache: ProjectLinkerSourceCache,
  profiler?: ProjectLinkerProfiler,
): LinkProjectResult {
  const pipeline = measureLinkPhase(profiler, "link.workspace", () =>
    createLinkingWorkspace(request, sourceCache, profiler)
  );
  measureLinkPhase(profiler, "link.deployment", () => resolveDeploymentStage(pipeline));
  measureLinkPhase(profiler, "link.logical-relationships", () => materializeLogicalRelationshipsStage(pipeline));
  measureLinkPhase(profiler, "link.projections", () => expandProjectionStage(pipeline));
  return measureLinkPhase(profiler, "link.complete", () => completeLinkingPipeline(request, pipeline));
}

function createLinkingWorkspace(
  request: LinkProjectRequest,
  sourceCache: ProjectLinkerSourceCache,
  profiler?: ProjectLinkerProfiler,
): LinkingWorkspace {
  const typeSystem = measureLinkPhase(profiler, "link.workspace.type-system", () => new TypeSystem(request.snapshot));
  const operatorImplementations = request.operatorImplementations ?? coreOperatorImplementationRegistry;
  const documents = measureLinkPhase(profiler, "link.workspace.parse-documents", () =>
    request.sources.map((source) =>
      parseDocument(sourceCache.parse(source.sourceName, source.source), typeSystem, operatorImplementations)
    )
  );
  const diagnostics: LanguageDiagnostic[] = [];
  const elementsByContextAndLocalId = new Map<string, ParsedElement[]>();
  const sourceElementsBySourceAndLocalId = new Map<string, ParsedElement>();
  measureLinkPhase(profiler, "link.workspace.index-elements", () => {
    for (const element of documents.flatMap((document) => document.elements)) {
      indexElement(element, elementsByContextAndLocalId, sourceElementsBySourceAndLocalId);
    }
  });
  measureLinkPhase(profiler, "link.workspace.pending-operators-before-extensions", () =>
    collectPendingOperatorInvocations(documents, typeSystem, elementsByContextAndLocalId, sourceElementsBySourceAndLocalId)
  );
  measureLinkPhase(profiler, "link.workspace.apply-extensions", () =>
    applyExtensions(documents, typeSystem, elementsByContextAndLocalId, sourceElementsBySourceAndLocalId, diagnostics)
  );
  measureLinkPhase(profiler, "link.workspace.pending-operators-after-extensions", () =>
    collectPendingOperatorInvocations(documents, typeSystem, elementsByContextAndLocalId, sourceElementsBySourceAndLocalId)
  );
  diagnostics.unshift(...documents.flatMap((document) => document.diagnostics));
  const elements = documents.flatMap((document) => document.elements);
  measureLinkPhase(profiler, "link.workspace.duplicate-elements", () =>
    reportDuplicateElements(elementsByContextAndLocalId, diagnostics)
  );
  const imports = measureLinkPhase(profiler, "link.workspace.resolve-imports", () =>
    resolveImports(documents, elementsByContextAndLocalId, diagnostics)
  );
  const importsBySourceAndAlias = new Map<string, ResolvedImport>();
  for (const item of imports) {
    importsBySourceAndAlias.set(`${item.sourceName}\0${item.alias}`, item);
  }
  const linkedEdges: LinkedEdge[] = [];
  const ownerIndependentProjectionKeys = new Set<string>();
  const pendingProjections: PendingProjection[] = [];
  const wireDeploymentCoverage: WireDeploymentCoverage[] = [];
  const deployedElementIds = new Set<string>();
  const linkedElementsById = new Map(elements.map((element) => [element.id, element]));
  const resolvedElementAttributes = new Map<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>();
  const computedElementSemanticAttributeNames = new Map<string, Readonly<Record<string, string>>>();
  measureLinkPhase(profiler, "link.workspace.resolve-element-attributes", () => {
    for (const element of elements) {
      resolvedElementAttributes.set(
        element.id,
        resolveAttributes(element, element.type, element.attributes, element.referenceAttributePositions, element.scalarAttributes, element.scalarAttributePositions, element.context, sourceElementsBySourceAndLocalId, elementsByContextAndLocalId, importsBySourceAndAlias, typeSystem, diagnostics),
      );
    }
  });
  const deploymentContext: DeploymentExpansionContext = {
    nestedSlots: new Map(),
    sourceElementsBySourceAndLocalId,
    elementsByContextAndLocalId,
    importsBySourceAndAlias,
    linkedElementsById,
    resolvedElementAttributes,
    effectiveDeploymentsByElementId: new Map<string, readonly ParsedElement[]>(),
    typeSystem,
    diagnostics,
    elements,
    cloneId(owner, source, action) {
      return `${owner.context}/${syntheticLinkedLocalId("deployment-clone", [
        owner.id,
        source.id,
        action.sourceName,
        action.line,
        action.column,
      ])}`;
    },
  };
  for (const element of elements) indexNestedSlot(deploymentContext.nestedSlots, element);
  return {
    ...(profiler === undefined ? {} : { profiler }),
    documents,
    elements,
    imports,
    diagnostics,
    typeSystem,
    elementsByContextAndLocalId,
    sourceElementsBySourceAndLocalId,
    importsBySourceAndAlias,
    linkedEdges,
    ownerIndependentProjectionKeys,
    pendingProjections,
    wireDeploymentCoverage,
    deployedElementIds,
    linkedElementsById,
    resolvedElementAttributes,
    computedElementSemanticAttributeNames,
    deploymentContext,
    operatorImplementations,
  };
}

function resolveDeploymentStage(workspace: LinkingWorkspace): void {
  const {
    elements,
    typeSystem,
    deploymentContext,
    deployedElementIds,
    resolvedElementAttributes,
    computedElementSemanticAttributeNames,
  } = workspace;
  for (const element of elements) {
    if (typeSystem.typeHasCapability(element.type, TYPE_CAPABILITIES.deploymentProfile)) {
      continue;
    }
    const application = element.deploymentActions.length === 0
      ? { deployments: [], runsOn: [], uses: [] }
      : resolveDeploymentApplication(element, element.deploymentActions, false, deploymentContext);
    if (application.runsOn.length > 0 || application.uses.length > 0) {
      deployedElementIds.add(element.id);
    }
    const inheritedDeployments = element.parent === undefined
      ? []
      : deploymentContext.effectiveDeploymentsByElementId.get(element.parent) ?? [];
    const effectiveDeployments = application.deployments.length > 0
      ? application.deployments
      : inheritedDeployments;
    deploymentContext.effectiveDeploymentsByElementId.set(element.id, effectiveDeployments);
    if (element.deploymentActions.length === 0 && effectiveDeployments.length === 0) {
      continue;
    }
    const placementAttribute = typeSystem.attributeWithCapability(
      element.type,
      ATTRIBUTE_CAPABILITIES.placementOwner,
    )?.name ?? RUNS_ON_ATTRIBUTE;
    const usesAttribute = typeSystem.attributeWithCapability(
      element.type,
      ATTRIBUTE_CAPABILITIES.infrastructureUses,
    )?.name ?? USES_ATTRIBUTE;
    const computedSemanticAttributeNames: Record<string, string> = {};
    if (application.runsOn.length > 0) {
      computedSemanticAttributeNames[ATTRIBUTE_CAPABILITIES.placementOwner] = placementAttribute;
    }
    if (application.uses.length > 0) {
      computedSemanticAttributeNames[ATTRIBUTE_CAPABILITIES.infrastructureUses] = usesAttribute;
    }
    if (Object.keys(computedSemanticAttributeNames).length > 0) {
      computedElementSemanticAttributeNames.set(element.id, computedSemanticAttributeNames);
    }
    resolvedElementAttributes.set(
      element.id,
      mergeResolvedReferenceAttributes(resolvedElementAttributes.get(element.id) ?? {}, {
        [APPLIES_TO_ATTRIBUTE]: effectiveDeployments.map((deployment) => resolvedValueForElement(deployment, deployment)),
        [placementAttribute]: application.runsOn.map(resolvedValueForDeploymentUse),
        [usesAttribute]: application.uses.map(resolvedValueForDeploymentUse),
      }, new Set([placementAttribute])),
    );
  }
}

function materializeLogicalRelationshipsStage(workspace: LinkingWorkspace): void {
  const {
    documents,
    sourceElementsBySourceAndLocalId,
    elementsByContextAndLocalId,
    importsBySourceAndAlias,
    diagnostics,
    typeSystem,
    deploymentContext,
    linkedEdges,
    linkedElementsById,
    wireDeploymentCoverage,
    pendingProjections,
    deployedElementIds,
    resolvedElementAttributes,
    computedElementSemanticAttributeNames,
    operatorImplementations,
    profiler,
  } = workspace;
  for (const document of documents) {
    for (const edge of document.edges) {
      const target = resolveEdgeTarget(edge, document.context.id, sourceElementsBySourceAndLocalId, elementsByContextAndLocalId, importsBySourceAndAlias, diagnostics);
      if (target === undefined) {
        continue;
      }
      const operator = typeSystem.operatorConstructor(edge.operator, edge.sourceType, target.type, edge.expectedType);
      if (operator === undefined) {
        const knownOperator = typeSystem.hasOperatorConstructor(edge.operator);
        diagnostics.push({
          code: knownOperator ? "TYPE_MISMATCH" : "CONSTRUCTOR_NOT_DECLARED",
          message: knownOperator
            ? `Operator '${edge.operator}' cannot be applied from '${edge.sourceType}' to '${target.type}'`
            : `Unknown operator '${edge.operator}' from '${edge.sourceType}' to '${target.type}'`,
          sourceName: edge.sourceName,
          ...diagnosticPosition(edge),
        });
        continue;
      }
      const edgeType = operator.ownerType ?? edge.operator;
      const edgeScalarAttributes = { ...(operator.defaults ?? {}), ...edge.scalarAttributes };
      const edgeAttributes = resolveAttributes(edge, edgeType, edge.attributes, edge.referenceAttributePositions, edgeScalarAttributes, edge.scalarAttributePositions, document.context.id, sourceElementsBySourceAndLocalId, elementsByContextAndLocalId, importsBySourceAndAlias, typeSystem, diagnostics);
      const deploymentAttributes = edge.deploymentActions.length === 0
        ? {}
        : deploymentAttributesForWire(edge, target, edgeType, deploymentContext);
      const effectiveEdgeAttributes = mergeResolvedReferenceAttributes(edgeAttributes, deploymentAttributes);
      const source = linkedElementsById.get(edge.source);
      if (source === undefined) {
        continue;
      }
      const endpoints = measureLinkPhase(profiler, "link.logical.snapshot-endpoints", () => ({
        from: linkedElementSnapshot(source, typeSystem, resolvedElementAttributes, deployedElementIds, computedElementSemanticAttributeNames),
        to: linkedElementSnapshot(target, typeSystem, resolvedElementAttributes, deployedElementIds, computedElementSemanticAttributeNames),
      }));
      const materialized = measureLinkPhase(profiler, "link.logical.materialize-edge", () =>
        implementationFor(operator, typeSystem, operatorImplementations).materializeEdge({
          edge,
          operator,
          target,
          edgeType,
          edgeScalarAttributes,
          edgeAttributes: effectiveEdgeAttributes,
          typeSystem,
          ...endpoints,
        })
      );
      diagnostics.push(...(materialized.diagnostics ?? []));
      if (materialized.edge === undefined) {
        continue;
      }
      linkedEdges.push(materialized.edge);
      const deploymentSource = deploymentViewLogicalEndpoint(edge.source, linkedElementsById, typeSystem);
      const deploymentTarget = deploymentViewLogicalEndpoint(target.id, linkedElementsById, typeSystem);
      const coverage = typeSystem.attributeWithCapability(edgeType, ATTRIBUTE_CAPABILITIES.deploymentActions) !== undefined
        && !typeSystem.typeHasCapability(edge.sourceType, TYPE_CAPABILITIES.deploymentElement)
        && deploymentSource !== undefined
        && deploymentTarget !== undefined
        && deploymentSource !== deploymentTarget
        ? {
          parsed: edge,
          linked: materialized.edge,
          deploymentDefined: edge.deploymentActions.length > 0,
          projected: false,
        }
        : undefined;
      if (coverage !== undefined) {
        wireDeploymentCoverage.push(coverage);
      }
      pendingProjections.push({
        sourceIdentity: edge.sourceName,
        fromId: edge.source,
        toId: target.id,
        attributes: effectiveEdgeAttributes,
        projectedAttributes: materialized.edge.attributes,
        projectedOperator: materialized.edge.operator,
        projectionOrigin: {
          source: edge.source,
          target: target.id,
          sourceIdentity: materialized.edge.sourceIdentity,
          ...(materialized.edge.declaration === undefined ? {} : { declaration: materialized.edge.declaration }),
        },
        routeActions: edge.deploymentActions.filter((action) =>
          deploymentActionHasCapability(action, OPERATOR_CAPABILITIES.deploymentRoute, typeSystem)
        ),
        ...(materialized.edge.annotations === undefined ? {} : { annotations: materialized.edge.annotations }),
        ...(coverage === undefined ? {} : { coverage }),
      });
    }
  }
}

function expandProjectionStage(workspace: LinkingWorkspace): void {
  const {
    pendingProjections,
    linkedEdges,
    linkedElementsById,
    resolvedElementAttributes,
    ownerIndependentProjectionKeys,
    typeSystem,
    diagnostics,
    elements,
  } = workspace;
  for (const projection of pendingProjections) {
    if ((projection.routeActions?.length ?? 0) > 0) {
      const firstDiagnostic = diagnostics.length;
      expandRouteProjection(workspace, projection);
      const wire = projection.projectionOrigin.declaration;
      if (wire !== undefined) {
        for (let index = firstDiagnostic; index < diagnostics.length; index++) {
          const diagnostic = diagnostics[index]!;
          diagnostics[index] = { ...diagnostic, message: `${diagnostic.message} (wire ${projection.fromId} → ${projection.toId} at ${wire.sourceName}:${wire.line}:${wire.column})` };
        }
      }
    } else {
      addProjectedEdges(linkedEdges, projection.sourceIdentity, projection.fromId, projection.toId, projection.attributes, linkedElementsById, resolvedElementAttributes, ownerIndependentProjectionKeys, typeSystem, diagnostics, undefined, projection.annotations, projection.projectedAttributes, projection.projectedOperator, new Set<string>(), projection.coverage, projection.projectionOrigin);
    }
  }
  expandComponentProjectionStage(workspace);
  const slotDomainTypes = typeSystem.slotDomainTypes();
  for (const element of elements) {
    if (isProjectionRoot(element, slotDomainTypes, typeSystem)) {
      addProjectedEdges(linkedEdges, element.sourceName, element.id, element.id, resolvedElementAttributes.get(element.id) ?? {}, linkedElementsById, resolvedElementAttributes, ownerIndependentProjectionKeys, typeSystem, diagnostics);
    }
  }
}

function completeLinkingPipeline(
  request: LinkProjectRequest,
  workspace: LinkingWorkspace,
): LinkProjectResult {
  const {
    typeSystem,
    documents,
    elements,
    imports,
    diagnostics,
    linkedEdges,
    resolvedElementAttributes,
    computedElementSemanticAttributeNames,
    deployedElementIds,
    wireDeploymentCoverage,
    elementsByContextAndLocalId,
    sourceElementsBySourceAndLocalId,
    importsBySourceAndAlias,
    profiler,
  } = workspace;
  const duplicateEdges = measureLinkPhase(profiler, "link.complete.duplicate-edges", () =>
    duplicateLinkedEdges(linkedEdges)
  );
  const presentations = measureLinkPhase(profiler, "link.complete.presentations", () =>
    buildPresentationIndex(request.snapshot.presentations ?? [], typeSystem, diagnostics)
  );
  const graph = measureLinkPhase(profiler, "link.complete.build-indexed-graph", () =>
    buildIndexedGraph(documents, elements, imports, linkedEdges, typeSystem)
  );
  const graphElements = elements.filter(isGraphElement);
  measureLinkPhase(profiler, "link.complete.inspect-graph", () =>
    inspectGraph(graph, graphElements, linkedEdges, resolvedElementAttributes, typeSystem, deployedElementIds, wireDeploymentCoverage, diagnostics)
  );
  measureLinkPhase(profiler, "link.complete.validate-icons", () =>
    validateIconAnnotations(elements, linkedEdges, diagnostics)
  );
  const tabRoots = measureLinkPhase(profiler, "link.complete.tab-roots", () =>
    tabRootsBySource(documents, elementsByContextAndLocalId)
  );
  measureLinkPhase(profiler, "link.complete.resolve-context-attributes", () => {
    for (const document of documents) {
      resolveAttributes(
        { sourceName: document.sourceName, ...document.context },
        document.context.type,
        {},
        {},
        document.context.scalarAttributes,
        document.context.scalarAttributePositions,
        document.context.id,
        sourceElementsBySourceAndLocalId,
        elementsByContextAndLocalId,
        importsBySourceAndAlias,
        typeSystem,
        diagnostics,
      );
    }
  });
  const contexts: LinkedContext[] = measureLinkPhase(profiler, "link.complete.context-snapshots", () =>
    documents.map((document) => {
      const root = document.documentRoot ?? document.context;
      return {
        id: document.context.id,
        type: root.type,
        sourceIdentity: document.sourceName,
        ...(document.context.synthetic ? { synthetic: true } : {}),
        declaration: sourceLocation(document.sourceName, root),
        ...(typeSystem.capabilities(root.type).length === 0
          ? {}
          : { capabilities: typeSystem.capabilities(root.type) }),
        attributes: flattenAttributes(root.scalarAttributes, {}),
      };
    })
  );
  const linkedElements = measureLinkPhase(profiler, "link.complete.element-snapshots", () =>
    graphElements.map((element) =>
      linkedElementSnapshot(element, typeSystem, resolvedElementAttributes, deployedElementIds, computedElementSemanticAttributeNames)
    )
  );
  const linkedImports = measureLinkPhase(profiler, "link.complete.import-snapshots", () =>
    imports.map((item) => ({
      sourceIdentity: item.sourceName,
      alias: item.alias,
      importedId: item.importedId,
      sourceContext: item.sourceContext,
      target: item.target,
      declaration: sourceLocation(item.sourceName, {
        line: item.importedLine,
        column: item.importedColumn,
        ...(item.importedEndLine === undefined ? {} : { endLine: item.importedEndLine }),
        ...(item.importedEndColumn === undefined ? {} : { endColumn: item.importedEndColumn }),
      }),
    }))
  );
  return {
    diagnostics,
    graph,
    contexts,
    elements: linkedElements,
    imports: linkedImports,
    edges: linkedEdges,
    tabRoots,
    duplicateEdges,
    presentations,
  };
}

function validateIconAnnotations(
  elements: readonly ParsedElement[],
  edges: readonly LinkedEdge[],
  diagnostics: LanguageDiagnostic[],
): void {
  for (const element of elements) {
    const icons = element.annotations.filter(({ name }) => name === "icon");
    for (const duplicate of icons.slice(1)) {
      diagnostics.push(annotationDiagnostic(
        duplicate,
        element.sourceName,
        element,
        "ICON_ANNOTATION_DUPLICATE",
        "Only one @icon annotation is allowed on an element",
      ));
    }
    const icon = icons[0];
    if (icon === undefined) continue;
    const resolution = resolveExplicitIcon(icon.value ?? "");
    if (resolution.status !== "unknown") continue;
    const suffix = resolution.suggestions.length === 0
      ? ""
      : `; did you mean ${resolution.suggestions.map((id) => `'${id}'`).join(", ")}?`;
    diagnostics.push(annotationDiagnostic(
      icon,
      element.sourceName,
      element,
      "ICON_NOT_FOUND",
      `Unknown icon '${icon.value ?? ""}'${suffix}`,
    ));
  }

  const reportedEdges = new Set<string>();
  for (const edge of edges) {
    for (const annotation of edge.annotations?.filter(({ name }) => name === "icon") ?? []) {
      const source = annotation.source ?? edge.declaration;
      const key = `${source?.sourceName ?? edge.sourceIdentity}:${source?.line ?? 0}:${source?.column ?? 0}`;
      if (reportedEdges.has(key)) continue;
      reportedEdges.add(key);
      diagnostics.push(annotationDiagnostic(
        annotation,
        edge.sourceIdentity,
        edge.declaration,
        "ICON_TARGET_NOT_SUPPORTED",
        "@icon can only be applied to elements, not relationships",
      ));
    }
  }
}

function annotationDiagnostic(
  annotation: LinkedAnnotation,
  fallbackSourceName: string,
  fallbackPosition: { readonly line: number; readonly column: number; readonly endLine?: number; readonly endColumn?: number } | SourceLocation | undefined,
  code: string,
  message: string,
): LanguageDiagnostic {
  const source = annotation.source;
  const endLine = source?.endLine ?? fallbackPosition?.endLine;
  const endColumn = source?.endColumn ?? fallbackPosition?.endColumn;
  return {
    code,
    message,
    sourceName: source?.sourceName ?? fallbackSourceName,
    line: source?.line ?? fallbackPosition?.line ?? 1,
    column: source?.column ?? fallbackPosition?.column ?? 0,
    ...(endLine === undefined ? {} : { endLine }),
    ...(endColumn === undefined ? {} : { endColumn }),
  };
}

function linkedElementSnapshot(
  element: ParsedElement,
  typeSystem: TypeSystem,
  resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
  deployedElementIds: ReadonlySet<string>,
  computedElementSemanticAttributeNames: ReadonlyMap<string, Readonly<Record<string, string>>>,
): LinkedElement {
  const resolvedAttributes = resolvedElementAttributes.get(element.id) ?? {};
  const attributes = flattenAttributes(element.scalarAttributes, resolvedAttributes);
  const capabilities = typeSystem.capabilities(element.type);
  const computedSemanticAttributeNames = computedElementSemanticAttributeNames.get(element.id) ?? {};
  const semanticAttributes = semanticAttributesFor(element.type, attributes, typeSystem, computedSemanticAttributeNames);
  const semanticAttributeNames = semanticAttributeNamesFor(element.type, typeSystem, computedSemanticAttributeNames);
  return {
    id: element.id,
    context: element.context,
    localId: element.localId,
    type: element.type,
    constructor: element.constructor,
    sourceIdentity: element.sourceName,
    declaration: sourceLocation(element.sourceName, element),
    ...(element.anonymous ? { anonymous: true } : {}),
    ...(element.synthetic ? { synthetic: true } : {}),
    ...(element.cloneOf === undefined ? {} : { cloneOf: element.cloneOf }),
    ...(element.parent === undefined ? {} : { parent: element.parent }),
    baseTypes: typeSystem.baseTypes(element.type),
    ...(capabilities.length === 0 ? {} : { capabilities }),
    attributes,
    ...(Object.keys(semanticAttributes).length === 0 ? {} : { semanticAttributes }),
    ...(Object.keys(semanticAttributeNames).length === 0 ? {} : { semanticAttributeNames }),
    ...(deployedElementIds.has(element.id) ? { deployed: true } : {}),
    ...listAttributesProperty(typeSystem, element.type),
    ...referenceAttributesProperty(resolvedAttributes),
    ...(element.note === undefined ? {} : { note: element.note }),
    ...(element.noteSource === undefined ? {} : { noteSource: element.noteSource }),
    ...(element.annotations.length === 0 ? {} : { annotations: element.annotations }),
  };
}

function parseDocument(
  parsed: ParsedSource,
  typeSystem: TypeSystem,
  operatorImplementations: OperatorImplementationRegistry,
): MutableParsedDocument {
  const { sourceName } = parsed;
  const diagnostics = [...parsed.diagnostics];
  const architecture = parsed.syntax.firstDescendant<RuleNode>("architectureFile");
  const contextDeclaration = architecture === undefined ? undefined : firstChild(architecture, "contextDeclaration");
  const environmentFile = architecture === undefined ? undefined : firstChild(architecture, "environmentFile");
  const environmentDeclaration = environmentFile === undefined ? undefined : firstChild(environmentFile, "environmentDeclaration");
  const contextId = contextDeclaration === undefined
    ? environmentDeclaration === undefined ? sourceName : firstChild(environmentDeclaration, "environmentDeclarationName")?.getText() ?? sourceName
    : firstChild(contextDeclaration, "contextDeclarationName")?.getText() ?? sourceName;
  const contextType = typeSystem.findConstructor("context", NOTHING)?.ownerType ?? CONTEXT;
  const contextPosition = position(contextDeclaration, sourceName);
  const document: MutableParsedDocument = {
    sourceName,
    context: {
      id: contextId,
      type: contextType,
      synthetic: contextDeclaration === undefined && environmentDeclaration === undefined,
      line: contextPosition.line,
      column: contextPosition.column,
      scalarAttributes: {},
      scalarAttributePositions: {},
      assignedScalarAttributes: new Set(),
    },
    imports: [],
    elements: [],
    edges: [],
    pendingInvocations: [],
    extensions: [],
    diagnostics,
    operatorImplementations,
  };

  if (architecture === undefined) {
    return document;
  }

  const contextBody = contextDeclaration === undefined ? undefined : firstChild(contextDeclaration, "objectBody");
  if (contextBody !== undefined) {
    collectBodyItems(contextBody, contextType, undefined, document, typeSystem);
  }

  const environmentRoot = environmentDeclaration === undefined
    ? undefined
    : collectEnvironmentDeclaration(environmentDeclaration, environmentFile, document, typeSystem);
  if (environmentRoot !== undefined) document.documentRoot = environmentRoot;
  if (environmentFile !== undefined) {
    for (const item of children(environmentFile, "architectureTopLevelItem")) {
      collectTopLevelItem(item, document, typeSystem, environmentRoot);
    }
  } else {
    for (const item of children(architecture, "architectureTopLevelItem")) {
      collectTopLevelItem(item, document, typeSystem);
    }
  }
  return document;
}

function anonymousLocalId(
  document: MutableParsedDocument,
  declaration: RuleNode | undefined,
  role: string,
  ownerId?: string,
): string {
  const source = position(declaration, document.sourceName);
  return syntheticLinkedLocalId("anonymous", [
    document.sourceName,
    role,
    ownerId ?? document.context.id,
    source.line,
    source.column,
    source.endLine ?? source.line,
    source.endColumn ?? source.column,
  ]);
}

function collectEnvironmentDeclaration(
  declaration: RuleNode,
  environmentFile: RuleNode | undefined,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
): ParsedElement | undefined {
  const requiredGroups = aggregateRequiredGroupNames(declaration, environmentFile, typeSystem);
  const resolution = resolveDocumentAggregateRoot(typeSystem, requiredGroups);
  const name = firstChild(declaration, "environmentDeclarationName");
  const localId = name?.getText() ?? document.context.id;
  if (resolution === undefined) {
    document.diagnostics.push({
      code: "CONSTRUCTOR_NOT_DECLARED",
      message: `No type declares capability '${TYPE_CAPABILITIES.documentAggregateRoot}'`,
      sourceName: document.sourceName,
      ...position(declaration, document.sourceName),
    });
    return undefined;
  }
  if (resolution.ambiguousTypes.length > 0) {
    document.diagnostics.push({
      code: "DOCUMENT_AGGREGATE_SCHEMA_AMBIGUOUS",
      message: `Document root matches multiple aggregate schemas: ${resolution.ambiguousTypes.map((type) => `'${type}'`).join(", ")}`,
      sourceName: document.sourceName,
      ...position(name ?? declaration, document.sourceName),
    });
  }
  const environmentType = resolution.type;
  const constructor = aggregateRootConstructor(typeSystem, environmentType);
  const element: ParsedElement = {
    id: `${document.context.id}/${localId}`,
    context: document.context.id,
    localId,
    type: environmentType,
    constructor: constructor?.spelling ?? "environment",
    sourceName: document.sourceName,
    anonymous: false,
    projectionRules: [],
    attributes: {},
    referenceAttributePositions: {},
    scalarAttributes: { ...(constructor?.defaults ?? {}) },
    scalarAttributePositions: {},
    assignedScalarAttributes: new Set(),
    deploymentActions: [],
    annotations: [],
    ...noteProperty(declaration, document.sourceName),
    ...position(declaration, document.sourceName),
    ...prefixedPosition("id", name, document.sourceName),
  };
  document.elements.push(element);
  const body = firstChild(declaration, "objectBody");
  if (body !== undefined) {
    collectBodyItems(body, element.type, element, document, typeSystem);
  }
  return element;
}

function aggregateRootConstructor(
  typeSystem: TypeSystem,
  rootType: string,
): ConstructorDefinition | undefined {
  for (const type of [rootType, ...typeSystem.baseTypes(rootType)]) {
    const constructors = typeSystem.constructorsDeclaredBy(type);
    if (constructors.length === 1) {
      return constructors[0];
    }
  }
  return undefined;
}

function aggregateRequiredGroupNames(
  declaration: RuleNode,
  environmentFile: RuleNode | undefined,
  typeSystem: TypeSystem,
): ReadonlySet<string> {
  const result = new Set<string>();
  const body = firstChild(declaration, "objectBody");
  if (body !== undefined) {
    collectNamedListNames(body, result);
  }
  if (environmentFile !== undefined) {
    for (const item of children(environmentFile, "architectureTopLevelItem")) {
      const object = firstDescendant(item, "objectDeclaration");
      if (object === undefined || !isAggregateMemberObject(object, typeSystem)) {
        continue;
      }
      const objectBody = firstChild(object, "objectBody");
      if (objectBody !== undefined) {
        collectNamedListNames(objectBody, result);
      }
    }
  }
  return result;
}

function collectNamedListNames(body: RuleNode, result: Set<string>): void {
  for (const item of children(body, "architectureBodyItem")) {
    const list = firstChild(item, "namedList");
    if (list === undefined) {
      continue;
    }
    const name = firstChild(list, "listName")?.getText();
    if (name !== undefined && name.length > 0) {
      result.add(name);
    }
  }
}

function isAggregateMemberObject(object: RuleNode, typeSystem: TypeSystem): boolean {
  const constructorName = firstChild(object, "elementConstructor")?.getText();
  return constructorName !== undefined && typeSystem.constructorsForSpelling(constructorName)
    .some((constructor) => isDocumentAggregateMember(typeSystem, constructor.ownerType));
}

function collectTopLevelItem(
  item: RuleNode,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
  environmentRoot?: ParsedElement,
): void {
  const importDeclaration = firstChild(item, "namedImportDeclaration");
  if (importDeclaration !== undefined) {
	    const importedReference = firstChild(importDeclaration, "identifierReference");
	    const contextReference = firstDescendant(importDeclaration, "contextReference") ?? firstDescendant(importDeclaration, "environmentReference");
    const importedId = importedReference?.getText() ?? "";
    const sourceContext = contextReference?.getText() ?? "";
    const alias = firstChild(importDeclaration, "importAlias")?.getText() ?? importedId;
    const importedPosition = position(importedReference, document.sourceName);
    const contextPosition = position(contextReference, document.sourceName);
    document.imports.push({
      sourceName: document.sourceName,
    importedId,
    sourceContext,
    alias,
    importedLine: importedPosition.line,
    importedColumn: importedPosition.column,
    ...(importedPosition.endLine === undefined ? {} : { importedEndLine: importedPosition.endLine }),
    ...(importedPosition.endColumn === undefined ? {} : { importedEndColumn: importedPosition.endColumn }),
    contextLine: contextPosition.line,
    contextColumn: contextPosition.column,
    ...(contextPosition.endLine === undefined ? {} : { contextEndLine: contextPosition.endLine }),
    ...(contextPosition.endColumn === undefined ? {} : { contextEndColumn: contextPosition.endColumn }),
  });
    return;
  }

  const annotatedObject = firstChild(item, "annotatedObjectDeclaration");
  if (annotatedObject !== undefined) {
    const object = firstChild(annotatedObject, "objectDeclaration");
    if (object !== undefined) {
      collectObject(
        object,
        environmentRoot?.type ?? document.context.type,
        environmentRoot,
        document,
        typeSystem,
        annotations(annotatedObject, document),
      );
    }
    return;
  }

  const extension = firstChild(item, "objectExtension");
  if (extension !== undefined) {
    collectExtension(extension, document);
  }
}

function collectBodyItems(
  body: RuleNode,
  ownerType: string,
  owner: ParsedElement | undefined,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
): void {
  for (const item of children(body, "architectureBodyItem")) {
    collectBodyItem(item, ownerType, owner, document, typeSystem);
  }
}

function collectBodyItem(
  item: RuleNode,
  ownerType: string,
  owner: ParsedElement | undefined,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
  expectedObjectType?: string,
): void {
  const expectedType = expectedObjectType ?? typeSystem.anonymousListAttribute(ownerType)?.listElementType;
  const relationAnnotatedObject = firstChild(item, "annotatedObjectDeclaration");
  const relationObject = relationAnnotatedObject === undefined
    ? undefined
    : firstChild(relationAnnotatedObject, "objectDeclaration");
  if (owner !== undefined && expectedType !== undefined && typeSystem.isAssignable(expectedType, EDGE)
      && relationObject !== undefined
      && firstChild(relationObject, "namedPrefixOperatorInvocation") !== undefined) {
    owner.projectionRules.push(concreteProjectionRuleFromObject(relationObject, document.sourceName, "projection"));
    return;
  }
  const annotatedInvocation = firstChild(item, "annotatedOperatorInvocation") ?? firstChild(item, "annotatedObjectDeclaration");
  const invocationNode = annotatedInvocation === undefined ? undefined
    : firstChild(annotatedInvocation, "operatorInvocation") ?? firstChild(annotatedInvocation, "objectDeclaration");
  if (owner !== undefined && expectedType !== undefined && invocationNode !== undefined
      && isOperatorInvocation(invocationNode, InsightParser.ruleNames, typeSystem, expectedType)
      && collectListInvocation(invocationNode, owner, ownerType, expectedType, "_", annotations(annotatedInvocation!, document), document, typeSystem)) {
    return;
  }
  const assignment = firstChild(item, "assignment");
  if (assignment !== undefined) {
    if (owner !== undefined) {
      assignScalarAttribute(owner, assignment, document.sourceName, document.diagnostics);
    } else {
      assignScalarAttribute(document.context, assignment, document.sourceName, document.diagnostics);
    }
    return;
  }

  const list = firstChild(item, "namedList");
  if (list !== undefined) {
    collectNamedList(list, ownerType, owner, document, typeSystem);
    return;
  }

  const relation = firstChild(item, "relationInvocation");
  if (relation !== undefined) {
    if (owner !== undefined && expectedType !== undefined && typeSystem.isAssignable(expectedType, EDGE)) {
      owner.projectionRules.push(concreteProjectionRule(relation, document.sourceName, "projection"));
      return;
    }
    if (owner !== undefined && expectedType !== undefined
        && collectRelationPrefixedObject(relation, ownerType, owner, expectedType, "_", document, typeSystem)) {
      return;
    }
    document.diagnostics.push({
      code: "TYPE_MISMATCH",
      message: "Relation invocation expects an Edge list",
      sourceName: document.sourceName,
      ...position(relation, document.sourceName),
    });
    return;
  }

  const annotatedObject = firstChild(item, "annotatedObjectDeclaration");
  if (annotatedObject !== undefined) {
    const object = firstChild(annotatedObject, "objectDeclaration");
    if (object !== undefined) {
      const element = collectObject(
        object,
        ownerType,
        owner,
        document,
        typeSystem,
        annotations(annotatedObject, document),
        expectedObjectType ?? expectedNestedType(typeSystem, ownerType),
      );
      if (owner !== undefined && element !== undefined && typeSystem.anonymousListAttribute(ownerType) !== undefined) {
        addAttributeValue(owner.attributes, "_", elementReference(element));
      }
    }
    return;
  }

  const annotatedOperator = firstChild(item, "annotatedOperatorInvocation");
  if (annotatedOperator !== undefined && owner !== undefined) {
    document.diagnostics.push({
      code: "TYPE_MISMATCH",
      message: "Operator invocation expects an Edge list",
      sourceName: document.sourceName,
      ...position(annotatedOperator, document.sourceName),
    });
    return;
  }

  const extension = firstChild(item, "objectExtension");
  if (extension !== undefined) {
    collectExtension(extension, document);
  }
}

function collectRelationPrefixedObject(
  relation: RuleNode,
  parentType: string,
  parent: ParsedElement,
  expectedType: string,
  attribute: string,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
): boolean {
  const terms = children(relation, "relationTerm");
  const prefixNode = terms[0] === undefined ? undefined : firstChild(terms[0], "relationReference");
  const constructorNode = firstChild(relation, "operatorIdentifier");
  const idNode = terms[1] === undefined ? undefined : firstChild(terms[1], "relationReference");
  if (prefixNode === undefined || constructorNode === undefined || idNode === undefined
      || firstChild(terms[0]!, "relationDeploymentQualifier") !== undefined
      || firstChild(terms[1]!, "relationDeploymentQualifier") !== undefined
      || firstChild(prefixNode, "identifier") === undefined
      || firstChild(idNode, "identifier") === undefined) {
    return false;
  }
  const prefix = prefixNode.getText();
  const constructor = constructorNode.getText();
  const declaredId = idNode.getText();
  const typeConstructor = typeSystem.findConstructor(constructor, expectedType);
  if (typeConstructor === undefined) return false;
  const prefixOperator = typeSystem.operatorConstructor(prefix, parentType, typeConstructor.ownerType);
  if (prefixOperator === undefined) return false;
  const prefixResult = implementationFor(prefixOperator, typeSystem, document.operatorImplementations).applyElementPrefix({
    operator: prefixOperator,
    prefix,
    sourceName: document.sourceName,
    sourcePosition: position(prefixNode, document.sourceName),
  });
  document.diagnostics.push(...(prefixResult.diagnostics ?? []));
  if (!prefixResult.accepted) return true;
  const anonymous = declaredId === "_";
  const localId = anonymous
    ? anonymousLocalId(document, relation, `object:${constructor}`, parent.id)
    : declaredId;
  const type = prefixOperator.ownerType;
  if (!typeSystem.isAssignable(type, expectedType)) return false;
  const element: ParsedElement = {
    id: `${document.context.id}/${localId}`,
    context: document.context.id,
    localId,
    type,
    constructor,
    sourceName: document.sourceName,
    anonymous,
    parent: parent.id,
    projectionRules: [],
    attributes: {},
    referenceAttributePositions: {},
    scalarAttributes: { ...(typeConstructor.defaults ?? {}), ...(prefixOperator.defaults ?? {}) },
    scalarAttributePositions: {},
    assignedScalarAttributes: new Set(),
    deploymentActions: [],
    annotations: [],
    ...position(relation, document.sourceName),
    ...prefixedPosition("id", idNode, document.sourceName),
  };
  for (const assignment of children(relation, "assignment")) {
    assignScalarAttribute(element, assignment, document.sourceName, document.diagnostics);
  }
  document.elements.push(element);
  addAttributeValue(parent.attributes, attribute, elementReference(element));
  return true;
}

function collectExtension(extension: RuleNode, document: MutableParsedDocument): void {
  const body = firstChild(extension, "objectBody");
  const constructor = firstChild(extension, "extensionConstructor");
  const target = firstChild(extension, "extensionTargetReference");
  const constructorPosition = position(constructor, document.sourceName);
  const targetPosition = position(target, document.sourceName);
  document.extensions.push({
    sourceName: document.sourceName,
    context: document.context.id,
    constructor: constructor?.getText() ?? "",
    constructorLine: constructorPosition.line,
    constructorColumn: constructorPosition.column,
    ...(constructorPosition.endLine === undefined ? {} : { constructorEndLine: constructorPosition.endLine }),
    ...(constructorPosition.endColumn === undefined ? {} : { constructorEndColumn: constructorPosition.endColumn }),
    targetId: target?.getText() ?? "",
    targetLine: targetPosition.line,
    targetColumn: targetPosition.column,
    ...(targetPosition.endLine === undefined ? {} : { targetEndLine: targetPosition.endLine }),
    ...(targetPosition.endColumn === undefined ? {} : { targetEndColumn: targetPosition.endColumn }),
    ...(body === undefined ? {} : { body }),
    ...position(extension, document.sourceName),
  });
}

function collectListInvocation(
  node: RuleNode,
  owner: ParsedElement,
  ownerType: string,
  expectedType: string,
  attribute: string,
  annotations: readonly LinkedAnnotation[],
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
  deploymentActions = owner.deploymentActions,
  referenceAttributes = owner.attributes,
): boolean {
  if (!isOperatorInvocation(node, InsightParser.ruleNames, typeSystem, expectedType)) return false;
  const invocation = readOperatorInvocation(node, InsightParser.ruleNames)!;
  const diagnostic = operatorInvocationDiagnostic(invocation, ownerType, expectedType, typeSystem, document.sourceName);
  if (diagnostic !== undefined) {
    document.diagnostics.push(diagnostic);
    return true;
  }
  if (typeSystem.isAssignable(expectedType, EDGE)) {
    document.pendingInvocations.push({ node, owner, ownerType, expectedType, annotations, deploymentActions });
  } else {
    const element = collectObject(node, ownerType, owner, document, typeSystem, annotations, expectedType);
    if (element !== undefined) addAttributeValue(referenceAttributes, attribute, elementReference(element));
  }
  return true;
}

// Resolve the same invocation after declarations and imports are available.
// Its selected constructor determines execution and the type of its body.
function collectPendingOperatorInvocations(
  documents: readonly MutableParsedDocument[],
  typeSystem: TypeSystem,
  elementsByContextAndLocalId: Map<string, ParsedElement[]>,
  sourceElementsBySourceAndLocalId: Map<string, ParsedElement>,
): void {
  let allowUnresolved = false;
  while (documents.some((document) => document.pendingInvocations.length > 0)) {
    const imports = new Map(resolveImports(documents, elementsByContextAndLocalId, [])
      .map((item) => [`${item.sourceName}\0${item.alias}`, item]));
    let progressed = false;
    for (const document of documents) {
      const pending = document.pendingInvocations.splice(0);
      const elementCount = document.elements.length;
      for (const item of pending) {
        const invocation = readOperatorInvocation(item.node, InsightParser.ruleNames)!;
        const targetContext = invocation.anonymousImport === undefined ? undefined
          : firstChild(invocation.anonymousImport, "contextReference")?.getText();
        const target = lookupElementReference(invocation.target!.getText(), targetContext, document.sourceName,
          document.context.id, sourceElementsBySourceAndLocalId, elementsByContextAndLocalId, imports);
        if (target === undefined && !allowUnresolved) {
          document.pendingInvocations.push(item);
          continue;
        }
        progressed = true;
        const spelling = invocation.operator.getText();
        const operator = target === undefined ? undefined
          : typeSystem.operatorConstructor(spelling, item.ownerType, target.type, item.expectedType);
        const candidates = operator === undefined
          ? typeSystem.operatorConstructorsFrom(item.ownerType, item.expectedType).filter((candidate) => candidate.spelling === spelling)
          : [operator];
        const deployment = candidates.length > 0 && candidates.every((candidate) =>
          typeSystem.operatorHasCapability(candidate, OPERATOR_CAPABILITIES.deploymentUse)
            || typeSystem.operatorHasCapability(candidate, OPERATOR_CAPABILITIES.deploymentPlacement)
            || typeSystem.operatorHasCapability(candidate, OPERATOR_CAPABILITIES.deploymentRoute));
        if (deployment) {
          const action = buildDeploymentAction(item.node, item.owner, item.ownerType, item.expectedType, document, typeSystem);
          if (action !== undefined) {
            const next = item.deploymentActions.findIndex((previous) => previous.sourceName === action.sourceName
              && (previous.line > action.line || previous.line === action.line && previous.column > action.column));
            item.deploymentActions.splice(next < 0 ? item.deploymentActions.length : next, 0, action);
          }
        } else {
          collectOperatorInvocation(item.node, item.owner, document, typeSystem, item.annotations,
            item.expectedType, operator?.ownerType, item.ownerType);
        }
      }
      for (const element of document.elements.slice(elementCount)) {
        indexElement(element, elementsByContextAndLocalId, sourceElementsBySourceAndLocalId);
      }
    }
    allowUnresolved = !progressed;
  }
}

function listItemDeclaration(item: RuleNode): RuleNode | undefined {
  const body = firstChild(item, "architectureBodyItem");
  const annotated = body === undefined ? undefined
    : firstChild(body, "annotatedOperatorInvocation") ?? firstChild(body, "annotatedObjectDeclaration");
  return firstChild(item, "listValue") ?? (annotated === undefined ? undefined
    : firstChild(annotated, "operatorInvocation") ?? firstChild(annotated, "objectDeclaration"));
}

function listItemAnnotations(item: RuleNode, document: MutableParsedDocument): readonly LinkedAnnotation[] {
  const body = firstChild(item, "architectureBodyItem");
  const annotated = body === undefined ? undefined
    : firstChild(body, "annotatedOperatorInvocation") ?? firstChild(body, "annotatedObjectDeclaration");
  return annotated === undefined ? [] : annotations(annotated, document);
}

function collectNamedList(
  list: RuleNode,
  ownerType: string,
  owner: ParsedElement | undefined,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
): void {
  const listNameNode = firstChild(list, "listName");
  const listName = listNameNode?.getText() ?? "";
  if (collectImplicitObjectAttribute(list, listName, listNameNode, ownerType, owner, document, typeSystem)) {
    return;
  }
  if (collectGroupingList(list, ownerType, owner, document, typeSystem)) {
    return;
  }
  if (owner !== undefined) {
    const attribute = typeSystem.attribute(ownerType, listName);
    if (owner.attributes[listName] !== undefined && attribute?.list !== true) {
      document.diagnostics.push({
        code: "ATTRIBUTE_SHADOWS_PREVIOUS",
        message: `Attribute '${listName}' is already assigned`,
        sourceName: document.sourceName,
        ...position(listNameNode, document.sourceName),
      });
    }
    owner.attributes[listName] ??= [];
    owner.referenceAttributePositions[listName] = position(listNameNode, document.sourceName);
  }
  for (const item of children(list, "listBodyItem")) {
    const invocationNode = listItemDeclaration(item);
    const expectedType = typeSystem.attribute(ownerType, listName)?.listElementType;
    if (owner !== undefined && invocationNode !== undefined && expectedType !== undefined
        && isOperatorInvocation(invocationNode, InsightParser.ruleNames, typeSystem, expectedType)
        && collectListInvocation(invocationNode, owner, ownerType, expectedType, listName, listItemAnnotations(item, document), document, typeSystem)) {
      continue;
    }
    const value = firstChild(item, "listValue");
    if (value !== undefined && owner !== undefined) {
      addAttributeValue(owner.attributes, listName, referenceValue(value, document.sourceName));
      continue;
    }

    const bodyItem = firstChild(item, "architectureBodyItem");
    if (bodyItem !== undefined) {
      const annotatedOperator = firstChild(bodyItem, "annotatedOperatorInvocation");
      if (annotatedOperator !== undefined && owner !== undefined) {
        const invocation = firstChild(annotatedOperator, "operatorInvocation");
        if (invocation !== undefined) {
          if (isEdgeList(typeSystem, ownerType, listName)) {
            collectOperatorInvocation(invocation, owner, document, typeSystem, annotations(annotatedOperator, document));
          } else {
            document.diagnostics.push({
              code: "TYPE_MISMATCH",
              message: `Attribute '${listName}' on type '${ownerType}' expects an Edge list`,
              sourceName: document.sourceName,
              ...position(annotatedOperator, document.sourceName),
            });
          }
        }
        continue;
      }

      const relation = firstChild(bodyItem, "relationInvocation");
      if (relation !== undefined && owner !== undefined) {
        if (isEdgeList(typeSystem, ownerType, listName)) {
          owner.projectionRules.push(concreteProjectionRule(relation, document.sourceName, projectionSection(listName)));
        } else if (!collectRelationPrefixedObject(
          relation,
          ownerType,
          owner,
          typeSystem.attribute(ownerType, listName)?.listElementType
            ?? typeSystem.attribute(ownerType, listName)?.type
            ?? expectedNestedType(typeSystem, ownerType),
          listName,
          document,
          typeSystem,
        )) {
          document.diagnostics.push({
            code: "TYPE_MISMATCH",
            message: `Attribute '${listName}' on type '${ownerType}' expects an Edge list`,
            sourceName: document.sourceName,
            ...position(relation, document.sourceName),
          });
        }
        continue;
      }

      const annotatedObject = firstChild(bodyItem, "annotatedObjectDeclaration");
      if (annotatedObject !== undefined) {
        const object = firstChild(annotatedObject, "objectDeclaration");
        if (object !== undefined) {
          if (owner !== undefined && isEdgeList(typeSystem, ownerType, listName)
              && firstChild(object, "namedPrefixOperatorInvocation") !== undefined) {
            owner.projectionRules.push(concreteProjectionRuleFromObject(object, document.sourceName, projectionSection(listName)));
            continue;
          }
          const attribute = typeSystem.attribute(ownerType, listName);
          const nestedType = attribute === undefined
            ? ownerType
            : attribute.list === true
              ? attribute.listElementType ?? attribute.type
              : attribute.type;
          const element = collectObject(object, nestedType, owner, document, typeSystem, annotations(annotatedObject, document), nestedType);
          if (owner !== undefined && element !== undefined) {
            addAttributeValue(owner.attributes, listName, elementReference(element));
          }
        }
        continue;
      }

      const nestedList = firstChild(bodyItem, "namedList");
      if (nestedList !== undefined && owner !== undefined) {
        const nestedName = firstChild(nestedList, "listName");
        document.diagnostics.push({
          code: "TYPE_MISMATCH",
          message: `Attribute '${listName}' on type '${ownerType}' cannot contain a nested attribute`,
          sourceName: document.sourceName,
          ...position(nestedName ?? nestedList, document.sourceName),
        });
      }
    }
  }
}

function collectGroupingList(
  list: RuleNode,
  ownerType: string,
  owner: ParsedElement | undefined,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
): boolean {
  if (owner === undefined || namedListHasDirectValue(list)) {
    return false;
  }
  const listName = firstChild(list, "listName")?.getText() ?? "";
  const root = aggregateParent(owner, document, typeSystem);
  if (root === undefined
    || !isDocumentAggregateMember(typeSystem, ownerType)
    || typeSystem.attribute(ownerType, listName) !== undefined
    || typeSystem.anonymousListAttribute(ownerType) === undefined) {
    return false;
  }
  if (collectImplicitAggregateGroupObject(list, listName, owner, root, document, typeSystem)) {
    return true;
  }
  const expectedObjectType = aggregateGroupType(root.type, ownerType, listName, typeSystem);
  for (const item of children(list, "listBodyItem")) {
    const bodyItem = firstChild(item, "architectureBodyItem");
    if (bodyItem !== undefined) {
      const before = document.elements.length;
      collectBodyItem(bodyItem, ownerType, owner, document, typeSystem, expectedObjectType);
      for (const element of document.elements.slice(before)) {
        if (element.parent === owner.id && element.slotName === undefined) {
          element.slotName = listName;
        }
      }
    }
  }
  return true;
}

function collectImplicitAggregateGroupObject(
  list: RuleNode,
  listName: string,
  owner: ParsedElement,
  root: ParsedElement,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
): boolean {
  if (namedListHasExplicitObject(list)) {
    return false;
  }
  const diagnosticCount = document.diagnostics.length;
  const constructor = resolveAggregateGroupConstructor(listName, firstChild(list, "listName"), owner, root, document, typeSystem);
  if (constructor === undefined) {
    return document.diagnostics.length > diagnosticCount;
  }
  const element = collectImplicitObjectElement(list, firstChild(list, "listName"), constructor, owner, document, listName);
  addAttributeValue(owner.attributes, "_", elementReference(element));
  collectNamedListBodyItemsAsObjectBody(list, constructor.ownerType, element, document, typeSystem);
  return true;
}

function resolveAggregateGroupConstructor(
  listName: string,
  listNameNode: RuleNode | undefined,
  owner: ParsedElement,
  root: ParsedElement,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
): ConstructorDefinition | undefined {
  const attributeType = aggregateGroupType(root.type, owner.type, listName, typeSystem);
  if (attributeType !== undefined) {
    return resolveImplicitObjectConstructor(attributeType, listName, listNameNode, document, typeSystem);
  }
  const memberType = aggregateMemberType(typeSystem, root.type);
  const constructors = memberType === undefined ? [] : typeSystem.constructorsForExpectedType(memberType)
    .filter((constructor) => constructor.spelling === listName);
  if (constructors.length === 0) {
    return undefined;
  }
  if (constructors.length > 1) {
    document.diagnostics.push({
      code: "CONSTRUCTOR_AMBIGUOUS",
      message: `Aggregate group '${listName}' has multiple constructors: ${constructors.map((constructor) => `'${constructor.spelling}' for type '${constructor.ownerType}'`).join(", ")}`,
      sourceName: document.sourceName,
      ...position(listNameNode, document.sourceName),
    });
    return undefined;
  }
  return constructors[0]!;
}

function aggregateGroupType(
  rootType: string,
  memberType: string,
  listName: string,
  typeSystem: TypeSystem,
): string | undefined {
  const attribute = aggregateGroupAttribute(typeSystem, rootType, memberType, listName);
  if (attribute === undefined) {
    return undefined;
  }
  return attribute.list === true
    ? attribute.listElementType ?? attribute.type
    : attribute.type;
}

function aggregateParent(
  owner: ParsedElement,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
): ParsedElement | undefined {
  const parent = owner.parent === undefined
    ? undefined
    : document.elements.find((element) => element.id === owner.parent);
  return parent !== undefined
      && typeSystem.typeHasCapability(parent.type, TYPE_CAPABILITIES.documentAggregateRoot)
    ? parent
    : undefined;
}

function collectImplicitObjectAttribute(
  list: RuleNode,
  attributeName: string,
  attributeNameNode: RuleNode | undefined,
  ownerType: string,
  owner: ParsedElement | undefined,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
): boolean {
  if (owner === undefined || attributeName.length === 0) {
    return false;
  }
  const attribute = typeSystem.attribute(ownerType, attributeName);
  if (attribute === undefined || attribute.list === true || !typeSystem.isObjectAttribute(attribute)) {
    return false;
  }
  if (namedListHasDirectValue(list) || namedListHasExplicitObjectForType(list, attribute.type, typeSystem)) {
    return false;
  }
  if (owner.attributes[attributeName] !== undefined) {
    document.diagnostics.push({
      code: "ATTRIBUTE_SHADOWS_PREVIOUS",
      message: `Attribute '${attributeName}' is already assigned`,
      sourceName: document.sourceName,
      ...position(attributeNameNode, document.sourceName),
    });
  }
  owner.attributes[attributeName] ??= [];
  owner.referenceAttributePositions[attributeName] = position(attributeNameNode, document.sourceName);

  const constructor = resolveImplicitObjectConstructor(attribute.type, attributeName, attributeNameNode, document, typeSystem);
  if (constructor === undefined) {
    return true;
  }

  const element = collectImplicitObjectElement(list, attributeNameNode, constructor, owner, document, attributeName);
  addAttributeValue(owner.attributes, attributeName, elementReference(element));
  collectNamedListBodyItemsAsObjectBody(list, constructor.ownerType, element, document, typeSystem);
  return true;
}

function resolveImplicitObjectConstructor(
  attributeType: string,
  attributeName: string,
  attributeNameNode: RuleNode | undefined,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
): ConstructorDefinition | undefined {
  const constructors = typeSystem.constructorsForExpectedType(attributeType);
  if (constructors.length === 0) {
    document.diagnostics.push({
      code: "CONSTRUCTOR_NOT_DECLARED",
      message: `Type '${attributeType}' has no constructor for implicit attribute '${attributeName}'`,
      sourceName: document.sourceName,
      ...position(attributeNameNode, document.sourceName),
    });
    return undefined;
  }
  const exactConstructors = constructors.filter((constructor) => constructor.ownerType === attributeType);
  const candidates = exactConstructors.length > 0 ? exactConstructors : constructors;
  if (candidates.length > 1) {
    document.diagnostics.push({
      code: "CONSTRUCTOR_AMBIGUOUS",
      message: `Type '${attributeType}' has multiple constructors for implicit attribute '${attributeName}': ${candidates.map((constructor) => `'${constructor.spelling}'`).join(", ")}`,
      sourceName: document.sourceName,
      ...position(attributeNameNode, document.sourceName),
    });
    return undefined;
  }
  return candidates[0]!;
}

function collectImplicitObjectElement(
  list: RuleNode,
  attributeNameNode: RuleNode | undefined,
  constructor: ConstructorDefinition,
  parent: ParsedElement,
  document: MutableParsedDocument,
  slotName?: string,
): ParsedElement {
  const localId = anonymousLocalId(
    document,
    attributeNameNode ?? list,
    `implicit:${constructor.spelling}:${slotName ?? "_"}`,
    parent.id,
  );
  const element: ParsedElement = {
    id: `${document.context.id}/${localId}`,
    context: document.context.id,
    localId,
    ...(slotName === undefined ? {} : { slotName }),
    type: constructor.ownerType,
    constructor: constructor.spelling,
    sourceName: document.sourceName,
    anonymous: true,
    projectionRules: [],
    parent: parent.id,
    attributes: {},
    referenceAttributePositions: {},
    scalarAttributes: { ...(constructor.defaults ?? {}) },
    scalarAttributePositions: {},
    assignedScalarAttributes: new Set(),
    deploymentActions: [],
    annotations: [],
    ...position(list, document.sourceName),
    ...prefixedPosition("id", attributeNameNode, document.sourceName),
  };
  document.elements.push(element);
  return element;
}

function namedListHasDirectValue(list: RuleNode): boolean {
  return children(list, "listBodyItem")
    .some((item) => firstChild(item, "listValue") !== undefined);
}

function namedListHasExplicitObject(list: RuleNode): boolean {
  return children(list, "listBodyItem").some((item) => {
    const bodyItem = firstChild(item, "architectureBodyItem");
    const annotatedObject = bodyItem === undefined ? undefined : firstChild(bodyItem, "annotatedObjectDeclaration");
    return annotatedObject !== undefined && firstChild(annotatedObject, "objectDeclaration") !== undefined;
  });
}

function namedListHasExplicitObjectForType(
  list: RuleNode,
  expectedType: string,
  typeSystem: TypeSystem,
): boolean {
  return children(list, "listBodyItem").some((item) => {
    const bodyItem = firstChild(item, "architectureBodyItem");
    const annotatedObject = bodyItem === undefined ? undefined : firstChild(bodyItem, "annotatedObjectDeclaration");
    const object = annotatedObject === undefined ? undefined : firstChild(annotatedObject, "objectDeclaration");
    const constructor = object === undefined ? undefined : firstChild(object, "elementConstructor")?.getText();
    const typeConstructor = constructor === undefined ? undefined : typeSystem.findConstructor(constructor, expectedType);
    return typeConstructor !== undefined && typeSystem.isAssignable(typeConstructor.ownerType, expectedType);
  });
}

function collectNamedListBodyItemsAsObjectBody(
  list: RuleNode,
  ownerType: string,
  owner: ParsedElement,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
): void {
  for (const item of children(list, "listBodyItem")) {
    const value = firstChild(item, "listValue");
    if (value !== undefined) {
      document.diagnostics.push({
        code: "TYPE_MISMATCH",
        message: `Implicit object '${owner.constructor}' does not accept direct list values`,
        sourceName: document.sourceName,
        ...position(value, document.sourceName),
      });
      continue;
    }
    const bodyItem = firstChild(item, "architectureBodyItem");
    if (bodyItem !== undefined) {
      collectBodyItem(bodyItem, ownerType, owner, document, typeSystem);
    }
  }
}

function collectObject(
  object: RuleNode,
  parentType: string,
  parent: ParsedElement | undefined,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
  annotations: readonly LinkedAnnotation[] = [],
  expectedType = expectedNestedType(typeSystem, parentType),
): ParsedElement | undefined {
  const syntax = readOperatorInvocation(object, InsightParser.ruleNames);
  const constructor = firstChild(object, "elementConstructor")?.getText() ?? syntax?.operator.getText() ?? "";
  const identifierDeclaration = firstChild(object, "identifierDeclaration") ?? syntax?.target;
  const declaredId = identifierDeclaration?.getText() ?? "";
  if (constructor.length === 0 || declaredId.length === 0) {
    return undefined;
  }
  const anonymous = declaredId === "_";

  const typeConstructor = typeSystem.findConstructor(constructor, expectedType);
  if (typeConstructor === undefined) {
    const slotElement = collectSlotOperatorObject(
      object,
      constructor,
      declaredId,
      parentType,
      parent,
      document,
      typeSystem,
      annotations,
      expectedType,
    );
    if (slotElement !== undefined) {
      return slotElement;
    }
    document.diagnostics.push({
      code: "CONSTRUCTOR_NOT_DECLARED",
      message: `Unknown element kind '${constructor}'`,
      sourceName: document.sourceName,
      ...position(object, document.sourceName),
    });
    return undefined;
  }
  const localId = anonymous
    ? anonymousLocalId(document, object, `object:${constructor}`, parent?.id)
    : declaredId;
  const baseType = typeConstructor.ownerType;
  const prefix = firstChild(object, "namedPrefixOperatorInvocation")?.getText();
  const prefixNode = firstChild(object, "namedPrefixOperatorInvocation");
  const prefixOperator = prefix === undefined ? undefined : typeSystem.operatorConstructor(prefix, parentType, baseType);
  if (prefixOperator !== undefined) {
    const prefixResult = implementationFor(prefixOperator, typeSystem, document.operatorImplementations).applyElementPrefix({
      operator: prefixOperator,
      prefix: prefix ?? "",
      sourceName: document.sourceName,
      sourcePosition: position(prefixNode, document.sourceName),
    });
    document.diagnostics.push(...(prefixResult.diagnostics ?? []));
    if (!prefixResult.accepted) {
      return undefined;
    }
  }
  if (prefix !== undefined && prefixOperator === undefined) {
    document.diagnostics.push({
      code: "TYPE_MISMATCH",
      message: `Operator '${prefix}' cannot be applied from '${parentType}' to '${baseType}'`,
      sourceName: document.sourceName,
      ...position(prefixNode, document.sourceName),
    });
    return undefined;
  }
  const prefixedType = prefixOperator?.ownerType;
  const type = prefixedType ?? baseType;
  if (!typeSystem.isAssignable(type, expectedType)) {
    document.diagnostics.push({
      code: "TYPE_MISMATCH",
      message: `Type '${type}' is not assignable to expected type '${expectedType}'`,
      sourceName: document.sourceName,
      ...position(object, document.sourceName),
    });
    return undefined;
  }
  const element: ParsedElement = {
    id: `${document.context.id}/${localId}`,
    context: document.context.id,
    localId,
    type,
    constructor,
    sourceName: document.sourceName,
    anonymous,
    projectionRules: [],
    ...(parent === undefined ? {} : { parent: parent.id }),
    attributes: {},
    referenceAttributePositions: {},
    scalarAttributes: { ...(typeConstructor?.defaults ?? {}), ...(prefixOperator?.defaults ?? {}) },
    scalarAttributePositions: {},
    assignedScalarAttributes: new Set(),
    deploymentActions: [],
    annotations,
    ...noteProperty(object, document.sourceName),
    ...position(object, document.sourceName),
    ...prefixedPosition("id", identifierDeclaration, document.sourceName),
  };
  document.elements.push(element);

  const body = firstChild(object, "objectBody");
  if (body !== undefined) {
    collectBodyItems(body, type, element, document, typeSystem);
  }
  return element;
}

function collectSlotOperatorObject(
  object: RuleNode,
  constructor: string,
  slotName: string,
  parentType: string,
  parent: ParsedElement | undefined,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
  annotations: readonly LinkedAnnotation[],
  expectedType: string,
): ParsedElement | undefined {
  const slotOperator = typeSystem.slotOperatorConstructor(constructor, parentType, expectedType);
  if (slotOperator === undefined) {
    return undefined;
  }
  const slotAttribute = typeSystem.attribute(slotOperator.targetType, slotName);
  if (slotAttribute === undefined) {
    if (!typeSystem.typeHasCapability(slotOperator.targetType, TYPE_CAPABILITIES.environment)) {
      document.diagnostics.push({
        code: "ATTRIBUTE_NOT_DECLARED",
        message: `Slot '${slotName}' is not declared on type '${slotOperator.targetType}'`,
        sourceName: document.sourceName,
        ...position(readOperatorInvocation(object, InsightParser.ruleNames)?.target, document.sourceName),
      });
      return undefined;
    }
  }
  const slotValueType = slotAttribute === undefined
    ? ELEMENT_TYPE
    : slotAttribute.list === true
      ? slotAttribute.listElementType ?? slotAttribute.type
      : slotAttribute.type;
  const localId = anonymousLocalId(
    document,
    object,
    `slot:${constructor}:${slotName}`,
    parent?.id,
  );
  const identifierDeclaration = readOperatorInvocation(object, InsightParser.ruleNames)?.target;
  const element: ParsedElement = {
    id: `${document.context.id}/${localId}`,
    context: document.context.id,
    localId,
    type: slotOperator.ownerType,
    constructor,
    sourceName: document.sourceName,
    anonymous: true,
    graphElement: false,
    projectionRoot: false,
    projectionRules: [],
    operatorDefinition: slotOperator,
    ...(parent === undefined ? {} : { parent: parent.id }),
    attributes: {},
    referenceAttributePositions: {},
    scalarAttributes: {
      ...(slotOperator.defaults ?? {}),
      parentType: slotOperator.targetType,
      attributeName: slotName,
      attributeType: slotValueType,
    },
    scalarAttributePositions: {
      parentType: position(identifierDeclaration, document.sourceName),
      attributeName: position(identifierDeclaration, document.sourceName),
      attributeType: position(identifierDeclaration, document.sourceName),
    },
    assignedScalarAttributes: new Set(),
    deploymentActions: [],
    annotations,
    ...noteProperty(object, document.sourceName),
    ...position(object, document.sourceName),
    ...prefixedPosition("id", identifierDeclaration, document.sourceName),
  };
  document.elements.push(element);

  const body = firstChild(object, "objectBody");
  if (body !== undefined) {
    collectBodyItems(body, slotOperator.ownerType, element, document, typeSystem);
  }
  return element;
}

function expectedNestedType(typeSystem: TypeSystem, parentType: string): string {
  return typeSystem.anonymousListAttribute(parentType)?.listElementType ?? parentType;
}

function isEdgeList(typeSystem: TypeSystem, ownerType: string, listName: string): boolean {
  const attribute = typeSystem.attribute(ownerType, listName);
  return attribute?.list === true
    && attribute.listElementType !== undefined
    && typeSystem.isAssignable(attribute.listElementType, EDGE);
}

function collectOperatorInvocation(
  invocation: RuleNode,
  owner: ParsedElement,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
  annotations: readonly LinkedAnnotation[] = [],
  expectedType = EDGE,
  resultType?: string,
  ownerType = owner.type,
): void {
  const syntax = readOperatorInvocation(invocation, InsightParser.ruleNames);
  const targetReference = syntax?.target;
  if (targetReference === undefined) {
    return;
  }
  const targetId = targetReference?.getText() ?? "";
  const targetPosition = position(targetReference, document.sourceName);
  const anonymousImport = firstChild(invocation, "anonymousImportDeclaration");
  const attributes: Record<string, ParsedAttributeValue[]> = {};
  const referenceAttributePositions: Record<string, SourcePosition> = {};
  const scalarAttributes: Record<string, string> = {};
  const scalarAttributePositions: Record<string, SourcePosition> = {};
  const assignedScalarAttributes = new Set<string>();
  const deploymentActions: ParsedDeploymentAction[] = [];
  const body = firstChild(invocation, "objectBody");
  const edgeOperator = syntax!.operator.getText();
  if (body !== undefined) {
    collectReferenceAttributes(body, owner, edgeOperator, attributes, referenceAttributePositions, scalarAttributes, scalarAttributePositions, assignedScalarAttributes, deploymentActions, document, typeSystem, resultType);
  }
  document.edges.push({
    sourceName: document.sourceName,
    source: owner.id,
    sourceType: ownerType,
    expectedType,
    operator: edgeOperator,
    targetId,
    targetLine: targetPosition.line,
    targetColumn: targetPosition.column,
    ...(targetPosition.endLine === undefined ? {} : { targetEndLine: targetPosition.endLine }),
    ...(targetPosition.endColumn === undefined ? {} : { targetEndColumn: targetPosition.endColumn }),
    ...(anonymousImport === undefined ? {} : { targetContext: firstChild(anonymousImport, "contextReference")?.getText() ?? "" }),
    attributes,
    referenceAttributePositions,
    scalarAttributes,
    scalarAttributePositions,
    assignedScalarAttributes,
    deploymentActions,
    annotations,
    ...noteProperty(invocation, document.sourceName),
    ...operatorInvocationHeaderPosition(invocation, document.sourceName),
  });
}

function buildDeploymentAction(
  invocation: RuleNode,
  owner: ParsedElement,
  ownerType: string,
  expectedType: string,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
): ParsedDeploymentAction | undefined {
  const syntax = readOperatorInvocation(invocation, InsightParser.ruleNames);
  const targetReference = syntax?.target;
  if (targetReference === undefined) {
    return;
  }
  const targetPosition = position(targetReference, document.sourceName);
  const anonymousImport = firstChild(invocation, "anonymousImportDeclaration");
  const attributes: Record<string, ParsedAttributeValue[]> = {};
  const referenceAttributePositions: Record<string, SourcePosition> = {};
  const scalarAttributes: Record<string, string> = {};
  const scalarAttributePositions: Record<string, SourcePosition> = {};
  const assignedScalarAttributes = new Set<string>();
  const environment = syntax?.environmentQualifier && firstChild(syntax.environmentQualifier, "environmentReference");
  const body = firstChild(invocation, "objectBody");
  const operator = syntax!.operator.getText();
  if (body !== undefined) {
    collectDeploymentActionAttributes(body, owner, operator, attributes, referenceAttributePositions, scalarAttributes, scalarAttributePositions, assignedScalarAttributes, document, typeSystem);
  }
  return {
    sourceName: document.sourceName,
    ownerId: owner.id,
    ownerType,
    expectedType,
    operator,
    targetId: targetReference.getText(),
    ...(environment === undefined ? {} : { routeEnvironment: { id: environment.getText(), ...position(environment, document.sourceName) } }),
    ...(anonymousImport === undefined ? {} : { targetContext: firstChild(anonymousImport, "contextReference")?.getText() ?? "" }),
    targetLine: targetPosition.line,
    targetColumn: targetPosition.column,
    ...(targetPosition.endLine === undefined ? {} : { targetEndLine: targetPosition.endLine }),
    ...(targetPosition.endColumn === undefined ? {} : { targetEndColumn: targetPosition.endColumn }),
    attributes,
    referenceAttributePositions,
    scalarAttributes,
    scalarAttributePositions,
    assignedScalarAttributes,
    ...position(invocation, document.sourceName),
  };
}

function deploymentOperatorCandidates(
  typeSystem: TypeSystem,
  ownerType: string,
  spelling: string,
  expectedType: string,
  targetTypes: readonly string[],
): readonly OperatorDefinition[] {
  if (targetTypes.length === 0) {
    return typeSystem.operatorConstructorsFrom(ownerType, expectedType).filter((operator) => operator.spelling === spelling);
  }
  const selected = targetTypes.map((type) => typeSystem.operatorConstructor(spelling, ownerType, type, expectedType));
  return selected.every((operator): operator is OperatorDefinition => operator !== undefined) ? unique(selected) : [];
}

function collectDeploymentActionAttributes(
  body: RuleNode,
  owner: ParsedElement,
  operator: string,
  attributes: Record<string, ParsedAttributeValue[]>,
  referenceAttributePositions: Record<string, SourcePosition>,
  scalarAttributes: Record<string, string>,
  scalarAttributePositions: Record<string, SourcePosition>,
  assignedScalarAttributes: Set<string>,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
): void {
  for (const item of children(body, "architectureBodyItem")) {
    const assignment = firstChild(item, "assignment");
    if (assignment !== undefined) {
      assignScalarAttribute({ scalarAttributes, scalarAttributePositions, assignedScalarAttributes }, assignment, document.sourceName, document.diagnostics);
      continue;
    }
    const list = firstChild(item, "namedList");
    if (list === undefined) {
      continue;
    }
    const listNameNode = firstChild(list, "listName");
    const listName = listNameNode?.getText() ?? "";
    if (collectImplicitReferenceObjectAttribute(list, listName, listNameNode, owner, operator, attributes, referenceAttributePositions, document, typeSystem)) {
      continue;
    }
    referenceAttributePositions[listName] = position(listNameNode, document.sourceName);
    for (const listItem of children(list, "listBodyItem")) {
      const value = firstChild(listItem, "listValue");
      if (value !== undefined) {
        addAttributeValue(attributes, listName, referenceValue(value, document.sourceName));
      }
    }
  }
}

function collectReferenceAttributes(
  body: RuleNode,
  owner: ParsedElement,
  edgeOperator: string,
  attributes: Record<string, ParsedAttributeValue[]>,
  referenceAttributePositions: Record<string, SourcePosition>,
  scalarAttributes: Record<string, string>,
  scalarAttributePositions: Record<string, SourcePosition>,
  assignedScalarAttributes: Set<string>,
  deploymentActions: ParsedDeploymentAction[],
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
  resultType?: string,
): void {
  for (const item of children(body, "architectureBodyItem")) {
    const assignment = firstChild(item, "assignment");
    if (assignment !== undefined) {
      assignScalarAttribute({ scalarAttributes, scalarAttributePositions, assignedScalarAttributes }, assignment, document.sourceName, document.diagnostics);
      continue;
    }
    const list = firstChild(item, "namedList");
    if (list === undefined) {
      continue;
    }
    const listNameNode = firstChild(list, "listName");
    const listName = listNameNode?.getText() ?? "";
    const attributeOwnerTypes = resultType === undefined ? unique(typeSystem.operatorConstructorsFrom(owner.type)
      .filter((operator) => operator.spelling === edgeOperator)
      .map((operator) => operator.ownerType)
      .filter((type) => typeSystem.attribute(type, listName) !== undefined)) : [resultType];
    if (collectImplicitReferenceObjectAttribute(list, listName, listNameNode, owner, edgeOperator, attributes, referenceAttributePositions, document, typeSystem, resultType)) {
      continue;
    }
    referenceAttributePositions[listName] = position(listNameNode, document.sourceName);
    for (const listItem of children(list, "listBodyItem")) {
      const node = listItemDeclaration(listItem);
      if (node !== undefined) {
        const candidates = attributeOwnerTypes.filter((type) => {
          const expectedType = typeSystem.attribute(type, listName)?.listElementType;
          return expectedType !== undefined && isOperatorInvocation(node, InsightParser.ruleNames, typeSystem, expectedType);
        });
        const invocationOwner = typeSystem.commonBaseType(candidates);
        const expectedType = invocationOwner === undefined ? undefined : typeSystem.attribute(invocationOwner, listName)?.listElementType;
        if (invocationOwner !== undefined && expectedType !== undefined
            && collectListInvocation(node, owner, invocationOwner, expectedType, listName, listItemAnnotations(listItem, document), document, typeSystem, deploymentActions, attributes)) {
          continue;
        }
      }

      const value = firstChild(listItem, "listValue");
      if (value !== undefined) {
        addAttributeValue(attributes, listName, referenceValue(value, document.sourceName));
        continue;
      }
      const bodyItem = firstChild(listItem, "architectureBodyItem");
      const annotatedObject = bodyItem === undefined ? undefined : firstChild(bodyItem, "annotatedObjectDeclaration");
      if (annotatedObject !== undefined) {
        const object = firstChild(annotatedObject, "objectDeclaration");
        if (object !== undefined) {
          const element = collectObject(object, "Element", owner, document, typeSystem, annotations(annotatedObject, document), "Element");
          if (element !== undefined) {
            addAttributeValue(attributes, listName, elementReference(element));
          }
        }
      }
    }
  }
}

function collectImplicitReferenceObjectAttribute(
  list: RuleNode,
  attributeName: string,
  attributeNameNode: RuleNode | undefined,
  owner: ParsedElement,
  edgeOperator: string,
  attributes: Record<string, ParsedAttributeValue[]>,
  referenceAttributePositions: Record<string, SourcePosition>,
  document: MutableParsedDocument,
  typeSystem: TypeSystem,
  resultType?: string,
): boolean {
  if (attributeName.length === 0 || namedListHasDirectValue(list)) {
    return false;
  }
  const attributeTypes = unique([
    ...typeSystem.operatorConstructorsFrom(owner.type)
      .filter((operator) => operator.spelling === edgeOperator)
      .filter((operator) => resultType === undefined || operator.ownerType === resultType)
      .flatMap((operator) => {
        const attribute = typeSystem.attribute(operator.ownerType, attributeName);
        return attribute !== undefined && attribute.list !== true && typeSystem.isObjectAttribute(attribute)
          ? [attribute.type]
          : [];
      }),
  ]);
  if (attributeTypes.length === 0) {
    return false;
  }
  if (attributeTypes.length > 1) {
    document.diagnostics.push({
      code: "CONSTRUCTOR_AMBIGUOUS",
      message: `Attribute '${attributeName}' resolves to multiple object types for operator '${edgeOperator}': ${attributeTypes.map((type) => `'${type}'`).join(", ")}`,
      sourceName: document.sourceName,
      ...position(attributeNameNode, document.sourceName),
    });
    return true;
  }
  const attributeType = attributeTypes[0]!;
  if (namedListHasExplicitObjectForType(list, attributeType, typeSystem)) {
    return false;
  }
  referenceAttributePositions[attributeName] = position(attributeNameNode, document.sourceName);
  const constructor = resolveImplicitObjectConstructor(attributeType, attributeName, attributeNameNode, document, typeSystem);
  if (constructor === undefined) {
    return true;
  }
  const element = collectImplicitObjectElement(list, attributeNameNode, constructor, owner, document);
  addAttributeValue(attributes, attributeName, elementReference(element));
  collectNamedListBodyItemsAsObjectBody(list, constructor.ownerType, element, document, typeSystem);
  return true;
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

function assignScalarAttribute(
  owner: {
    scalarAttributes: Record<string, string>;
    scalarAttributePositions: Record<string, SourcePosition>;
    assignedScalarAttributes: Set<string>;
  },
  assignment: RuleNode,
  sourceName: string,
  diagnostics: LanguageDiagnostic[],
): void {
  const attributeName = firstChild(assignment, "attributeName");
  const name = attributeName?.getText() ?? "";
  const attributePosition = position(attributeName, sourceName);
  if (owner.assignedScalarAttributes.has(name)) {
    diagnostics.push({
      code: "ATTRIBUTE_SHADOWS_PREVIOUS",
      message: `Attribute '${name}' is already assigned`,
      sourceName,
      ...attributePosition,
    });
  }
  owner.assignedScalarAttributes.add(name);
  owner.scalarAttributes[name] = textValue(firstChild(assignment, "textValue"));
  owner.scalarAttributePositions[name] = attributePosition;
}

function referenceValue(value: RuleNode, sourceName: string): ParsedAttributeValue {
  const anonymousImport = firstChild(value, "anonymousImportDeclaration");
  return {
    targetId: firstChild(value, "identifierReference")?.getText() ?? "",
    ...(anonymousImport === undefined ? {} : { targetContext: firstChild(anonymousImport, "contextReference")?.getText() ?? "" }),
    ...position(value, sourceName),
  };
}

function elementReference(element: ParsedElement): ParsedAttributeValue {
  return {
    targetId: element.localId,
    targetContext: element.context,
    line: element.line,
    column: element.column,
    ...(element.endLine === undefined ? {} : { endLine: element.endLine }),
    ...(element.endColumn === undefined ? {} : { endColumn: element.endColumn }),
  };
}

function annotations(root: RuleNode, document: MutableParsedDocument): readonly LinkedAnnotation[] {
  return children(root, "annotation").map((annotation) => {
    const name = firstChild(annotation, "annotationName")?.getText().replace(/^@/, "") ?? "";
    const parameters = firstChild(annotation, "annotationParameters");
    const value = parameters === undefined ? undefined : terminalText(parameters, InsightParser.ANNOTATION_VALUE);
    if (name === "attribute") {
      document.diagnostics.push({
        level: "NOTE",
        code: "ATTRIBUTE_ANNOTATION_DEPRECATED",
        message: "@attribute is deprecated and will be removed in the next language versions; use define presentation instead",
        sourceName: document.sourceName,
        ...position(annotation, document.sourceName),
      });
    }
    return {
      name,
      ...(value === undefined ? {} : { value }),
      source: sourceLocation(document.sourceName, position(annotation, document.sourceName)),
    };
  });
}

function noteProperty(root: RuleNode, sourceName: string): { readonly note?: string; readonly noteSource?: SourceLocation } {
  const note = firstChild(root, "note");
  if (note === undefined) {
    return {};
  }
  const text = terminalText(note, InsightParser.COMMENT);
  if (text === undefined) {
    return {};
  }
  return {
    note: text.replace(/^#/, "").trimStart(),
    noteSource: sourceLocation(sourceName, position(note, sourceName)),
  };
}

function addAttributeValue(attributes: Record<string, ParsedAttributeValue[]>, name: string, value: ParsedAttributeValue): void {
  attributes[name] = [...(attributes[name] ?? []), value];
}

function resolveImports(
  documents: readonly ParsedDocument[],
  elementsByContextAndLocalId: ReadonlyMap<string, readonly ParsedElement[]>,
  diagnostics: LanguageDiagnostic[],
): readonly ResolvedImport[] {
  const result: ResolvedImport[] = [];
  const contexts = new Set(documents.map((document) => document.context.id));
  for (const document of documents) {
    for (const item of document.imports) {
      const element = elementsByContextAndLocalId.get(`${item.sourceContext}\0${item.importedId}`)?.[0];
      if (element === undefined) {
        const unknownContext = !contexts.has(item.sourceContext);
        const sourcePosition = unknownContext
          ? {
              line: item.contextLine,
              column: item.contextColumn,
              ...(item.contextEndLine === undefined ? {} : { endLine: item.contextEndLine }),
              ...(item.contextEndColumn === undefined ? {} : { endColumn: item.contextEndColumn }),
            }
          : {
              line: item.importedLine,
              column: item.importedColumn,
              ...(item.importedEndLine === undefined ? {} : { endLine: item.importedEndLine }),
              ...(item.importedEndColumn === undefined ? {} : { endColumn: item.importedEndColumn }),
            };
        diagnostics.push({
          code: unknownContext ? "UNKNOWN_IMPORT_CONTEXT" : "UNKNOWN_IMPORTED_ELEMENT",
          message: unknownContext
            ? `Import context '${item.sourceContext}' is not declared`
            : `Imported element '${item.importedId}' is not declared in context '${item.sourceContext}'`,
          sourceName: item.sourceName,
          ...diagnosticPosition(sourcePosition),
        });
      }
      result.push({
        sourceName: item.sourceName,
        alias: item.alias,
        importedId: item.importedId,
        sourceContext: item.sourceContext,
        target: `${item.sourceContext}/${item.importedId}`,
        importedLine: item.importedLine,
        importedColumn: item.importedColumn,
        ...(item.importedEndLine === undefined ? {} : { importedEndLine: item.importedEndLine }),
        ...(item.importedEndColumn === undefined ? {} : { importedEndColumn: item.importedEndColumn }),
        ...(element === undefined ? {} : { element }),
      });
    }
  }
  return result;
}

function reportDuplicateElements(
  elementsByContextAndLocalId: ReadonlyMap<string, readonly ParsedElement[]>,
  diagnostics: LanguageDiagnostic[],
): void {
  for (const duplicates of elementsByContextAndLocalId.values()) {
    if (duplicates.length < 2) {
      continue;
    }
    for (const duplicate of duplicates.slice(1)) {
      diagnostics.push({
        code: "IDENTIFIER_ALREADY_DECLARED",
        message: `Identifier '${duplicate.localId}' is already declared in context '${duplicate.context}'`,
        sourceName: duplicate.sourceName,
        ...diagnosticPosition({
          line: duplicate.idLine,
          column: duplicate.idColumn,
          ...(duplicate.idEndLine === undefined ? {} : { endLine: duplicate.idEndLine }),
          ...(duplicate.idEndColumn === undefined ? {} : { endColumn: duplicate.idEndColumn }),
        }),
      });
    }
  }
}

function applyExtensions(
  documents: readonly ParsedDocument[],
  typeSystem: TypeSystem,
  elementsByContextAndLocalId: Map<string, ParsedElement[]>,
  sourceElementsBySourceAndLocalId: Map<string, ParsedElement>,
  diagnostics: LanguageDiagnostic[],
): void {
  for (const document of documents) {
    for (const extension of document.extensions) {
      const target = elementsByContextAndLocalId.get(`${extension.context}\0${extension.targetId}`)?.[0];
      if (target === undefined) {
        diagnostics.push({
          code: "UNDECLARED_IDENTIFIER",
          message: `Cannot extend undeclared element '${extension.targetId}'`,
          sourceName: extension.sourceName,
          ...diagnosticPosition({
            line: extension.targetLine,
            column: extension.targetColumn,
            ...(extension.targetEndLine === undefined ? {} : { endLine: extension.targetEndLine }),
            ...(extension.targetEndColumn === undefined ? {} : { endColumn: extension.targetEndColumn }),
          }),
        });
        continue;
      }
      const constructor = typeSystem.findConstructor(extension.constructor, target.type);
      if (constructor === undefined || !typeSystem.isAssignable(target.type, constructor.ownerType)) {
        diagnostics.push({
          code: "TYPE_MISMATCH",
          message: `Extension '${extension.constructor}' cannot be applied to element '${extension.targetId}' of type '${target.type}'`,
          sourceName: extension.sourceName,
          ...diagnosticPosition({
            line: extension.constructorLine,
            column: extension.constructorColumn,
            ...(extension.constructorEndLine === undefined ? {} : { endLine: extension.constructorEndLine }),
            ...(extension.constructorEndColumn === undefined ? {} : { endColumn: extension.constructorEndColumn }),
          }),
        });
        continue;
      }
      if (extension.body !== undefined) {
        const mutableDocument = document as MutableParsedDocument;
        const before = mutableDocument.elements.length;
        collectBodyItems(extension.body, target.type, target, mutableDocument, typeSystem);
        for (const element of mutableDocument.elements.slice(before)) {
          indexElement(element, elementsByContextAndLocalId, sourceElementsBySourceAndLocalId);
        }
      }
    }
  }
}

function indexElement(
  element: ParsedElement,
  elementsByContextAndLocalId: Map<string, ParsedElement[]>,
  sourceElementsBySourceAndLocalId: Map<string, ParsedElement>,
): void {
  addToGroup(elementsByContextAndLocalId, `${element.context}\0${element.localId}`, element);
  sourceElementsBySourceAndLocalId.set(`${element.sourceName}\0${element.localId}`, element);
}

function tabRootsBySource(
  documents: readonly ParsedDocument[],
  elementsByContextAndLocalId: ReadonlyMap<string, readonly ParsedElement[]>,
): Readonly<Record<string, readonly string[]>> {
  const roots = new Map<string, Set<string>>();
  const addRoot = (sourceName: string, element: ParsedElement | undefined): void => {
    if (element === undefined || !isGraphElement(element)) {
      return;
    }
    const values = roots.get(sourceName) ?? new Set<string>();
    values.add(element.id);
    roots.set(sourceName, values);
  };

  for (const document of documents) {
    for (const element of document.elements) {
      if (element.sourceName === document.sourceName && element.parent === undefined) {
        addRoot(document.sourceName, element);
      }
    }
    for (const extension of document.extensions) {
      addRoot(
        document.sourceName,
        elementsByContextAndLocalId.get(`${extension.context}\0${extension.targetId}`)?.[0],
      );
    }
  }
  return Object.fromEntries([...roots].map(([sourceName, values]) => [sourceName, [...values]]));
}

function resolveAttributes(
  owner: { readonly sourceName: string } & Partial<SourcePosition>,
  ownerType: string,
  attributes: Readonly<Record<string, readonly ParsedAttributeValue[]>>,
  referenceAttributePositions: Readonly<Record<string, SourcePosition>>,
  scalarAttributes: Readonly<Record<string, string>>,
  scalarAttributePositions: Readonly<Record<string, SourcePosition>>,
  currentContext: string,
  sourceElementsBySourceAndLocalId: ReadonlyMap<string, ParsedElement>,
  elementsByContextAndLocalId: ReadonlyMap<string, readonly ParsedElement[]>,
  importsBySourceAndAlias: ReadonlyMap<string, ResolvedImport>,
  typeSystem: TypeSystem,
  diagnostics: LanguageDiagnostic[],
  checkRequired = true,
): Readonly<Record<string, readonly ResolvedReferenceValue[]>> {
  const result: Record<string, ResolvedReferenceValue[]> = {};
  if (checkRequired) {
    for (const attribute of typeSystem.attributes(ownerType).values()) {
      if (attribute.required === true
      && scalarAttributes[attribute.name] === undefined
      && attributes[attribute.name] === undefined) {
        diagnostics.push({
          code: "REQUIRED_ATTRIBUTE_MISSING",
          message: `Required attribute '${attribute.name}' is missing on type '${ownerType}'`,
          sourceName: owner.sourceName,
          ...diagnosticPosition({
            line: owner.line ?? 1,
            column: owner.column ?? 1,
            ...(owner.endLine === undefined ? {} : { endLine: owner.endLine }),
            ...(owner.endColumn === undefined ? {} : { endColumn: owner.endColumn }),
          }),
        });
      }
    }
  }
  for (const name of Object.keys(scalarAttributes)) {
    const attribute = typeSystem.attribute(ownerType, name);
    const scalarPosition = scalarAttributePositions[name] ?? { line: owner.line ?? 1, column: owner.column ?? 1 };
    if (attribute === undefined) {
      diagnostics.push({
        code: "ATTRIBUTE_NOT_DECLARED",
        message: `Attribute '${name}' is not declared on type '${ownerType}'`,
        sourceName: owner.sourceName,
        ...diagnosticPosition(scalarPosition),
      });
      continue;
    }
    if (attribute.type === "Text") {
      continue;
    }
    const enumValues = typeSystem.enumValues(attribute.type);
    if (enumValues.length > 0) {
      const value = scalarAttributes[name]!;
      if (!enumValues.includes(value)) {
        diagnostics.push({
          code: "ENUM_VALUE_NOT_DECLARED",
          message: `Enum value '${value}' is not declared for type '${attribute.type}'`,
          sourceName: owner.sourceName,
          ...diagnosticPosition(scalarPosition),
        });
      }
      continue;
    }
    diagnostics.push({
      code: "TYPE_MISMATCH",
      message: `Attribute '${name}' on type '${ownerType}' expects a slot`,
      sourceName: owner.sourceName,
      ...diagnosticPosition(scalarPosition),
    });
  }
  for (const [name, values] of Object.entries(attributes)) {
    const attribute = typeSystem.attribute(ownerType, name);
    const attributePosition = referenceAttributePositions[name] ?? { line: owner.line ?? 1, column: owner.column ?? 1 };
    if (attribute === undefined) {
      diagnostics.push({
        code: "ATTRIBUTE_NOT_DECLARED",
        message: `Attribute '${name}' is not declared on type '${ownerType}'`,
        sourceName: owner.sourceName,
        ...diagnosticPosition(attributePosition),
      });
      continue;
    }
    const expectedType = attribute.list === true ? attribute.listElementType : attribute.type;
    if (attribute.list !== true && values.length > 1) {
      diagnostics.push({
        code: "TYPE_MISMATCH",
        message: `Attribute '${name}' expects exactly one value`,
        sourceName: owner.sourceName,
        ...diagnosticPosition(values[1] ?? { line: 1, column: 1 }),
      });
      continue;
    }
    if (expectedType === undefined || expectedType === "Text") {
      continue;
    }
    const enumValues = typeSystem.enumValues(expectedType);
    if (enumValues.length > 0) {
      for (const value of values) {
        if (!enumValues.includes(value.targetId)) {
          diagnostics.push({
            code: "ENUM_VALUE_NOT_DECLARED",
            message: `Enum value '${value.targetId}' is not declared for type '${expectedType}'`,
            sourceName: owner.sourceName,
            ...diagnosticPosition(value),
          });
          continue;
        }
        result[name] = [...(result[name] ?? []), { id: value.targetId }];
      }
      continue;
    }
    for (const value of values) {
      const resolved = resolveReferenceValue(value, owner.sourceName, currentContext, sourceElementsBySourceAndLocalId, elementsByContextAndLocalId, importsBySourceAndAlias, diagnostics);
      if (resolved === undefined) {
        continue;
      }
      if (!typeSystem.isAssignable(resolved.type, expectedType)) {
        diagnostics.push({
          code: "TYPE_MISMATCH",
          message: `Element '${value.targetId}' of type '${resolved.type}' is not assignable to expected type '${expectedType}'`,
          sourceName: owner.sourceName,
          ...diagnosticPosition(value),
        });
        continue;
      }
      result[name] = [...(result[name] ?? []), {
        id: resolved.id,
        element: resolved,
        line: value.line,
        column: value.column,
        ...(value.endLine === undefined ? {} : { endLine: value.endLine }),
        ...(value.endColumn === undefined ? {} : { endColumn: value.endColumn }),
      }];
    }
  }
  return result;
}

function resolveReferenceValue(
  value: ParsedAttributeValue,
  sourceName: string,
  currentContext: string,
  sourceElementsBySourceAndLocalId: ReadonlyMap<string, ParsedElement>,
  elementsByContextAndLocalId: ReadonlyMap<string, readonly ParsedElement[]>,
  importsBySourceAndAlias: ReadonlyMap<string, ResolvedImport>,
  diagnostics: LanguageDiagnostic[],
): ParsedElement | undefined {
  const edge: ParsedEdge = {
    sourceName,
    source: "",
    sourceType: "",
    operator: "",
    targetId: value.targetId,
    targetLine: value.line,
    targetColumn: value.column,
    ...(value.endLine === undefined ? {} : { targetEndLine: value.endLine }),
    ...(value.endColumn === undefined ? {} : { targetEndColumn: value.endColumn }),
    ...(value.targetContext === undefined ? {} : { targetContext: value.targetContext }),
    attributes: {},
    referenceAttributePositions: {},
    scalarAttributes: {},
    scalarAttributePositions: {},
    assignedScalarAttributes: new Set(),
    deploymentActions: [],
    annotations: [],
    line: value.line,
    column: value.column,
    ...(value.endLine === undefined ? {} : { endLine: value.endLine }),
    ...(value.endColumn === undefined ? {} : { endColumn: value.endColumn }),
  };
  return resolveEdgeTarget(edge, currentContext, sourceElementsBySourceAndLocalId, elementsByContextAndLocalId, importsBySourceAndAlias, diagnostics);
}

function flattenAttributes(
  scalarAttributes: Readonly<Record<string, string>>,
  attributes: Readonly<Record<string, readonly ResolvedReferenceValue[]>>,
): Readonly<Record<string, readonly string[]>> {
  return {
    ...Object.fromEntries(Object.entries(scalarAttributes).map(([name, value]) => [name, [value]])),
    ...Object.fromEntries(Object.entries(attributes).map(([name, values]) => [name, values.map((value) => value.id)])),
  };
}

function deploymentAttributesForWire(
  edge: ParsedEdge,
  target: ParsedElement,
  edgeType: string,
  context: DeploymentExpansionContext,
): Readonly<Record<string, readonly ResolvedReferenceValue[]>> {
  const source = context.linkedElementsById.get(edge.source);
  if (source === undefined) {
    return {};
  }
  const unsupported = edge.deploymentActions.filter((action) =>
    !deploymentActionHasCapability(action, OPERATOR_CAPABILITIES.deploymentRoute, context.typeSystem)
  );
  for (const action of unsupported) {
    context.diagnostics.push({
      code: "WIRE_ROUTE_REQUIRED",
      message: `Relationship deployment supports only 'route <name>', got '${action.operator} ${action.targetId}'`,
      sourceName: action.sourceName,
      ...diagnosticPosition(action),
    });
  }
  if (unsupported.length > 0) return {};
  return {};
}

function deploymentActionHasCapability(
  action: ParsedDeploymentAction,
  capability: string,
  typeSystem: TypeSystem,
): boolean {
  const candidates = deploymentOperatorCandidates(
    typeSystem,
    action.ownerType,
    action.operator,
    action.expectedType,
    [],
  );
  return candidates.length > 0
    && candidates.every((operator) => typeSystem.operatorHasCapability(operator, capability));
}

function resolveDeploymentApplication(
  owner: ParsedElement,
  actions: readonly ParsedDeploymentAction[],
  wire: boolean,
  context: DeploymentExpansionContext,
  initialDeployments: readonly ParsedElement[] = [],
): DeploymentApplication {
  const state = {
    deployments: [...initialDeployments],
    profileByDeploymentId: new Map<string, ParsedElement>(),
    runsOn: [] as DeploymentUse[],
    usesByKey: new Map<string, DeploymentUse>(),
  };
  for (const action of actions) {
    applyDeploymentAction(owner, action, false, wire, state, context);
  }
  return {
    deployments: state.deployments,
    runsOn: state.runsOn,
    uses: [...state.usesByKey.values()],
  };
}

function applyDeploymentAction(
  owner: ParsedElement,
  action: ParsedDeploymentAction,
  inherited: boolean,
  wire: boolean,
  state: DeploymentApplicationState,
  context: DeploymentExpansionContext,
  resolutionDeployments: readonly ParsedElement[] = state.deployments,
): void {
  const target = lookupElementReference(
    action.targetId,
    action.targetContext,
    action.sourceName,
    owner.context,
    context.sourceElementsBySourceAndLocalId,
    context.elementsByContextAndLocalId,
    context.importsBySourceAndAlias,
  );
  const targetTypes = target !== undefined ? [target.type] : unique(resolutionDeployments
    .flatMap((deployment) => deploymentSlotValues(deployment, action.targetId, context))
    .flatMap((value) => value.element === undefined ? [] : [value.element.type]));
  const candidates = deploymentOperatorCandidates(context.typeSystem, action.ownerType, action.operator, action.expectedType, targetTypes);
  const isUse = candidates.length > 0
    && candidates.every((operator) => context.typeSystem.operatorHasCapability(operator, OPERATOR_CAPABILITIES.deploymentUse));
  const isPlacement = candidates.length > 0
    && candidates.every((operator) => context.typeSystem.operatorHasCapability(operator, OPERATOR_CAPABILITIES.deploymentPlacement));
  if (isUse && target !== undefined
      && context.typeSystem.typeHasCapability(target.type, TYPE_CAPABILITIES.deploymentProfile)) {
    if (wire) {
      context.diagnostics.push({
        code: "TYPE_MISMATCH",
        message: "Relationship deployment cannot use a deployment profile; use network infrastructure",
        sourceName: action.sourceName,
        ...diagnosticPosition(action),
      });
      return;
    }
    applyDeploymentProfile(owner, action, target, wire, state, context);
    return;
  }
  if (!isUse && !isPlacement) {
    context.diagnostics.push({
      code: "TYPE_MISMATCH",
      message: targetTypes.length > 0
        ? `Operator '${action.operator}' cannot be applied from '${action.ownerType}' to '${targetTypes.join("' or '")}'`
        : `Operator '${action.operator}' has incompatible deployment capabilities`,
      sourceName: action.sourceName,
      ...diagnosticPosition(action),
    });
    return;
  }
  if (wire && isPlacement) {
    if (!inherited) {
      context.diagnostics.push({
        code: "TYPE_MISMATCH",
        message: "Relationship deployment does not support placement; use network infrastructure with a deployment-use operator",
        sourceName: action.sourceName,
        ...diagnosticPosition(action),
      });
    }
    return;
  }
  const selected = resolveDeploymentInfrastructure(owner, action, target, resolutionDeployments, inherited, wire, context);
  for (const item of selected) {
    if (wire && !context.typeSystem.typeHasCapability(item.element.type, TYPE_CAPABILITIES.networkConnection)) {
      if (!inherited) {
        context.diagnostics.push({
          code: "TYPE_MISMATCH",
          message: `Relationship deployment can use only network infrastructure, got '${item.element.type}'`,
          sourceName: action.sourceName,
          ...diagnosticPosition(action),
        });
      }
      continue;
    }
    const use = {
      ...item,
      inherited,
    };
    if (isPlacement) {
      state.runsOn.push(use);
      continue;
    }
    state.usesByKey.set(deploymentUseKey(item.element, item.deploymentId, target, context.typeSystem), use);
  }
}

function applyDeploymentProfile(
  owner: ParsedElement,
  action: ParsedDeploymentAction,
  profile: ParsedElement,
  wire: boolean,
  state: DeploymentApplicationState,
  context: DeploymentExpansionContext,
): void {
  const operator = context.typeSystem.operatorConstructor(action.operator, action.ownerType, profile.type);
  if (operator === undefined) {
    context.diagnostics.push({
      code: "TYPE_MISMATCH",
      message: `Operator '${action.operator}' cannot be applied from '${owner.type}' to '${profile.type}'`,
      sourceName: action.sourceName,
      ...diagnosticPosition(action),
    });
    return;
  }
  const deployments = profileDeployments(profile, context);
  const overlaps = deployments.flatMap((deployment) => {
    const previousProfile = state.profileByDeploymentId.get(deployment.id);
    return previousProfile === undefined ? [] : [{ deployment, previousProfile }];
  });
  if (overlaps.length > 0) {
    const details = overlaps
      .map(({ deployment, previousProfile }) => `'${deployment.localId} from ${deployment.context}' (already selected by '${previousProfile.localId}')`)
      .join(", ");
    context.diagnostics.push({
      code: "DEPLOYMENT_PROFILE_DEPLOYMENT_OVERLAP",
      message: `Deployment profile '${profile.localId}' overlaps in deployment(s) ${details}`,
      sourceName: action.sourceName,
      ...diagnosticPosition(action),
    });
    return;
  }
  for (const deployment of deployments) {
    state.profileByDeploymentId.set(deployment.id, profile);
  }
  state.deployments = mergeUniqueElements(state.deployments, deployments);
  for (const profileAction of profile.deploymentActions) {
    applyDeploymentAction(owner, profileAction, true, wire, state, context, deployments);
  }
}

function profileDeployments(
  profile: ParsedElement,
  context: DeploymentExpansionContext,
): readonly ParsedElement[] {
  const profileMembers = context.typeSystem.attributeWithCapability(
    profile.type,
    ATTRIBUTE_CAPABILITIES.deploymentProfileMembers,
  )?.name ?? APPLIES_TO_ATTRIBUTE;
  const deployments = (context.resolvedElementAttributes.get(profile.id)?.[profileMembers] ?? [])
    .flatMap((value) => value.element === undefined ? [] : [value.element])
    .filter((element) => context.typeSystem.typeHasCapability(element.type, TYPE_CAPABILITIES.deployment));
  return mergeUniqueElements([], deployments);
}

function resolveDeploymentInfrastructure(
  owner: ParsedElement,
  action: ParsedDeploymentAction,
  target: ParsedElement | undefined,
  deployments: readonly ParsedElement[],
  inherited: boolean,
  wire: boolean,
  context: DeploymentExpansionContext,
): readonly DeploymentUse[] {
  if (target !== undefined) {
    if (context.typeSystem.typeHasCapability(target.type, TYPE_CAPABILITIES.infrastructure)) {
      return [materializeInfrastructureUse(owner, target, action, undefined, context, inherited)];
    }
    context.diagnostics.push({
      code: "TYPE_MISMATCH",
      message: `Deployment operator '${action.operator}' expects a deployment profile or infrastructure, got '${target.type}'`,
      sourceName: action.sourceName,
      ...diagnosticPosition(action),
    });
    return [];
  }
  if (action.targetContext !== undefined) {
    context.diagnostics.push({
      code: "UNDECLARED_IDENTIFIER",
      message: `Element '${action.targetId}' is not declared in context '${action.targetContext}'`,
      sourceName: action.sourceName,
      ...diagnosticPosition(action),
    });
    return [];
  }
  if (!isDeclaredDeploymentInfrastructureSlot(action.targetId, context.typeSystem)) {
    context.diagnostics.push({
      code: "UNDECLARED_IDENTIFIER",
      message: `Deployment slot '${action.targetId}' is not declared by any Environment type`,
      sourceName: action.sourceName,
      ...diagnosticPosition(action),
    });
    return [];
  }
  if (deployments.length === 0) {
    if (wire) {
      return [];
    }
    context.diagnostics.push({
      code: "REQUIRED_ATTRIBUTE_MISSING",
      message: `Deployment operator '${action.operator}' cannot resolve deployment slot '${action.targetId}' without a deployment profile`,
      sourceName: action.sourceName,
      ...diagnosticPosition(action),
    });
    return [];
  }
  const result: DeploymentUse[] = [];
  for (const deployment of deployments) {
    const values = deploymentSlotValues(deployment, action.targetId, context);
    if (values.length === 0) {
      if (!wire) {
        context.diagnostics.push({
          code: "REQUIRED_ATTRIBUTE_MISSING",
          message: `Deployment '${deployment.localId} from ${deployment.context}' does not provide slot '${action.targetId}'`,
          sourceName: action.sourceName,
          ...diagnosticPosition(action),
        });
      }
      continue;
    }
    for (const value of values) {
      if (value.element === undefined) {
        continue;
      }
      result.push(materializeInfrastructureUse(owner, value.element, action, deployment.id, context, inherited));
    }
  }
  return result;
}

function isDeclaredDeploymentInfrastructureSlot(
  slotName: string,
  typeSystem: TypeSystem,
): boolean {
  for (const type of typeSystem.declaredTypes()) {
  if (!typeSystem.typeHasCapability(type, TYPE_CAPABILITIES.environment)) {
      continue;
    }
    const attribute = typeSystem.attribute(type, slotName);
    if (attribute === undefined) {
      continue;
    }
    const valueType = attribute.list === true
      ? attribute.listElementType ?? attribute.type
      : attribute.type;
    if (typeSystem.typesWithCapability(TYPE_CAPABILITIES.infrastructure)
      .some((infrastructureType) => typeSystem.isAssignable(valueType, infrastructureType))) {
      return true;
    }
  }
  return false;
}

function materializeInfrastructureUse(
  owner: ParsedElement,
  source: ParsedElement,
  action: ParsedDeploymentAction,
  deploymentId: string | undefined,
  context: DeploymentExpansionContext,
  inherited: boolean,
): DeploymentUse {
  if (!deploymentActionHasOverrides(action)) {
    return {
      element: source,
      ...(deploymentId === undefined ? {} : { deploymentId }),
      action,
      inherited,
    };
  }
  const cloneMap = new Map<string, ParsedElement>();
  const root = cloneInfrastructureElement(owner, source, action, context, cloneMap, undefined, true);
  return {
    element: root,
    ...(deploymentId === undefined ? {} : { deploymentId }),
    action,
    inherited,
  };
}

function deploymentActionHasOverrides(action: ParsedDeploymentAction): boolean {
  return action.assignedScalarAttributes.size > 0 || Object.keys(action.attributes).length > 0;
}

function cloneInfrastructureElement(
  owner: ParsedElement,
  source: ParsedElement,
  action: ParsedDeploymentAction,
  context: DeploymentExpansionContext,
  cloneMap: Map<string, ParsedElement>,
  parentId: string | undefined,
  root: boolean,
): ParsedElement {
  const existing = cloneMap.get(source.id);
  if (existing !== undefined) {
    return existing;
  }
  const id = context.cloneId(owner, source, action);
  const localId = id.slice(id.lastIndexOf("/") + 1);
  const clone: ParsedElement = {
    ...source,
    id,
    context: owner.context,
    localId,
    sourceName: owner.sourceName,
    anonymous: true,
    synthetic: true,
    cloneOf: source.cloneOf ?? source.id,
    ...(parentId === undefined ? { parent: owner.id } : { parent: parentId }),
    scalarAttributes: {
      ...source.scalarAttributes,
      ...(root ? action.scalarAttributes : {}),
    },
    scalarAttributePositions: {
      ...source.scalarAttributePositions,
      ...(root ? action.scalarAttributePositions : {}),
    },
    assignedScalarAttributes: new Set([
      ...source.assignedScalarAttributes,
      ...(root ? action.assignedScalarAttributes : new Set<string>()),
    ]),
  };
  cloneMap.set(source.id, clone);
  context.elements.push(clone);
  indexNestedSlot(context.nestedSlots, clone);
  context.linkedElementsById.set(clone.id, clone);

  const sourceAttributes = context.resolvedElementAttributes.get(source.id) ?? {};
  const clonedAttributes: Record<string, ResolvedReferenceValue[]> = {};
  for (const [name, values] of Object.entries(sourceAttributes)) {
    if (root && action.attributes[name] !== undefined) {
      continue;
    }
    clonedAttributes[name] = values.map((value) => {
      if (value.element === undefined
          || (!context.typeSystem.typeHasCapability(value.element.type, TYPE_CAPABILITIES.infrastructure)
            && !context.typeSystem.typeHasCapability(value.element.type, TYPE_CAPABILITIES.projection))) {
        return value;
      }
      const child = cloneInfrastructureElement(owner, value.element, action, context, cloneMap, clone.id, false);
      return remapResolvedValue(value, child);
    });
  }
  const overrideAttributes = root
    ? resolveAttributes(action, source.type, action.attributes, action.referenceAttributePositions, action.scalarAttributes, action.scalarAttributePositions, owner.context, context.sourceElementsBySourceAndLocalId, context.elementsByContextAndLocalId, context.importsBySourceAndAlias, context.typeSystem, context.diagnostics, false)
    : {};
  context.resolvedElementAttributes.set(clone.id, applyResolvedReferenceOverrides(clonedAttributes, overrideAttributes));
  return clone;
}

function applyResolvedReferenceOverrides(
  base: Readonly<Record<string, readonly ResolvedReferenceValue[]>>,
  overrides: Readonly<Record<string, readonly ResolvedReferenceValue[]>>,
): Readonly<Record<string, readonly ResolvedReferenceValue[]>> {
  const result: Record<string, ResolvedReferenceValue[]> = Object.fromEntries(
    Object.entries(base).map(([name, values]) => [name, [...values]]),
  );
  for (const [name, values] of Object.entries(overrides)) {
    if (values.length > 0) {
      result[name] = [...values];
    }
  }
  return result;
}

function remapResolvedValue(value: ResolvedReferenceValue, element: ParsedElement): ResolvedReferenceValue {
  return {
    ...value,
    id: element.id,
    element,
  };
}

function indexNestedSlot(slots: Map<string, ResolvedReferenceValue[]>, element: ParsedElement): void {
  if (element.parent === undefined || element.slotName === undefined) return;
  const key = `${element.parent}\0${element.slotName}`;
  const value = resolvedValueForElement(element, element);
  const values = slots.get(key);
  if (values === undefined) slots.set(key, [value]);
  else values.push(value);
}

function deploymentSlotValues(
  deployment: ParsedElement,
  slot: string,
  context: DeploymentExpansionContext,
): readonly ResolvedReferenceValue[] {
  const direct = context.resolvedElementAttributes.get(deployment.id)?.[slot] ?? [];
  if (direct.length > 0) {
    return direct;
  }
  return context.nestedSlots.get(`${deployment.id}\0${slot}`) ?? [];
}

function deploymentUseFamilyKey(
  element: ParsedElement,
  deploymentId: string | undefined,
  typeSystem: TypeSystem,
): string {
  return `${deploymentId ?? element.context}\0${deploymentUseFamily(element.type, typeSystem)}`;
}

function deploymentUseKey(
  element: ParsedElement,
  deploymentId: string | undefined,
  concreteTarget: ParsedElement | undefined,
  typeSystem: TypeSystem,
): string {
  // Slot actions replace the selected infrastructure family for a deployment,
  // while concrete references are additive and identify one exact instance.
  return concreteTarget === undefined
    ? `family\0${deploymentUseFamilyKey(element, deploymentId, typeSystem)}`
    : `element\0${concreteTarget.id}`;
}

function deploymentUseFamily(type: string, typeSystem: TypeSystem): string {
  if (typeSystem.typeHasCapability(type, TYPE_CAPABILITIES.networkConnection)) {
    return TYPE_CAPABILITIES.networkConnection;
  }
  const lineage = [type, ...typeSystem.baseTypes(type)];
  const capabilityRoot = lineage.findIndex((candidate) =>
    typeSystem.declaresCapability(candidate, TYPE_CAPABILITIES.infrastructure)
  );
  return capabilityRoot > 0 ? lineage[capabilityRoot - 1]! : type;
}

interface RouteProjectionNode {
  readonly id: string;
  readonly deployment?: ParsedElement;
  readonly placement?: string;
  readonly port?: boolean;
}

interface RouteEdgeDraft {
  readonly source: RouteProjectionNode;
  readonly target: RouteProjectionNode;
  readonly operator: string;
  readonly attributes: Readonly<Record<string, readonly string[]>>;
  readonly preservesLogicalRelationship: boolean;
  readonly rule: ProjectionRuleDefinition;
}

interface PhysicalProjectionEndpoint {
  readonly kind: "to" | "this";
  readonly element: ParsedElement;
  readonly deployments: readonly ParsedElement[];
  readonly slotName?: string;
}

function expandRouteProjection(workspace: LinkingWorkspace, projection: PendingProjection): void {
  // The projection stage dispatches here only when at least one route action exists.
  const actions = projection.routeActions!;
  const sourceElement = workspace.linkedElementsById.get(projection.fromId);
  const targetElement = workspace.linkedElementsById.get(projection.toId);
  if (sourceElement === undefined || targetElement === undefined) return;

  const sourceDeployments = workspace.deploymentContext.effectiveDeploymentsByElementId.get(sourceElement.id) ?? [];
  const targetDeployments = workspace.deploymentContext.effectiveDeploymentsByElementId.get(targetElement.id) ?? [];
  const seeds = sourceDeployments.length > 0 ? sourceDeployments : targetDeployments;
  if (seeds.length === 0) {
    const action = actions[0]!;
    workspace.diagnostics.push({
      code: "ROUTE_ENDPOINT_DEPLOYMENT_MISSING",
      message: `Route '${action.targetId}' cannot be resolved because neither endpoint has an effective deployment`,
      sourceName: action.sourceName,
      ...diagnosticPosition(action),
    });
    return;
  }

  const selections = new Map<string | undefined, ParsedDeploymentAction>();
  const environments = new Set(seeds.map((seed) => seed.context));
  let invalid = false;
  for (const action of actions) {
    const qualifier = action.routeEnvironment;
    if (selections.has(qualifier?.id)) {
      workspace.diagnostics.push({
        code: "ROUTE_SELECTION_AMBIGUOUS",
        message: qualifier === undefined ? "A wire can select only one default route"
          : `A wire can select only one route for environment '${qualifier.id}'`,
        sourceName: action.sourceName,
        ...diagnosticPosition(qualifier ?? action),
      });
      invalid = true;
    } else if (qualifier !== undefined && !environments.has(qualifier.id)) {
      workspace.diagnostics.push({
        code: "ROUTE_ENVIRONMENT_NOT_APPLICABLE",
        message: `Environment '${qualifier.id}' is outside the effective deployments of '${sourceDeployments.length ? sourceElement.id : targetElement.id}'`,
        sourceName: action.sourceName,
        ...diagnosticPosition(qualifier),
      });
      invalid = true;
    }
    selections.set(qualifier?.id, action);
  }
  if (invalid) return;

  let projected = false;
  for (const seed of seeds) {
    const action = selections.get(seed.context) ?? selections.get(undefined);
    if (action === undefined) continue;
    const route = routeImplementation(action.targetId, seed.context, workspace);
    if (route === undefined) {
      workspace.diagnostics.push({
        code: "ROUTE_NOT_DECLARED",
        message: `Route '${action.targetId}' is not declared in environment '${seed.context}'`,
        sourceName: action.sourceName,
        ...diagnosticPosition(action),
      });
      continue;
    }
    const rules = route.projectionRules.filter((rule) => rule.section !== "projection");
    const sections = (["outbound", "transit", "inbound"] as const)
      .map((section) => ({ section, rules: rules.filter((rule) => rule.section === section) }))
      .filter((item) => item.rules.length > 0);
    if (!sections.some((item) => item.section === "outbound" || item.section === "inbound")) {
      workspace.diagnostics.push({
        code: "ROUTE_ENDPOINT_SECTION_REQUIRED",
        message: `Route '${route.localId}' must declare at least one of 'outbound' or 'inbound'`,
        sourceName: route.sourceName,
        ...diagnosticPosition(route),
      });
      continue;
    }

    const sourceNode = routeLogicalNode(sourceElement, seed, workspace, action, "source");
    if (sourceNode === undefined) continue;
    let inputNodes: readonly RouteProjectionNode[] = [sourceNode];
    let drafts: RouteEdgeDraft[] = [];
    const boundaryIds: string[] = [];
    for (let index = 0; index < sections.length; index += 1) {
      const item = sections[index]!;
      const last = index === sections.length - 1;
      const boundary = last ? undefined : `${route.id}\0${item.section}\0${sections[index + 1]!.section}`;
      if (boundary !== undefined) boundaryIds.push(boundary);
      const expanded = expandRouteSection(
        route,
        item.rules,
        inputNodes,
        boundary,
        last,
        { kind: "to", element: targetElement, deployments: targetDeployments },
        projection,
        workspace,
      );
      drafts.push(...expanded.edges);
      inputNodes = expanded.outputs;
      if (inputNodes.length === 0) break;
    }
    if (inputNodes.length === 0) continue;
    for (const boundary of boundaryIds) {
      drafts = collapseRouteBoundary(drafts, boundary, route, workspace.diagnostics);
    }
    const dangling = drafts.filter((edge) => edge.source.port === true || edge.target.port === true);
    if (dangling.length > 0) {
      workspace.diagnostics.push({
        code: "ROUTE_SECTION_NOT_CONNECTED",
        message: `Route '${route.localId}' has a section branch that does not connect to the next section`,
        sourceName: route.sourceName,
        ...(dangling[0]?.rule.operatorSource ?? diagnosticPosition(route)),
      });
      continue;
    }
    for (const draft of drafts) {
      materializeRouteEdge(workspace, projection, route, draft);
      projected = true;
    }
  }
  if (projected && projection.coverage !== undefined) projection.coverage.projected = true;
}

function expandComponentProjectionStage(workspace: LinkingWorkspace): void {
  const projections = workspace.elements.filter((element) =>
    workspace.typeSystem.typeHasCapability(element.type, TYPE_CAPABILITIES.projection)
      && element.projectionRules.some((rule) => rule.section !== "projection"
        || rule.source.deployment !== undefined
        || rule.target.deployment !== undefined)
  );
  for (const projectionElement of projections) {
    const owner = projectionElement.parent === undefined
      ? undefined
      : workspace.linkedElementsById.get(projectionElement.parent);
    if (owner === undefined || !workspace.typeSystem.typeHasCapability(owner.type, TYPE_CAPABILITIES.infrastructure)) {
      workspace.diagnostics.push({
        code: "PROJECTION_OWNER_REQUIRED",
        message: `Projection '${projectionElement.localId}' must belong to an infrastructure component`,
        sourceName: projectionElement.sourceName,
        ...diagnosticPosition(projectionElement),
      });
      continue;
    }
    const slotName = owner.slotName;
    const endpointDeployments = workspace.elements.filter((element) => {
      if (!workspace.typeSystem.typeHasCapability(element.type, TYPE_CAPABILITIES.deployment)) return false;
      if (deploymentAncestor(owner, workspace.linkedElementsById, workspace.typeSystem)?.id === element.id) return true;
      return slotName !== undefined && deploymentSlotValues(element, slotName, workspace.deploymentContext)
        .some((value) => value.element !== undefined
          && (workspace.typeSystem.isAssignable(value.element.type, owner.type)
            || workspace.typeSystem.isAssignable(owner.type, value.element.type)));
    });
    const endpoint: PhysicalProjectionEndpoint = {
      kind: "this",
      element: owner,
      deployments: endpointDeployments,
      ...(slotName === undefined ? {} : { slotName }),
    };
    const consumers = componentProjectionConsumers(owner, workspace);
    for (const consumer of consumers) {
      const effectiveDeployments = workspace.deploymentContext.effectiveDeploymentsByElementId.get(consumer.element.id) ?? [];
      const seeds = consumer.deploymentId === undefined
        ? effectiveDeployments
        : effectiveDeployments.filter((deployment) => deployment.id === consumer.deploymentId);
      for (const seed of seeds) {
        const sourceNode = componentProjectionSourceNode(consumer.element, seed, projectionElement, workspace);
        if (sourceNode === undefined) continue;
        const normalizedRules = projectionElement.projectionRules.map((rule) =>
          rule.section === "projection" ? { ...rule, section: "outbound" as const } : rule
        );
        const sections = (["outbound", "transit", "inbound"] as const)
          .map((section) => ({ section, rules: normalizedRules.filter((rule) => rule.section === section) }))
          .filter((item) => item.rules.length > 0);
        let inputNodes: readonly RouteProjectionNode[] = [sourceNode];
        let drafts: RouteEdgeDraft[] = [];
        const boundaries: string[] = [];
        const pending: PendingProjection = {
          sourceIdentity: consumer.element.sourceName,
          fromId: consumer.element.id,
          toId: owner.id,
          attributes: {},
          projectedOperator: "->",
          projectionOrigin: {
            source: consumer.element.id,
            target: owner.id,
            sourceIdentity: consumer.element.sourceName,
            declaration: sourceLocation(projectionElement.sourceName, projectionElement),
          },
        };
        for (let index = 0; index < sections.length; index += 1) {
          const item = sections[index]!;
          const last = index === sections.length - 1;
          const boundary = last ? undefined : `${projectionElement.id}\0${item.section}\0${sections[index + 1]!.section}`;
          if (boundary !== undefined) boundaries.push(boundary);
          const expanded = expandRouteSection(
            projectionElement,
            item.rules,
            inputNodes,
            boundary,
            last,
            endpoint,
            pending,
            workspace,
          );
          drafts.push(...expanded.edges);
          inputNodes = expanded.outputs;
          if (inputNodes.length === 0) break;
        }
        if (inputNodes.length === 0) continue;
        for (const boundary of boundaries) {
          drafts = collapseRouteBoundary(drafts, boundary, projectionElement, workspace.diagnostics);
        }
        for (const draft of drafts) {
          if (draft.source.port === true || draft.target.port === true) continue;
          materializeRouteEdge(workspace, pending, projectionElement, draft, owner.id);
        }
      }
    }
  }
}

function componentProjectionConsumers(
  owner: ParsedElement,
  workspace: LinkingWorkspace,
): readonly { readonly element: ParsedElement; readonly deploymentId?: string }[] {
  const result: { element: ParsedElement; deploymentId?: string }[] = [];
  for (const [elementId, attributes] of workspace.resolvedElementAttributes) {
    const element = workspace.linkedElementsById.get(elementId);
    if (element === undefined || workspace.typeSystem.typeHasCapability(element.type, TYPE_CAPABILITIES.deploymentElement)
        || workspace.typeSystem.typeHasCapability(element.type, TYPE_CAPABILITIES.infrastructure)) continue;
    const endpointId = deploymentViewLogicalEndpoint(element.id, workspace.linkedElementsById, workspace.typeSystem);
    const endpoint = endpointId === undefined ? undefined : workspace.linkedElementsById.get(endpointId);
    if (endpoint === undefined) continue;
    for (const value of Object.values(attributes).flat()) {
      if (value.element?.id !== owner.id) continue;
      result.push({ element: endpoint, ...(value.deploymentId === undefined ? {} : { deploymentId: value.deploymentId }) });
    }
  }
  return uniqueBy(result, (item) => `${item.element.id}\0${item.deploymentId ?? ""}`);
}

function componentProjectionSourceNode(
  element: ParsedElement,
  deployment: ParsedElement,
  projection: ParsedElement,
  workspace: LinkingWorkspace,
): RouteProjectionNode | undefined {
  const placement = endpointPlacement(
    element.id,
    deployment.id,
    deployment.context,
    workspace.linkedElementsById,
    workspace.resolvedElementAttributes,
    workspace.typeSystem,
  );
  if (placement === undefined) {
    workspace.diagnostics.push({
      code: "PROJECTION_SOURCE_NOT_PLACED",
      message: `Projection '${projection.localId}' cannot place consumer '${element.localId}' in deployment '${deployment.localId} from ${deployment.context}'`,
      sourceName: projection.sourceName,
      ...diagnosticPosition(projection),
    });
    return undefined;
  }
  return { id: element.id, deployment, placement };
}

function routeImplementation(
  routeName: string,
  environment: string,
  workspace: LinkingWorkspace,
): ParsedElement | undefined {
  const candidates = (workspace.elementsByContextAndLocalId.get(`${environment}\0${routeName}`) ?? [])
    .filter((element) => workspace.typeSystem.typeHasCapability(element.type, TYPE_CAPABILITIES.route));
  return candidates.length === 1 ? candidates[0] : undefined;
}

function routeLogicalNode(
  element: ParsedElement,
  deployment: ParsedElement,
  workspace: LinkingWorkspace,
  action: ParsedDeploymentAction,
  endpoint: "source" | "target",
): RouteProjectionNode | undefined {
  const placement = endpointPlacement(
    element.id,
    deployment.id,
    deployment.context,
    workspace.linkedElementsById,
    workspace.resolvedElementAttributes,
    workspace.typeSystem,
  );
  if (placement === undefined && !routeEndpointMayRemainUnplaced(element, workspace.typeSystem)) {
    workspace.diagnostics.push({
      code: "ROUTE_ENDPOINT_NOT_PLACED",
      message: `Route '${action.targetId}' cannot place ${endpoint} '${element.localId}' in deployment '${deployment.localId} from ${deployment.context}'`,
      sourceName: action.sourceName,
      ...diagnosticPosition(action),
    });
    return undefined;
  }
  return {
    id: element.id,
    deployment,
    ...(placement === undefined ? {} : { placement }),
  };
}

function expandRouteSection(
  route: ParsedElement,
  rules: readonly ProjectionRuleDefinition[],
  inputNodes: readonly RouteProjectionNode[],
  outputBoundary: string | undefined,
  finalSection: boolean,
  endpoint: PhysicalProjectionEndpoint,
  projection: PendingProjection,
  workspace: LinkingWorkspace,
): { readonly edges: RouteEdgeDraft[]; readonly outputs: readonly RouteProjectionNode[] } {
  const diagnosticCount = workspace.diagnostics.length;
  const named = new Map<string, RouteProjectionNode[]>();
  const edges: RouteEdgeDraft[] = [];
  const outputs: RouteProjectionNode[] = [];
  for (const rule of rules) {
    const sources = resolveRouteTerm(
      rule.source,
      "source",
      inputNodes,
      inputNodes,
      named,
      outputBoundary,
      finalSection,
      endpoint,
      route,
      workspace,
    );
    // A hop from a named node to the same name advances those branches.
    // Other branches can still refer to their own placements.
    if (rule.source.kind === "attribute" && rule.target.kind === "attribute"
        && rule.source.value === rule.target.value && rule.target.deployment !== undefined) {
      const consumed = new Set(sources.map((node) => node.deployment?.id));
      named.set(rule.source.value, (named.get(rule.source.value) ?? [])
        .filter((node) => !consumed.has(node.deployment?.id)));
    }
    for (const source of sources) {
      const targets = resolveRouteTerm(
        rule.target,
        "target",
        [source],
        inputNodes,
        named,
        outputBoundary,
        finalSection,
        endpoint,
        route,
        workspace,
      );
      for (const target of targets) {
        const preserves = projectionRuleHasCapability(rule, workspace.typeSystem, OPERATOR_CAPABILITIES.preserveLogicalEdge);
        edges.push({
          source,
          target,
          operator: preserves ? projection.projectedOperator ?? "->" : rule.operator,
          attributes: mergeAttributeValues(
            preserves ? projection.projectedAttributes : undefined,
            rule.attributes ?? {},
          ),
          preservesLogicalRelationship: preserves,
          rule,
        });
        if (rule.target.kind === endpoint.kind) outputs.push(target);
        if (finalSection && rule.source.kind === endpoint.kind) outputs.push(source);
        if (rule.target.kind === "attribute") addRouteNamedNode(named, rule.target.value, target);
      }
    }
  }
  if (outputs.length === 0 && workspace.diagnostics.length === diagnosticCount) {
    workspace.diagnostics.push({
      code: "ROUTE_SECTION_OUTPUT_REQUIRED",
      message: `${endpoint.kind === "to" ? "Route" : "Projection"} '${route.localId}' section '${rules[0]?.section ?? ""}' must reach '$${endpoint.kind}'`,
      sourceName: route.sourceName,
      ...(rules[0]?.operatorSource ?? diagnosticPosition(route)),
    });
  }
  return { edges, outputs: uniqueRouteNodes(outputs) };
}

function resolveRouteTerm(
  term: ProjectionTermDefinition,
  side: "source" | "target",
  inheritedNodes: readonly RouteProjectionNode[],
  sectionInputNodes: readonly RouteProjectionNode[],
  named: ReadonlyMap<string, readonly RouteProjectionNode[]>,
  outputBoundary: string | undefined,
  finalSection: boolean,
  endpoint: PhysicalProjectionEndpoint,
  route: ParsedElement,
  workspace: LinkingWorkspace,
): readonly RouteProjectionNode[] {
  if (term.kind === "from") {
    return qualifyRouteNodes(sectionInputNodes, term, route, workspace);
  }
  if (term.kind === endpoint.kind) {
    const deployments = routeDeploymentsForTerm(term, inheritedNodes, route, workspace);
    if (!finalSection) {
      return deployments.map((deployment) => routePortNode(outputBoundary!, deployment));
    }
    return deployments.flatMap((deployment) => {
      const selected = selectTargetRouteDeployments(deployment, term, endpoint.deployments);
      if (selected.length === 0) {
        if (endpoint.kind !== "this"
            && term.deployment === undefined
            && routeEndpointMayRemainUnplaced(endpoint.element, workspace.typeSystem)) {
          return [{ id: endpoint.element.id, deployment }];
        }
        workspace.diagnostics.push({
          code: "ROUTE_TARGET_DEPLOYMENT_MISSING",
          message: `Target '${endpoint.element.localId}' is not deployed in '${deployment.localId} from ${deployment.context}' required by ${endpoint.kind === "to" ? "route" : "projection"} '${route.localId}'`,
          ...(term.source ?? { sourceName: route.sourceName, line: route.line, column: route.column }),
        });
      }
      if (selected.length > 1) {
        workspace.diagnostics.push({
          code: "ROUTE_TARGET_DEPLOYMENT_AMBIGUOUS",
          message: `Target '${endpoint.element.localId}' has multiple matching deployments for ${endpoint.kind === "to" ? "route" : "projection"} '${route.localId}'`,
          ...(term.source ?? { sourceName: route.sourceName, line: route.line, column: route.column }),
        });
        return [];
      }
      const targetDeployment = selected[0];
      if (targetDeployment === undefined) return [];
      const target = endpoint.kind === "this"
        ? infrastructureProjectionEndpoint(endpoint, targetDeployment, route, workspace, term)
        : endpoint.element;
      if (target === undefined) return [];
      const placement = endpoint.kind === "this" ? undefined : endpointPlacement(
        target.id,
        targetDeployment.id,
        targetDeployment.context,
        workspace.linkedElementsById,
        workspace.resolvedElementAttributes,
        workspace.typeSystem,
      );
      if (placement === undefined
          && endpoint.kind !== "this"
          && !routeEndpointMayRemainUnplaced(target, workspace.typeSystem)) {
        workspace.diagnostics.push({
          code: "ROUTE_ENDPOINT_NOT_PLACED",
          message: `${endpoint.kind === "to" ? "Route" : "Projection"} '${route.localId}' cannot place target '${target.localId}' in deployment '${targetDeployment.localId} from ${targetDeployment.context}'`,
          ...(term.source ?? { sourceName: route.sourceName, line: route.line, column: route.column }),
        });
        return [];
      }
      return [{ id: target.id, deployment: targetDeployment, ...(placement === undefined ? {} : { placement }) }];
    });
  }
  if (term.kind === "to" || term.kind === "this" || term.kind === "slot") {
    workspace.diagnostics.push({
      code: "ROUTE_TERM_NOT_SUPPORTED",
      message: `Route '${route.localId}' cannot use '${term.value}'; routes support '$from', '$to', and deployment infrastructure`,
      ...(term.source ?? { sourceName: route.sourceName, line: route.line, column: route.column }),
    });
    return [];
  }

  const existing = side === "source" ? named.get(term.value) ?? [] : [];
  const bases = existing.length > 0 ? existing : inheritedNodes;
  const deployments = routeDeploymentsForTerm(term, bases, route, workspace);
  const result: RouteProjectionNode[] = [];
  for (const deployment of deployments) {
    const values = routeInfrastructureValues(deployment, term.value, workspace.deploymentContext)
      .filter((value) => value.element !== undefined);
    if (values.length !== 1) {
      workspace.diagnostics.push({
        code: values.length === 0 ? "ROUTE_INFRASTRUCTURE_MISSING" : "ROUTE_INFRASTRUCTURE_AMBIGUOUS",
        message: values.length === 0
          ? `Deployment '${deployment.localId} from ${deployment.context}' does not provide route infrastructure '${term.value}'`
          : `Deployment '${deployment.localId} from ${deployment.context}' provides multiple values for route infrastructure '${term.value}'`,
        ...(term.source ?? { sourceName: route.sourceName, line: route.line, column: route.column }),
      });
      continue;
    }
    result.push({ id: values[0]!.element!.id, deployment });
  }
  return uniqueRouteNodes(result);
}

function routeEndpointMayRemainUnplaced(element: ParsedElement, typeSystem: TypeSystem): boolean {
  return typeSystem.isAssignable(element.type, ACTOR_TYPE)
    || elementTypeOrKindIsExplicitlyExternal(element.type, element.scalarAttributes.kind, typeSystem);
}

function routeInfrastructureValues(
  deployment: ParsedElement,
  name: string,
  context: DeploymentExpansionContext,
): readonly ResolvedReferenceValue[] {
  const direct = deploymentSlotValues(deployment, name, context);
  if (direct.length > 0) return direct;
  const nested = context.elements
    .filter((element) => element.id === deployment.id
      || elementDescendsFrom(element, deployment.id, context.linkedElementsById))
    .flatMap((element) => context.resolvedElementAttributes.get(element.id)?.[name] ?? [])
    .filter((value) => value.element !== undefined);
  if (nested.length > 0) return nested;
  return context.elements
    .filter((element) => (element.slotName === name || element.localId === name)
      && elementDescendsFrom(element, deployment.id, context.linkedElementsById))
    .map((element) => resolvedValueForElement(element, element));
}

function elementDescendsFrom(
  element: ParsedElement,
  ancestorId: string,
  elementsById: ReadonlyMap<string, ParsedElement>,
): boolean {
  const visited = new Set<string>();
  let current: ParsedElement | undefined = element;
  while (current !== undefined && !visited.has(current.id)) {
    if (current.parent === ancestorId) return true;
    visited.add(current.id);
    current = current.parent === undefined ? undefined : elementsById.get(current.parent);
  }
  return false;
}

function routeDeploymentsForTerm(
  term: ProjectionTermDefinition,
  nodes: readonly RouteProjectionNode[],
  route: ParsedElement,
  workspace: LinkingWorkspace,
): readonly ParsedElement[] {
  const bases = uniqueElements(nodes.flatMap((node) => node.deployment === undefined ? [] : [node.deployment]));
  if (term.deployment === undefined) return bases;
  const candidates = workspace.elements.filter((element) =>
    workspace.typeSystem.typeHasCapability(element.type, TYPE_CAPABILITIES.deployment)
      && element.context === term.deployment!.environment
      && (term.deployment!.deployment === undefined || element.localId === term.deployment!.deployment)
  );
  const selected = term.deployment.deployment !== undefined
    ? candidates
    : uniqueElements(bases.flatMap((base) => {
      const sameName = candidates.filter((candidate) => candidate.localId === base.localId);
      return sameName.length > 0 ? sameName : candidates.length === 1 ? candidates : [];
    }));
  if (selected.length === 0) {
    workspace.diagnostics.push({
      code: "ROUTE_DEPLOYMENT_NOT_FOUND",
      message: `Route '${route.localId}' cannot resolve deployment '${term.deployment.deployment ?? "<matching>"}' in environment '${term.deployment.environment}'`,
      ...(term.deployment.source ?? term.source ?? { sourceName: route.sourceName, line: route.line, column: route.column }),
    });
  } else if (selected.length > 1) {
    workspace.diagnostics.push({
      code: "ROUTE_DEPLOYMENT_AMBIGUOUS",
      message: `Route '${route.localId}' must name a deployment in environment '${term.deployment.environment}' because multiple deployments match`,
      ...(term.deployment.source ?? term.source ?? { sourceName: route.sourceName, line: route.line, column: route.column }),
    });
    return [];
  }
  return selected;
}

function qualifyRouteNodes(
  nodes: readonly RouteProjectionNode[],
  term: ProjectionTermDefinition,
  route: ParsedElement,
  workspace: LinkingWorkspace,
): readonly RouteProjectionNode[] {
  if (term.deployment === undefined) return nodes;
  const deployments = routeDeploymentsForTerm(term, nodes, route, workspace);
  const selected = new Set(deployments.map((deployment) => deployment.id));
  return nodes.filter((node) => node.deployment !== undefined && selected.has(node.deployment.id));
}

function selectTargetRouteDeployments(
  current: ParsedElement,
  term: ProjectionTermDefinition,
  targetDeployments: readonly ParsedElement[],
): readonly ParsedElement[] {
  if (term.deployment !== undefined) {
    return targetDeployments.filter((deployment) =>
      deployment.context === term.deployment!.environment
        && (term.deployment!.deployment === undefined || deployment.localId === term.deployment!.deployment)
    );
  }
  const exact = targetDeployments.filter((deployment) => deployment.id === current.id);
  if (exact.length > 0) return exact;
  return targetDeployments.filter((deployment) =>
    deployment.context === current.context && deployment.localId === current.localId
  );
}

function infrastructureProjectionEndpoint(
  endpoint: PhysicalProjectionEndpoint,
  deployment: ParsedElement,
  projection: ParsedElement,
  workspace: LinkingWorkspace,
  term: ProjectionTermDefinition,
): ParsedElement | undefined {
  const ownerDeployment = deploymentAncestor(endpoint.element, workspace.linkedElementsById, workspace.typeSystem);
  if (ownerDeployment?.id === deployment.id) return endpoint.element;
  const slotName = endpoint.slotName;
  const candidates = slotName === undefined ? [] : deploymentSlotValues(deployment, slotName, workspace.deploymentContext)
    .flatMap((value) => value.element === undefined ? [] : [value.element])
    .filter((element) => workspace.typeSystem.isAssignable(element.type, endpoint.element.type)
      || workspace.typeSystem.isAssignable(endpoint.element.type, element.type));
  if (candidates.length !== 1) {
    workspace.diagnostics.push({
      code: candidates.length === 0 ? "PROJECTION_INFRASTRUCTURE_MISSING" : "PROJECTION_INFRASTRUCTURE_AMBIGUOUS",
      message: candidates.length === 0
        ? `Deployment '${deployment.localId} from ${deployment.context}' does not provide '${slotName ?? endpoint.element.localId}' for projection '${projection.localId}'`
        : `Deployment '${deployment.localId} from ${deployment.context}' provides multiple '${slotName ?? endpoint.element.localId}' values for projection '${projection.localId}'`,
      ...(term.source ?? { sourceName: projection.sourceName, line: projection.line, column: projection.column }),
    });
    return undefined;
  }
  return candidates[0];
}

function deploymentAncestor(
  element: ParsedElement,
  elementsById: ReadonlyMap<string, ParsedElement>,
  typeSystem: TypeSystem,
): ParsedElement | undefined {
  const visited = new Set<string>();
  let current: ParsedElement | undefined = element;
  while (current !== undefined && !visited.has(current.id)) {
    if (typeSystem.typeHasCapability(current.type, TYPE_CAPABILITIES.deployment)) return current;
    visited.add(current.id);
    current = current.parent === undefined ? undefined : elementsById.get(current.parent);
  }
  return undefined;
}

function routePortNode(boundary: string, deployment: ParsedElement): RouteProjectionNode {
  return { id: `@route-port:${boundary}:${deployment.id}`, deployment, port: true };
}

function addRouteNamedNode(map: Map<string, RouteProjectionNode[]>, name: string, node: RouteProjectionNode): void {
  map.set(name, uniqueRouteNodes([...(map.get(name) ?? []), node]));
}

function uniqueRouteNodes(nodes: readonly RouteProjectionNode[]): RouteProjectionNode[] {
  return uniqueBy(nodes, (node) => `${node.id}\0${node.deployment?.id ?? ""}\0${node.placement ?? ""}`);
}

function uniqueElements(elements: readonly ParsedElement[]): ParsedElement[] {
  return uniqueBy(elements, (element) => element.id);
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function collapseRouteBoundary(
  edges: readonly RouteEdgeDraft[],
  boundary: string,
  route: ParsedElement,
  diagnostics: LanguageDiagnostic[],
): RouteEdgeDraft[] {
  const prefix = `@route-port:${boundary}:`;
  const ports = new Set(edges.flatMap((edge) => [edge.source.id, edge.target.id]).filter((id) => id.startsWith(prefix)));
  let result = [...edges];
  for (const port of ports) {
    const incoming = result.filter((edge) => edge.target.id === port);
    const outgoing = result.filter((edge) => edge.source.id === port);
    if (incoming.length === 0 || outgoing.length === 0) {
      diagnostics.push({
        code: "ROUTE_SECTION_NOT_CONNECTED",
        message: `Route '${route.localId}' has an unconnected section boundary`,
        sourceName: route.sourceName,
        line: route.line,
        column: route.column,
      });
      continue;
    }
    result = result.filter((edge) => edge.source.id !== port && edge.target.id !== port);
    for (const left of incoming) {
      for (const right of outgoing) {
        const preferred = left.preservesLogicalRelationship ? left : right;
        result.push({
          source: left.source,
          target: right.target,
          operator: preferred.operator,
          attributes: mergeAttributeValues(left.attributes, right.attributes),
          preservesLogicalRelationship: left.preservesLogicalRelationship || right.preservesLogicalRelationship,
          rule: preferred.rule,
        });
      }
    }
  }
  return result;
}

function materializeRouteEdge(
  workspace: LinkingWorkspace,
  projection: PendingProjection,
  route: ParsedElement,
  draft: RouteEdgeDraft,
  projectionRoot = route.id,
): void {
  const sourceElement = workspace.linkedElementsById.get(draft.source.id);
  const targetElement = workspace.linkedElementsById.get(draft.target.id);
  if (sourceElement === undefined || targetElement === undefined) return;
  const operator = workspace.typeSystem.operatorConstructor(draft.operator, sourceElement.type, targetElement.type);
  const type = operator?.ownerType ?? draft.operator;
  if (!draft.preservesLogicalRelationship) {
    const existingIndex = workspace.linkedEdges.findIndex((edge) => edge.projected === true
      && edge.source === draft.source.id
      && edge.operator === draft.operator
      && edge.target === draft.target.id
      && edge.projectionRoot === projectionRoot
      && edge.sourcePlacement === draft.source.placement
      && edge.targetPlacement === draft.target.placement);
    const existing = workspace.linkedEdges[existingIndex];
    if (existingIndex >= 0 && existing !== undefined) {
      workspace.linkedEdges[existingIndex] = {
        ...existing,
        attributes: mergeAttributeValues(draft.attributes, existing.attributes),
        annotations: uniqueAnnotations([...(existing.annotations ?? []), ...(projection.annotations ?? [])]),
        projectionOrigins: uniqueProjectionOrigins([
          ...(existing.projectionOrigins ?? []),
          projection.projectionOrigin,
        ]),
      };
      return;
    }
  }
  workspace.linkedEdges.push({
    id: linkedEdgeId([
      "route",
      projection.sourceIdentity,
      projection.fromId,
      projection.toId,
      projectionRoot,
      draft.source.id,
      draft.operator,
      draft.target.id,
      draft.source.deployment?.id,
      draft.target.deployment?.id,
      draft.preservesLogicalRelationship ? projectionOriginKey(projection.projectionOrigin) : undefined,
    ]),
    source: draft.source.id,
    target: draft.target.id,
    originSource: projection.fromId,
    originTarget: projection.toId,
    projectionOrigins: [projection.projectionOrigin],
    projectionRoot,
    operator: draft.operator,
    type,
    sourceIdentity: projection.sourceIdentity,
    ...(projection.projectionOrigin.declaration === undefined ? {} : { declaration: projection.projectionOrigin.declaration }),
    attributes: draft.attributes,
    ...listAttributesProperty(workspace.typeSystem, type),
    projected: true,
    ...(draft.source.placement === undefined ? {} : { sourcePlacement: draft.source.placement }),
    ...(draft.target.placement === undefined ? {} : { targetPlacement: draft.target.placement }),
    ...(projection.annotations === undefined ? {} : { annotations: projection.annotations }),
  });
}

function resolvedValueForElement(element: ParsedElement, source: SourcePosition): ResolvedReferenceValue {
  return {
    id: element.id,
    element,
    line: source.line,
    column: source.column,
    ...(source.endLine === undefined ? {} : { endLine: source.endLine }),
    ...(source.endColumn === undefined ? {} : { endColumn: source.endColumn }),
  };
}

function resolvedValueForDeploymentUse(use: DeploymentUse): ResolvedReferenceValue {
  return {
    ...resolvedValueForElement(use.element, use.action),
    ...(use.deploymentId === undefined ? {} : { deploymentId: use.deploymentId }),
  };
}

function mergeResolvedReferenceAttributes(
  base: Readonly<Record<string, readonly ResolvedReferenceValue[]>>,
  override: Readonly<Record<string, readonly ResolvedReferenceValue[]>>,
  singleAttributes: ReadonlySet<string> = new Set(),
): Readonly<Record<string, readonly ResolvedReferenceValue[]>> {
  const result: Record<string, ResolvedReferenceValue[]> = Object.fromEntries(
    Object.entries(base).map(([name, values]) => [name, [...values]]),
  );
  for (const [name, values] of Object.entries(override)) {
    if (values.length === 0) {
      continue;
    }
    const attribute = singleAttributes.has(name) ? "single" : "list";
    result[name] = attribute === "single" ? [...values] : [...(result[name] ?? []), ...values];
  }
  return result;
}

function lookupElementReference(
  targetId: string,
  targetContext: string | undefined,
  sourceName: string,
  currentContext: string,
  sourceElementsBySourceAndLocalId: ReadonlyMap<string, ParsedElement>,
  elementsByContextAndLocalId: ReadonlyMap<string, readonly ParsedElement[]>,
  importsBySourceAndAlias: ReadonlyMap<string, ResolvedImport>,
): ParsedElement | undefined {
  if (targetContext !== undefined) {
    return elementsByContextAndLocalId.get(`${targetContext}\0${targetId}`)?.[0];
  }
  return sourceElementsBySourceAndLocalId.get(`${sourceName}\0${targetId}`)
    ?? importsBySourceAndAlias.get(`${sourceName}\0${targetId}`)?.element
    ?? elementsByContextAndLocalId.get(`${currentContext}\0${targetId}`)?.[0];
}

function mergeUniqueElements(
  left: readonly ParsedElement[],
  right: readonly ParsedElement[],
): ParsedElement[] {
  const seen = new Set(left.map((element) => element.id));
  const result = [...left];
  for (const element of right) {
    if (seen.has(element.id)) {
      continue;
    }
    seen.add(element.id);
    result.push(element);
  }
  return result;
}

function addProjectedEdges(
  linkedEdges: LinkedEdge[],
  sourceIdentity: string,
  fromId: string,
  toId: string,
  attributes: Readonly<Record<string, readonly ResolvedReferenceValue[]>>,
  elementsById: ReadonlyMap<string, ParsedElement>,
  resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
  ownerIndependentProjectionKeys: Set<string>,
  typeSystem: TypeSystem,
  diagnostics: LanguageDiagnostic[],
  projectionScope?: ProjectionScope,
  annotations: readonly LinkedAnnotation[] = [],
  projectedAttributes?: Readonly<Record<string, readonly string[]>>,
  projectedOperator?: string,
  visitedProjectionElements = new Set<string>(),
  coverage?: WireDeploymentCoverage,
  projectionOrigin: ProjectionOrigin = { source: fromId, target: toId },
  projectionDeploymentId?: string,
): void {
  for (const [attributeName, values] of Object.entries(attributes)) {
    if (attributeName === "_") {
      continue;
    }
    for (const value of values) {
      if (value.element === undefined) {
        continue;
      }
      if (!isGraphElement(value.element)) {
        continue;
      }
      const effectiveDeploymentId = value.deploymentId ?? projectionDeploymentId;
      const scopedValue = effectiveDeploymentId === undefined ? value : { ...value, deploymentId: effectiveDeploymentId };
      const visitKey = `${fromId}\0${toId}\0${value.element.id}\0${effectiveDeploymentId ?? ""}`;
      if (visitedProjectionElements.has(visitKey)) {
        continue;
      }
      visitedProjectionElements.add(visitKey);
      if (isDirectSlotReferenceSelfProjection(value.element, fromId, toId)) {
        continue;
      }
      const effectiveProjectionScope = projectionScope ?? projectionScopeFor(
        fromId,
        toId,
        scopedValue,
        elementsById,
        resolvedElementAttributes,
        typeSystem,
      );
      const rules = value.element.projectionRules;
      if (typeSystem.typeHasCapability(value.element.type, TYPE_CAPABILITIES.projection)
          && fromId === toId
          && (value.element.parent === fromId
            || (elementsById.get(fromId) !== undefined
              && typeSystem.typeHasCapability(elementsById.get(fromId)!.type, TYPE_CAPABILITIES.infrastructure)))) {
        continue;
      }
      if (typeSystem.typeHasCapability(value.element.type, TYPE_CAPABILITIES.projection)
          && rules.some((rule) => rule.section !== "projection"
            || rule.source.deployment !== undefined
            || rule.target.deployment !== undefined)) {
        continue;
      }
      reportOmittedDeploymentOccurrence(
        fromId,
        toId,
        scopedValue,
        effectiveProjectionScope,
        rules,
        elementsById,
        resolvedElementAttributes,
        typeSystem,
        diagnostics,
        projectionOrigin,
        sourceIdentity,
      );
      if (fromId === toId && rules.some(projectionRuleUsesTo)) {
        if (typeSystem.typeHasCapability(value.element.type, TYPE_CAPABILITIES.projection)
            && value.element.parent === fromId) {
          continue;
        }
        const position = value.line === undefined || value.column === undefined
          ? value.element
          : {
            line: value.line,
            column: value.column,
            ...(value.endLine === undefined ? {} : { endLine: value.endLine }),
            ...(value.endColumn === undefined ? {} : { endColumn: value.endColumn }),
          };
        diagnostics.push({
          code: "PROJECTION_TARGET_REQUIRED",
          message: `Projection for '${value.element.type}' uses '$to' and must be attached to a relationship, not to element '${fromId}'`,
          sourceName: sourceIdentity,
          ...diagnosticPosition(position),
        });
        continue;
      }
      for (const rule of rules) {
        addProjectedRuleEdge(linkedEdges, sourceIdentity, fromId, toId, value.element, rule, elementsById, resolvedElementAttributes, ownerIndependentProjectionKeys, typeSystem, diagnostics, effectiveProjectionScope, annotations, projectedAttributes, projectedOperator, coverage, projectionOrigin);
      }
      addProjectedEdges(
        linkedEdges,
        sourceIdentity,
        fromId,
        toId,
        resolvedElementAttributes.get(value.element.id) ?? {},
        elementsById,
        resolvedElementAttributes,
        ownerIndependentProjectionKeys,
        typeSystem,
        diagnostics,
        effectiveProjectionScope,
        annotations,
        rules.length === 0 ? projectedAttributes : undefined,
        projectedOperator,
        visitedProjectionElements,
        coverage,
        projectionOrigin,
        effectiveDeploymentId,
      );
    }
  }
}

function reportOmittedDeploymentOccurrence(
  fromId: string,
  toId: string,
  projectionValue: ResolvedReferenceValue,
  projectionScope: ProjectionScope | undefined,
  rules: readonly ProjectionRuleDefinition[],
  elementsById: ReadonlyMap<string, ParsedElement>,
  resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
  typeSystem: TypeSystem,
  diagnostics: LanguageDiagnostic[],
  projectionOrigin: ProjectionOrigin,
  sourceIdentity: string,
): void {
  if (projectionValue.deploymentId === undefined || projectionValue.element === undefined || rules.length === 0) return;
  const sourceHasPlacements = endpointPlacementValues(fromId, elementsById, resolvedElementAttributes, typeSystem).length > 0;
  const targetHasPlacements = endpointPlacementValues(toId, elementsById, resolvedElementAttributes, typeSystem).length > 0;
  const sourceMissing = sourceHasPlacements
    && projectionScope?.sourcePlacement === undefined
    && rules.some(projectionRuleUsesFrom);
  const targetMissing = targetHasPlacements
    && projectionScope?.targetPlacement === undefined
    && rules.some(projectionRuleUsesTo);
  if (!sourceMissing && !targetMissing) return;

  const environment = projectionValue.element.context;
  const missing = [
    ...(sourceMissing ? [`source '${fromId}'`] : []),
    ...(targetMissing ? [`target '${toId}'`] : []),
  ];
  const message = `Deployment occurrence for relationship '${fromId} -> ${toId}' is omitted in environment '${environment}' because ${missing.join(" and ")} has no placement there`;
  if (diagnostics.some((diagnostic) => diagnostic.code === "WIRE_DEPLOYMENT_OCCURRENCE_OMITTED"
      && diagnostic.message === message)) return;

  const declaration = projectionOrigin.declaration;
  const fallback = elementsById.get(fromId);
  diagnostics.push({
    level: "NOTE",
    code: "WIRE_DEPLOYMENT_OCCURRENCE_OMITTED",
    message,
    sourceName: declaration?.sourceName ?? fallback?.sourceName ?? sourceIdentity,
    line: declaration?.line ?? fallback?.line ?? 1,
    column: declaration?.column ?? fallback?.column ?? 0,
    ...(declaration?.endLine === undefined ? {} : { endLine: declaration.endLine }),
    ...(declaration?.endColumn === undefined ? {} : { endColumn: declaration.endColumn }),
  });
}

function addProjectedEdgesForValues(
  linkedEdges: LinkedEdge[],
  sourceIdentity: string,
  fromId: string,
  toId: string,
  values: readonly ResolvedReferenceValue[],
  elementsById: ReadonlyMap<string, ParsedElement>,
  resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
  ownerIndependentProjectionKeys: Set<string>,
  typeSystem: TypeSystem,
  diagnostics: LanguageDiagnostic[],
  projectionScope?: ProjectionScope,
  annotations: readonly LinkedAnnotation[] = [],
  projectedAttributes?: Readonly<Record<string, readonly string[]>>,
  projectedOperator?: string,
): void {
  addProjectedEdges(
    linkedEdges,
    sourceIdentity,
    fromId,
    toId,
    { _: values },
    elementsById,
    resolvedElementAttributes,
    ownerIndependentProjectionKeys,
    typeSystem,
    diagnostics,
    projectionScope,
    annotations,
    projectedAttributes,
    projectedOperator,
  );
}

function isDirectSlotReferenceSelfProjection(element: ParsedElement, fromId: string, toId: string): boolean {
  return fromId === toId
    && element.parent === fromId
    && element.scalarAttributes.parentType !== undefined
    && element.scalarAttributes.attributeName !== undefined;
}

function addProjectedRuleEdge(
  linkedEdges: LinkedEdge[],
  sourceIdentity: string,
  fromId: string,
  toId: string,
  projectionElement: ParsedElement,
  rule: ProjectionRuleDefinition,
  elementsById: ReadonlyMap<string, ParsedElement>,
  resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
  ownerIndependentProjectionKeys: Set<string>,
  typeSystem: TypeSystem,
  diagnostics: LanguageDiagnostic[],
  projectionScope?: ProjectionScope,
  annotations: readonly LinkedAnnotation[] = [],
  projectedAttributes?: Readonly<Record<string, readonly string[]>>,
  projectedOperator?: string,
  coverage?: WireDeploymentCoverage,
  projectionOrigin: ProjectionOrigin = { source: fromId, target: toId },
): void {
  if (!validateConcreteProjectionRule(rule, typeSystem, diagnostics)) {
    return;
  }
  const projectionRoot = typeSystem.typeHasCapability(projectionElement.type, TYPE_CAPABILITIES.projection)
      && projectionElement.parent !== undefined
    ? projectionElement.parent
    : projectionElement.id;
  const sources = projectionTerm(rule.source, fromId, toId, projectionElement, elementsById, resolvedElementAttributes, typeSystem, diagnostics, projectionScope);
  const targets = projectionTerm(rule.target, fromId, toId, projectionElement, elementsById, resolvedElementAttributes, typeSystem, diagnostics, projectionScope);
  const preservesLogicalRelationship = projectionRuleHasCapability(
    rule,
    typeSystem,
    OPERATOR_CAPABILITIES.preserveLogicalEdge,
  );
  const effectiveOperator = preservesLogicalRelationship
    ? projectedOperator ?? "->"
    : rule.operator;
  const edgeOwnerPlacement = projectionRuleOwnerPlacement(rule, preservesLogicalRelationship);
  const edgeProjectionScope = projectionPlacementScope(edgeOwnerPlacement, projectionScope);
  const sourcePlacement = projectionPlacementScope(rule.source.placement, projectionScope);
  const targetPlacement = projectionPlacementScope(rule.target.placement, projectionScope);
  const edgeSourceIdentity = projectionPlacementSourceIdentity(edgeOwnerPlacement, fromId, toId, elementsById) ?? sourceIdentity;
  const carriedAttributes = mergeAttributeValues(
    preservesLogicalRelationship ? projectedAttributes : undefined,
    rule.attributes ?? {},
  );
  const originKey = projectionOriginKey(projectionOrigin);
  for (const source of sources) {
    for (const target of targets) {
      if (coverage !== undefined) {
        coverage.projected = true;
      }
      if (!projectionRuleUsesOwner(rule)) {
        const key = `${projectionRoot}\0${source}\0${effectiveOperator}\0${target}\0${preservesLogicalRelationship ? originKey : ""}`;
        if (ownerIndependentProjectionKeys.has(key)) {
          mergeProjectedEdge(
            linkedEdges,
            source,
            effectiveOperator,
            target,
            projectionRoot,
            projectionOrigin,
            annotations,
            carriedAttributes,
          );
          continue;
        }
        ownerIndependentProjectionKeys.add(key);
      }
      const sourceElement = elementsById.get(source);
      const targetElement = elementsById.get(target);
      const operator = sourceElement === undefined || targetElement === undefined
        ? undefined
        : typeSystem.operatorConstructor(effectiveOperator, sourceElement.type, targetElement.type);
      const type = operator?.ownerType ?? effectiveOperator;
      const existingIndex = linkedEdges.findIndex((edge) => edge.projected === true
        && edge.source === source
        && edge.operator === effectiveOperator
        && edge.target === target
        && edge.projectionRoot === projectionRoot
        && edge.projectionScope === edgeProjectionScope
        && edge.sourcePlacement === sourcePlacement
        && edge.targetPlacement === targetPlacement
        && (!preservesLogicalRelationship
          || edge.projectionOrigins?.some((origin) => projectionOriginKey(origin) === originKey) === true));
      if (existingIndex >= 0) {
        const edge = linkedEdges[existingIndex];
        if (edge !== undefined) {
          linkedEdges[existingIndex] = {
            ...edge,
            attributes: mergeAttributeValues(carriedAttributes, edge.attributes),
            annotations: uniqueAnnotations([...(edge.annotations ?? []), ...annotations]),
            projectionOrigins: uniqueProjectionOrigins([...(edge.projectionOrigins ?? []), projectionOrigin]),
          };
        }
        continue;
      }
      linkedEdges.push({
        id: linkedEdgeId([
          "projected",
          edgeSourceIdentity,
          source,
          target,
          effectiveOperator,
          type,
          projectionRoot,
          edgeProjectionScope,
          sourcePlacement,
          targetPlacement,
          preservesLogicalRelationship ? originKey : undefined,
        ]),
        source,
        target,
        originSource: fromId,
        originTarget: toId,
        projectionOrigins: [projectionOrigin],
        projectionRoot,
        operator: effectiveOperator,
        type,
        sourceIdentity: edgeSourceIdentity,
        ...(preservesLogicalRelationship && projectionOrigin.declaration !== undefined
          ? { declaration: projectionOrigin.declaration }
          : {}),
        attributes: carriedAttributes ?? {},
        ...listAttributesProperty(typeSystem, type),
        projected: true,
        ...(edgeProjectionScope === undefined ? {} : { projectionScope: edgeProjectionScope }),
        ...(sourcePlacement === undefined ? {} : { sourcePlacement }),
        ...(targetPlacement === undefined ? {} : { targetPlacement }),
        ...(annotations.length === 0 ? {} : { annotations }),
      });
    }
  }
}

function validateConcreteProjectionRule(
  rule: ProjectionRuleDefinition,
  typeSystem: TypeSystem,
  diagnostics: LanguageDiagnostic[],
): boolean {
  let valid = true;
  if (typeSystem.relationOperatorConstructor(rule.operator) === undefined) {
    diagnostics.push({
      code: "UNSUPPORTED_PROJECTION_OPERATOR",
      message: `Projection operator '${rule.operator}' is not declared for ProjectionTerm`,
      ...(rule.operatorSource ?? { sourceName: "projection", line: 1, column: 1 }),
    });
    valid = false;
  }
  return valid;
}

function mergeProjectedEdge(
  linkedEdges: LinkedEdge[],
  source: string,
  operator: string,
  target: string,
  projectionRoot: string,
  projectionOrigin: ProjectionOrigin,
  annotations: readonly LinkedAnnotation[],
  attributes?: Readonly<Record<string, readonly string[]>>,
): void {
  const index = linkedEdges.findIndex((edge) => edge.projected === true
    && edge.source === source
    && edge.operator === operator
    && edge.target === target
    && edge.projectionRoot === projectionRoot);
  if (index < 0) {
    return;
  }
  const edge = linkedEdges[index];
  if (edge === undefined) {
    return;
  }
  linkedEdges[index] = {
    ...edge,
    attributes: mergeAttributeValues(attributes, edge.attributes),
    annotations: uniqueAnnotations([...(edge.annotations ?? []), ...annotations]),
    projectionOrigins: uniqueProjectionOrigins([...(edge.projectionOrigins ?? []), projectionOrigin]),
  };
}

function uniqueProjectionOrigins(origins: readonly ProjectionOrigin[]): readonly ProjectionOrigin[] {
  const seen = new Set<string>();
  const result: ProjectionOrigin[] = [];
  for (const origin of origins) {
    const key = projectionOriginKey(origin);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(origin);
  }
  return result;
}

function projectionOriginKey(origin: ProjectionOrigin): string {
  const declaration = origin.declaration;
  return [
    origin.source,
    origin.target,
    origin.sourceIdentity ?? "",
    declaration?.sourceName ?? "",
    declaration?.line ?? "",
    declaration?.column ?? "",
    declaration?.endLine ?? "",
    declaration?.endColumn ?? "",
  ].join("\0");
}

function mergeAttributeValues(
  base: Readonly<Record<string, readonly string[]>> | undefined,
  override: Readonly<Record<string, readonly string[]>>,
): Readonly<Record<string, readonly string[]>> {
  if (base === undefined || Object.keys(base).length === 0) {
    return override;
  }
  if (Object.keys(override).length === 0) {
    return base;
  }
  return { ...base, ...override };
}

function uniqueAnnotations(annotations: readonly LinkedAnnotation[]): readonly LinkedAnnotation[] {
  const seen = new Set<string>();
  const result: LinkedAnnotation[] = [];
  for (const annotation of annotations) {
    const key = `${annotation.name}\0${annotation.value ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(annotation);
  }
  return result;
}

function listAttributesProperty(
  typeSystem: TypeSystem,
  type: string,
): { readonly listAttributes?: readonly string[] } {
  const listAttributes = [...typeSystem.attributes(type).values()]
    .filter((attribute) => attribute.list === true)
    .map((attribute) => attribute.name);
  return listAttributes.length === 0 ? {} : { listAttributes };
}

function referenceAttributesProperty(attributes: Readonly<Record<string, readonly ResolvedReferenceValue[]>>): { readonly referenceAttributes?: readonly string[] } {
  const referenceAttributes = Object.keys(attributes);
  return referenceAttributes.length === 0 ? {} : { referenceAttributes };
}

function projectionRuleUsesOwner(rule: ProjectionRuleDefinition): boolean {
  return projectionTermUsesOwner(rule.source) || projectionTermUsesOwner(rule.target);
}

function projectionRuleUsesTo(rule: ProjectionRuleDefinition): boolean {
  return projectionTermUsesTo(rule.source) || projectionTermUsesTo(rule.target);
}

function projectionRuleUsesFrom(rule: ProjectionRuleDefinition): boolean {
  return projectionTermUsesFrom(rule.source) || projectionTermUsesFrom(rule.target);
}

function projectionTermUsesTo(term: ProjectionTermDefinition): boolean {
  return term.kind === "to";
}

function projectionTermUsesFrom(term: ProjectionTermDefinition): boolean {
  return term.kind === "from";
}

function projectionTermUsesOwner(term: ProjectionTermDefinition): boolean {
  return term.placement === "source" || term.placement === "target";
}

function projectionTerm(
  term: ProjectionTermDefinition,
  fromId: string,
  toId: string,
  projectionElement: ParsedElement,
  elementsById: ReadonlyMap<string, ParsedElement>,
  resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
  typeSystem: TypeSystem,
  diagnostics: LanguageDiagnostic[],
  projectionScope?: ProjectionScope,
): readonly string[] {
  switch (term.kind) {
    case "from":
      return [fromId];
    case "to":
      return [toId];
    case "this":
      return resolveThisProjectionTerm(projectionElement, elementsById, typeSystem);
    case "attribute":
      return resolveAttributeProjectionTerm(term, projectionElement, elementsById, resolvedElementAttributes, typeSystem, diagnostics);
    case "slot":
      return resolveSlotProjectionTerm(term, projectionElement, elementsById, resolvedElementAttributes, typeSystem, diagnostics);
  }
}

function resolveThisProjectionTerm(
  projectionElement: ParsedElement,
  elementsById: ReadonlyMap<string, ParsedElement>,
  typeSystem: TypeSystem,
): readonly string[] {
  return typeSystem.typeHasCapability(projectionElement.type, TYPE_CAPABILITIES.projection)
      && projectionElement.parent !== undefined
    ? [projectionElement.parent]
    : [projectionElement.id];
}

function resolveAttributeProjectionTerm(
  term: ProjectionTermDefinition,
  projectionElement: ParsedElement,
  elementsById: ReadonlyMap<string, ParsedElement>,
  resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
  typeSystem: TypeSystem,
  diagnostics: LanguageDiagnostic[],
): readonly string[] {
  const owners = resolveThisProjectionTerm(projectionElement, elementsById, typeSystem);
  const scopedValues = owners.flatMap((owner) => resolvedElementAttributes.get(owner)?.[term.value] ?? []);
  if (scopedValues.length > 0) {
    return uniqueIds(scopedValues.map((value) => value.id));
  }
  const localElement = [...elementsById.values()]
    .find((candidate) => candidate.context === projectionElement.context && candidate.localId === term.value);
  if (localElement !== undefined) {
    return [localElement.id];
  }
  diagnostics.push({
    code: "UNDECLARED_IDENTIFIER",
    message: `Projection term '${term.value}' is not declared as an attribute of '${projectionElement.localId}' or as an element in environment '${projectionElement.context}'`,
    ...(term.source ?? { sourceName: projectionElement.sourceName, line: projectionElement.line, column: projectionElement.column }),
  });
  return [];
}

function uniqueIds(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function projectionRuleOwnerPlacement(
  rule: ProjectionRuleDefinition,
  preservesLogicalRelationship: boolean,
): "source" | "target" {
  return preservesLogicalRelationship
    ? rule.target.placement
    : rule.source.placement;
}

function projectionRuleHasCapability(
  rule: ProjectionRuleDefinition,
  typeSystem: TypeSystem,
  capability: string,
): boolean {
  const operator = typeSystem.relationOperatorConstructor(rule.operator);
  return operator !== undefined && typeSystem.operatorHasCapability(operator, capability);
}

function projectionScopeFor(
  fromId: string,
  toId: string,
  projectionValue: ResolvedReferenceValue,
  elementsById: ReadonlyMap<string, ParsedElement>,
  resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
  typeSystem: TypeSystem,
): ProjectionScope | undefined {
  const sourcePlacement = endpointPlacement(
    fromId,
    projectionValue.deploymentId,
    projectionValue.element?.context,
    elementsById,
    resolvedElementAttributes,
    typeSystem,
  );
  const targetPlacement = endpointPlacement(
    toId,
    projectionValue.deploymentId,
    projectionValue.element?.context,
    elementsById,
    resolvedElementAttributes,
    typeSystem,
  );
  return sourcePlacement === undefined && targetPlacement === undefined
    ? undefined
    : {
      ...(sourcePlacement === undefined ? {} : { sourcePlacement }),
      ...(targetPlacement === undefined ? {} : { targetPlacement }),
    };
}

function endpointPlacement(
  endpointId: string,
  deploymentId: string | undefined,
  projectionContext: string | undefined,
  elementsById: ReadonlyMap<string, ParsedElement>,
  resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
  typeSystem: TypeSystem,
): string | undefined {
  const placements = endpointPlacementValues(endpointId, elementsById, resolvedElementAttributes, typeSystem);
  if (deploymentId !== undefined) {
    const inDeployment = uniqueIds(placements
      .filter((placement) => placement.deploymentId === deploymentId)
      .map((placement) => placement.id));
    if (inDeployment.length === 1) {
      return inDeployment[0];
    }
  }
  if (projectionContext !== undefined) {
    const inContext = uniqueIds(placements
      .filter((placement) => placement.element?.context === projectionContext)
      .map((placement) => placement.id));
    if (inContext.length === 1) {
      return inContext[0];
    }
  }
  const uniquePlacements = uniqueIds(placements.map((placement) => placement.id));
  return uniquePlacements.length === 1 ? uniquePlacements[0] : undefined;
}

function endpointPlacementValues(
  endpointId: string,
  elementsById: ReadonlyMap<string, ParsedElement>,
  resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
  typeSystem: TypeSystem,
): readonly ResolvedReferenceValue[] {
  const visited = new Set<string>();
  let current = elementsById.get(endpointId);
  while (current !== undefined && !visited.has(current.id)) {
    visited.add(current.id);
    const placementAttribute = typeSystem.attributeWithCapability(
      current.type,
      ATTRIBUTE_CAPABILITIES.placementOwner,
    )?.name ?? RUNS_ON_ATTRIBUTE;
    const placements = resolvedElementAttributes.get(current.id)?.[placementAttribute] ?? [];
    if (placements.length > 0) {
      return placements;
    }
    current = current.parent === undefined ? undefined : elementsById.get(current.parent);
  }
  return [];
}

function projectionPlacementScope(
  placement: "source" | "target",
  projectionScope?: ProjectionScope,
): string | undefined {
  return placement === "source"
    ? projectionScope?.sourcePlacement
    : projectionScope?.targetPlacement;
}

function projectionPlacementSourceIdentity(
  placement: "source" | "target",
  fromId: string,
  toId: string,
  elementsById: ReadonlyMap<string, ParsedElement>,
): string | undefined {
  return elementsById.get(placement === "target" ? toId : fromId)?.sourceName;
}

function resolveSlotProjectionTerm(
  term: ProjectionTermDefinition,
  projectionElement: ParsedElement,
  elementsById: ReadonlyMap<string, ParsedElement>,
  resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
  typeSystem: TypeSystem,
  diagnostics: LanguageDiagnostic[],
): readonly string[] {
  const ownerAttribute = term.ownerAttribute;
  if (ownerAttribute === undefined) {
    return [];
  }
  const parentType = projectionElement.scalarAttributes.parentType;
  const attributeName = projectionElement.scalarAttributes.attributeName;
  if (parentType === undefined || attributeName === undefined) {
    diagnostics.push({
      code: "TYPE_MISMATCH",
      message: `Projection term '${term.value}' expects a TypeSlotReference element`,
      sourceName: projectionElement.sourceName,
      ...diagnosticPosition(projectionElement),
    });
    return [];
  }
  const owner = projectionElement.parent === undefined ? undefined : elementsById.get(projectionElement.parent);
  if (owner === undefined) {
    diagnostics.push({
      code: "TYPE_MISMATCH",
      message: `Projection term '${term.value}' expects an owner element`,
      sourceName: projectionElement.sourceName,
      ...diagnosticPosition(projectionElement),
    });
    return [];
  }
  const domain = resolvedElementAttributes.get(owner.id)?.[ownerAttribute] ?? [];
  const result: string[] = [];
  for (const value of domain) {
    if (value.element === undefined) {
      continue;
    }
    if (!typeSystem.isAssignable(value.element.type, parentType)) {
      diagnostics.push({
        code: "TYPE_MISMATCH",
        message: `Projection owner attribute '${ownerAttribute}' contains '${value.element.type}', expected '${parentType}'`,
        sourceName: projectionElement.sourceName,
        ...diagnosticPosition(projectionElement),
      });
      continue;
    }
    const resolvedSlot = resolvedElementAttributes.get(value.element.id)?.[attributeName] ?? [];
    if (resolvedSlot.length === 0) {
      diagnostics.push({
        code: "REQUIRED_ATTRIBUTE_MISSING",
        message: `Environment '${value.element.localId}' does not provide slot '${attributeName}'`,
        sourceName: projectionElement.sourceName,
        ...diagnosticPosition(projectionElement),
      });
      continue;
    }
    result.push(...resolvedSlot.map((slotValue) => slotValue.id));
  }
  return result;
}

function duplicateLinkedEdges(edges: readonly LinkedEdge[]): readonly DuplicateLinkedEdgeGroup[] {
  const groups = new Map<string, LinkedEdge[]>();
  for (const edge of edges) {
    addToGroup(groups, duplicateEdgeKey(edge), edge);
  }
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      source: group[0]!.source,
      operator: group[0]!.operator,
      target: group[0]!.target,
      edges: group,
    }));
}

function duplicateEdgeKey(edge: LinkedEdge): string {
  return `${edge.source}\0${edge.operator}\0${edge.target}`;
}

function isGraphElement(element: ParsedElement): boolean {
  return element.graphElement !== false;
}

function isProjectionRoot(element: ParsedElement, slotDomainTypes: ReadonlySet<string>, typeSystem: TypeSystem): boolean {
  return isGraphElement(element)
    && element.projectionRoot !== false
    && !typeSystem.typeHasCapability(element.type, TYPE_CAPABILITIES.projection)
    && !typeSystem.typeHasCapability(element.type, TYPE_CAPABILITIES.route)
    && !isSlotDomainElement(element, slotDomainTypes, typeSystem);
}

function isSlotDomainElement(
  element: ParsedElement,
  slotDomainTypes: ReadonlySet<string>,
  typeSystem: TypeSystem,
): boolean {
  for (const slotDomainType of slotDomainTypes) {
    if (typeSystem.isAssignable(element.type, slotDomainType)) {
      return true;
    }
  }
  return false;
}

function edgeCandidate(input: EdgeMaterializationInput): LinkedEdge {
  const edge = input.edge;
  const attributes = flattenAttributes(input.edgeScalarAttributes, input.edgeAttributes);
  const semanticAttributes = semanticAttributesFor(input.edgeType, attributes, input.typeSystem);
  const semanticAttributeNames = semanticAttributeNamesFor(input.edgeType, input.typeSystem);
  return {
    id: linkedEdgeId([
      "authored",
      edge.sourceName,
      edge.line,
      edge.column,
      edge.source,
      input.target.id,
      edge.operator,
      input.edgeType,
    ]),
    source: edge.source,
    target: input.target.id,
    operator: edge.operator,
    type: input.edgeType,
    sourceIdentity: edge.sourceName,
    declaration: sourceLocation(edge.sourceName, edge),
    attributes,
    ...(Object.keys(semanticAttributes).length === 0 ? {} : { semanticAttributes }),
    ...(Object.keys(semanticAttributeNames).length === 0 ? {} : { semanticAttributeNames }),
    ...listAttributesProperty(input.typeSystem, input.edgeType),
    ...referenceAttributesProperty(input.edgeAttributes),
    ...(edge.note === undefined ? {} : { note: edge.note }),
    ...(edge.noteSource === undefined ? {} : { noteSource: edge.noteSource }),
    ...(edge.annotations.length === 0 ? {} : { annotations: edge.annotations }),
  };
}

function semanticAttributesFor(
  type: string,
  attributes: Readonly<Record<string, readonly string[]>>,
  typeSystem: TypeSystem,
  computedSemanticAttributeNames: Readonly<Record<string, string>> = {},
): Readonly<Record<string, readonly string[]>> {
  const semantic: Record<string, readonly string[]> = {};
  for (const attribute of typeSystem.attributes(type).values()) {
    const values = attributes[attribute.name];
    if (values === undefined) {
      continue;
    }
    for (const capability of attribute.capabilities ?? []) {
      semantic[capability] = [...(semantic[capability] ?? []), ...values];
    }
  }
  for (const [capability, attributeName] of Object.entries(computedSemanticAttributeNames)) {
    const values = attributes[attributeName];
    if (values !== undefined) {
      semantic[capability] = values;
    }
  }
  return semantic;
}

function semanticAttributeNamesFor(
  type: string,
  typeSystem: TypeSystem,
  computedSemanticAttributeNames: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> {
  return {
    ...Object.fromEntries([...typeSystem.attributes(type).values()].flatMap((attribute) =>
      (attribute.capabilities ?? []).map((capability) => [capability, attribute.name] as const)
    )),
    ...computedSemanticAttributeNames,
  };
}

class RegisteredOperatorImplementation implements LinkOperatorImplementation {
  constructor(
    private readonly id: string,
    private readonly implementation: OperatorImplementationV1,
  ) {}

  materializeEdge(input: EdgeMaterializationInput): EdgeMaterializationResult {
    const candidate = edgeCandidate(input);
    const result = this.implementation.invoke({
      execution: { implementation: this.id, mode: "link" },
      invocation: {
        operator: input.operator,
        sourceIdentity: input.edge.sourceName,
        ...(candidate.declaration === undefined ? {} : { declaration: candidate.declaration }),
        from: input.from,
        to: input.to,
        target: input.to,
        edge: candidate,
        attributes: candidate.attributes,
        ...(candidate.annotations === undefined ? {} : { annotations: candidate.annotations }),
      },
      projector: EMPTY_PROJECTION_API,
      from: input.from,
      to: input.to,
      scope: { sourceIdentity: input.edge.sourceName },
    });
    const edges = result.edges ?? [];
    if (edges.length > 1) {
      return {
        diagnostics: [invalidOperatorResultDiagnostic(
          input.operator,
          input.edge.sourceName,
          input.edge,
          `returned ${edges.length} edges where at most one is allowed during link materialization`,
        ), ...(result.diagnostics ?? [])],
      };
    }
    return {
      ...(edges[0] === undefined ? {} : { edge: edges[0] }),
      ...(result.diagnostics === undefined ? {} : { diagnostics: result.diagnostics }),
    };
  }

  applyElementPrefix(input: ElementPrefixInput): ElementPrefixResult {
    const result = this.implementation.invoke({
      execution: { implementation: this.id, mode: "link" },
      invocation: {
        operator: input.operator,
        sourceIdentity: input.sourceName,
        declaration: sourceLocation(input.sourceName, input.sourcePosition),
        attributes: {},
      },
      projector: EMPTY_PROJECTION_API,
      scope: { sourceIdentity: input.sourceName },
    });
    const diagnostics = result.diagnostics ?? [];
    return {
      accepted: !diagnostics.some((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"),
      ...(diagnostics.length === 0 ? {} : { diagnostics }),
    };
  }
}

const EMPTY_PROJECTION_API = Object.freeze({
  resolveSlot: () => [],
  project: () => ({}),
});

class UnsupportedOperatorImplementation implements LinkOperatorImplementation {
  materializeEdge(input: EdgeMaterializationInput): EdgeMaterializationResult {
    return unsupportedEdgeOperatorResult(input.operator, input.edge, "edge materialization");
  }

  applyElementPrefix(input: ElementPrefixInput): ElementPrefixResult {
    return unsupportedOperatorResult(input.operator, input.prefix, "element materialization", input.sourceName, input.sourcePosition);
  }
}

const unsupportedOperatorImplementation = new UnsupportedOperatorImplementation();

function implementationFor(
  operator: OperatorDefinition,
  typeSystem: TypeSystem,
  registry: OperatorImplementationRegistry,
): LinkOperatorImplementation {
  const id = implementationId(operator) ?? defaultImplementationId(operator, typeSystem);
  const implementation = id === undefined ? undefined : registry.resolve(id);
  return id === undefined || implementation === undefined
    ? unsupportedOperatorImplementation
    : new RegisteredOperatorImplementation(id, implementation);
}

function implementationId(operator: OperatorDefinition): string | undefined {
  return operator.implementation;
}

function defaultImplementationId(operator: OperatorDefinition, typeSystem: TypeSystem): string | undefined {
  if (operator.implementation !== undefined) {
    return operator.implementation;
  }
  if (typeSystem.isAssignable(operator.ownerType, EDGE)) {
    return CORE_EDGE_IMPLEMENTATION;
  }
  if (typeSystem.isAssignable(operator.ownerType, ELEMENT_TYPE)) {
    return CORE_ELEMENT_IMPLEMENTATION;
  }
  return undefined;
}

function invalidOperatorResultDiagnostic(
  operator: OperatorDefinition,
  sourceName: string,
  sourcePosition: SourcePosition,
  detail: string,
): LanguageDiagnostic {
  return {
    code: "INVALID_OPERATOR_IMPLEMENTATION_RESULT",
    message: `Operator '${operator.spelling}' implementation '${operator.implementation ?? "<default>"}' ${detail}`,
    sourceName,
    ...diagnosticPosition(sourcePosition),
  };
}

function unsupportedEdgeOperatorResult(
  operator: OperatorDefinition,
  edge: ParsedEdge,
  phase: string,
): EdgeMaterializationResult {
  return {
    diagnostics: [{
      code: "UNSUPPORTED_OPERATOR_IMPLEMENTATION",
      message: `Operator '${edge.operator}' uses unsupported implementation '${implementationId(operator) ?? "<none>"}' for ${phase}`,
      sourceName: edge.sourceName,
      ...diagnosticPosition(edge),
    }],
  };
}

function unsupportedOperatorResult(
  operator: OperatorDefinition,
  spelling: string,
  phase: string,
  sourceName: string,
  sourcePosition: SourcePosition,
): ElementPrefixResult {
  return {
    accepted: false,
    diagnostics: [{
      code: "UNSUPPORTED_OPERATOR_IMPLEMENTATION",
      message: `Operator '${spelling}' uses unsupported implementation '${implementationId(operator) ?? "<none>"}' for ${phase}`,
      sourceName,
      ...diagnosticPosition(sourcePosition),
    }],
  };
}

function inspectGraph(
  graph: IndexedGraph,
  elements: readonly ParsedElement[],
  edges: readonly LinkedEdge[],
  resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
  typeSystem: TypeSystem,
  deployedElementIds: ReadonlySet<string>,
  wireDeploymentCoverage: readonly WireDeploymentCoverage[],
  diagnostics: LanguageDiagnostic[],
): void {
  if (diagnostics.some((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR")) {
    return;
  }
  const context: LinkIntrospectionContext = {
    graph,
    elements,
    edges,
    resolvedElementAttributes,
    typeSystem,
    deployedElementIds,
    wireDeploymentCoverage,
    diagnostics,
  };
  for (const rule of LINK_INTROSPECTION_RULES) {
    rule(context);
  }
}

interface LinkIntrospectionContext {
  readonly graph: IndexedGraph;
  readonly elements: readonly ParsedElement[];
  readonly edges: readonly LinkedEdge[];
  readonly resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>;
  readonly typeSystem: TypeSystem;
  readonly deployedElementIds: ReadonlySet<string>;
  readonly wireDeploymentCoverage: readonly WireDeploymentCoverage[];
  readonly diagnostics: LanguageDiagnostic[];
}

type LinkIntrospectionRule = (context: LinkIntrospectionContext) => void;

const LINK_INTROSPECTION_RULES: readonly LinkIntrospectionRule[] = [
  ({ elements, resolvedElementAttributes, typeSystem, diagnostics }) =>
    reportDuplicateDeploymentProfileMembers(elements, resolvedElementAttributes, typeSystem, diagnostics),
  ({ graph, elements, edges, resolvedElementAttributes, diagnostics }) =>
    reportIsolatedElements(graph, elements, edges, resolvedElementAttributes, diagnostics),
  ({ graph, edges, diagnostics }) => reportShadowedLowerLevelEdges(graph, edges, diagnostics),
  ({ wireDeploymentCoverage, diagnostics }) => reportIncompleteWireDeployments(wireDeploymentCoverage, diagnostics),
  ({ elements, typeSystem, deployedElementIds, diagnostics }) =>
    reportIncompleteElementDeployments(elements, typeSystem, deployedElementIds, diagnostics),
];

function reportDuplicateDeploymentProfileMembers(
  elements: readonly ParsedElement[],
  resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
  typeSystem: TypeSystem,
  diagnostics: LanguageDiagnostic[],
): void {
  for (const profile of elements) {
    const membersAttribute = typeSystem.attributeWithCapability(
      profile.type,
      ATTRIBUTE_CAPABILITIES.deploymentProfileMembers,
    );
    if (membersAttribute === undefined) {
      continue;
    }
    const seen = new Set<string>();
    for (const member of resolvedElementAttributes.get(profile.id)?.[membersAttribute.name] ?? []) {
      if (!seen.has(member.id)) {
        seen.add(member.id);
        continue;
      }
      diagnostics.push({
        level: "WARNING",
        code: "DEPLOYMENT_PROFILE_MEMBER_DUPLICATE",
        message: `Deployment '${member.element?.localId ?? localName(member.id)}' is listed more than once in profile '${profile.localId}'`,
        sourceName: profile.sourceName,
        ...diagnosticPosition({
          line: member.line ?? profile.idLine,
          column: member.column ?? profile.idColumn,
          ...(member.endLine === undefined ? {} : { endLine: member.endLine }),
          ...(member.endColumn === undefined ? {} : { endColumn: member.endColumn }),
        }),
      });
    }
  }
}

function reportIncompleteWireDeployments(
  coverage: readonly WireDeploymentCoverage[],
  diagnostics: LanguageDiagnostic[],
): void {
  if (!coverage.some((item) => item.deploymentDefined)) {
    return;
  }
  for (const item of coverage) {
    if (item.deploymentDefined && item.projected) {
      continue;
    }
    const source = localName(item.linked.source);
    const target = localName(item.linked.target);
    const declaration = item.linked.declaration;
    diagnostics.push({
      level: "WARNING",
      code: item.deploymentDefined ? "WIRE_DEPLOYMENT_NOT_PROJECTED" : "WIRE_MISSING_DEPLOYMENT",
      message: item.deploymentDefined
        ? `Relationship from '${source}' to '${target}' has deployment configuration but produces no physical projection`
        : `Relationship from '${source}' to '${target}' has no deployment configuration and is omitted from deployment views`,
      sourceName: item.parsed.sourceName,
      line: declaration?.line ?? item.parsed.line,
      column: declaration?.column ?? item.parsed.column,
      ...(declaration?.endLine === undefined ? {} : { endLine: declaration.endLine }),
      ...(declaration?.endColumn === undefined ? {} : { endColumn: declaration.endColumn }),
    });
  }
}

function reportIncompleteElementDeployments(
  elements: readonly ParsedElement[],
  typeSystem: TypeSystem,
  deployedElementIds: ReadonlySet<string>,
  diagnostics: LanguageDiagnostic[],
): void {
  const candidates = elements.flatMap((element) => {
    const family = elementDeploymentFamily(element, typeSystem);
    return family === undefined ? [] : [{ element, family }];
  });
  const activeFamilies = new Set(candidates
    .filter(({ element }) => element.deploymentActions.length > 0)
    .map(({ family }) => family));
  for (const { element, family } of candidates) {
    if (!activeFamilies.has(family) || deployedElementIds.has(element.id)) {
      continue;
    }
    diagnostics.push({
      level: "WARNING",
      code: element.deploymentActions.length > 0 ? "ELEMENT_DEPLOYMENT_NOT_PHYSICAL" : "ELEMENT_MISSING_DEPLOYMENT",
      message: element.deploymentActions.length > 0
        ? `Element '${element.localId}' has deployment configuration but resolves to no physical infrastructure`
        : `Element '${element.localId}' has no deployment configuration and is omitted from deployment views`,
      sourceName: element.sourceName,
      ...diagnosticPosition({
        line: element.idLine,
        column: element.idColumn,
        ...(element.idEndLine === undefined ? {} : { endLine: element.idEndLine }),
        ...(element.idEndColumn === undefined ? {} : { endColumn: element.idEndColumn }),
      }),
    });
  }
}

function deploymentViewLogicalEndpoint(
  elementId: string,
  elementsById: ReadonlyMap<string, ParsedElement>,
  typeSystem: TypeSystem,
): string | undefined {
  let element = elementsById.get(elementId);
  while (element !== undefined) {
    if (typeSystem.typeHasCapability(element.type, TYPE_CAPABILITIES.deploymentEndpoint)
        || elementTypeOrKindIsExplicitlyExternal(element.type, element.scalarAttributes.kind, typeSystem)) {
      return element.id;
    }
    element = element.parent === undefined ? undefined : elementsById.get(element.parent);
  }
  return undefined;
}

function elementDeploymentFamily(element: ParsedElement, typeSystem: TypeSystem): string | undefined {
  if (typeSystem.typeHasCapability(element.type, TYPE_CAPABILITIES.deploymentElement)
      || typeSystem.typeHasCapability(element.type, TYPE_CAPABILITIES.deploymentProfile)) {
    return undefined;
  }
  if (elementTypeOrKindIsExplicitlyExternal(element.type, element.scalarAttributes.kind, typeSystem)
      && element.deploymentActions.length === 0) {
    return undefined;
  }
  const family = [element.type, ...typeSystem.baseTypes(element.type)]
    .find((candidate) => typeSystem.declaresCapability(candidate, TYPE_CAPABILITIES.deploymentFamily));
  if (family !== undefined) {
    return family;
  }
  return typeSystem.isAssignable(element.type, ELEMENT_TYPE) ? element.type : undefined;
}

function reportIsolatedElements(
  graph: IndexedGraph,
  elements: readonly ParsedElement[],
  edges: readonly LinkedEdge[],
  resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
  diagnostics: LanguageDiagnostic[],
): void {
  const referenced = new Set<string>();
  for (const relationId of graph.relationsOfKind("REFERENCES")) {
    const relation = graph.relation(relationId);
    if (relation !== undefined) {
      referenced.add(relation.source);
      referenced.add(relation.target);
    }
  }
  for (const edge of edges) {
    referenced.add(edge.source);
    referenced.add(edge.target);
    if (edge.projectionRoot !== undefined) referenced.add(edge.projectionRoot);
  }
  for (const [elementId, attributes] of resolvedElementAttributes) {
    for (const values of Object.values(attributes)) {
      if (values.length === 0) {
        continue;
      }
      referenced.add(elementId);
      for (const value of values) {
        referenced.add(value.id);
      }
    }
  }
  for (const element of elements) {
    if (element.anonymous || containsNestedElement(graph, element.id) || referenced.has(element.id)) {
      continue;
    }
    diagnostics.push({
      level: "NOTE",
      code: "ISOLATED_ELEMENT",
      message: `Element '${element.localId}' is not referenced by any element and does not reference any element`,
      sourceName: element.sourceName,
      ...diagnosticPosition({
        line: element.idLine,
        column: element.idColumn,
        ...(element.idEndLine === undefined ? {} : { endLine: element.idEndLine }),
        ...(element.idEndColumn === undefined ? {} : { endColumn: element.idEndColumn }),
      }),
    });
  }
}

function reportShadowedLowerLevelEdges(
  graph: IndexedGraph,
  edges: readonly LinkedEdge[],
  diagnostics: LanguageDiagnostic[],
): void {
  const parentByChild = parentByChildFromGraph(graph);
  const logicalEdges = edges.filter((edge) => !edge.projected);
  const firstLower = new Map<string, LinkedEdge>();
  function record(lower: LinkedEdge, source: string | undefined, target: string | undefined): void {
    if (source === undefined || target === undefined) return;
    const key = `${lower.type}\0${source}\0${target}`;
    if (!firstLower.has(key)) firstLower.set(key, lower);
  }
  for (const lower of logicalEdges) {
    const sourceParent = parentByChild.get(lower.source);
    const targetParent = parentByChild.get(lower.target);
    record(lower, sourceParent, lower.target);
    record(lower, lower.source, targetParent);
    record(lower, sourceParent, targetParent);
  }
  for (const higher of logicalEdges) {
    const lower = firstLower.get(`${higher.type}\0${higher.source}\0${higher.target}`);
    if (lower !== undefined) {
      diagnostics.push({
        level: "WARNING",
        code: "EDGE_SHADOWS_LOWER_LEVEL_EDGE",
        message: `Edge from '${localName(higher.source)}' to '${localName(higher.target)}' shadows lower-level edge from '${localName(lower.source)}' to '${localName(lower.target)}'`,
        sourceName: higher.sourceIdentity,
        line: higher.declaration?.line ?? 1,
        column: higher.declaration?.column ?? 1,
        ...(higher.declaration?.endLine === undefined ? {} : { endLine: higher.declaration.endLine }),
        ...(higher.declaration?.endColumn === undefined ? {} : { endColumn: higher.declaration.endColumn }),
      });
    }
  }
}

function parentByChildFromGraph(graph: IndexedGraph): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const relationId of graph.relationsOfKind("CONTAINS")) {
    const relation = graph.relation(relationId);
    if (relation !== undefined) {
      result.set(relation.target, relation.source);
    }
  }
  return result;
}

function containsNestedElement(graph: IndexedGraph, node: string): boolean {
  for (const relationId of graph.outgoingRelations(node, "CONTAINS")) {
    const relation = graph.relation(relationId);
    if (relation !== undefined && graph.node(relation.target)?.kind === "element") {
      return true;
    }
  }
  return false;
}

function localName(id: string): string {
  return id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
}

function resolveEdgeTarget(
  edge: ParsedEdge,
  currentContext: string,
  sourceElementsBySourceAndLocalId: ReadonlyMap<string, ParsedElement>,
  elementsByContextAndLocalId: ReadonlyMap<string, readonly ParsedElement[]>,
  importsBySourceAndAlias: ReadonlyMap<string, ResolvedImport>,
  diagnostics: LanguageDiagnostic[],
): ParsedElement | undefined {
  if (edge.targetId === "_") {
    diagnostics.push(missingElement(
      edge,
      "Anonymous instance '_' cannot be referenced; give the target a named id",
      "ANONYMOUS_INSTANCE_NOT_REFERENCEABLE",
    ));
    return undefined;
  }
  if (edge.targetContext !== undefined) {
    const explicit = elementsByContextAndLocalId.get(`${edge.targetContext}\0${edge.targetId}`)?.[0];
    if (explicit !== undefined) {
      return explicit;
    }
    diagnostics.push(missingElement(edge, `Element '${edge.targetId}' is not declared in context '${edge.targetContext}'`, "UNDECLARED_IDENTIFIER"));
    return undefined;
  }

  const sameSource = sourceElementsBySourceAndLocalId.get(`${edge.sourceName}\0${edge.targetId}`);
  if (sameSource !== undefined) {
    return sameSource;
  }

  const imported = importsBySourceAndAlias.get(`${edge.sourceName}\0${edge.targetId}`);
  if (imported?.element !== undefined) {
    return imported.element;
  }

  const sameContext = elementsByContextAndLocalId.get(`${currentContext}\0${edge.targetId}`)?.[0];
  if (sameContext !== undefined) {
    diagnostics.push(missingElement(edge, `Element '${edge.targetId}' is declared in another source of context '${currentContext}' and must be imported explicitly`, "MISSING_IMPORT"));
    return undefined;
  }

  diagnostics.push(missingElement(edge, `Element '${edge.targetId}' is not declared`, "UNDECLARED_IDENTIFIER"));
  return undefined;
}

function missingElement(edge: ParsedEdge, message: string, code: string): LanguageDiagnostic {
  return {
    code,
    message,
    sourceName: edge.sourceName,
    ...diagnosticPosition({
      line: edge.targetLine,
      column: edge.targetColumn,
      ...(edge.targetEndLine === undefined ? {} : { endLine: edge.targetEndLine }),
      ...(edge.targetEndColumn === undefined ? {} : { endColumn: edge.targetEndColumn }),
    }),
  };
}

function sourceLocation(sourceName: string, item: SourcePosition): SourceLocation {
  return {
    sourceName,
    line: item.line,
    column: item.column,
    ...(item.endLine === undefined ? {} : { endLine: item.endLine }),
    ...(item.endColumn === undefined ? {} : { endColumn: item.endColumn }),
  };
}

function diagnosticPosition(item: SourcePosition): Pick<LanguageDiagnostic, "line" | "column" | "endLine" | "endColumn"> {
  return {
    line: item.line,
    column: item.column,
    ...(item.endLine === undefined ? {} : { endLine: item.endLine }),
    ...(item.endColumn === undefined ? {} : { endColumn: item.endColumn }),
  };
}

type RuleNode = AntlrParseTreeLike & {
  readonly ruleIndex: number;
  getText(): string;
  getChildCount(): number;
  getChild(index: number): AntlrParseTreeLike | null;
};

function children(root: AntlrParseTreeLike, rule: string): RuleNode[] {
  return directChildrenByRule<RuleNode>(root, rule);
}

function firstChild(root: AntlrParseTreeLike, rule: string): RuleNode | undefined {
  return firstChildByRule<RuleNode>(root, rule);
}

function firstDescendant(root: AntlrParseTreeLike, rule: string): RuleNode | undefined {
  return firstDescendantByRule<RuleNode>(root, rule);
}

function terminalText(root: RuleNode, tokenType: number): string | undefined {
  const token = directTerminalTokens(root).find((item) => tokenTypeOf(item) === tokenType);
  return token === undefined ? undefined : tokenText(token);
}

function textValue(root: RuleNode | undefined): string {
  if (root === undefined) {
    return "";
  }
  return directTerminalTokens(root)
    .filter((item) => tokenTypeOf(item) === InsightParser.TEXT)
    .map(tokenText)
    .join("");
}

function concreteProjectionRule(
  ruleNode: RuleNode,
  sourceName: string,
  section: ProjectionSection,
): ProjectionRuleDefinition {
  const terms = children(ruleNode, "relationTerm");
  const operator = firstChild(ruleNode, "operatorIdentifier");
  const attributes = concreteProjectionRuleAttributes(ruleNode);
  return {
    section,
    source: concreteProjectionTerm(terms[0], sourceName),
    operator: operator?.getText() ?? "",
    operatorSource: sourceLocation(sourceName, position(operator, sourceName)),
    target: concreteProjectionTerm(terms[1], sourceName),
    ...(Object.keys(attributes).length === 0 ? {} : { attributes }),
  };
}

function concreteProjectionRuleFromObject(
  object: RuleNode,
  sourceName: string,
  section: ProjectionSection,
): ProjectionRuleDefinition {
  const source = firstChild(object, "namedPrefixOperatorInvocation");
  const operator = firstChild(object, "elementConstructor");
  const target = firstChild(object, "identifierDeclaration");
  const body = firstChild(object, "objectBody");
  const attributes = body === undefined ? {} : Object.fromEntries(
    children(body, "architectureBodyItem").flatMap((item) => {
      const assignment = firstChild(item, "assignment");
      return assignment === undefined ? [] : [[
        firstChild(assignment, "attributeName")?.getText() ?? "",
        [textValue(firstChild(assignment, "textValue"))],
      ]];
    }),
  );
  return {
    section,
    source: {
      kind: "attribute",
      value: source?.getText() ?? "",
      placement: "source",
      source: sourceLocation(sourceName, position(source, sourceName)),
    },
    operator: operator?.getText() ?? "",
    operatorSource: sourceLocation(sourceName, position(operator, sourceName)),
    target: {
      kind: "attribute",
      value: target?.getText() ?? "",
      placement: "source",
      source: sourceLocation(sourceName, position(target, sourceName)),
    },
    ...(Object.keys(attributes).length === 0 ? {} : { attributes }),
  };
}

function concreteProjectionRuleAttributes(ruleNode: RuleNode): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(
    children(ruleNode, "assignment").map((assignment) => [
      firstChild(assignment, "attributeName")?.getText() ?? "",
      [textValue(firstChild(assignment, "textValue"))],
    ]),
  );
}

function concreteProjectionTerm(termNode: RuleNode | undefined, sourceName: string): ProjectionTermDefinition {
  const projectionTermNode = termNode === undefined ? undefined : firstChild(termNode, "relationReference");
  const qualifierNode = termNode === undefined ? undefined : firstChild(termNode, "relationDeploymentQualifier");
  const environmentNode = qualifierNode === undefined ? undefined : firstChild(qualifierNode, "identifierReference");
  const importNode = qualifierNode === undefined ? undefined : firstChild(qualifierNode, "anonymousImportDeclaration");
  const importedEnvironment = importNode === undefined ? undefined : firstChild(importNode, "contextReference");
  const deployment = qualifierNode === undefined ? undefined : {
    environment: importedEnvironment?.getText() ?? environmentNode?.getText() ?? "",
    ...(importedEnvironment === undefined ? {} : { deployment: environmentNode?.getText() ?? "" }),
    source: sourceLocation(sourceName, position(qualifierNode, sourceName)),
  };
  const value = projectionTermNode?.getText() ?? "";
  const base = {
    placement: value === "$to" ? "target" as const : "source" as const,
    ...(deployment === undefined ? {} : { deployment }),
    source: sourceLocation(sourceName, position(projectionTermNode, sourceName)),
  };
  const slot = projectionTermNode === undefined ? undefined : firstChild(projectionTermNode, "relationSlotDereference");
  if (slot !== undefined) {
    const ownerAttribute = firstChild(slot, "identifier")?.getText();
    return {
      ...base,
      kind: "slot",
      value: "$slot",
      ...(ownerAttribute === undefined ? {} : { ownerAttribute }),
    };
  }
  if (value === "$from") {
    return { ...base, kind: "from", value };
  }
  if (value === "$to") {
    return { ...base, kind: "to", value };
  }
  if (value === "$this") {
    return { ...base, kind: "this", value };
  }
  return { ...base, kind: "attribute", value };
}

function projectionSection(listName: string): ProjectionSection {
  if (listName === "outbound" || listName === "transit" || listName === "inbound") {
    return listName;
  }
  return "projection";
}

function position(node: unknown, _sourceName: string): SourcePosition {
  if (typeof node === "object" && node !== null) {
    const range = sourceRangeOf(node as AntlrParseTreeLike);
    return {
      line: range.line,
      column: range.column,
      endLine: range.endLine,
      endColumn: range.endColumn,
    };
  }
  return { line: 1, column: 1 };
}

function operatorInvocationHeaderPosition(invocation: RuleNode, sourceName: string): SourcePosition {
  const syntax = readOperatorInvocation(invocation, InsightParser.ruleNames);
  const start = position(syntax?.operator ?? invocation, sourceName);
  const end = position(
    firstChild(invocation, "note")
      ?? syntax?.anonymousImport
      ?? syntax?.target
      ?? syntax?.operator
      ?? invocation,
    sourceName,
  );
  return {
    line: start.line,
    column: start.column,
    endLine: end.endLine ?? end.line,
    endColumn: end.endColumn ?? end.column + 1,
  };
}

function prefixedPosition<K extends string>(
  prefix: K,
  node: unknown,
  sourceName: string,
): Record<`${K}Line`, number>
  & Record<`${K}Column`, number>
  & Partial<Record<`${K}EndLine`, number>>
  & Partial<Record<`${K}EndColumn`, number>> {
  const item = position(node, sourceName);
  return {
    [`${prefix}Line`]: item.line,
    [`${prefix}Column`]: item.column,
    ...(item.endLine === undefined ? {} : { [`${prefix}EndLine`]: item.endLine }),
    ...(item.endColumn === undefined ? {} : { [`${prefix}EndColumn`]: item.endColumn }),
  } as Record<`${K}Line`, number>
    & Record<`${K}Column`, number>
    & Partial<Record<`${K}EndLine`, number>>
    & Partial<Record<`${K}EndColumn`, number>>;
}

function addToGroup<K, V>(groups: Map<K, V[]>, key: K, value: V): void {
  const group = groups.get(key) ?? [];
  group.push(value);
  groups.set(key, group);
}
