import {
  BaseErrorListener,
  CharStream,
  CommonTokenStream,
  RecognitionException,
  Recognizer,
  type ATNSimulator,
  type Token,
} from "antlr4ng";
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
  DuplicateLinkedEdgeGroup,
  PresentationDefinition,
  ProjectionRuleDefinition,
  ProjectionTermDefinition,
  ResolvedPresentation,
  SourceLocation,
} from "./contracts.js";
import { InsightLexer } from "./generated/InsightLexer.js";
import { InsightParser } from "./generated/InsightParser.js";
import { IndexedGraph, type GraphNode, type GraphRelation, type RelationKind } from "./indexed-graph.js";
import { CONTEXT, EDGE, NOTHING, TypeSystem } from "./type-system.js";

const ELEMENT_TYPE = "Element";
const DEPLOYMENT_PROFILE_TYPE = "DeploymentProfile";
const RUNS_ON_ATTRIBUTE = "runsOn";
const ENVIRONMENTS_ATTRIBUTE = "environments";
const DEPLOYMENT_PROFILE_ATTRIBUTE = "profile";

interface ParsedDocument {
  readonly sourceName: string;
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

interface ParsedElement {
  readonly id: string;
  readonly context: string;
  readonly localId: string;
  readonly type: string;
  readonly constructor: string;
  readonly sourceName: string;
  readonly anonymous: boolean;
  graphElement?: boolean;
  projectionRoot?: boolean;
  readonly operatorDefinition?: OperatorDefinition;
  readonly parent?: string;
  readonly attributes: Record<string, ParsedAttributeValue[]>;
  readonly referenceAttributePositions: Record<string, SourcePosition>;
  readonly scalarAttributes: Record<string, string>;
  readonly scalarAttributePositions: Record<string, SourcePosition>;
  readonly assignedScalarAttributes: Set<string>;
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
  readonly context: ParsedContext;
  readonly imports: ParsedImport[];
  readonly elements: ParsedElement[];
  readonly edges: ParsedEdge[];
  readonly extensions: ParsedExtension[];
  readonly diagnostics: LanguageDiagnostic[];
  readonly anonymousCounters: Map<string, number>;
}

interface ResolvedImport {
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
  readonly line?: number;
  readonly column?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

interface LinkExecutionContext {
  readonly typeSystem: TypeSystem;
  readonly elementsById: ReadonlyMap<string, ParsedElement>;
  readonly resolvedElementAttributes: Map<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>;
  readonly linkedEdges: LinkedEdge[];
  readonly ownerIndependentProjectionKeys: Set<string>;
  readonly edgeScopesByCarrierId: ReadonlyMap<string, readonly ProjectionScope[]>;
  readonly placementByElementAndScope: Map<string, string>;
  readonly diagnostics: LanguageDiagnostic[];
}

interface ProjectionScope {
  readonly sourceIdentity: string;
  readonly fromId: string;
  readonly toId: string;
  readonly slotParent?: ParsedElement;
  readonly annotations?: readonly LinkedAnnotation[];
}

interface PendingProjection {
  readonly sourceIdentity: string;
  readonly fromId: string;
  readonly toId: string;
  readonly attributes: Readonly<Record<string, readonly ResolvedReferenceValue[]>>;
  readonly annotations?: readonly LinkedAnnotation[];
}

interface EdgeMaterializationInput {
  readonly edge: ParsedEdge;
  readonly operator: OperatorDefinition;
  readonly target: ParsedElement;
  readonly edgeType: string;
  readonly edgeScalarAttributes: Readonly<Record<string, string>>;
  readonly edgeAttributes: Readonly<Record<string, readonly ResolvedReferenceValue[]>>;
  readonly typeSystem: TypeSystem;
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

interface SlotCarrierInput {
  readonly carrier: ParsedElement;
  readonly operator: OperatorDefinition;
  readonly context: LinkExecutionContext;
}

interface LinkOperatorImplementation {
  readonly slotCarrierPhase?: number;
  materializeEdge(input: EdgeMaterializationInput): EdgeMaterializationResult;
  applyElementPrefix(input: ElementPrefixInput): ElementPrefixResult;
  applySlotCarrier(input: SlotCarrierInput): void;
}

export function linkProject(request: LinkProjectRequest): LinkProjectResult {
  const typeSystem = new TypeSystem(request.snapshot);
  const anonymousCounters = new Map<string, number>();
  const documents = request.sources.map((source) => parseDocument(source.sourceName, source.source, typeSystem, anonymousCounters));
  const diagnostics: LanguageDiagnostic[] = [];

  const elementsByContextAndLocalId = new Map<string, ParsedElement[]>();
  const sourceElementsBySourceAndLocalId = new Map<string, ParsedElement>();
  for (const element of documents.flatMap((document) => document.elements)) {
    indexElement(element, elementsByContextAndLocalId, sourceElementsBySourceAndLocalId);
  }
  applyExtensions(documents, typeSystem, elementsByContextAndLocalId, sourceElementsBySourceAndLocalId, diagnostics);
  diagnostics.unshift(...documents.flatMap((document) => document.diagnostics));
  const elements = documents.flatMap((document) => document.elements);
  reportDuplicateElements(elementsByContextAndLocalId, diagnostics);

  const imports = resolveImports(documents, elementsByContextAndLocalId, diagnostics);
  const importsBySourceAndAlias = new Map<string, ResolvedImport>();
  for (const item of imports) {
    importsBySourceAndAlias.set(`${item.sourceName}\0${item.alias}`, item);
  }

  const linkedEdges: LinkedEdge[] = [];
  const ownerIndependentProjectionKeys = new Set<string>();
  const edgeScopesByCarrierId = new Map<string, ProjectionScope[]>();
  const pendingProjections: PendingProjection[] = [];
  const linkedElementsById = new Map<string, ParsedElement>();
  for (const element of elements) {
    linkedElementsById.set(element.id, element);
  }
  const resolvedElementAttributes = new Map<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>();
  for (const element of elements) {
    resolvedElementAttributes.set(
      element.id,
      resolveAttributes(element, element.type, element.attributes, element.referenceAttributePositions, element.scalarAttributes, element.scalarAttributePositions, element.context, sourceElementsBySourceAndLocalId, elementsByContextAndLocalId, importsBySourceAndAlias, typeSystem, diagnostics),
    );
  }

  for (const document of documents) {
    for (const edge of document.edges) {
      const target = resolveEdgeTarget(edge, document.context.id, sourceElementsBySourceAndLocalId, elementsByContextAndLocalId, importsBySourceAndAlias, diagnostics);
      if (target === undefined) {
        continue;
      }
      const operator = typeSystem.operatorConstructor(edge.operator, edge.sourceType, target.type);
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
      const edgeType = operator?.ownerType ?? edge.operator;
      const edgeScalarAttributes = { ...(operator?.defaults ?? {}), ...edge.scalarAttributes };
      const edgeAttributes = resolveAttributes(edge, edgeType, edge.attributes, edge.referenceAttributePositions, edgeScalarAttributes, edge.scalarAttributePositions, document.context.id, sourceElementsBySourceAndLocalId, elementsByContextAndLocalId, importsBySourceAndAlias, typeSystem, diagnostics);
      const materialized = implementationFor(operator, typeSystem).materializeEdge({
        edge,
        operator,
        target,
        edgeType,
        edgeScalarAttributes,
        edgeAttributes,
        typeSystem,
      });
      diagnostics.push(...(materialized.diagnostics ?? []));
      if (materialized.edge !== undefined) {
        linkedEdges.push(materialized.edge);
        addEdgeScopes(edgeScopesByCarrierId, edgeAttributes, {
          sourceIdentity: edge.sourceName,
          fromId: edge.source,
          toId: target.id,
          ...(materialized.edge.annotations === undefined ? {} : { annotations: materialized.edge.annotations }),
        });
        pendingProjections.push({
          sourceIdentity: edge.sourceName,
          fromId: edge.source,
          toId: target.id,
          attributes: edgeAttributes,
          ...(materialized.edge.annotations === undefined ? {} : { annotations: materialized.edge.annotations }),
        });
      }
    }
  }
  const linkExecutionContext: LinkExecutionContext = {
    typeSystem,
    elementsById: linkedElementsById,
    resolvedElementAttributes,
    linkedEdges,
    ownerIndependentProjectionKeys,
    edgeScopesByCarrierId,
    placementByElementAndScope: new Map(),
    diagnostics,
  };
  const slotCarriers = elements
    .flatMap((carrier) => carrier.operatorDefinition === undefined ? [] : [{
      carrier,
      operator: carrier.operatorDefinition,
      implementation: implementationFor(carrier.operatorDefinition, typeSystem),
    }]);
  slotCarriers.sort((left, right) => (left.implementation.slotCarrierPhase ?? 1) - (right.implementation.slotCarrierPhase ?? 1));
  for (const carrier of slotCarriers) {
    carrier.implementation.applySlotCarrier({
      carrier: carrier.carrier,
      operator: carrier.operator,
      context: linkExecutionContext,
    });
  }
  for (const projection of pendingProjections) {
    addProjectedEdges(linkedEdges, projection.sourceIdentity, projection.fromId, projection.toId, projection.attributes, linkedElementsById, resolvedElementAttributes, ownerIndependentProjectionKeys, typeSystem, diagnostics, undefined, projection.annotations);
  }
  const slotDomainTypes = typeSystem.slotDomainTypes();
  for (const element of elements) {
    if (!isProjectionRoot(element, slotDomainTypes, typeSystem)) {
      continue;
    }
    addProjectedEdges(linkedEdges, element.sourceName, element.id, element.id, resolvedElementAttributes.get(element.id) ?? {}, linkedElementsById, resolvedElementAttributes, ownerIndependentProjectionKeys, typeSystem, diagnostics);
  }
  const duplicateEdges = duplicateLinkedEdges(linkedEdges);
  const presentations = buildPresentationIndex(request.snapshot.presentations ?? [], typeSystem, diagnostics);
  const graph = buildIndexedGraph(documents, elements, imports, linkedEdges, typeSystem);
  const graphElements = elements.filter(isGraphElement);
  inspectGraph(graph, graphElements, linkedEdges, resolvedElementAttributes, diagnostics);
  const tabRoots = tabRootsBySource(documents, elementsByContextAndLocalId);
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

  const contexts: LinkedContext[] = documents.map((document) => ({
    id: document.context.id,
    type: document.context.type,
    sourceIdentity: document.sourceName,
    declaration: sourceLocation(document.sourceName, document.context),
    attributes: flattenAttributes(document.context.scalarAttributes, {}),
  }));

  return {
    diagnostics,
    graph,
    contexts,
    elements: graphElements.map((element) => ({
      id: element.id,
      context: element.context,
      localId: element.localId,
      type: element.type,
      constructor: element.constructor,
      sourceIdentity: element.sourceName,
      declaration: sourceLocation(element.sourceName, element),
      ...(element.anonymous ? { anonymous: true } : {}),
      ...(element.parent === undefined ? {} : { parent: element.parent }),
      baseTypes: typeSystem.baseTypes(element.type),
      attributes: flattenAttributes(element.scalarAttributes, resolvedElementAttributes.get(element.id) ?? {}),
      ...listAttributesProperty(typeSystem, element.type),
      ...referenceAttributesProperty(resolvedElementAttributes.get(element.id) ?? {}),
      ...(element.note === undefined ? {} : { note: element.note }),
      ...(element.noteSource === undefined ? {} : { noteSource: element.noteSource }),
      ...(element.annotations.length === 0 ? {} : { annotations: element.annotations }),
    })),
    imports: imports.map((item) => ({
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
    })),
    edges: linkedEdges,
    tabRoots,
    duplicateEdges,
    presentations,
  };
}

function parseDocument(sourceName: string, source: string, typeSystem: TypeSystem, anonymousCounters: Map<string, number>): ParsedDocument {
  const diagnostics: LanguageDiagnostic[] = [];
  const lexer = new InsightLexer(CharStream.fromString(source));
  lexer.removeErrorListeners();
  lexer.addErrorListener(new LinkerErrorListener(sourceName, diagnostics));

  const tokenStream = new CommonTokenStream(lexer);
  const parser = new InsightParser(tokenStream);
  parser.removeErrorListeners();
  parser.addErrorListener(new LinkerErrorListener(sourceName, diagnostics));

  const tree = parser.insight();
  const architecture = firstDescendant(tree, "architectureFile");
  const contextDeclaration = architecture === undefined ? undefined : firstChild(architecture, "contextDeclaration");
  const contextId = contextDeclaration === undefined ? sourceName : firstChild(contextDeclaration, "contextDeclarationName")?.getText() ?? sourceName;
  const contextType = typeSystem.findConstructor("context", NOTHING)?.ownerType ?? CONTEXT;
  const contextPosition = position(contextDeclaration, sourceName);
  const document: MutableParsedDocument = {
    sourceName,
    context: {
      id: contextId,
      type: contextType,
      line: contextPosition.line,
      column: contextPosition.column,
      scalarAttributes: {},
      scalarAttributePositions: {},
      assignedScalarAttributes: new Set(),
    },
    imports: [],
    elements: [],
    edges: [],
    extensions: [],
    diagnostics,
    anonymousCounters,
  };

  if (architecture === undefined) {
    return document;
  }

  const contextBody = contextDeclaration === undefined ? undefined : firstChild(contextDeclaration, "objectBody");
  if (contextBody !== undefined) {
    collectBodyItems(contextBody, contextType, undefined, document, typeSystem);
  }

  for (const item of children(architecture, "architectureTopLevelItem")) {
    collectTopLevelItem(item, document, typeSystem);
  }
  return document;
}

function nextAnonymousLocalId(document: MutableParsedDocument): string {
  const next = (document.anonymousCounters.get(document.context.id) ?? 0) + 1;
  document.anonymousCounters.set(document.context.id, next);
  return `_anonymous_${next}`;
}

function collectTopLevelItem(item: RuleNode, document: MutableParsedDocument, typeSystem: TypeSystem): void {
  const importDeclaration = firstChild(item, "namedImportDeclaration");
  if (importDeclaration !== undefined) {
    const importedReference = firstChild(importDeclaration, "identifierReference");
    const contextReference = firstChild(importDeclaration, "contextReference");
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
      collectObject(object, document.context.type, undefined, document, typeSystem, annotations(annotatedObject, document));
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
): void {
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

  const annotatedObject = firstChild(item, "annotatedObjectDeclaration");
  if (annotatedObject !== undefined) {
    const object = firstChild(annotatedObject, "objectDeclaration");
    if (object !== undefined) {
      const element = collectObject(object, ownerType, owner, document, typeSystem, annotations(annotatedObject, document));
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
  if (owner !== undefined) {
    if (owner.attributes[listName] !== undefined) {
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

      const annotatedObject = firstChild(bodyItem, "annotatedObjectDeclaration");
      if (annotatedObject !== undefined) {
        const object = firstChild(annotatedObject, "objectDeclaration");
        if (object !== undefined) {
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
      }
    }
  }
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

  const element = collectImplicitObjectElement(list, attributeNameNode, constructor, owner, document);
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
  if (constructors.length > 1) {
    document.diagnostics.push({
      code: "CONSTRUCTOR_AMBIGUOUS",
      message: `Type '${attributeType}' has multiple constructors for implicit attribute '${attributeName}': ${constructors.map((constructor) => `'${constructor.spelling}'`).join(", ")}`,
      sourceName: document.sourceName,
      ...position(attributeNameNode, document.sourceName),
    });
    return undefined;
  }
  return constructors[0]!;
}

function collectImplicitObjectElement(
  list: RuleNode,
  attributeNameNode: RuleNode | undefined,
  constructor: ConstructorDefinition,
  parent: ParsedElement,
  document: MutableParsedDocument,
): ParsedElement {
  const localId = nextAnonymousLocalId(document);
  const element: ParsedElement = {
    id: `${document.context.id}/${localId}`,
    context: document.context.id,
    localId,
    type: constructor.ownerType,
    constructor: constructor.spelling,
    sourceName: document.sourceName,
    anonymous: true,
    parent: parent.id,
    attributes: {},
    referenceAttributePositions: {},
    scalarAttributes: { ...(constructor.defaults ?? {}) },
    scalarAttributePositions: {},
    assignedScalarAttributes: new Set(),
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
  const constructor = firstChild(object, "elementConstructor")?.getText() ?? "";
  const identifierDeclaration = firstChild(object, "identifierDeclaration");
  const declaredId = identifierDeclaration?.getText() ?? "";
  if (constructor.length === 0 || declaredId.length === 0) {
    return undefined;
  }
  const anonymous = declaredId === "_";

  const typeConstructor = typeSystem.findConstructor(constructor, parentType);
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
  const localId = anonymous ? nextAnonymousLocalId(document) : declaredId;
  const baseType = typeConstructor.ownerType;
  const prefix = firstChild(object, "namedPrefixOperatorInvocation")?.getText();
  const prefixNode = firstChild(object, "namedPrefixOperatorInvocation");
  const prefixOperator = prefix === undefined ? undefined : typeSystem.operatorConstructor(prefix, parentType, baseType);
  if (prefixOperator !== undefined) {
    const prefixResult = implementationFor(prefixOperator, typeSystem).applyElementPrefix({
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
    ...(parent === undefined ? {} : { parent: parent.id }),
    attributes: {},
    referenceAttributePositions: {},
    scalarAttributes: { ...(typeConstructor?.defaults ?? {}), ...(prefixOperator?.defaults ?? {}) },
    scalarAttributePositions: {},
    assignedScalarAttributes: new Set(),
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
  if (isDeploymentProfileReferenceOperator(slotOperator)) {
    return collectDirectReferenceSlotOperatorObject(
      object,
      slotOperator,
      slotName,
      parent,
      document,
      annotations,
    );
  }
  const slotAttribute = typeSystem.attribute(slotOperator.targetType, slotName);
  if (slotAttribute === undefined) {
    document.diagnostics.push({
      code: "ATTRIBUTE_NOT_DECLARED",
      message: `Slot '${slotName}' is not declared on type '${slotOperator.targetType}'`,
      sourceName: document.sourceName,
      ...position(firstChild(object, "identifierDeclaration"), document.sourceName),
    });
    return undefined;
  }
  const slotValueType = slotAttribute.list === true
    ? slotAttribute.listElementType ?? slotAttribute.type
    : slotAttribute.type;
  const localId = nextAnonymousLocalId(document);
  const identifierDeclaration = firstChild(object, "identifierDeclaration");
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

function collectDirectReferenceSlotOperatorObject(
  object: RuleNode,
  slotOperator: OperatorDefinition,
  targetId: string,
  parent: ParsedElement | undefined,
  document: MutableParsedDocument,
  annotations: readonly LinkedAnnotation[],
): ParsedElement | undefined {
  if (parent === undefined) {
    return undefined;
  }
  const identifierDeclaration = firstChild(object, "identifierDeclaration");
  const localId = nextAnonymousLocalId(document);
  const element: ParsedElement = {
    id: `${document.context.id}/${localId}`,
    context: document.context.id,
    localId,
    type: slotOperator.ownerType,
    constructor: slotOperator.spelling,
    sourceName: document.sourceName,
    anonymous: true,
    graphElement: false,
    projectionRoot: false,
    operatorDefinition: slotOperator,
    parent: parent.id,
    attributes: {
      [DEPLOYMENT_PROFILE_ATTRIBUTE]: [{
        targetId,
        ...position(identifierDeclaration, document.sourceName),
      }],
    },
    referenceAttributePositions: {
      [DEPLOYMENT_PROFILE_ATTRIBUTE]: position(identifierDeclaration, document.sourceName),
    },
    scalarAttributes: {
      ...(slotOperator.defaults ?? {}),
      parentType: slotOperator.targetType,
      attributeName: DEPLOYMENT_PROFILE_ATTRIBUTE,
      attributeType: slotOperator.targetType,
    },
    scalarAttributePositions: {
      parentType: position(identifierDeclaration, document.sourceName),
      attributeName: position(identifierDeclaration, document.sourceName),
      attributeType: position(identifierDeclaration, document.sourceName),
    },
    assignedScalarAttributes: new Set(),
    annotations,
    ...noteProperty(object, document.sourceName),
    ...position(object, document.sourceName),
    ...prefixedPosition("id", identifierDeclaration, document.sourceName),
  };
  document.elements.push(element);
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
): void {
  const targetReference = firstChild(invocation, "identifierReference");
  const targetId = targetReference?.getText() ?? "";
  const targetPosition = position(targetReference, document.sourceName);
  const anonymousImport = firstChild(invocation, "anonymousImportDeclaration");
  const attributes: Record<string, ParsedAttributeValue[]> = {};
  const referenceAttributePositions: Record<string, SourcePosition> = {};
  const scalarAttributes: Record<string, string> = {};
  const scalarAttributePositions: Record<string, SourcePosition> = {};
  const assignedScalarAttributes = new Set<string>();
  const body = firstChild(invocation, "objectBody");
  const edgeOperator = firstChild(invocation, "operatorIdentifier")?.getText() ?? "";
  if (body !== undefined) {
    collectReferenceAttributes(body, owner, edgeOperator, attributes, referenceAttributePositions, scalarAttributes, scalarAttributePositions, assignedScalarAttributes, document, typeSystem);
  }
  document.edges.push({
    sourceName: document.sourceName,
    source: owner.id,
    sourceType: owner.type,
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
    annotations,
    ...noteProperty(invocation, document.sourceName),
    ...position(invocation, document.sourceName),
  });
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
    if (collectImplicitReferenceObjectAttribute(list, listName, listNameNode, owner, edgeOperator, attributes, referenceAttributePositions, document, typeSystem)) {
      continue;
    }
    referenceAttributePositions[listName] = position(listNameNode, document.sourceName);
    for (const listItem of children(list, "listBodyItem")) {
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
): boolean {
  if (attributeName.length === 0 || namedListHasDirectValue(list)) {
    return false;
  }
  const attributeTypes = unique([
    ...typeSystem.operatorConstructorsFrom(owner.type)
      .filter((operator) => operator.spelling === edgeOperator)
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
): Readonly<Record<string, readonly ResolvedReferenceValue[]>> {
  const result: Record<string, ResolvedReferenceValue[]> = {};
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
    if (attribute.type !== "Text" && attribute.type !== "text") {
      diagnostics.push({
        code: "TYPE_MISMATCH",
        message: `Attribute '${name}' on type '${ownerType}' expects a slot`,
        sourceName: owner.sourceName,
        ...diagnosticPosition(scalarPosition),
      });
    }
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
    if (expectedType === undefined || expectedType === "Text" || expectedType === "text") {
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
  projectionScope?: string,
  annotations: readonly LinkedAnnotation[] = [],
  visitedProjectionElements = new Set<string>(),
): void {
  for (const values of Object.values(attributes)) {
    for (const value of values) {
      if (value.element === undefined) {
        continue;
      }
      if (!isGraphElement(value.element)) {
        continue;
      }
      const visitKey = `${fromId}\0${toId}\0${value.element.id}`;
      if (visitedProjectionElements.has(visitKey)) {
        continue;
      }
      visitedProjectionElements.add(visitKey);
      if (isDirectSlotReferenceSelfProjection(value.element, fromId, toId)) {
        continue;
      }
      const rules = typeSystem.projectionRules(value.element.type);
      if (fromId === toId && rules.some(projectionRuleUsesTo)) {
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
        addProjectedRuleEdge(linkedEdges, sourceIdentity, fromId, toId, value.element, rule, elementsById, resolvedElementAttributes, ownerIndependentProjectionKeys, typeSystem, diagnostics, projectionScope, annotations);
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
        projectionScope,
        annotations,
        visitedProjectionElements,
      );
    }
  }
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
  projectionScope?: string,
  annotations: readonly LinkedAnnotation[] = [],
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
  );
}

function addEdgeScopes(
  scopesByCarrierId: Map<string, ProjectionScope[]>,
  attributes: Readonly<Record<string, readonly ResolvedReferenceValue[]>>,
  scope: ProjectionScope,
): void {
  for (const values of Object.values(attributes)) {
    for (const value of values) {
      if (value.element === undefined) {
        continue;
      }
      const scopes = scopesByCarrierId.get(value.element.id) ?? [];
      scopesByCarrierId.set(value.element.id, [...scopes, scope]);
    }
  }
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
  projectionScope?: string,
  annotations: readonly LinkedAnnotation[] = [],
): void {
  const sources = projectionTerm(rule.source, fromId, toId, projectionElement, elementsById, resolvedElementAttributes, diagnostics);
  const targets = projectionTerm(rule.target, fromId, toId, projectionElement, elementsById, resolvedElementAttributes, diagnostics);
  for (const source of sources) {
    for (const target of targets) {
      if (!projectionRuleUsesOwner(rule)) {
        const key = `${projectionElement.id}\0${source}\0${rule.operator}\0${target}`;
        if (ownerIndependentProjectionKeys.has(key)) {
          mergeProjectedEdgeAnnotations(linkedEdges, source, rule.operator, target, annotations);
          continue;
        }
        ownerIndependentProjectionKeys.add(key);
      }
      const sourceElement = elementsById.get(source);
      const targetElement = elementsById.get(target);
      const operator = sourceElement === undefined || targetElement === undefined
        ? undefined
        : typeSystem.operatorConstructor(rule.operator, sourceElement.type, targetElement.type);
      const type = operator?.ownerType ?? rule.operator;
      const existingIndex = linkedEdges.findIndex((edge) => edge.projected === true
        && edge.source === source
        && edge.operator === rule.operator
        && edge.target === target
        && edge.projectionScope === projectionScope);
      if (existingIndex >= 0) {
        const edge = linkedEdges[existingIndex];
        if (edge !== undefined) {
          linkedEdges[existingIndex] = {
            ...edge,
            annotations: uniqueAnnotations([...(edge.annotations ?? []), ...annotations]),
          };
        }
        continue;
      }
      linkedEdges.push({
        source,
        target,
        originSource: fromId,
        originTarget: toId,
        operator: rule.operator,
        type,
        sourceIdentity,
        attributes: {},
        ...listAttributesProperty(typeSystem, type),
        projected: true,
        ...(projectionScope === undefined ? {} : { projectionScope }),
        ...(annotations.length === 0 ? {} : { annotations }),
      });
    }
  }
}

function mergeProjectedEdgeAnnotations(
  linkedEdges: LinkedEdge[],
  source: string,
  operator: string,
  target: string,
  annotations: readonly LinkedAnnotation[],
): void {
  if (annotations.length === 0) {
    return;
  }
  const index = linkedEdges.findIndex((edge) => edge.projected === true
    && edge.source === source
    && edge.operator === operator
    && edge.target === target);
  if (index < 0) {
    return;
  }
  const edge = linkedEdges[index];
  if (edge === undefined) {
    return;
  }
  linkedEdges[index] = {
    ...edge,
    annotations: uniqueAnnotations([...(edge.annotations ?? []), ...annotations]),
  };
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

function projectionTermUsesTo(term: ProjectionTermDefinition): boolean {
  return term.kind === "to";
}

function projectionTermUsesOwner(term: ProjectionTermDefinition): boolean {
  return term.kind === "from" || term.kind === "to" || term.kind === "slot";
}

function projectionTerm(
  term: ProjectionTermDefinition,
  fromId: string,
  toId: string,
  projectionElement: ParsedElement,
  elementsById: ReadonlyMap<string, ParsedElement>,
  resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
  diagnostics: LanguageDiagnostic[],
): readonly string[] {
  switch (term.kind) {
    case "from":
      return [fromId];
    case "to":
      return [toId];
    case "this":
      return [projectionElement.id];
    case "attribute":
      return resolvedElementAttributes.get(projectionElement.id)?.[term.value]?.map((value) => value.id) ?? [];
    case "slot":
      return resolveSlotProjectionTerm(term, projectionElement, elementsById, resolvedElementAttributes, diagnostics);
  }
}

function resolveSlotProjectionTerm(
  term: ProjectionTermDefinition,
  projectionElement: ParsedElement,
  elementsById: ReadonlyMap<string, ParsedElement>,
  resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
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
    if (value.element.type !== parentType) {
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

const PRESENTATION_FIELDS = new Set(["header", "subtitle", "body"]);
const PRESENTATION_SECTIONS = new Set(["light", "dark", "graphviz"]);
const PRESENTATION_SECTION_PROPERTIES = new Set([
  "fill",
  "stroke",
  "text",
  "bgcolor",
  "shape",
  "style",
  "width",
  "height",
  "rankdir",
  "overlap",
  "newrank",
  "nodesep",
  "ranksep",
  "splines",
  "labelloc",
  "minlen",
  "fontsize",
  "penwidth",
  "visible",
]);

function buildPresentationIndex(
  presentations: readonly PresentationDefinition[],
  typeSystem: TypeSystem,
  diagnostics: LanguageDiagnostic[],
): Readonly<Record<string, ResolvedPresentation>> {
  const byName = new Map(presentations.map((presentation) => [presentation.name, presentation]));
  for (const presentation of presentations) {
    validatePresentationDefinition(presentation, typeSystem, diagnostics);
  }
  const resolved = new Map<string, ResolvedPresentation>();
  for (const name of byName.keys()) {
    resolvePresentation(name, byName, typeSystem, resolved, new Set(), diagnostics);
  }
  return Object.fromEntries(resolved);
}

function validatePresentationDefinition(
  presentation: PresentationDefinition,
  typeSystem: TypeSystem,
  diagnostics: LanguageDiagnostic[],
): void {
  if (!typeSystem.isDeclared(presentation.name)) {
    diagnostics.push({
      code: "UNKNOWN_PRESENTATION_TYPE",
      message: `Presentation target type '${presentation.name}' is not declared`,
      ...presentationDiagnosticLocation(presentation.source),
    });
    return;
  }
  const attributes = typeSystem.attributes(presentation.name);
  for (const [field, value] of Object.entries(presentation.assignments ?? {})) {
    if (!PRESENTATION_FIELDS.has(field)) {
      diagnostics.push({
        code: "ATTRIBUTE_NOT_DECLARED",
        message: `Presentation field '${field}' is not declared`,
        ...presentationDiagnosticLocation(presentation.assignmentPositions?.[field], presentation.source),
      });
      continue;
    }
    if (attributes.size > 0 && !attributes.has(value) && !attributeExistsOnDescendant(typeSystem, presentation.name, value)) {
      diagnostics.push({
        code: "ATTRIBUTE_NOT_DECLARED",
        message: `Attribute '${value}' is not declared on type '${presentation.name}'`,
        ...presentationDiagnosticLocation(presentation.assignmentValuePositions?.[field], presentation.assignmentPositions?.[field], presentation.source),
      });
    }
  }
  for (const [section, assignments] of Object.entries(presentation.sections ?? {})) {
    if (!PRESENTATION_SECTIONS.has(section)) {
      diagnostics.push({
        code: "ATTRIBUTE_NOT_DECLARED",
        message: `Presentation section '${section}' is not declared`,
        ...presentationDiagnosticLocation(presentation.sectionPositions?.[section], presentation.source),
      });
      continue;
    }
    for (const property of Object.keys(assignments)) {
      if (!PRESENTATION_SECTION_PROPERTIES.has(property)) {
        diagnostics.push({
          code: "ATTRIBUTE_NOT_DECLARED",
          message: `Presentation section property '${property}' is not declared`,
          ...presentationDiagnosticLocation(presentation.sectionPropertyPositions?.[section]?.[property], presentation.sectionPositions?.[section], presentation.source),
        });
      }
    }
  }
}

function presentationDiagnosticLocation(
  ...locations: Array<SourceLocation | undefined>
): Pick<LanguageDiagnostic, "sourceName" | "line" | "column" | "endLine" | "endColumn"> {
  return locations.find((location) => location !== undefined) ?? {
    sourceName: "presentation",
    line: 1,
    column: 1,
  };
}

function attributeExistsOnDescendant(typeSystem: TypeSystem, type: string, attribute: string): boolean {
  for (const candidate of typeSystem.declaredTypes()) {
    if (candidate !== type
      && typeSystem.baseTypes(candidate).includes(type)
      && typeSystem.attribute(candidate, attribute) !== undefined) {
      return true;
    }
  }
  return false;
}

function resolvePresentation(
  name: string,
  presentations: ReadonlyMap<string, PresentationDefinition>,
  typeSystem: TypeSystem,
  resolved: Map<string, ResolvedPresentation>,
  visiting: Set<string>,
  diagnostics: LanguageDiagnostic[],
): ResolvedPresentation | undefined {
  const existing = resolved.get(name);
  if (existing !== undefined) {
    return existing;
  }
  const declaration = presentations.get(name);
  if (declaration === undefined) {
    return undefined;
  }
  if (visiting.has(name)) {
    diagnostics.push({
      code: "CYCLIC_PRESENTATION_INHERITANCE",
      message: `Presentation inheritance for '${name}' contains a cycle`,
      sourceName: "presentation",
      line: 1,
      column: 1,
    });
    return undefined;
  }
  visiting.add(name);
  const baseName = inferPresentationBase(name, presentations, typeSystem);
  const base = baseName === undefined
    ? undefined
    : resolvePresentation(baseName, presentations, typeSystem, resolved, visiting, diagnostics);
  visiting.delete(name);
  const item: ResolvedPresentation = {
    name,
    ...(baseName === undefined ? {} : { basePresentation: baseName }),
    assignments: {
      ...(base?.assignments ?? {}),
      ...(declaration.assignments ?? {}),
    },
    sections: mergeResolvedPresentationSections(base?.sections ?? {}, declaration.sections ?? {}),
  };
  resolved.set(name, item);
  return item;
}

function inferPresentationBase(
  name: string,
  presentations: ReadonlyMap<string, PresentationDefinition>,
  typeSystem: TypeSystem,
): string | undefined {
  return typeSystem.baseTypes(name).find((candidate) => presentations.has(candidate));
}

function mergeResolvedPresentationSections(
  base: Readonly<Record<string, Readonly<Record<string, string>>>>,
  own: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Readonly<Record<string, Readonly<Record<string, string>>>> {
  const result: Record<string, Readonly<Record<string, string>>> = { ...base };
  for (const [section, assignments] of Object.entries(own)) {
    result[section] = {
      ...(result[section] ?? {}),
      ...assignments,
    };
  }
  return result;
}

function duplicateEdgeKey(edge: LinkedEdge): string {
  return `${edge.source}\0${edge.operator}\0${edge.target}`;
}

function buildIndexedGraph(
  documents: readonly ParsedDocument[],
  elements: readonly ParsedElement[],
  imports: readonly ResolvedImport[],
  edges: readonly LinkedEdge[],
  typeSystem: TypeSystem,
): IndexedGraph {
  const graph = new IndexedGraph();

  for (const type of typeSystem.declaredTypes()) {
    safeAddNode(graph, {
      kind: "type",
      id: type,
      baseTypes: typeSystem.baseTypes(type),
    });
  }
  if (typeSystem.declaredTypes().size === 0) {
    safeAddNode(graph, {
      kind: "type",
      id: ELEMENT_TYPE,
      baseTypes: [],
    });
  }

  for (const document of documents) {
    const sourceIdentity = document.sourceName;
    safeAddNode(graph, { kind: "context", id: document.context.id });
    safeAddNode(graph, { kind: "source", id: sourceIdentity });
    safeAddRelation(graph, graphRelation(
      `contributes:${sourceIdentity}->${document.context.id}`,
      "CONTRIBUTES",
      sourceIdentity,
      document.context.id,
      sourceIdentity,
    ));
  }

  const graphElements = elements.filter(isGraphElement);
  const elementsById = new Map(graphElements.map((element) => [element.id, element]));
  for (const element of graphElements) {
    safeAddNode(graph, elementNode(element, typeSystem, elementsById));
  }
  for (const element of graphElements) {
    const parent = element.parent ?? element.context;
    safeAddRelation(graph, graphRelation(
      `declares:${element.sourceName}->${element.id}`,
      "DECLARES",
      element.sourceName,
      element.id,
      element.sourceName,
    ));
    safeAddRelation(graph, graphRelation(
      `contains:${parent}->${element.id}`,
      "CONTAINS",
      parent,
      element.id,
      element.sourceName,
    ));
  }
  for (const imported of imports) {
    safeAddRelation(graph, graphRelation(
      `imports:${imported.sourceName}:${imported.alias}->${imported.target}`,
      "IMPORTS",
      imported.sourceName,
      imported.target,
      imported.sourceName,
    ));
  }
  const referenceOccurrences = new Map<string, number>();
  for (const edge of edges) {
    const occurrenceKey = referenceRelationOccurrenceKey(edge);
    const occurrence = referenceOccurrences.get(occurrenceKey) ?? 0;
    referenceOccurrences.set(occurrenceKey, occurrence + 1);
    safeAddRelation(graph, graphRelation(
      `references:${occurrenceKey}:${occurrence}`,
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

function referenceRelationOccurrenceKey(edge: LinkedEdge): string {
  return [
    edge.sourceIdentity,
    edge.source,
    edge.target,
    edge.operator,
    edge.type,
    edge.projected === true ? "projected" : "real",
    edge.projectionScope ?? "",
  ].join("\0");
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
    nestingLevel: elementNestingLevel(element, elementsById),
    ...(element.note === undefined ? {} : { note: element.note }),
    declarationSource: element.sourceName,
  };
}

function elementNestingLevel(
  element: ParsedElement,
  elementsById: ReadonlyMap<string, ParsedElement>,
): number {
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

function graphRelation(
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

function safeAddNode(graph: IndexedGraph, node: GraphNode): void {
  if (graph.node(node.id) !== undefined) {
    return;
  }
  graph.addNode(node);
}

function safeAddRelation(graph: IndexedGraph, relation: GraphRelation): void {
  if (graph.relation(relation.id) !== undefined || graph.node(relation.source) === undefined || graph.node(relation.target) === undefined) {
    return;
  }
  graph.addRelation(relation);
}

function isGraphElement(element: ParsedElement): boolean {
  return element.graphElement !== false;
}

function isProjectionRoot(element: ParsedElement, slotDomainTypes: ReadonlySet<string>, typeSystem: TypeSystem): boolean {
  return isGraphElement(element)
    && element.projectionRoot !== false
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

class CoreEdgeImplementation implements LinkOperatorImplementation {
  static readonly id = "@insight/core.edge";

  materializeEdge(input: EdgeMaterializationInput): EdgeMaterializationResult {
    const edge = input.edge;
    return {
      edge: {
        source: edge.source,
        target: input.target.id,
        operator: edge.operator,
        type: input.edgeType,
        sourceIdentity: edge.sourceName,
        declaration: sourceLocation(edge.sourceName, edge),
        attributes: flattenAttributes(input.edgeScalarAttributes, input.edgeAttributes),
        ...listAttributesProperty(input.typeSystem, input.edgeType),
        ...referenceAttributesProperty(input.edgeAttributes),
        ...(edge.note === undefined ? {} : { note: edge.note }),
        ...(edge.noteSource === undefined ? {} : { noteSource: edge.noteSource }),
        ...(edge.annotations.length === 0 ? {} : { annotations: edge.annotations }),
      },
    };
  }

  applyElementPrefix(input: ElementPrefixInput): ElementPrefixResult {
    return unsupportedOperatorResult(input.operator, input.prefix, "element materialization", input.sourceName, input.sourcePosition);
  }

  applySlotCarrier(_input: SlotCarrierInput): void {
    // Core edge operators do not consume TypeSlotReference carrier objects.
  }
}

class CoreElementImplementation implements LinkOperatorImplementation {
  static readonly id = "@insight/core.element";

  materializeEdge(input: EdgeMaterializationInput): EdgeMaterializationResult {
    return unsupportedEdgeOperatorResult(input.operator, input.edge, "edge materialization");
  }

  applyElementPrefix(_input: ElementPrefixInput): ElementPrefixResult {
    return { accepted: true };
  }

  applySlotCarrier(_input: SlotCarrierInput): void {
    // Core element operators do not consume TypeSlotReference carrier objects.
  }
}

class DeploymentRunsOnImplementation implements LinkOperatorImplementation {
  static readonly id = "@insight/deployment.runsOn";
  readonly slotCarrierPhase = 0;

  materializeEdge(input: EdgeMaterializationInput): EdgeMaterializationResult {
    return unsupportedEdgeOperatorResult(input.operator, input.edge, "edge materialization");
  }

  applyElementPrefix(input: ElementPrefixInput): ElementPrefixResult {
    return unsupportedOperatorResult(input.operator, input.prefix, "element materialization", input.sourceName, input.sourcePosition);
  }

  applySlotCarrier(input: SlotCarrierInput): void {
    const parent = input.carrier.parent === undefined
      ? undefined
      : input.context.elementsById.get(input.carrier.parent);
    if (parent === undefined) {
      return;
    }
    if (isStandaloneDeploymentProfile(parent, input.context)) {
      return;
    }
    applyDeploymentRunsOnCarrier(input.carrier, parent, input.context);
  }
}

class DeploymentUsesImplementation implements LinkOperatorImplementation {
  static readonly id = "@insight/deployment.uses";

  materializeEdge(input: EdgeMaterializationInput): EdgeMaterializationResult {
    return unsupportedEdgeOperatorResult(input.operator, input.edge, "edge materialization");
  }

  applyElementPrefix(input: ElementPrefixInput): ElementPrefixResult {
    return unsupportedOperatorResult(input.operator, input.prefix, "element materialization", input.sourceName, input.sourcePosition);
  }

  applySlotCarrier(input: SlotCarrierInput): void {
    const parent = input.carrier.parent === undefined
      ? undefined
      : input.context.elementsById.get(input.carrier.parent);
    if (parent === undefined) {
      return;
    }
    if (isStandaloneDeploymentProfile(parent, input.context)) {
      return;
    }
    applyDeploymentUsesCarrier(input.carrier, parent, input.context);
  }
}

class DeploymentEnvironmentsFromProfileImplementation implements LinkOperatorImplementation {
  static readonly id = "@insight/deployment.environmentsFrom";
  readonly slotCarrierPhase = -1;

  materializeEdge(input: EdgeMaterializationInput): EdgeMaterializationResult {
    return unsupportedEdgeOperatorResult(input.operator, input.edge, "edge materialization");
  }

  applyElementPrefix(input: ElementPrefixInput): ElementPrefixResult {
    return unsupportedOperatorResult(input.operator, input.prefix, "element materialization", input.sourceName, input.sourcePosition);
  }

  applySlotCarrier(input: SlotCarrierInput): void {
    const parent = input.carrier.parent === undefined
      ? undefined
      : input.context.elementsById.get(input.carrier.parent);
    if (parent === undefined) {
      return;
    }
    copyDeploymentProfileEnvironments(input.carrier, parent, input.context);
  }
}

class DeploymentUsesProfileImplementation implements LinkOperatorImplementation {
  static readonly id = "@insight/deployment.usesProfile";
  readonly slotCarrierPhase = -1;

  materializeEdge(input: EdgeMaterializationInput): EdgeMaterializationResult {
    return unsupportedEdgeOperatorResult(input.operator, input.edge, "edge materialization");
  }

  applyElementPrefix(input: ElementPrefixInput): ElementPrefixResult {
    return unsupportedOperatorResult(input.operator, input.prefix, "element materialization", input.sourceName, input.sourcePosition);
  }

  applySlotCarrier(input: SlotCarrierInput): void {
    const parent = input.carrier.parent === undefined
      ? undefined
      : input.context.elementsById.get(input.carrier.parent);
    if (parent === undefined) {
      return;
    }
    const profiles = profileReferences(input.carrier, input.context);
    for (const profile of profiles) {
      if (profile.element === undefined) {
        continue;
      }
      copyReferenceAttributes(profile.element, parent, input.context, input.carrier, (attributeName) => attributeName !== "_");
      for (const carrier of profileSlotCarriers(profile.element, input.context)) {
        const operatorId = carrier.operatorDefinition === undefined ? undefined : implementationId(carrier.operatorDefinition);
        if (operatorId === DeploymentRunsOnImplementation.id) {
          applyDeploymentRunsOnCarrier(carrier, parent, input.context);
        } else if (operatorId === DeploymentUsesImplementation.id) {
          applyDeploymentUsesCarrier(carrier, parent, input.context);
        }
      }
    }
  }
}

function isDeploymentProfileReferenceOperator(operator: OperatorDefinition): boolean {
  const id = implementationId(operator);
  return id === DeploymentEnvironmentsFromProfileImplementation.id
    || id === DeploymentUsesProfileImplementation.id;
}

function copyDeploymentProfileEnvironments(
  carrier: ParsedElement,
  parent: ParsedElement,
  context: LinkExecutionContext,
): void {
  for (const profile of profileReferences(carrier, context)) {
    if (profile.element === undefined) {
      continue;
    }
    copyReferenceAttributes(profile.element, parent, context, carrier, (attributeName) => attributeName === ENVIRONMENTS_ATTRIBUTE);
  }
}

function profileReferences(
  carrier: ParsedElement,
  context: LinkExecutionContext,
): readonly ResolvedReferenceValue[] {
  return context.resolvedElementAttributes.get(carrier.id)?.[DEPLOYMENT_PROFILE_ATTRIBUTE] ?? [];
}

function copyReferenceAttributes(
  source: ParsedElement,
  target: ParsedElement,
  context: LinkExecutionContext,
  diagnosticSource: ParsedElement,
  predicate: (attributeName: string) => boolean,
): void {
  const sourceAttributes = context.resolvedElementAttributes.get(source.id) ?? {};
  for (const [attributeName, values] of Object.entries(sourceAttributes)) {
    if (!predicate(attributeName)) {
      continue;
    }
    const targetAttribute = context.typeSystem.attribute(target.type, attributeName);
    if (targetAttribute === undefined) {
      context.diagnostics.push({
        code: "ATTRIBUTE_NOT_DECLARED",
        message: `Attribute '${attributeName}' is not declared on type '${target.type}'`,
        sourceName: diagnosticSource.sourceName,
        ...diagnosticPosition(diagnosticSource),
      });
      continue;
    }
    if (targetAttribute.list !== true && (context.resolvedElementAttributes.get(target.id)?.[attributeName]?.length ?? 0) > 0) {
      context.diagnostics.push({
        code: "ATTRIBUTE_SHADOWS_PREVIOUS",
        message: `Attribute '${attributeName}' is already assigned`,
        sourceName: diagnosticSource.sourceName,
        ...diagnosticPosition(diagnosticSource),
      });
      continue;
    }
    for (const value of values) {
      addResolvedAttributeValue(context.resolvedElementAttributes, target.id, attributeName, value);
    }
  }
}

function profileSlotCarriers(
  profile: ParsedElement,
  context: LinkExecutionContext,
): readonly ParsedElement[] {
  return [...context.elementsById.values()]
    .filter((element) => element.parent === profile.id && element.operatorDefinition !== undefined)
    .sort((left, right) => {
      const leftPhase = left.operatorDefinition === undefined
        ? 1
        : implementationFor(left.operatorDefinition, context.typeSystem).slotCarrierPhase ?? 1;
      const rightPhase = right.operatorDefinition === undefined
        ? 1
        : implementationFor(right.operatorDefinition, context.typeSystem).slotCarrierPhase ?? 1;
      return leftPhase - rightPhase;
    });
}

function applyDeploymentRunsOnCarrier(
  carrier: ParsedElement,
  parent: ParsedElement,
  context: LinkExecutionContext,
): void {
  markModelCarrier(parent, context);
  const owner = placementOwner(parent, context);
  if (owner === undefined) {
    return;
  }
  for (const scope of projectionScopes(parent, context)) {
    for (const target of resolveTypeSlotValues(carrier, parent, context, scope)) {
      addResolvedAttributeValue(context.resolvedElementAttributes, owner.id, RUNS_ON_ATTRIBUTE, target);
      if (scope.slotParent !== undefined) {
        context.placementByElementAndScope.set(placementKey(owner.id, scope.slotParent.id), target.id);
      }
    }
  }
}

function applyDeploymentUsesCarrier(
  carrier: ParsedElement,
  parent: ParsedElement,
  context: LinkExecutionContext,
): void {
  markModelCarrier(parent, context);
  const scopes = projectionScopes(parent, context);
  for (const scope of scopes) {
    const slotValues = resolveTypeSlotValues(carrier, parent, context, scope);
    const projectionScope = projectionScopeOwner(scope, context);
    const annotations = uniqueAnnotations([...(scope.annotations ?? []), ...carrier.annotations]);
    addProjectedEdgesForValues(
      context.linkedEdges,
      scope.sourceIdentity,
      scope.fromId,
      scope.toId,
      slotValues,
      context.elementsById,
      context.resolvedElementAttributes,
      context.ownerIndependentProjectionKeys,
      context.typeSystem,
      context.diagnostics,
      projectionScope,
      annotations,
    );
  }
}

function isStandaloneDeploymentProfile(element: ParsedElement, context: LinkExecutionContext): boolean {
  return element.parent === undefined && context.typeSystem.isAssignable(element.type, DEPLOYMENT_PROFILE_TYPE);
}

function projectionScopeOwner(scope: ProjectionScope, context: LinkExecutionContext): string | undefined {
  if (scope.slotParent === undefined) {
    return undefined;
  }
  return context.placementByElementAndScope.get(placementKey(scope.fromId, scope.slotParent.id))
    ?? context.placementByElementAndScope.get(placementKey(scope.toId, scope.slotParent.id));
}

function placementKey(elementId: string, scopeId: string): string {
  return `${elementId}\0${scopeId}`;
}

function markModelCarrier(element: ParsedElement, context: LinkExecutionContext): void {
  if (context.resolvedElementAttributes.get(element.id)?.environments !== undefined) {
    element.graphElement = false;
    element.projectionRoot = false;
  }
}

function placementOwner(parent: ParsedElement, context: LinkExecutionContext): ParsedElement | undefined {
  const parentAttributes = context.resolvedElementAttributes.get(parent.id) ?? {};
  const hasEnvironmentScope = parentAttributes.environments !== undefined;
  return hasEnvironmentScope && parent.parent !== undefined
    ? context.elementsById.get(parent.parent)
    : parent;
}

function projectionScopes(parent: ParsedElement, context: LinkExecutionContext): readonly ProjectionScope[] {
  const edgeScopes = context.edgeScopesByCarrierId.get(parent.id) ?? [];
  const baseScopes = edgeScopes.length > 0
    ? edgeScopes
    : placementScopes(parent, context);
  const slotParents = explicitSlotParents(parent, context);
  if (slotParents.length === 0) {
    return baseScopes;
  }
  return baseScopes.flatMap((scope) => slotParents.map((slotParent) => ({
    ...scope,
    slotParent,
  })));
}

function placementScopes(parent: ParsedElement, context: LinkExecutionContext): readonly ProjectionScope[] {
  const owner = placementOwner(parent, context);
  if (owner === undefined) {
    return [];
  }
  return [{
    sourceIdentity: parent.sourceName,
    fromId: owner.id,
    toId: owner.id,
  }];
}

function explicitSlotParents(parent: ParsedElement, context: LinkExecutionContext): readonly ParsedElement[] {
  const slotParents = context.resolvedElementAttributes.get(parent.id)?.environments
    ?.flatMap((value) => value.element === undefined ? [] : [value.element]) ?? [];
  for (const element of slotParents) {
    element.graphElement = false;
    element.projectionRoot = false;
  }
  return slotParents;
}

function resolveTypeSlotValues(
  carrier: ParsedElement,
  parent: ParsedElement,
  context: LinkExecutionContext,
  scope?: ProjectionScope,
): readonly ResolvedReferenceValue[] {
  const attributeName = carrier.scalarAttributes.attributeName;
  const parentType = carrier.scalarAttributes.parentType;
  if (attributeName === undefined || parentType === undefined) {
    context.diagnostics.push({
      code: "TYPE_MISMATCH",
      message: "Type slot reference is missing parentType or attributeName",
      sourceName: carrier.sourceName,
      ...diagnosticPosition(carrier),
    });
    return [];
  }
  const scopedParents = scopedTypeSlotParents(parent, parentType, context, scope);
  const result: ResolvedReferenceValue[] = [];
  for (const scopedParent of scopedParents) {
    for (const value of context.resolvedElementAttributes.get(scopedParent.id)?.[attributeName] ?? []) {
      if (value.element !== undefined && !result.some((item) => item.id === value.id)) {
        result.push(value);
      }
    }
  }
  return result;
}

function scopedTypeSlotParents(
  parent: ParsedElement,
  parentType: string,
  context: LinkExecutionContext,
  scope?: ProjectionScope,
): readonly ParsedElement[] {
  if (scope?.slotParent !== undefined) {
    return context.typeSystem.isAssignable(scope.slotParent.type, parentType)
      ? [scope.slotParent]
      : [];
  }
  const explicitScope = context.resolvedElementAttributes.get(parent.id)?.environments
    ?.flatMap((value) => value.element === undefined ? [] : [value.element])
    .filter((element) => context.typeSystem.isAssignable(element.type, parentType)) ?? [];
  if (explicitScope.length > 0) {
    for (const element of explicitScope) {
      element.graphElement = false;
      element.projectionRoot = false;
    }
    return explicitScope;
  }
  const ancestor = nearestAncestor(parent, context.elementsById, (element) => context.typeSystem.isAssignable(element.type, parentType));
  return ancestor === undefined ? [] : [ancestor];
}

class UnsupportedOperatorImplementation implements LinkOperatorImplementation {
  materializeEdge(input: EdgeMaterializationInput): EdgeMaterializationResult {
    return unsupportedEdgeOperatorResult(input.operator, input.edge, "edge materialization");
  }

  applyElementPrefix(input: ElementPrefixInput): ElementPrefixResult {
    return unsupportedOperatorResult(input.operator, input.prefix, "element materialization", input.sourceName, input.sourcePosition);
  }

  applySlotCarrier(input: SlotCarrierInput): void {
    input.context.diagnostics.push({
      code: "UNSUPPORTED_OPERATOR_IMPLEMENTATION",
      message: `Operator '${input.operator.spelling}' uses unsupported implementation '${implementationId(input.operator) ?? "<none>"}' for slot carrier materialization`,
      sourceName: input.carrier.sourceName,
      ...diagnosticPosition(input.carrier),
    });
  }
}

const operatorImplementations = new Map<string, LinkOperatorImplementation>([
  [CoreEdgeImplementation.id, new CoreEdgeImplementation()],
  [CoreElementImplementation.id, new CoreElementImplementation()],
  [DeploymentRunsOnImplementation.id, new DeploymentRunsOnImplementation()],
  [DeploymentUsesImplementation.id, new DeploymentUsesImplementation()],
  [DeploymentEnvironmentsFromProfileImplementation.id, new DeploymentEnvironmentsFromProfileImplementation()],
  [DeploymentUsesProfileImplementation.id, new DeploymentUsesProfileImplementation()],
]);
const unsupportedOperatorImplementation = new UnsupportedOperatorImplementation();

function implementationFor(operator: OperatorDefinition, typeSystem: TypeSystem): LinkOperatorImplementation {
  const id = implementationId(operator) ?? defaultImplementationId(operator, typeSystem);
  return id === undefined
    ? unsupportedOperatorImplementation
    : operatorImplementations.get(id) ?? unsupportedOperatorImplementation;
}

function implementationId(operator: OperatorDefinition): string | undefined {
  return operator.implementation;
}

function defaultImplementationId(operator: OperatorDefinition, typeSystem: TypeSystem): string | undefined {
  if (operator.implementation !== undefined) {
    return operator.implementation;
  }
  if (typeSystem.isAssignable(operator.ownerType, EDGE)) {
    return CoreEdgeImplementation.id;
  }
  if (typeSystem.isAssignable(operator.ownerType, ELEMENT_TYPE)) {
    return CoreElementImplementation.id;
  }
  return undefined;
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

function addResolvedAttributeValue(
  attributesByElement: Map<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
  elementId: string,
  attributeName: string,
  value: ResolvedReferenceValue,
): void {
  const attributes = attributesByElement.get(elementId) ?? {};
  const values = attributes[attributeName] ?? [];
  if (values.some((item) => item.id === value.id)) {
    return;
  }
  attributesByElement.set(elementId, {
    ...attributes,
    [attributeName]: [...values, value],
  });
}

function nearestAncestor(
  element: ParsedElement,
  elementsById: ReadonlyMap<string, ParsedElement>,
  predicate: (element: ParsedElement) => boolean,
): ParsedElement | undefined {
  let current = element.parent === undefined ? undefined : elementsById.get(element.parent);
  const visited = new Set<string>([element.id]);
  while (current !== undefined && !visited.has(current.id)) {
    if (predicate(current)) {
      return current;
    }
    visited.add(current.id);
    current = current.parent === undefined ? undefined : elementsById.get(current.parent);
  }
  return undefined;
}

function inspectGraph(
  graph: IndexedGraph,
  elements: readonly ParsedElement[],
  edges: readonly LinkedEdge[],
  resolvedElementAttributes: ReadonlyMap<string, Readonly<Record<string, readonly ResolvedReferenceValue[]>>>,
  diagnostics: LanguageDiagnostic[],
): void {
  if (diagnostics.some((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR")) {
    return;
  }
  reportIsolatedElements(graph, elements, edges, resolvedElementAttributes, diagnostics);
  reportShadowedLowerLevelEdges(graph, edges, diagnostics);
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
  const warned = new Set<number>();
  for (let higherIndex = 0; higherIndex < edges.length; higherIndex++) {
    const higher = edges[higherIndex]!;
    for (let lowerIndex = 0; lowerIndex < edges.length; lowerIndex++) {
      if (higherIndex === lowerIndex || warned.has(higherIndex)) {
        continue;
      }
      const lower = edges[lowerIndex]!;
      if (higher.projected === true || lower.projected === true) {
        continue;
      }
      if (higher.type !== lower.type || !shadows(higher, lower, parentByChild)) {
        continue;
      }
      warned.add(higherIndex);
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

function shadows(
  higher: LinkedEdge,
  lower: LinkedEdge,
  parentByChild: ReadonlyMap<string, string>,
): boolean {
  const sourceMovesDown = higher.source === parentByChild.get(lower.source);
  const targetMovesDown = higher.target === parentByChild.get(lower.target);
  if (!sourceMovesDown && !targetMovesDown) {
    return false;
  }
  return shadowsEndpoint(higher.source, lower.source, sourceMovesDown)
    && shadowsEndpoint(higher.target, lower.target, targetMovesDown);
}

function shadowsEndpoint(higherEndpoint: string, lowerEndpoint: string, movesDown: boolean): boolean {
  return movesDown || higherEndpoint === lowerEndpoint;
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

type RuleNode = {
  readonly ruleIndex: number;
  getText(): string;
  getChildCount(): number;
  getChild(index: number): unknown;
};

function children(root: RuleNode, ruleName: string): RuleNode[] {
  const result: RuleNode[] = [];
  for (let index = 0; index < root.getChildCount(); index++) {
    const item = root.getChild(index);
    if (isRule(item) && rule(item) === ruleName) {
      result.push(item);
    }
  }
  return result;
}

function firstChild(root: RuleNode, ruleName: string): RuleNode | undefined {
  return children(root, ruleName)[0];
}

function firstDescendant(root: unknown, ruleName: string): RuleNode | undefined {
  if (isRule(root) && rule(root) === ruleName) {
    return root;
  }
  if (!hasChildren(root)) {
    return undefined;
  }
  for (let index = 0; index < root.getChildCount(); index++) {
    const found = firstDescendant(root.getChild(index), ruleName);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function terminalText(root: RuleNode, tokenType: number): string | undefined {
  for (let index = 0; index < root.getChildCount(); index++) {
    const item = root.getChild(index);
    if (typeof item === "object" && item !== null && "symbol" in item) {
      const symbol = (item as { readonly symbol?: { readonly type: number; readonly text?: string } }).symbol;
      if (symbol?.type === tokenType) {
        return symbol.text;
      }
    }
  }
  return undefined;
}

function textValue(root: RuleNode | undefined): string {
  if (root === undefined) {
    return "";
  }
  const result: string[] = [];
  for (let index = 0; index < root.getChildCount(); index++) {
    const item = root.getChild(index);
    if (typeof item === "object" && item !== null && "symbol" in item) {
      const symbol = (item as { readonly symbol?: { readonly type: number; readonly text?: string } }).symbol;
      if (symbol?.type === InsightParser.TEXT) {
        result.push(symbol.text ?? "");
      }
    }
  }
  return result.join("");
}

function rule(node: RuleNode): string | undefined {
  return InsightParser.ruleNames[node.ruleIndex];
}

function isRule(node: unknown): node is RuleNode {
  return hasChildren(node) && "ruleIndex" in node && typeof (node as { readonly ruleIndex?: unknown }).ruleIndex === "number";
}

function hasChildren(node: unknown): node is { getChildCount(): number; getChild(index: number): unknown } {
  return typeof node === "object"
    && node !== null
    && "getChildCount" in node
    && "getChild" in node;
}

function position(node: unknown, _sourceName: string): SourcePosition {
  if (typeof node === "object" && node !== null && "start" in node) {
    const item = node as {
      readonly start?: TokenLike | null;
      readonly stop?: TokenLike | null;
    };
    const token = item.start;
    const stop = item.stop ?? item.start;
    return {
      line: token?.line ?? 1,
      column: (token?.column ?? 0) + 1,
      endLine: stop?.line ?? token?.line ?? 1,
      endColumn: endColumn(stop ?? token),
    };
  }
  return { line: 1, column: 1 };
}

interface TokenLike {
  readonly line?: number;
  readonly column?: number;
  readonly text?: string | null;
  readonly start?: number;
  readonly stop?: number;
}

function endColumn(token: TokenLike | null | undefined): number {
  if (token === undefined || token === null) {
    return 2;
  }
  const textLength = token.text?.length
    ?? (token.start !== undefined && token.stop !== undefined ? Math.max(1, token.stop - token.start + 1) : 1);
  return (token.column ?? 0) + textLength + 1;
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

class LinkerErrorListener extends BaseErrorListener {
  public constructor(
    private readonly sourceName: string,
    private readonly diagnostics: LanguageDiagnostic[],
  ) {
    super();
  }

  public override syntaxError<S extends Token, T extends ATNSimulator>(
    _recognizer: Recognizer<T>,
    offendingSymbol: S | null,
    line: number,
    column: number,
    message: string,
    _exception: RecognitionException | null,
  ): void {
    const end = endColumn(offendingSymbol);
    this.diagnostics.push({
      code: "SYNTAX_ERROR",
      message,
      sourceName: this.sourceName,
      line,
      column: column + 1,
      endLine: offendingSymbol?.line ?? line,
      endColumn: Math.max(column + 2, end),
    });
  }
}
