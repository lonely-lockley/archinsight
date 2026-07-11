export type CompletionKind =
  | "KEYWORD"
  | "TYPE"
  | "CONSTRUCTOR"
  | "OPERATOR"
  | "ATTRIBUTE"
  | "IDENTIFIER"
  | "ENUM_VALUE"
  | "ANNOTATION"
  | "NEWLINE";

import type { IndexedGraph } from "./indexed-graph.js";

export interface CompletionItem {
  readonly label: string;
  readonly insertText: string;
  readonly kind: CompletionKind;
  readonly imported?: boolean;
}

export interface CompletionResult {
  readonly items: readonly CompletionItem[];
  readonly expectedTokens: ReadonlySet<string>;
  readonly ruleStack: readonly string[];
  readonly replacementStartOffset: number;
  readonly replacementEndOffset: number;
}

export interface TokenInfo {
  readonly type: string;
  readonly text: string;
  readonly index?: number;
}

export interface SyntaxContext {
  readonly expectedTokenNames: ReadonlySet<string>;
  readonly ruleStack: readonly string[];
  readonly previousToken?: TokenInfo;
  readonly previousPreviousToken?: TokenInfo;
  readonly lineBreakIndentDelta?: number;
  readonly activeAssignmentName?: string;
  readonly activePresentationName?: string;
  readonly activeExtensionConstructor?: string;
}

export interface AttributeDefinition {
  readonly name: string;
  readonly type: string;
  readonly listElementType?: string;
  readonly required?: boolean;
  readonly list?: boolean;
}

export type ProjectionTermKind = "from" | "to" | "this" | "attribute" | "slot";

export interface ProjectionTermDefinition {
  readonly kind: ProjectionTermKind;
  readonly value: string;
  readonly ownerAttribute?: string;
  readonly source?: SourceLocation;
}

export interface ProjectionRuleDefinition {
  readonly source: ProjectionTermDefinition;
  readonly operator: string;
  readonly target: ProjectionTermDefinition;
}

export interface TypeDefinition {
  readonly name: string;
  readonly baseType?: string;
  readonly attributes?: readonly AttributeDefinition[];
  readonly projectionRules?: readonly ProjectionRuleDefinition[];
  readonly declaration?: SourceLocation;
}

export interface ConstructorDefinition {
  readonly spelling: string;
  readonly ownerType: string;
  readonly defaults?: Readonly<Record<string, string>>;
  readonly source?: SourceLocation;
}

export interface OperatorDefinition {
  readonly spelling: string;
  readonly ownerType: string;
  readonly leftType?: string;
  readonly targetType: string;
  readonly implementation?: string;
  readonly defaults?: Readonly<Record<string, string>>;
  readonly source?: SourceLocation;
}

export interface EnumDefinition {
  readonly type: string;
  readonly values: readonly string[];
}

export interface SourceLocation {
  readonly sourceName: string;
  readonly line: number;
  readonly column: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

export interface PresentationDefinition {
  readonly name: string;
  readonly assignments?: Readonly<Record<string, string>>;
  readonly sections?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly source?: SourceLocation;
  readonly assignmentPositions?: Readonly<Record<string, SourceLocation>>;
  readonly assignmentValuePositions?: Readonly<Record<string, SourceLocation>>;
  readonly sectionPositions?: Readonly<Record<string, SourceLocation>>;
  readonly sectionPropertyPositions?: Readonly<Record<string, Readonly<Record<string, SourceLocation>>>>;
}

export interface LanguageSnapshot {
  readonly schemaVersion: string;
  readonly types: readonly TypeDefinition[];
  readonly constructors: readonly ConstructorDefinition[];
  readonly operators: readonly OperatorDefinition[];
  readonly enums: readonly EnumDefinition[];
  readonly presentations?: readonly PresentationDefinition[];
  readonly presentationExtensions?: readonly PresentationDefinition[];
}

export interface LanguageDiagnostic {
  readonly level?: "ERROR" | "WARNING" | "NOTE";
  readonly code: string;
  readonly message: string;
  readonly sourceName: string;
  readonly line: number;
  readonly column: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

export interface LanguageBuildResult {
  readonly snapshot: LanguageSnapshot;
  readonly diagnostics: readonly LanguageDiagnostic[];
}

export interface ProjectSource {
  readonly sourceName: string;
  readonly source: string;
}

export interface LinkProjectRequest {
  readonly snapshot: LanguageSnapshot;
  readonly sources: readonly ProjectSource[];
}

export interface LinkedContext {
  readonly id: string;
  readonly type: string;
  readonly sourceIdentity: string;
  readonly declaration?: SourceLocation;
  readonly attributes: Readonly<Record<string, readonly string[]>>;
}

export interface LinkedElement {
  readonly id: string;
  readonly context: string;
  readonly localId: string;
  readonly type: string;
  readonly constructor: string;
  readonly sourceIdentity: string;
  readonly declaration?: SourceLocation;
  readonly anonymous?: boolean;
  readonly parent?: string;
  readonly baseTypes: readonly string[];
  readonly attributes: Readonly<Record<string, readonly string[]>>;
  readonly listAttributes?: readonly string[];
  readonly referenceAttributes?: readonly string[];
  readonly note?: string;
  readonly noteSource?: SourceLocation;
  readonly annotations?: readonly LinkedAnnotation[];
}

export interface LinkedImport {
  readonly sourceIdentity: string;
  readonly alias: string;
  readonly importedId: string;
  readonly sourceContext: string;
  readonly target: string;
  readonly declaration?: SourceLocation;
}

export interface LinkedEdge {
  readonly source: string;
  readonly target: string;
  readonly originSource?: string;
  readonly originTarget?: string;
  readonly operator: string;
  readonly type: string;
  readonly sourceIdentity: string;
  readonly declaration?: SourceLocation;
  readonly attributes: Readonly<Record<string, readonly string[]>>;
  readonly listAttributes?: readonly string[];
  readonly referenceAttributes?: readonly string[];
  readonly note?: string;
  readonly noteSource?: SourceLocation;
  readonly annotations?: readonly LinkedAnnotation[];
  readonly projected?: boolean;
  readonly projectionScope?: string;
}

export interface LinkedAnnotation {
  readonly name: string;
  readonly value?: string;
  readonly source?: SourceLocation;
}

export type OperatorImplementationApiVersion = "insight.operator.v1";

export interface OperatorImplementationV1 {
  readonly apiVersion: OperatorImplementationApiVersion;
  invoke(input: OperatorInvocationInputV1): OperatorInvocationResultV1;
}

export interface OperatorInvocationInputV1 {
  readonly execution: OperatorExecutionV1;
  readonly invocation: OperatorInvocationV1;
  readonly graph: IndexedGraph;
  readonly projector: ReadonlyProjectionApiV1;
  readonly from?: LinkedElement;
  readonly to?: LinkedElement;
  readonly scope: OperatorInvocationScopeV1;
}

export interface OperatorExecutionV1 {
  readonly implementation: string;
  readonly mode: "link" | "projection" | "render";
}

export interface OperatorInvocationV1 {
  readonly operator: OperatorDefinition;
  readonly sourceIdentity: string;
  readonly declaration?: SourceLocation;
  readonly owner?: LinkedElement;
  readonly carrier?: LinkedElement;
  readonly from?: LinkedElement;
  readonly to?: LinkedElement;
  readonly target?: LinkedElement;
  readonly attributes: Readonly<Record<string, readonly string[]>>;
  readonly annotations?: readonly LinkedAnnotation[];
}

export interface OperatorInvocationScopeV1 {
  readonly context?: LinkedContext;
  readonly sourceIdentity?: string;
  readonly owner?: LinkedElement;
  readonly environments?: readonly LinkedElement[];
  readonly values?: Readonly<Record<string, readonly string[]>>;
}

export interface ReadonlyProjectionApiV1 {
  resolveSlot(input: ProjectionSlotResolveInputV1): readonly LinkedElement[];
  project(input: ProjectionApplyInputV1): OperatorInvocationResultV1;
}

export interface ProjectionSlotResolveInputV1 {
  readonly owner: LinkedElement;
  readonly slotType: string;
  readonly slotName: string;
  readonly scope?: OperatorInvocationScopeV1;
}

export interface ProjectionApplyInputV1 {
  readonly type: string;
  readonly from?: LinkedElement;
  readonly to?: LinkedElement;
  readonly this?: LinkedElement;
  readonly owner?: LinkedElement;
  readonly scope?: OperatorInvocationScopeV1;
}

export interface OperatorInvocationResultV1 {
  readonly elements?: readonly LinkedElement[];
  readonly edges?: readonly LinkedEdge[];
  readonly placements?: readonly OperatorPlacementV1[];
  readonly diagnostics?: readonly LanguageDiagnostic[];
}

export interface OperatorPlacementV1 {
  readonly child: string;
  readonly parent: string;
  readonly sourceIdentity: string;
  readonly declaration?: SourceLocation;
}

export interface DuplicateLinkedEdgeGroup {
  readonly source: string;
  readonly operator: string;
  readonly target: string;
  readonly edges: readonly LinkedEdge[];
}

export interface ResolvedPresentation {
  readonly name: string;
  readonly basePresentation?: string;
  readonly assignments: Readonly<Record<string, string>>;
  readonly sections: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface LinkProjectResult {
  readonly diagnostics: readonly LanguageDiagnostic[];
  readonly graph: IndexedGraph;
  readonly contexts: readonly LinkedContext[];
  readonly elements: readonly LinkedElement[];
  readonly imports: readonly LinkedImport[];
  readonly edges: readonly LinkedEdge[];
  readonly tabRoots: Readonly<Record<string, readonly string[]>>;
  readonly duplicateEdges: readonly DuplicateLinkedEdgeGroup[];
  readonly presentations: Readonly<Record<string, ResolvedPresentation>>;
}

export interface QueryScope {
  readonly context?: string;
  readonly tab?: string;
}

export interface RenderGraphEdge {
  readonly edge: LinkedEdge;
  readonly source: string;
  readonly target: string;
}

export interface RenderGraphGroup {
  readonly owner: string;
  readonly label?: string;
  readonly elements: readonly string[];
}

export interface RenderGraph {
  readonly context: string;
  readonly elements: Readonly<Record<string, LinkedElement>>;
  readonly edges: readonly RenderGraphEdge[];
  readonly groups: readonly RenderGraphGroup[];
  readonly externalElements: readonly string[];
}

export interface VisibleIdentifier {
  readonly label: string;
  readonly type?: string;
  readonly imported?: boolean;
}

export interface ListFrame {
  readonly indent: number;
  readonly ownerType: string;
  readonly attribute: string;
}

export interface ElementFrame {
  readonly indent: number;
  readonly type: string;
  readonly assignedAttributes: ReadonlySet<string>;
}

export interface CompletionScope {
  readonly mode: "ambiguous" | "definition" | "architecture";
  readonly contextId?: string;
  readonly visibleContexts: ReadonlySet<string>;
  readonly visibleTypes: ReadonlySet<string>;
  readonly visibleIdentifiers: ReadonlyMap<string, VisibleIdentifier>;
  readonly frames: readonly ElementFrame[];
  readonly operatorFrames: readonly ElementFrame[];
  readonly lists: readonly ListFrame[];
  readonly currentOperatorSpelling?: string;
}

export type FileContext = CompletionScope;

export interface ParsedInsightFile {
  readonly syntax: SyntaxContext;
  readonly context: CompletionScope;
}

export interface CompletionRequest {
  readonly sourceName: string;
  readonly source: string;
  readonly cursorOffset: number;
  readonly snapshot: LanguageSnapshot;
  readonly indexedIdentifiers?: ReadonlyMap<string, VisibleIdentifier>;
  readonly contextIds?: readonly string[];
}

export interface InsightSyntaxProvider {
  parse(request: CompletionRequest): ParsedInsightFile;
}
