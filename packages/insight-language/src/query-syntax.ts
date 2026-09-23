import {
  BaseErrorListener,
  CharStream,
  CommonTokenStream,
  RecognitionException,
  Recognizer,
  Token,
  type ATNSimulator,
} from "antlr4ng";
import { AiqLexer } from "./generated/AiqLexer.js";
import {
  AiqParser,
  type AndExpressionContext,
  type ComparisonContext,
  type ExpressionContext,
  type FunctionCallContext,
  type GraphQueryContext,
  type IdentifierContext,
  type ListExpressionContext,
  type MatchClauseContext,
  type NodePatternContext,
  type NotExpressionContext,
  type OrderByClauseContext,
  type OrExpressionContext,
  type PatternContext,
  type PathPatternContext,
  type PathRelationshipPatternContext,
  type PrimaryExpressionContext,
  type ProjectionContext,
  type QueryContext,
  type QueryValueContext,
  type RelationshipPatternContext,
  type TableQueryContext,
  type ValueExpressionContext,
  type WithClauseContext,
} from "./generated/AiqParser.js";
import { aiqFunction } from "./query-function-catalog.js";

export interface NodePattern {
  readonly range?: QuerySourceRange;
  readonly alias: string;
  readonly label?: string;
  readonly properties: Readonly<Record<string, QueryValue>>;
}

export interface RelationshipPattern {
  readonly range?: QuerySourceRange;
  readonly alias?: string;
  readonly type?: string;
  readonly properties: Readonly<Record<string, QueryValue>>;
  readonly selectors: ReadonlySet<string>;
}

export interface QueryPattern {
  readonly range?: QuerySourceRange;
  readonly left: NodePattern;
  readonly relationship?: RelationshipPattern;
  readonly right?: NodePattern;
  readonly direction?: "outgoing" | "incoming" | "undirected";
  readonly path?: QueryPathDefinition;
}

export interface QueryPathDefinition {
  readonly range?: QuerySourceRange;
  readonly alias: string;
  readonly mode: "shortest" | "all";
  readonly min: number;
  readonly max?: number;
}

export interface MatchClause {
  readonly range?: QuerySourceRange;
  readonly optional: boolean;
  readonly rollup: boolean;
  readonly pattern: QueryPattern;
  readonly where?: Expression;
}

export interface ParsedGraphQuery {
  readonly range?: QuerySourceRange;
  readonly kind: "graph";
  readonly matches: readonly MatchClause[];
  readonly groupBy?: ValueExpression;
  readonly returns: readonly string[];
}

export type ParsedQuery = ParsedGraphQuery | ParsedTableQuery;

export interface ParsedTableQuery {
  readonly range?: QuerySourceRange;
  readonly kind: "table";
  readonly clauses: readonly TableInputClause[];
  readonly projection: TableProjection;
  readonly orderBy: readonly TableOrderItem[];
  readonly skip?: PaginationExpression;
  readonly limit?: PaginationExpression;
}

export type TableInputClause =
  | { readonly kind: "match"; readonly clause: TableMatchClause; readonly range?: QuerySourceRange }
  | { readonly kind: "unwind"; readonly expression: TableValueExpression; readonly alias: string; readonly range?: QuerySourceRange }
  | { readonly kind: "with"; readonly clause: TableWithClause; readonly range?: QuerySourceRange };

export interface TableMatchClause {
  readonly range?: QuerySourceRange;
  readonly optional: boolean;
  readonly rollup: boolean;
  readonly pattern: QueryPattern;
  readonly where?: TableExpression;
}

export interface TableWithClause {
  readonly range?: QuerySourceRange;
  readonly projection: TableProjection;
  readonly where?: TableExpression;
  readonly orderBy: readonly TableOrderItem[];
  readonly skip?: PaginationExpression;
  readonly limit?: PaginationExpression;
}

export interface TableProjection {
  readonly range?: QuerySourceRange;
  readonly distinct: boolean;
  readonly items: readonly TableProjectionItem[];
}

export interface TableProjectionItem {
  readonly range?: QuerySourceRange;
  readonly expression: TableValueExpression;
  readonly alias?: string;
}

export interface TableOrderItem {
  readonly range?: QuerySourceRange;
  readonly alias: string;
  readonly direction: "asc" | "desc";
}

export type PaginationExpression =
  | { readonly kind: "number"; readonly value: number; readonly range?: QuerySourceRange }
  | { readonly kind: "parameter"; readonly name: string; readonly range?: QuerySourceRange };

export type TableExpression = (
  | { readonly kind: "and"; readonly left: TableExpression; readonly right: TableExpression }
  | { readonly kind: "or"; readonly left: TableExpression; readonly right: TableExpression }
  | { readonly kind: "not"; readonly expression: TableExpression }
  | { readonly kind: "is"; readonly left: TableValueExpression; readonly target: string | "null" }
  | { readonly kind: "in"; readonly left: TableValueExpression; readonly right: TableValueExpression }
  | { readonly kind: "compare"; readonly operator: TableComparisonOperator; readonly left: TableValueExpression; readonly right: TableValueExpression }
  | { readonly kind: "truthy"; readonly expression: TableValueExpression }
) & { readonly range?: QuerySourceRange };

export type TableComparisonOperator = "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "contains";

export type TableValueExpression = (
  | { readonly kind: "literal"; readonly value: string | number | boolean | null }
  | { readonly kind: "parameter"; readonly name: string }
  | { readonly kind: "binding"; readonly alias: string }
  | { readonly kind: "property"; readonly target: TableValueExpression; readonly property: string }
  | { readonly kind: "list"; readonly values: readonly TableValueExpression[] }
  | { readonly kind: "function"; readonly name: string; readonly arguments: readonly TableValueExpression[]; readonly distinct: boolean; readonly star: boolean }
  | { readonly kind: "quantifier"; readonly name: string; readonly alias: string; readonly source: TableValueExpression; readonly predicate?: TableExpression }
  | { readonly kind: "listComprehension"; readonly alias: string; readonly source: TableValueExpression; readonly predicate?: TableExpression; readonly projection: TableValueExpression }
) & { readonly range?: QuerySourceRange };

export interface QueryAnalysis {
  readonly query?: ParsedQuery;
  readonly resultKind: "graph" | "table" | "unknown";
  readonly referencedVariables: readonly string[];
  readonly requiredParameters: readonly string[];
  readonly scopeVariables: readonly string[];
  readonly requiresContext: boolean;
  readonly requiresSource: boolean;
  readonly capabilityRequirements: readonly string[];
  readonly diagnostics: readonly AiqDiagnostic[];
}

export interface AiqDiagnostic {
  readonly level: "ERROR" | "WARNING" | "NOTE";
  readonly code: string;
  readonly message: string;
  readonly sourceName: string;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface AnalyzeQueryOptions {
  readonly sourceName?: string;
}

export class AiqQueryError extends Error {
  public constructor(
    public readonly code: string,
    public readonly detail: string,
    public readonly range: QuerySourceRange = { startOffset: 0, endOffset: 0, line: 1, column: 1, endLine: 1, endColumn: 1 },
  ) {
    super(`${code}: ${detail}`);
    this.name = "AiqQueryError";
  }
}

export interface QuerySourceRange {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export type QueryValue = (
  | { readonly kind: "literal"; readonly value: string }
  | { readonly kind: "variable"; readonly name: string }
) & { readonly range?: QuerySourceRange };

export type Expression = (
  | { readonly kind: "and"; readonly left: Expression; readonly right: Expression }
  | { readonly kind: "or"; readonly left: Expression; readonly right: Expression }
  | { readonly kind: "not"; readonly expression: Expression }
  | { readonly kind: "is"; readonly left: ValueExpression; readonly target: string }
  | { readonly kind: "in"; readonly left: ValueExpression; readonly right: ValueExpression }
  | { readonly kind: "compare"; readonly operator: "eq" | "ne" | "contains"; readonly left: ValueExpression; readonly right: ValueExpression }
) & { readonly range?: QuerySourceRange };

export type ValueExpression = (
  | { readonly kind: "property"; readonly alias: string; readonly property: string }
  | { readonly kind: "binding"; readonly alias: string }
  | { readonly kind: "list"; readonly values: readonly QueryValue[] }
  | QueryValue
) & { readonly range?: QuerySourceRange };

export interface QueryVariableOccurrence {
  readonly name: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

interface ParsedAiq {
  readonly tree: QueryContext;
  readonly tokens: readonly Token[];
}

export function parseQuery(query: string): ParsedQuery {
  const parsed = parseAiq(query);
  return new QueryAstBuilder().query(parsed.tree);
}

export function analyzeQuery(query: string, options: AnalyzeQueryOptions = {}): QueryAnalysis {
  const tokens = lexAiq(query);
  const referencedVariables = [...new Set(tokens
    .filter((token) => token.type === AiqLexer.VARIABLE)
    .map((token) => token.text?.slice(1) ?? ""))].filter(Boolean).sort();
  let ast: ParsedQuery | undefined;
  let error: AiqQueryError | undefined;
  try {
    const parsed = parseAiq(query);
    ast = new QueryAstBuilder().query(parsed.tree);
  } catch (cause) {
    error = asAiqQueryError(cause, query);
  }
  const resultKind = ast?.kind ?? inferredResultKind(tokens);
  return {
    ...(ast === undefined ? {} : { query: ast }),
    resultKind,
    referencedVariables,
    requiredParameters: referencedVariables.filter((name) => name !== "context" && name !== "tab"),
    scopeVariables: referencedVariables.filter((name) => name === "context" || name === "tab"),
    requiresContext: referencedVariables.includes("context"),
    requiresSource: referencedVariables.includes("tab"),
    capabilityRequirements: ast === undefined ? [] : queryCapabilities(ast),
    diagnostics: error === undefined ? [] : [{
      level: "ERROR",
      code: error.code,
      message: error.detail,
      sourceName: options.sourceName ?? "<query>",
      ...error.range,
    }],
  };
}

/** Token ranges remain available while a query is incomplete or invalid. */
export function queryVariableOccurrences(source: string): readonly QueryVariableOccurrence[] {
  const lexer = new AiqLexer(CharStream.fromString(source));
  lexer.removeErrorListeners();
  const tokenStream = new CommonTokenStream(lexer);
  tokenStream.fill();
  return tokenStream.getTokens().flatMap((token) => token.type === AiqLexer.VARIABLE
    ? [{
        name: token.text?.slice(1) ?? "",
        startOffset: token.start,
        endOffset: token.stop + 1,
      }]
    : []);
}

function parseAiq(source: string): ParsedAiq {
  const errors: AiqQueryError[] = [];
  const lexer = new AiqLexer(CharStream.fromString(source));
  lexer.removeErrorListeners();
  lexer.addErrorListener(new QueryErrorListener(source, errors));
  const tokenStream = new CommonTokenStream(lexer);
  tokenStream.fill();
  const tokens = tokenStream.getTokens();
  const unterminated = tokens.find((token) => token.type === AiqLexer.UNTERMINATED_STRING);
  if (unterminated !== undefined) {
    throw new AiqQueryError("AIQ_SYNTAX", "Unterminated string literal in query", tokenRange(unterminated));
  }
  if (errors.length > 0) throw errors[0]!;

  const parser = new AiqParser(tokenStream);
  parser.removeErrorListeners();
  parser.addErrorListener(new QueryErrorListener(source, errors));
  const tree = parser.query();
  if (errors.length > 0) {
    const first = firstVisibleToken(tokens);
    if (first === undefined || (first.type !== AiqLexer.MATCH && first.type !== AiqLexer.OPTIONAL)) {
      throw new AiqQueryError("AIQ_UNSUPPORTED_SYNTAX", "Unsupported MATCH clause", first === undefined ? sourceRange(source, 0, 0) : tokenRange(first));
    }
    throw errors[0]!;
  }
  return { tree, tokens };
}

function firstVisibleToken(tokens: readonly Token[]): Token | undefined {
  return tokens.find((token) => token.type !== Token.EOF && token.channel === Token.DEFAULT_CHANNEL);
}

class QueryErrorListener extends BaseErrorListener {
  public constructor(private readonly source: string, private readonly errors: AiqQueryError[]) {
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
    const offset = offendingSymbol?.start ?? offsetAt(this.source, line, column);
    const remainder = this.source.slice(Math.max(0, offset));
    const range = offendingSymbol === null ? sourceRange(this.source, offset, offset + 1) : tokenRange(offendingSymbol);
    if (remainder.startsWith("$") && !/^\$[A-Za-z_]/.test(remainder)) {
      this.errors.push(new AiqQueryError("AIQ_SYNTAX", `Unsupported query variable near '${remainder}'`, range));
      return;
    }
    if (message.startsWith("token recognition error")) {
      this.errors.push(new AiqQueryError("AIQ_SYNTAX", `Unsupported query token '${this.source[offset] ?? ""}'`, range));
      return;
    }
    const found = offendingSymbol?.text ?? "";
    this.errors.push(new AiqQueryError("AIQ_SYNTAX", `Invalid AIQ at ${line}:${column + 1}: ${message}${found === "" ? "" : ` (found '${found}')`}`, range));
  }
}

function lexAiq(source: string): readonly Token[] {
  const lexer = new AiqLexer(CharStream.fromString(source));
  lexer.removeErrorListeners();
  const tokenStream = new CommonTokenStream(lexer);
  tokenStream.fill();
  return tokenStream.getTokens();
}

function inferredResultKind(tokens: readonly Token[]): QueryAnalysis["resultKind"] {
  const visible = tokens.filter((token) => token.type !== Token.EOF && token.channel === Token.DEFAULT_CHANNEL);
  let returnIndex = -1;
  for (let index = visible.length - 1; index >= 0; index--) {
    if (visible[index]?.type === AiqLexer.RETURN) {
      returnIndex = index;
      break;
    }
  }
  if (returnIndex < 0) return "unknown";
  const after = visible.slice(returnIndex + 1);
  if (after[0]?.type === AiqLexer.TABLE) return after.length > 1 ? "table" : "unknown";
  return after.length > 0 ? "graph" : "unknown";
}

function queryCapabilities(query: ParsedQuery): readonly string[] {
  const capabilities = new Set<string>();
  if (query.kind === "table") capabilities.add("table-result");
  const matches = query.kind === "graph"
    ? query.matches
    : query.clauses.flatMap((clause) => clause.kind === "match" ? [clause.clause] : []);
  if (matches.some((match) => match.pattern.path !== undefined)) capabilities.add("path-traversal");
  if (matches.some((match) => match.optional)) capabilities.add("optional-match");
  if (query.kind === "table" && (query.clauses.some((clause) => clause.kind === "with")
      || projectionUsesAggregate(query.projection))) capabilities.add("aggregation-pipeline");
  return [...capabilities].sort();
}

function projectionUsesAggregate(projection: TableProjection): boolean {
  return projection.items.some((item) => item.expression.kind === "function"
    && ["count", "collect", "min", "max", "sum", "avg"].includes(item.expression.name.toLowerCase()));
}

function asAiqQueryError(cause: unknown, source: string): AiqQueryError {
  if (cause instanceof AiqQueryError) return cause;
  return new AiqQueryError("AIQ_SEMANTIC", cause instanceof Error ? cause.message : String(cause), sourceRange(source, 0, source.length));
}

function tokenRange(token: Token): QuerySourceRange {
  const text = token.text ?? "";
  const lines = text.split("\n");
  return {
    startOffset: Math.max(0, token.start),
    endOffset: Math.max(0, token.stop + 1),
    line: token.line,
    column: token.column + 1,
    endLine: token.line + lines.length - 1,
    endColumn: lines.length === 1 ? token.column + text.length + 1 : (lines.at(-1)?.length ?? 0) + 1,
  };
}

function sourceRange(source: string, startOffset: number, endOffset: number): QuerySourceRange {
  const start = lineColumnAt(source, Math.max(0, Math.min(startOffset, source.length)));
  const end = lineColumnAt(source, Math.max(0, Math.min(endOffset, source.length)));
  return { startOffset, endOffset, line: start.line, column: start.column, endLine: end.line, endColumn: end.column };
}

function lineColumnAt(source: string, offset: number): { readonly line: number; readonly column: number } {
  const before = source.slice(0, offset);
  const line = before.split("\n").length;
  const newline = before.lastIndexOf("\n");
  return { line, column: offset - newline };
}

function offsetAt(source: string, line: number, column: number): number {
  let offset = 0;
  for (let current = 1; current < line; current++) {
    const newline = source.indexOf("\n", offset);
    if (newline < 0) return source.length;
    offset = newline + 1;
  }
  return offset + column;
}

class QueryAstBuilder {
  private readonly aliases = new Set<string>();
  private readonly aliasKinds = new Map<string, QueryValueKind>();
  private anonymousPath = 0;

  query(context: QueryContext): ParsedQuery {
    const graph = context.graphQuery();
    const query = withRange(context, graph === null
      ? this.tableQuery(required(context.tableQuery(), "table query"))
      : this.graphQuery(graph));
    validateUnboundedPaths(query);
    return query;
  }

  private graphQuery(context: GraphQueryContext): ParsedGraphQuery {
    const matches = context.matchClause().map((clause) => this.matchClause(clause));
    const groupContext = context.groupByClause();
    const groupBy = groupContext === null ? undefined : this.valueExpression(groupContext.valueExpression());
    const returns = context.returnList().identifier().map(identifierText);
    return withRange(context, { kind: "graph", matches, ...(groupBy === undefined ? {} : { groupBy }), returns });
  }

  private tableQuery(context: TableQueryContext): ParsedTableQuery {
    const clauses: TableInputClause[] = context.tableInputClause().map((input) => {
      const match = input.matchClause();
      if (match !== null) {
        const pattern = this.matchPattern(match);
        const whereContext = match.expression();
        const clause = withRange(match, {
          optional: match.OPTIONAL() !== null,
          rollup: match.ROLLUP() !== null,
          pattern,
          ...(whereContext === null ? {} : { where: this.tableExpression(whereContext) }),
        });
        return withRange(input, {
          kind: "match",
          clause,
        });
      }
      const unwind = input.unwindClause();
      if (unwind !== null) {
        const alias = identifierText(unwind.identifier());
        const expression = this.tableValueExpression(unwind.valueExpression());
        this.registerAlias(alias, unwindKind(this.valueKind(expression)));
        return withRange(input, { kind: "unwind", expression, alias });
      }
      return withRange(input, { kind: "with", clause: this.withClause(required(input.withClause(), "WITH clause")) });
    });
    const projection = this.projection(context.projection());
    const orderBy = this.orderBy(context.orderByClause());
    const pagination = this.pagination(context.skipClause()?.paginationValue(), context.limitClause()?.paginationValue());
    this.validateTableOrdering(projection, orderBy, pagination.skip);
    return withRange(context, {
      kind: "table",
      clauses,
      projection,
      orderBy,
      ...pagination,
    });
  }

  private withClause(context: WithClauseContext): TableWithClause {
    const projection = this.projection(context.projection());
    const nextAliases = projection.items.map((item) => [
      required(item.alias, "WITH projection alias"),
      this.valueKind(item.expression),
    ] as const);
    this.aliases.clear();
    this.aliasKinds.clear();
    nextAliases.forEach(([alias, kind]) => this.registerAlias(alias, kind));
    const where = context.expression();
    const orderBy = this.orderBy(context.orderByClause());
    const pagination = this.pagination(context.skipClause()?.paginationValue(), context.limitClause()?.paginationValue());
    this.validateTableOrdering(projection, orderBy, pagination.skip);
    return withRange(context, {
      projection,
      ...(where === null ? {} : { where: this.tableExpression(where) }),
      orderBy,
      ...pagination,
    });
  }

  private projection(context: ProjectionContext): TableProjection {
    const items = context.projectionItem().map((item): TableProjectionItem => {
      const expression = this.tableValueExpression(item.valueExpression());
      const explicitAlias = item.identifier();
      const alias = explicitAlias === null
        ? expression.kind === "binding" ? expression.alias : undefined
        : identifierText(explicitAlias);
      if (alias === undefined) {
        throw new Error("Table projection expressions must use AS name");
      }
      return withRange(item, { expression, alias });
    });
    const names = items.map((item) => item.alias);
    if (new Set(names).size !== names.length) throw new Error("Table projection column names must be unique");
    return withRange(context, { distinct: context.DISTINCT() !== null, items });
  }

  private orderBy(context: OrderByClauseContext | null): readonly TableOrderItem[] {
    return context?.orderItem().map((item) => withRange(item, {
      alias: identifierText(item.identifier()),
      direction: item.DESC() === null ? "asc" : "desc",
    })) ?? [];
  }

  private pagination(
    skipContext: { NUMBER(): { getText(): string } | null; VARIABLE(): { getText(): string } | null } | null | undefined,
    limitContext: { NUMBER(): { getText(): string } | null; VARIABLE(): { getText(): string } | null } | null | undefined,
  ): { readonly skip?: PaginationExpression; readonly limit?: PaginationExpression } {
    const parse = (context: typeof skipContext): PaginationExpression | undefined => {
      if (context === null || context === undefined) return undefined;
      const variable = context.VARIABLE();
      if (variable !== null) return withRange(context as unknown as { readonly start?: Token | null; readonly stop?: Token | null }, { kind: "parameter" as const, name: variable.getText().slice(1) });
      const value = Number(required(context.NUMBER(), "pagination number").getText());
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("SKIP and LIMIT require non-negative safe integers");
      return withRange(context as unknown as { readonly start?: Token | null; readonly stop?: Token | null }, { kind: "number" as const, value });
    };
    const skip = parse(skipContext);
    const limit = parse(limitContext);
    return { ...(skip === undefined ? {} : { skip }), ...(limit === undefined ? {} : { limit }) };
  }

  private validateTableOrdering(
    projection: TableProjection,
    orderBy: readonly TableOrderItem[],
    skip: PaginationExpression | undefined,
  ): void {
    if (skip !== undefined && orderBy.length === 0) throw new Error("AIQ_SKIP_REQUIRES_ORDER_BY: SKIP requires ORDER BY");
    const names = new Set(projection.items.map((item) => item.alias));
    for (const item of orderBy) {
      if (!names.has(item.alias)) throw new Error(`ORDER BY references unknown projected alias '${item.alias}'`);
    }
  }

  private matchClause(context: MatchClauseContext): MatchClause {
    const pattern = this.matchPattern(context);
    const whereContext = context.expression();
    const where = whereContext === null ? undefined : this.expression(whereContext);
    return withRange(context, {
      optional: context.OPTIONAL() !== null,
      rollup: context.ROLLUP() !== null,
      pattern,
      ...(where === undefined ? {} : { where }),
    });
  }

  private matchPattern(context: MatchClauseContext): QueryPattern {
    const path = context.pathAssignment();
    if (path !== null) return this.pathPattern(required(path.pathPattern(), "path pattern"), identifierText(path.identifier()), path.SHORTEST_PATH() === null ? "all" : "shortest");
    const anonymousPath = context.pathPattern();
    if (anonymousPath !== null) return this.pathPattern(anonymousPath, `__path${this.anonymousPath++}`, "all");
    return this.pattern(required(context.pattern(), "match pattern"));
  }

  private pathPattern(parsed: PathPatternContext, alias: string, mode: "shortest" | "all"): QueryPattern {
    const nodes = parsed.nodePattern();
    const left = this.nodePattern(required(nodes[0], "left path node"));
    const relationshipContext = required(parsed.pathRelationshipPattern(), "path relationship pattern");
    const relationship = this.pathRelationshipPattern(relationshipContext);
    const right = this.nodePattern(required(nodes[1], "right path node"));
    const direction = parsed.ARROW_LEFT() !== null
      ? "incoming"
      : parsed.ARROW_RIGHT() !== null ? "outgoing" : "undirected";
    const range = relationshipContext.pathRange();
    const rangeText = range?.getText() ?? "";
    let min = 1;
    let max: number | undefined;
    if (rangeText.includes("..")) {
      const [minimum, maximum] = rangeText.split("..");
      min = minimum === "" || minimum === undefined ? 1 : pathBound(minimum, "minimum");
      max = maximum === "" ? undefined : pathBound(maximum ?? "", "maximum");
    } else if (rangeText !== "") {
      min = pathBound(rangeText, "length");
      max = min;
    }
    if (max !== undefined && max < min) throw new Error("Path maximum must be greater than or equal to its minimum");
    if (mode === "shortest" && min > 1) throw new Error("shortestPath supports a minimum of 0 or 1");
    if (relationship.selectors.has("projected") || relationship.selectors.has("withProjected")) {
      throw new Error("AIQ_PROJECTED_TRAVERSAL_UNSUPPORTED: projected relationships cannot be traversed by variable-length paths");
    }
    this.registerAlias(alias, "path");
    return withRange(parsed, {
      left,
      relationship,
      right,
      direction,
      path: { alias, mode, min, ...(max === undefined ? {} : { max }), range: contextRange(parsed) },
    });
  }

  private pathRelationshipPattern(context: PathRelationshipPatternContext): RelationshipPattern {
    const identifiers = context.identifier();
    const hasColon = context.COLON() !== null;
    const alias = identifiers.length === 0 || (identifiers.length === 1 && hasColon)
      ? undefined
      : identifierText(required(identifiers[0], "path relationship alias"));
    const type = !hasColon
      ? undefined
      : identifierText(required(identifiers[identifiers.length - 1], "path relationship type"));
    if (alias !== undefined) this.registerAlias(alias, "relationship-list");
    const properties: Record<string, QueryValue> = {};
    const selectors = new Set<string>();
    for (const entry of context.relationshipProperties()?.relationshipProperty() ?? []) {
      const name = identifierText(entry.identifier());
      const value = entry.queryValue();
      if (value === null) selectors.add(name);
      else properties[name] = this.queryValue(value);
    }
    return withRange(context, { ...(alias === undefined ? {} : { alias }), ...(type === undefined ? {} : { type }), properties, selectors });
  }

  private pattern(context: PatternContext): QueryPattern {
    const nodes = context.nodePattern();
    const left = this.nodePattern(required(nodes[0], "left node pattern"));
    const relationshipContext = context.relationshipPattern();
    if (relationshipContext === null) return withRange(context, { left });
    const relationship = this.relationshipPattern(relationshipContext);
    const right = this.nodePattern(required(nodes[1], "right node pattern"));
    const direction = context.ARROW_LEFT() !== null
      ? "incoming"
      : context.ARROW_RIGHT() !== null ? "outgoing" : "undirected";
    return withRange(context, { left, relationship, right, direction });
  }

  private nodePattern(context: NodePatternContext): NodePattern {
    const identifiers = context.identifier();
    const alias = identifierText(required(identifiers[0], "node alias"));
    this.registerAlias(alias, "node");
    const label = identifiers[1] === undefined ? undefined : identifierText(identifiers[1]);
    const entries = context.nodeProperties()?.nodeProperty() ?? [];
    const properties = Object.fromEntries(entries.map((entry) => [
      identifierText(entry.identifier()),
      this.queryValue(entry.queryValue()),
    ]));
    return withRange(context, { alias, ...(label === undefined ? {} : { label }), properties });
  }

  private relationshipPattern(context: RelationshipPatternContext): RelationshipPattern {
    const identifiers = context.identifier();
    const hasColon = context.COLON() !== null;
    const alias = identifiers.length === 0 || (identifiers.length === 1 && hasColon)
      ? undefined
      : identifierText(required(identifiers[0], "relationship alias"));
    const type = !hasColon
      ? undefined
      : identifierText(required(identifiers[identifiers.length - 1], "relationship type"));
    if (alias !== undefined) this.registerAlias(alias, "relationship");
    const properties: Record<string, QueryValue> = {};
    const selectors = new Set<string>();
    for (const entry of context.relationshipProperties()?.relationshipProperty() ?? []) {
      const name = identifierText(entry.identifier());
      const value = entry.queryValue();
      if (value === null) selectors.add(name);
      else properties[name] = this.queryValue(value);
    }
    return withRange(context, {
      ...(alias === undefined ? {} : { alias }),
      ...(type === undefined ? {} : { type }),
      properties,
      selectors,
    });
  }

  private expression(context: ExpressionContext): Expression {
    return withRange(context, this.orExpression(context.orExpression()));
  }

  private orExpression(context: OrExpressionContext): Expression {
    return foldExpression("or", context.andExpression().map((item) => this.andExpression(item)));
  }

  private andExpression(context: AndExpressionContext): Expression {
    return foldExpression("and", context.notExpression().map((item) => this.notExpression(item)));
  }

  private notExpression(context: NotExpressionContext): Expression {
    const nested = context.notExpression();
    return nested === null
      ? this.primaryExpression(required(context.primaryExpression(), "primary expression"))
      : withRange(context, { kind: "not", expression: this.notExpression(nested) });
  }

  private primaryExpression(context: PrimaryExpressionContext): Expression {
    const nested = context.expression();
    return withRange(context, nested === null
      ? this.comparison(required(context.comparison(), "comparison"))
      : this.expression(nested));
  }

  private comparison(context: ComparisonContext): Expression {
    const values = context.valueExpression();
    const left = this.valueExpression(required(values[0], "left expression"));
    if (context.IS() !== null) {
      const expression: Expression = withRange(context, {
        kind: "is",
        left,
        target: context.NULL() === null
          ? identifierText(required(context.identifier(), "IS target"))
          : "NULL",
      });
      return context.NOT() === null ? expression : withRange(context, { kind: "not", expression });
    }
    const right = this.valueExpression(required(values[1], "right expression"));
    if (context.IN() !== null) return withRange(context, { kind: "in", left, right });
    const operatorContext = required(context.comparisonOperator(), "comparison operator");
    const operator = operatorContext.EQUALS() !== null
      ? "eq"
      : operatorContext.NOT_EQUALS() !== null ? "ne" : "contains";
    return withRange(context, { kind: "compare", operator, left, right });
  }

  private valueExpression(context: ValueExpressionContext): ValueExpression {
    const atom = context.valueAtom();
    const list = atom.listExpression();
    if (list !== null) {
      return withRange(context, { kind: "list", values: list.valueExpression().map((value) => this.legacyQueryValue(value)) });
    }
    const variable = atom.VARIABLE();
    if (variable !== null) return withRange(context, { kind: "variable", name: variable.getText().slice(1) });
    const string = atom.STRING();
    if (string !== null) return withRange(context, { kind: "literal", value: unquote(string.getText()) });
    const firstContext = atom.identifier();
    if (firstContext === null) throw new Error(`Unsupported value '${context.getText()}' in graph query`);
    const first = identifierText(firstContext);
    const properties = context.identifier();
    if (properties[0] !== undefined) {
      if (properties.length > 1) throw new Error("Graph query properties support one dereference");
      return withRange(context, { kind: "property", alias: first, property: identifierText(properties[0]) });
    }
    return withRange(context, this.aliases.has(first)
      ? { kind: "binding", alias: first }
      : { kind: "literal", value: first });
  }

  private legacyQueryValue(context: ValueExpressionContext): QueryValue {
    const value = this.tableValueExpression(context);
    if (value.kind === "parameter") return withRange(context, { kind: "variable", name: value.name });
    if (value.kind === "literal") return withRange(context, { kind: "literal", value: value.value === null ? "null" : String(value.value) });
    throw new Error(`Expected query value, found '${context.getText()}'`);
  }

  private tableExpression(context: ExpressionContext): TableExpression {
    return withRange(context, this.tableOrExpression(context.orExpression()));
  }

  private tableOrExpression(context: OrExpressionContext): TableExpression {
    return foldTableExpression("or", context.andExpression().map((item) => this.tableAndExpression(item)));
  }

  private tableAndExpression(context: AndExpressionContext): TableExpression {
    return foldTableExpression("and", context.notExpression().map((item) => this.tableNotExpression(item)));
  }

  private tableNotExpression(context: NotExpressionContext): TableExpression {
    const nested = context.notExpression();
    return nested === null
      ? this.tablePrimaryExpression(required(context.primaryExpression(), "primary expression"))
      : withRange(context, { kind: "not", expression: this.tableNotExpression(nested) });
  }

  private tablePrimaryExpression(context: PrimaryExpressionContext): TableExpression {
    const nested = context.expression();
    return withRange(context, nested === null
      ? this.tableComparison(required(context.comparison(), "comparison"))
      : this.tableExpression(nested));
  }

  private tableComparison(context: ComparisonContext): TableExpression {
    const values = context.valueExpression();
    const left = this.tableValueExpression(required(values[0], "left expression"));
    if (context.IS() !== null) {
      const target = context.NULL() === null
        ? identifierText(required(context.identifier(), "IS target"))
        : "null";
      const expression: TableExpression = withRange(context, { kind: "is", left, target });
      return context.NOT() === null ? expression : withRange(context, { kind: "not", expression });
    }
    if (context.IN() !== null) {
      return withRange(context, { kind: "in", left, right: this.tableValueExpression(required(values[1], "IN expression")) });
    }
    const operator = context.comparisonOperator();
    if (operator === null) return withRange(context, { kind: "truthy", expression: left });
    const right = this.tableValueExpression(required(values[1], "right expression"));
    const kind: TableComparisonOperator = operator.EQUALS() !== null ? "eq"
      : operator.NOT_EQUALS() !== null ? "ne"
      : operator.LESS_THAN() !== null ? "lt"
      : operator.LESS_THAN_OR_EQUAL() !== null ? "lte"
      : operator.GREATER_THAN() !== null ? "gt"
      : operator.GREATER_THAN_OR_EQUAL() !== null ? "gte"
      : "contains";
    return withRange(context, { kind: "compare", operator: kind, left, right });
  }

  private tableValueExpression(context: ValueExpressionContext): TableValueExpression {
    let expression = this.tableValueAtom(context.valueAtom());
    for (const property of context.identifier()) {
      const name = identifierText(property);
      const targetKind = this.valueKind(expression);
      if (targetKind === "path" && !["nodes", "relationships", "steps", "length"].includes(name)) {
        throw new AiqQueryError("AIQ_UNKNOWN_PROPERTY", `Unknown Path property '${name}'`, contextRange(property));
      }
      if (targetKind === "step" && !["index", "from", "to", "relationshipId", "direction"].includes(name)) {
        throw new AiqQueryError("AIQ_UNKNOWN_PROPERTY", `Unknown path-step property '${name}'`, contextRange(property));
      }
      expression = { kind: "property", target: expression, property: name };
    }
    return withRange(context, expression);
  }

  private tableValueAtom(context: ReturnType<ValueExpressionContext["valueAtom"]>): TableValueExpression {
    const list = context.listExpression();
    if (list !== null) return this.tableListExpression(list);
    const call = context.functionCall();
    if (call !== null) return this.tableFunction(call);
    const variable = context.VARIABLE();
    if (variable !== null) return withRange(context, { kind: "parameter", name: variable.getText().slice(1) });
    const string = context.STRING();
    if (string !== null) return withRange(context, { kind: "literal", value: unquote(string.getText()) });
    const number = context.NUMBER();
    if (number !== null) {
      const value = Number(number.getText());
      if (!Number.isFinite(value)) throw new AiqQueryError("AIQ_TYPE_ERROR", "Numeric literals must be finite", contextRange(context));
      return withRange(context, { kind: "literal", value });
    }
    if (context.TRUE() !== null) return withRange(context, { kind: "literal", value: true });
    if (context.FALSE() !== null) return withRange(context, { kind: "literal", value: false });
    if (context.NULL() !== null) return withRange(context, { kind: "literal", value: null });
    const identifier = identifierText(required(context.identifier(), "value"));
    if (!this.aliases.has(identifier)) {
      throw new AiqQueryError("AIQ_UNKNOWN_ALIAS", `Unknown table alias '${identifier}'`, contextRange(context));
    }
    return withRange(context, { kind: "binding", alias: identifier });
  }

  private tableFunction(context: FunctionCallContext): TableValueExpression {
    const identifiers = context.identifier();
    const name = identifierText(required(identifiers[0], "function name"));
    const definition = aiqFunction(name);
    if (definition === undefined) throw new AiqQueryError("AIQ_UNKNOWN_FUNCTION", `Unknown AIQ function '${name}'`, contextRange(context));
    if (context.IN() !== null) {
      if (definition.kind !== "quantifier") {
        throw new AiqQueryError("AIQ_FUNCTION_SIGNATURE", `Function '${name}' does not accept an IN predicate`, contextRange(context));
      }
      const alias = identifierText(required(identifiers[1], "quantifier alias"));
      const source = this.tableValueExpression(required(context.valueExpression()[0], "quantifier source"));
      const alreadyKnown = this.aliases.has(alias);
      const previousKind = this.aliasKinds.get(alias);
      this.registerAlias(alias, unwindKind(this.valueKind(source)));
      const predicateContext = context.expression();
      const predicate = predicateContext === null ? undefined : this.tableExpression(predicateContext);
      if (!alreadyKnown) this.removeAlias(alias);
      else this.registerAlias(alias, previousKind ?? "value");
      return withRange(context, { kind: "quantifier", name, alias, source, ...(predicate === undefined ? {} : { predicate }) });
    }
    if (definition.kind === "quantifier") {
      throw new AiqQueryError("AIQ_FUNCTION_SIGNATURE", `${name} requires the form ${definition.signature}`, contextRange(context));
    }
    const arguments_ = context.valueExpression();
    const distinct = context.DISTINCT() !== null;
    const star = context.STAR() !== null;
    if ((star && definition.acceptsStar !== true)
        || (distinct && definition.acceptsDistinct !== true)
        || (!star && (arguments_.length < definition.minArguments || arguments_.length > definition.maxArguments))) {
      throw new AiqQueryError("AIQ_FUNCTION_SIGNATURE", `${name} requires the form ${definition.signature}`, contextRange(context));
    }
    return withRange(context, {
      kind: "function",
      name,
      arguments: arguments_.map((value) => this.tableValueExpression(value)),
      distinct,
      star,
    });
  }

  private tableListExpression(context: ListExpressionContext): TableValueExpression {
    if (context.IN() === null) {
      return withRange(context, { kind: "list", values: context.valueExpression().map((value) => this.tableValueExpression(value)) });
    }
    const alias = identifierText(required(context.identifier(), "list comprehension alias"));
    const values = context.valueExpression();
    const source = this.tableValueExpression(required(values[0], "list comprehension source"));
    const alreadyKnown = this.aliases.has(alias);
    const previousKind = this.aliasKinds.get(alias);
    this.registerAlias(alias, unwindKind(this.valueKind(source)));
    const predicateContext = context.expression();
    const predicate = predicateContext === null ? undefined : this.tableExpression(predicateContext);
    const projection = this.tableValueExpression(required(values[1], "list comprehension projection"));
    if (!alreadyKnown) this.removeAlias(alias);
    else this.registerAlias(alias, previousKind ?? "value");
    return withRange(context, { kind: "listComprehension", alias, source, ...(predicate === undefined ? {} : { predicate }), projection });
  }

  private registerAlias(alias: string, kind: QueryValueKind): void {
    this.aliases.add(alias);
    this.aliasKinds.set(alias, kind);
  }

  private removeAlias(alias: string): void {
    this.aliases.delete(alias);
    this.aliasKinds.delete(alias);
  }

  private valueKind(expression: TableValueExpression): QueryValueKind {
    if (expression.kind === "binding") return this.aliasKinds.get(expression.alias) ?? "value";
    if (expression.kind === "property") {
      const target = this.valueKind(expression.target);
      if (target === "path") {
        if (expression.property === "nodes") return "node-list";
        if (expression.property === "relationships") return "relationship-list";
        if (expression.property === "steps") return "step-list";
      }
      return "value";
    }
    if (expression.kind === "function") {
      const name = expression.name.toLowerCase();
      if (name === "nodes") return "node-list";
      if (name === "relationships") return "relationship-list";
    }
    if (expression.kind === "list" || expression.kind === "listComprehension") return "value-list";
    return "value";
  }

  private queryValue(context: QueryValueContext): QueryValue {
    const variable = context.VARIABLE();
    if (variable !== null) return withRange(context, { kind: "variable", name: variable.getText().slice(1) });
    const string = context.STRING();
    if (string !== null) return withRange(context, { kind: "literal", value: unquote(string.getText()) });
    const scalar = context.NUMBER()?.getText()
      ?? context.TRUE()?.getText()
      ?? context.FALSE()?.getText()
      ?? context.NULL()?.getText();
    if (scalar !== undefined) return withRange(context, { kind: "literal", value: scalar });
    return withRange(context, { kind: "literal", value: identifierText(required(context.identifier(), "query value")) });
  }
}

export function isEndpointReachabilityClause(query: ParsedTableQuery, clauseIndex: number): boolean {
  const input = query.clauses[clauseIndex];
  if (input?.kind !== "match" || clauseIndex !== query.clauses.length - 1) return false;
  const { clause } = input;
  const pattern = clause.pattern;
  if (clause.optional || clause.rollup || clause.where !== undefined || pattern.path?.mode !== "all"
      || pattern.path.min > 1 || pattern.right === undefined || pattern.relationship?.alias !== undefined
      || !query.projection.distinct) return false;
  return query.projection.items.every((item) => {
    if (containsTableAggregate(item.expression)) return false;
    const aliases = tableValueAliases(item.expression);
    return [...aliases].every((alias) => alias === pattern.right!.alias);
  });
}

function validateUnboundedPaths(query: ParsedQuery): void {
  if (query.kind === "graph") {
    if (query.matches.some((match) => match.pattern.path?.mode === "all" && match.pattern.path.max === undefined)) {
      throw new Error("Variable-length path enumeration requires a finite maximum");
    }
    return;
  }
  query.clauses.forEach((input, index) => {
    if (input.kind === "match" && input.clause.pattern.path?.mode === "all"
        && input.clause.pattern.path.max === undefined && !isEndpointReachabilityClause(query, index)) {
      throw new Error("Unbounded variable-length paths require endpoint-only RETURN TABLE DISTINCT reachability");
    }
  });
}

function containsTableAggregate(expression: TableValueExpression): boolean {
  if (expression.kind === "function") {
    if (["count", "collect", "min", "max", "sum", "avg"].includes(expression.name.toLowerCase())) return true;
    return expression.arguments.some(containsTableAggregate);
  }
  if (expression.kind === "property") return containsTableAggregate(expression.target);
  if (expression.kind === "list") return expression.values.some(containsTableAggregate);
  if (expression.kind === "quantifier") return containsTableAggregate(expression.source);
  if (expression.kind === "listComprehension") {
    return containsTableAggregate(expression.source) || containsTableAggregate(expression.projection);
  }
  return false;
}

function tableValueAliases(expression: TableValueExpression, locals: ReadonlySet<string> = new Set()): ReadonlySet<string> {
  if (expression.kind === "binding") return locals.has(expression.alias) ? new Set() : new Set([expression.alias]);
  if (expression.kind === "property") return tableValueAliases(expression.target, locals);
  if (expression.kind === "list") return mergeAliasSets(expression.values.map((value) => tableValueAliases(value, locals)));
  if (expression.kind === "function") return mergeAliasSets(expression.arguments.map((value) => tableValueAliases(value, locals)));
  if (expression.kind === "quantifier") {
    return mergeAliasSets([
      tableValueAliases(expression.source, locals),
      ...(expression.predicate === undefined ? [] : [tableExpressionAliases(expression.predicate, new Set([...locals, expression.alias]))]),
    ]);
  }
  if (expression.kind === "listComprehension") {
    const nestedLocals = new Set([...locals, expression.alias]);
    return mergeAliasSets([
      tableValueAliases(expression.source, locals),
      ...(expression.predicate === undefined ? [] : [tableExpressionAliases(expression.predicate, nestedLocals)]),
      tableValueAliases(expression.projection, nestedLocals),
    ]);
  }
  return new Set();
}

function tableExpressionAliases(expression: TableExpression, locals: ReadonlySet<string>): ReadonlySet<string> {
  if (expression.kind === "and" || expression.kind === "or") {
    return mergeAliasSets([tableExpressionAliases(expression.left, locals), tableExpressionAliases(expression.right, locals)]);
  }
  if (expression.kind === "not") return tableExpressionAliases(expression.expression, locals);
  if (expression.kind === "truthy") return tableValueAliases(expression.expression, locals);
  if (expression.kind === "is") return tableValueAliases(expression.left, locals);
  return mergeAliasSets([tableValueAliases(expression.left, locals), tableValueAliases(expression.right, locals)]);
}

function mergeAliasSets(sets: readonly ReadonlySet<string>[]): ReadonlySet<string> {
  return new Set(sets.flatMap((set) => [...set]));
}

type QueryValueKind = "node" | "relationship" | "path" | "step" | "value"
  | "node-list" | "relationship-list" | "step-list" | "value-list";

function unwindKind(kind: QueryValueKind): QueryValueKind {
  if (kind === "node-list") return "node";
  if (kind === "relationship-list") return "relationship";
  if (kind === "step-list") return "step";
  return "value";
}

function contextRange(context: { readonly start?: Token | null; readonly stop?: Token | null }): QuerySourceRange {
  const start = context.start;
  const stop = context.stop ?? start;
  if (start === null || start === undefined || stop === null || stop === undefined) return { startOffset: 0, endOffset: 0, line: 1, column: 1, endLine: 1, endColumn: 1 };
  const first = tokenRange(start);
  const last = tokenRange(stop);
  return { ...first, endOffset: last.endOffset, endLine: last.endLine, endColumn: last.endColumn };
}

function withRange<T extends object>(
  context: { readonly start?: Token | null; readonly stop?: Token | null },
  value: T,
): T & { readonly range: QuerySourceRange } {
  return { ...value, range: contextRange(context) };
}

function identifierText(context: IdentifierContext): string {
  return context.getText();
}

function unquote(value: string): string {
  return value.slice(1, -1).replace(/\\(['\\nrt])/g, (_match, escaped: string) => {
    if (escaped === "n") return "\n";
    if (escaped === "r") return "\r";
    if (escaped === "t") return "\t";
    return escaped;
  });
}

function pathBound(value: string, description: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Path ${description} must be a non-negative integer`);
  return parsed;
}

function foldExpression(kind: "and" | "or", operands: readonly Expression[]): Expression {
  const first = required(operands[0], `${kind} expression`);
  return operands.slice(1).reduce<Expression>((left, right) => {
    const range = mergedRange(left.range, right.range);
    const expression: Expression = kind === "and" ? { kind: "and", left, right } : { kind: "or", left, right };
    return range === undefined ? expression : { ...expression, range };
  }, first);
}

function foldTableExpression(kind: "and" | "or", operands: readonly TableExpression[]): TableExpression {
  const first = required(operands[0], `${kind} expression`);
  return operands.slice(1).reduce<TableExpression>((left, right) => {
    const range = mergedRange(left.range, right.range);
    const expression: TableExpression = kind === "and" ? { kind: "and", left, right } : { kind: "or", left, right };
    return range === undefined ? expression : { ...expression, range };
  }, first);
}

function mergedRange(left: QuerySourceRange | undefined, right: QuerySourceRange | undefined): QuerySourceRange | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return { ...left, endOffset: right.endOffset, endLine: right.endLine, endColumn: right.endColumn };
}

function required<T>(value: T | null | undefined, description: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Invalid AIQ parse tree: missing ${description}`);
  }
  return value;
}
