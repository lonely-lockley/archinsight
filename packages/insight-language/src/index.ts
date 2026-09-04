export { CompletionEngine } from "./completion-engine.js";
export {
  BUILTIN_VIEW_DEFINITIONS,
  BUILTIN_VIEW_IDS,
  BUILTIN_VIEW_QUERIES,
  builtinViewDefinition,
  builtinViewHasStage,
  isBuiltinDiagramView,
  queryViewPipeline,
  resolveBuiltinView,
} from "./builtin-views.js";
export {
  AntlrInsightSyntaxProvider,
  createParsedInsightFile,
  createSyntaxContext,
} from "./antlr-adapter.js";
export {
  createGeneratedInsightSyntaxProvider,
  parseWithGeneratedInsightParser,
} from "./generated-provider.js";
export {
  ParsedSyntaxModel,
  childrenOf,
  descendantsByRule,
  directChildrenByRule,
  directTerminalTokens,
  firstChildByRule,
  firstDescendantByRule,
  firstTokenByName,
  firstTokenTextByName,
  parseInsightSource,
  ruleName,
  sourceLocationOf,
  sourceRangeOf,
  startToken,
  stopToken,
  terminalSymbol,
  textOf,
  tokenizeInsightSource,
  tokenColumn,
  tokenIndex,
  tokenLine,
  tokenName,
  tokenStart,
  tokenStop,
  tokenText,
  tokenType,
} from "./parser-facade.js";
export {
  buildLanguageSnapshotResultFromSources,
  buildLanguageSnapshotFromSources,
  buildLanguageSnapshotFromCore,
  buildLanguageSnapshotFromCoreSources,
  coreLanguageSnapshot,
  mergeLanguageSnapshots,
  validateLanguageSnapshot,
  type LanguageSnapshotSource,
} from "./core-snapshot.js";
export { coreSource, coreSources } from "./generated/core-source.js";
export {
  initialInsightLineLexerState,
  tokenizeInsightLine,
} from "./lexer-tokenizer.js";
export {
  insightSemanticTokenModifiers,
  insightSemanticTokenTypes,
  semanticHighlightInsight,
} from "./semantic-highlighting.js";
export { lineContextAt } from "./line-context.js";
export { InsightLanguageService } from "./language-service.js";
export { linkProject } from "./project-linker.js";
export { ProjectLinkerState } from "./project-linker-state.js";
export { ProjectAnalysisSession } from "./project-analysis-session.js";
export {
  CORE_EDGE_IMPLEMENTATION,
  CORE_ELEMENT_IMPLEMENTATION,
  ImmutableOperatorImplementationRegistry,
  coreOperatorImplementationRegistry,
  createOperatorImplementationRegistry,
} from "./operator-implementation-registry.js";
export {
  buildProjectStructure,
  buildTypeHierarchy,
  filterProjectStructure,
  filterTypeHierarchy,
} from "./project-structure.js";
export { DEFAULT_QUERY, discoverDeploymentEnvironments, selectGraph, selectGraphs } from "./query-engine.js";
export { renderGraphviz } from "./graphviz-renderer.js";
export { IndexedGraph, RELATION_KINDS } from "./indexed-graph.js";
export { CONTEXT, EDGE, NOTHING, TypeSystem } from "./type-system.js";
export {
  ATTRIBUTE_CAPABILITIES,
  OPERATOR_CAPABILITIES,
  TYPE_CAPABILITIES,
} from "./semantic-capabilities.js";
export type {
  ProjectAnalysis,
  ProjectAnalysisUpdate,
  ProjectAnalysisUpdateMode,
} from "./project-analysis-session.js";
export type {
  BuiltinDiagramView,
  BuiltinViewAlias,
  BuiltinViewDefinition,
  BuiltinViewEnvironmentPolicy,
  BuiltinViewLifecycle,
  BuiltinViewStage,
  QueryViewPipelineDefinition,
  ViewBoundaryDefinition,
  ViewBoundaryScope,
} from "./builtin-views.js";
export type {
  AntlrAdapterInput,
  AntlrParseFunction,
} from "./antlr-adapter.js";
export type {
  AntlrParseFailureLike,
  AntlrParseTreeLike,
  AntlrSyntaxErrorLike,
  AntlrTokenLike,
  InsightTokenization,
  ParsedSource,
  ParsedSourceRole,
  ParseInsightSourceRequest,
  SourceAnalysisMetadata,
  SourceRange,
  TokenNameResolver,
} from "./parser-facade.js";
export type {
  InsightLineLexerState,
  InsightLineToken,
  InsightLineTokenization,
} from "./lexer-tokenizer.js";
export type {
  InsightSemanticToken,
  InsightSemanticTokenModifier,
  InsightSemanticTokenType,
} from "./semantic-highlighting.js";
export type {
  InsightLanguageServiceOptions,
  ServiceCompletionRequest,
  ServiceLinkRequest,
  ServiceRenderRequest,
  ServiceRenderResult,
} from "./language-service.js";
export type {
  AttributeDefinition,
  CompletionItem,
  CompletionKind,
  CompletionRequest,
  CompletionResult,
  CompletionScope,
  ConstructorDefinition,
  DuplicateLinkedEdgeGroup,
  DeploymentEnvironment,
  ElementFrame,
  EnumDefinition,
  FileContext,
  InsightSyntaxProvider,
  LanguageBuildResult,
  LanguageDiagnostic,
  LanguageSnapshot,
  LinkedAnnotation,
  LinkedContext,
  LinkedEdge,
  LinkedEdgeId,
  LinkedElement,
  LinkedImport,
  LinkProjectRequest,
  LinkProjectResult,
  ListFrame,
  OperatorDefinition,
  OperatorImplementationApiVersion,
  OperatorImplementationRegistry,
  OperatorImplementationV1,
  OperatorInvocationInputV1,
  OperatorInvocationResultV1,
  ParsedInsightFile,
  PresentationDefinition,
  ProjectSource,
  ProjectionPlacement,
  ProjectionRuleDefinition,
  ProjectionTermDefinition,
  ProjectionTermKind,
  QueryScope,
  RenderGraph,
  RenderGraphEdge,
  RenderGraphGroup,
  ResolvedPresentation,
  SourceLocation,
  SyntaxContext,
  TokenInfo,
  TypeDefinition,
  VisibleIdentifier,
} from "./contracts.js";
export type {
  ContextGraphNode,
  ContextNodeId,
  ElementGraphNode,
  GraphNode,
  GraphNodeId,
  GraphRelation,
  GraphUpdateImpact,
  RelationId,
  RelationKind,
  SourceContribution,
  SourceGraphNode,
  SourceNodeId,
  TypeGraphNode,
  TypeNodeId,
} from "./indexed-graph.js";
export type {
  ProjectLinkerStateUpdate,
  ProjectSourceReplacement,
} from "./project-linker-state.js";
export type {
  ProjectStructure,
  ProjectStructureDeclaration,
  ProjectStructureLocation,
  TypeHierarchyNode,
  TypeHierarchyVisibility,
} from "./project-structure.js";
