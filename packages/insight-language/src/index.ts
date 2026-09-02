export { CompletionEngine } from "./completion-engine.js";
export {
  BUILTIN_VIEW_DEFINITIONS,
  BUILTIN_VIEW_IDS,
  BUILTIN_VIEW_QUERIES,
  builtinViewDefinition,
  builtinViewHasStage,
  isBuiltinDiagramView,
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
  buildProjectStructure,
  buildTypeHierarchy,
  filterProjectStructure,
  filterTypeHierarchy,
} from "./project-structure.js";
export { DEFAULT_QUERY, discoverDeploymentEnvironments, selectGraph, selectGraphs } from "./query-engine.js";
export { renderGraphviz } from "./graphviz-renderer.js";
export { IndexedGraph, RELATION_KINDS } from "./indexed-graph.js";
export { CONTEXT, EDGE, NOTHING, TypeSystem } from "./type-system.js";
export type {
  ProjectAnalysis,
  ProjectAnalysisUpdate,
  ProjectAnalysisUpdateMode,
} from "./project-analysis-session.js";
export type {
  BuiltinDiagramView,
  BuiltinViewAlias,
  BuiltinViewBoundary,
  BuiltinViewDefinition,
  BuiltinViewEnvironmentPolicy,
  BuiltinViewLifecycle,
  BuiltinViewStage,
} from "./builtin-views.js";
export type {
  AntlrAdapterInput,
  AntlrParseFunction,
  AntlrParseFailureLike,
  AntlrParseTreeLike,
  AntlrSyntaxErrorLike,
  AntlrTokenLike,
  TokenNameResolver,
} from "./antlr-adapter.js";
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
  LinkedElement,
  LinkedImport,
  LinkProjectRequest,
  LinkProjectResult,
  ListFrame,
  OperatorDefinition,
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
