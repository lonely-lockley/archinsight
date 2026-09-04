import {
  BaseErrorListener,
  CharStream,
  CommonTokenStream,
  Parser,
  RecognitionException,
  Recognizer,
  Token,
  type ATNSimulator,
} from "antlr4ng";
import type { LanguageDiagnostic, SourceLocation } from "./contracts.js";
import { InsightLexer } from "./generated/InsightLexer.js";
import { InsightParser } from "./generated/InsightParser.js";

export interface AntlrTokenLike {
  readonly type?: number;
  readonly tokenType?: number;
  readonly text?: string;
  readonly start?: number;
  readonly stop?: number;
  readonly startIndex?: number;
  readonly stopIndex?: number;
  readonly tokenIndex?: number;
  readonly line?: number;
  readonly column?: number;
  readonly charPositionInLine?: number;
  getType?(): number;
  getText?(): string;
  getStartIndex?(): number;
  getStopIndex?(): number;
  getTokenIndex?(): number;
  getLine?(): number;
  getCharPositionInLine?(): number;
}

export interface AntlrParseTreeLike {
  readonly children?: readonly (AntlrParseTreeLike | null)[];
  readonly childCount?: number;
  readonly ruleIndex?: number;
  readonly start?: AntlrTokenLike | null;
  readonly stop?: AntlrTokenLike | null;
  readonly symbol?: AntlrTokenLike | null;
  getChild?(index: number): AntlrParseTreeLike | null;
  getChildCount?(): number;
  getRuleIndex?(): number;
  getStart?(): AntlrTokenLike | null;
  getStop?(): AntlrTokenLike | null;
  getSymbol?(): AntlrTokenLike | null;
  getText?(): string;
}

export interface AntlrSyntaxErrorLike {
  readonly offset?: number;
  readonly line: number;
  readonly column: number;
  readonly message?: string;
  readonly expectedTokenTypes: readonly number[];
}

export interface AntlrParseFailureLike {
  readonly message: string;
}

export type TokenNameResolver = readonly string[] | ReadonlyMap<number, string> | ((type: number) => string);

export type ParsedSourceRole = "empty" | "definitions" | "architecture" | "environment" | "mixed" | "unknown";

export interface SourceAnalysisMetadata {
  readonly role: ParsedSourceRole;
  readonly contributesToSnapshot: boolean;
  readonly dependencySignature: string;
  readonly supportDependencySignature: string;
  readonly reliable: boolean;
}

export interface SourceRange {
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface ParsedSource {
  readonly sourceName: string;
  readonly source: string;
  readonly tree?: AntlrParseTreeLike;
  readonly tokens: readonly AntlrTokenLike[];
  readonly ruleNames: readonly string[];
  readonly tokenName: TokenNameResolver;
  readonly syntax: ParsedSyntaxModel;
  readonly syntaxErrors: readonly AntlrSyntaxErrorLike[];
  readonly diagnostics: readonly LanguageDiagnostic[];
  readonly metadata: SourceAnalysisMetadata;
  readonly parseFailure?: AntlrParseFailureLike;
}

export class ParsedSyntaxModel {
  constructor(
    readonly root: AntlrParseTreeLike | undefined,
    readonly ruleNames: readonly string[],
    readonly tokenName: TokenNameResolver,
  ) {
    Object.freeze(this);
  }

  children<T = AntlrParseTreeLike>(rule: string, tree = this.root): T[] {
    return tree === undefined ? [] : directChildrenByRule<T>(tree, rule, this.ruleNames);
  }

  firstChild<T = AntlrParseTreeLike>(rule: string, tree = this.root): T | undefined {
    return tree === undefined ? undefined : firstChildByRule<T>(tree, rule, this.ruleNames);
  }

  descendants<T = AntlrParseTreeLike>(rule: string, tree = this.root): T[] {
    return tree === undefined ? [] : descendantsByRule<T>(tree, rule, this.ruleNames);
  }

  firstDescendant<T = AntlrParseTreeLike>(rule: string, tree = this.root): T | undefined {
    return tree === undefined ? undefined : firstDescendantByRule<T>(tree, rule, this.ruleNames);
  }

  firstToken(name: string, tree = this.root): AntlrTokenLike | undefined {
    return tree === undefined ? undefined : firstTokenByName(tree, name, this.tokenName);
  }

  text(tree: AntlrParseTreeLike): string {
    return textOf(tree);
  }

  range(tree: AntlrParseTreeLike): SourceRange {
    return sourceRangeOf(tree);
  }

  location(tree: AntlrParseTreeLike | undefined, sourceName: string): SourceLocation {
    return sourceLocationOf(tree, sourceName);
  }
}

export interface ParseInsightSourceRequest {
  readonly sourceName: string;
  readonly source: string;
}

export interface InsightTokenization {
  readonly tokens: readonly AntlrTokenLike[];
  readonly tokenName: TokenNameResolver;
}

const definitionRules = [
  "defineTypeDeclaration",
  "defineOperatorDeclaration",
  "defineEnumDeclaration",
  "definePresentationDeclaration",
  "extendTypeDeclaration",
  "extendEnumDeclaration",
  "extendPresentationDeclaration",
] as const;

export function parseInsightSource(request: ParseInsightSourceRequest): ParsedSource {
  const syntaxErrors: AntlrSyntaxErrorLike[] = [];
  const diagnostics: LanguageDiagnostic[] = [];
  const lexicalFailures: string[] = [];
  const input = CharStream.fromString(request.source);
  const lexer = new InsightLexer(input);
  const lexerErrorListener = new ParserErrorListener(request.sourceName, syntaxErrors, diagnostics, undefined, lexicalFailures);
  lexer.removeErrorListeners();
  lexer.addErrorListener(lexerErrorListener);

  const tokenStream = new CommonTokenStream(lexer);
  const parser = new InsightParser(tokenStream);
  const parserErrorListener = new ParserErrorListener(request.sourceName, syntaxErrors, diagnostics, parser);
  parser.removeErrorListeners();
  parser.addErrorListener(parserErrorListener);

  try {
    const tree = parser.insight();
    tokenStream.fill();
    const tokens = tokenStream.getTokens();
    if (lexicalFailures.length > 0) {
      return failedParsedSource(request, tokens, syntaxErrors, diagnostics, lexicalFailures[0]!);
    }
    return Object.freeze({
      ...request,
      tree,
      tokens: Object.freeze([...tokens]),
      ruleNames: InsightParser.ruleNames,
      tokenName: generatedTokenName,
      syntax: new ParsedSyntaxModel(tree, InsightParser.ruleNames, generatedTokenName),
      syntaxErrors: Object.freeze([...syntaxErrors]),
      diagnostics: Object.freeze([...diagnostics]),
      metadata: sourceAnalysisMetadata(tree, tokens, syntaxErrors.length === 0, generatedTokenName),
    });
  } catch (error) {
    const tokens = tokensAfterParserFailure(request.source);
    const message = error instanceof Error ? error.message : String(error);
    if (diagnostics.length === 0) {
      diagnostics.push({
        code: "SYNTAX_ERROR",
        message,
        sourceName: request.sourceName,
        line: 1,
        column: 1,
      });
    }
    return failedParsedSource(request, tokens, syntaxErrors, diagnostics, message);
  }
}

function failedParsedSource(
  request: ParseInsightSourceRequest,
  tokens: readonly AntlrTokenLike[],
  syntaxErrors: readonly AntlrSyntaxErrorLike[],
  diagnostics: readonly LanguageDiagnostic[],
  message: string,
): ParsedSource {
  return Object.freeze({
    ...request,
    tokens: Object.freeze([...tokens]),
    ruleNames: InsightParser.ruleNames,
    tokenName: generatedTokenName,
    syntax: new ParsedSyntaxModel(undefined, InsightParser.ruleNames, generatedTokenName),
    syntaxErrors: Object.freeze([...syntaxErrors]),
    diagnostics: Object.freeze([...diagnostics]),
    metadata: sourceAnalysisMetadata(undefined, tokens, false, generatedTokenName),
    parseFailure: { message },
  });
}

export function tokenizeInsightSource(source: string): InsightTokenization {
  const lexer = new InsightLexer(CharStream.fromString(source));
  lexer.removeErrorListeners();
  const tokenStream = new CommonTokenStream(lexer);
  tokenStream.fill();
  return {
    tokens: Object.freeze([...tokenStream.getTokens()]),
    tokenName: generatedTokenName,
  };
}

export function childrenOf(tree: AntlrParseTreeLike): AntlrParseTreeLike[] {
  if (tree.children !== undefined) {
    return tree.children.filter((child): child is AntlrParseTreeLike => child !== null);
  }
  const count = typeof tree.getChildCount === "function" ? tree.getChildCount() : tree.childCount ?? 0;
  const result: AntlrParseTreeLike[] = [];
  for (let index = 0; index < count; index++) {
    const child = tree.getChild?.(index);
    if (child !== undefined && child !== null) {
      result.push(child);
    }
  }
  return result;
}

export function directChildrenByRule<T = AntlrParseTreeLike>(
  tree: AntlrParseTreeLike,
  targetRule: string,
  ruleNames: readonly string[] = InsightParser.ruleNames,
): T[] {
  return childrenOf(tree).filter((child) => ruleName(child, ruleNames) === targetRule) as T[];
}

export function firstChildByRule<T = AntlrParseTreeLike>(
  tree: AntlrParseTreeLike,
  targetRule: string,
  ruleNames: readonly string[] = InsightParser.ruleNames,
): T | undefined {
  return directChildrenByRule<T>(tree, targetRule, ruleNames)[0];
}

export function descendantsByRule<T = AntlrParseTreeLike>(
  tree: AntlrParseTreeLike,
  targetRule: string,
  ruleNames: readonly string[] = InsightParser.ruleNames,
): T[] {
  const result: T[] = [];
  collectDescendants(tree, targetRule, ruleNames, result);
  return result;
}

export function firstDescendantByRule<T = AntlrParseTreeLike>(
  tree: AntlrParseTreeLike,
  targetRule: string,
  ruleNames: readonly string[] = InsightParser.ruleNames,
): T | undefined {
  if (ruleName(tree, ruleNames) === targetRule) {
    return tree as T;
  }
  for (const child of childrenOf(tree)) {
    const result = firstDescendantByRule<T>(child, targetRule, ruleNames);
    if (result !== undefined) {
      return result;
    }
  }
  return undefined;
}

export function firstTokenByName(
  tree: AntlrParseTreeLike,
  targetToken: string,
  tokenNameResolver: TokenNameResolver,
): AntlrTokenLike | undefined {
  const symbol = terminalSymbol(tree);
  if (symbol !== undefined) {
    return tokenName(tokenNameResolver, tokenType(symbol)) === targetToken ? symbol : undefined;
  }
  for (const child of childrenOf(tree)) {
    const result = firstTokenByName(child, targetToken, tokenNameResolver);
    if (result !== undefined) {
      return result;
    }
  }
  return undefined;
}

export function directTerminalTokens(tree: AntlrParseTreeLike): AntlrTokenLike[] {
  return childrenOf(tree).flatMap((child) => {
    const symbol = terminalSymbol(child);
    return symbol === undefined ? [] : [symbol];
  });
}

export function firstTokenTextByName(
  tree: AntlrParseTreeLike,
  targetToken: string,
  tokenNameResolver: TokenNameResolver,
): string | undefined {
  const token = firstTokenByName(tree, targetToken, tokenNameResolver);
  return token === undefined ? undefined : tokenText(token);
}

export function ruleName(tree: AntlrParseTreeLike, ruleNames: readonly string[] = InsightParser.ruleNames): string {
  const index = typeof tree.getRuleIndex === "function" ? tree.getRuleIndex() : tree.ruleIndex;
  if (index !== undefined && index >= 0 && index < ruleNames.length) {
    return ruleNames[index] ?? "";
  }
  const constructorName = tree.constructor.name;
  return constructorName.endsWith("Context")
    ? lowerFirst(constructorName.slice(0, -"Context".length))
    : constructorName;
}

export function textOf(tree: AntlrParseTreeLike): string {
  if (typeof tree.getText === "function") {
    return tree.getText();
  }
  const symbol = terminalSymbol(tree);
  if (symbol !== undefined) {
    return tokenText(symbol);
  }
  return childrenOf(tree).map(textOf).join("");
}

export function startToken(tree: AntlrParseTreeLike): AntlrTokenLike | undefined {
  return (typeof tree.getStart === "function" ? tree.getStart() : tree.start) ?? terminalSymbol(tree);
}

export function stopToken(tree: AntlrParseTreeLike): AntlrTokenLike | undefined {
  return (typeof tree.getStop === "function" ? tree.getStop() : tree.stop) ?? terminalSymbol(tree);
}

export function terminalSymbol(tree: AntlrParseTreeLike): AntlrTokenLike | undefined {
  return (typeof tree.getSymbol === "function" ? tree.getSymbol() : tree.symbol) ?? undefined;
}

export function tokenType(token: AntlrTokenLike): number {
  return token.getType?.() ?? token.type ?? token.tokenType ?? -1;
}

export function tokenText(token: AntlrTokenLike): string {
  return token.getText?.() ?? token.text ?? "";
}

export function tokenStart(token: AntlrTokenLike): number {
  return token.getStartIndex?.() ?? token.startIndex ?? token.start ?? -1;
}

export function tokenStop(token: AntlrTokenLike): number {
  return token.getStopIndex?.() ?? token.stopIndex ?? token.stop ?? tokenStart(token);
}

export function tokenIndex(token: AntlrTokenLike | undefined): number | undefined {
  return token?.getTokenIndex?.() ?? token?.tokenIndex;
}

export function tokenLine(token: AntlrTokenLike | undefined): number {
  return token?.getLine?.() ?? token?.line ?? 1;
}

export function tokenColumn(token: AntlrTokenLike | undefined): number {
  return token?.getCharPositionInLine?.() ?? token?.charPositionInLine ?? token?.column ?? 0;
}

export function tokenName(resolver: TokenNameResolver, type: number): string {
  if (type === -1) {
    return "EOF";
  }
  if (typeof resolver === "function") {
    return resolver(type);
  }
  if (typeof (resolver as ReadonlyMap<number, string>).get === "function") {
    return (resolver as ReadonlyMap<number, string>).get(type) ?? String(type);
  }
  return (resolver as readonly string[])[type] ?? String(type);
}

export function sourceRangeOf(tree: AntlrParseTreeLike): SourceRange {
  const start = startToken(tree);
  const stop = stopToken(tree) ?? start;
  const startOffset = Math.max(0, start === undefined ? 0 : tokenStart(start));
  const stopOffset = stop === undefined ? startOffset : tokenStop(stop);
  return {
    line: tokenLine(start),
    column: tokenColumn(start) + 1,
    endLine: tokenLine(stop),
    endColumn: endColumn(stop),
    startOffset,
    endOffset: Math.max(startOffset, stopOffset + 1),
  };
}

export function sourceLocationOf(tree: AntlrParseTreeLike | undefined, sourceName: string): SourceLocation {
  if (tree === undefined) {
    return { sourceName, line: 1, column: 1 };
  }
  const range = sourceRangeOf(tree);
  return {
    sourceName,
    line: range.line,
    column: range.column,
    endLine: range.endLine,
    endColumn: range.endColumn,
  };
}

function collectDescendants<T>(
  tree: AntlrParseTreeLike,
  targetRule: string,
  ruleNames: readonly string[],
  result: T[],
): void {
  if (ruleName(tree, ruleNames) === targetRule) {
    result.push(tree as T);
  }
  for (const child of childrenOf(tree)) {
    collectDescendants(child, targetRule, ruleNames, result);
  }
}

function sourceAnalysisMetadata(
  tree: AntlrParseTreeLike | undefined,
  tokens: readonly AntlrTokenLike[],
  reliable: boolean,
  resolver: TokenNameResolver,
): SourceAnalysisMetadata {
  const hasDefinitions = tree === undefined
    ? tokensContainDefinition(tokens, resolver)
    : definitionRules.some((name) => firstDescendantByRule(tree, name, InsightParser.ruleNames) !== undefined);
  const architecture = tree === undefined
    ? false
    : firstDescendantByRule(tree, "architectureFile", InsightParser.ruleNames) !== undefined;
  const environment = tree === undefined
    ? false
    : firstDescendantByRule(tree, "environmentFile", InsightParser.ruleNames) !== undefined;
  const role: ParsedSourceRole = hasDefinitions && architecture
    ? "mixed"
    : hasDefinitions
      ? "definitions"
      : environment
        ? "environment"
        : architecture
          ? "architecture"
          : tokens.every((token) => tokenType(token) === -1 || tokenText(token).trim() === "")
            ? "empty"
            : "unknown";
  const dependencyParts = tree === undefined ? [] : dependencyPartsOf(tree);
  const supportParts = dependencyParts.filter((part) => !part.startsWith("context:") && !part.startsWith("environment:"));
  return Object.freeze({
    role,
    contributesToSnapshot: hasDefinitions,
    dependencySignature: dependencyParts.join("\n"),
    supportDependencySignature: supportParts.join("\n"),
    reliable,
  });
}

function dependencyPartsOf(tree: AntlrParseTreeLike): string[] {
  const rules = InsightParser.ruleNames;
  const parts: Array<{ readonly offset: number; readonly value: string }> = [];
  const addText = (rule: string, prefix: string): void => {
    for (const node of descendantsByRule(tree, rule, rules)) {
      parts.push({ offset: sourceRangeOf(node).startOffset, value: `${prefix}:${textOf(node)}` });
    }
  };
  addText("contextDeclarationName", "context");
  addText("environmentDeclarationName", "environment");
  for (const node of descendantsByRule(tree, "namedImportDeclaration", rules)) {
    parts.push({
      offset: sourceRangeOf(node).startOffset,
      value: [
        "import",
        childText(node, "identifierReference", rules),
        descendantText(node, "contextReference", rules) || descendantText(node, "environmentReference", rules),
        childText(node, "importAlias", rules),
      ].join(":"),
    });
  }
  for (const node of descendantsByRule(tree, "anonymousImportDeclaration", rules)) {
    parts.push({
      offset: sourceRangeOf(node).startOffset,
      value: `import:${descendantText(node, "contextReference", rules) || descendantText(node, "environmentReference", rules)}`,
    });
  }
  for (const node of descendantsByRule(tree, "objectExtension", rules)) {
    parts.push({
      offset: sourceRangeOf(node).startOffset,
      value: `extension:${childText(node, "extensionConstructor", rules)}:${childText(node, "extensionTargetReference", rules)}`,
    });
  }
  return parts.sort((left, right) => left.offset - right.offset).map((part) => part.value);
}

function childText(tree: AntlrParseTreeLike, rule: string, ruleNames: readonly string[]): string {
  const child = firstChildByRule(tree, rule, ruleNames);
  return child === undefined ? "" : textOf(child);
}

function descendantText(tree: AntlrParseTreeLike, rule: string, ruleNames: readonly string[]): string {
  const child = firstDescendantByRule(tree, rule, ruleNames);
  return child === undefined ? "" : textOf(child);
}

function tokensContainDefinition(tokens: readonly AntlrTokenLike[], resolver: TokenNameResolver): boolean {
  const visible = tokens.filter((token) => tokenType(token) !== -1).map((token) => tokenName(resolver, tokenType(token)));
  return visible.some((name, index) => {
    if (name !== "DEFINE" && name !== "EXTEND") {
      return false;
    }
    const kindIndex = name === "DEFINE" && visible[index + 1] === "ABSTRACT" ? index + 2 : index + 1;
    return ["TYPE", "OPERATOR", "ENUM", "PRESENTATION"].includes(visible[kindIndex] ?? "");
  });
}

function tokensAfterParserFailure(source: string): Token[] {
  try {
    return [...tokenizeInsightSource(source).tokens] as Token[];
  } catch {
    return [];
  }
}

function generatedTokenName(type: number): string {
  if (type === Token.EOF) {
    return "EOF";
  }
  return InsightParser.symbolicNames[type] ?? InsightParser.literalNames[type] ?? String(type);
}

function endColumn(token: AntlrTokenLike | null | undefined): number {
  if (token === undefined || token === null) {
    return 1;
  }
  const textLength = tokenText(token).length
    || (tokenStart(token) >= 0 && tokenStop(token) >= tokenStart(token) ? tokenStop(token) - tokenStart(token) + 1 : 1);
  return tokenColumn(token) + textLength + 1;
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : value[0]!.toLowerCase() + value.slice(1);
}

function optionalOffset(offset: number | undefined): { readonly offset?: number } {
  return offset === undefined || offset < 0 ? {} : { offset };
}

class ParserErrorListener extends BaseErrorListener {
  public constructor(
    private readonly sourceName: string,
    private readonly errors: AntlrSyntaxErrorLike[],
    private readonly diagnostics: LanguageDiagnostic[],
    private readonly parser?: Parser,
    private readonly failures?: string[],
  ) {
    super();
  }

  public override syntaxError<S extends Token, T extends ATNSimulator>(
    recognizer: Recognizer<T>,
    offendingSymbol: S | null,
    line: number,
    column: number,
    message: string,
    exception: RecognitionException | null,
  ): void {
    if (message.startsWith("token recognition error")) {
      this.failures?.push(message);
    }
    let expectedTokenTypes: readonly number[] = [];
    try {
      expectedTokenTypes = (exception?.getExpectedTokens()
        ?? this.parser?.getExpectedTokens()
        ?? recognizer.atn.getExpectedTokens(recognizer.state, null)).toArray();
    } catch {
      expectedTokenTypes = [];
    }
    this.errors.push({
      ...optionalOffset(offendingSymbol?.start),
      line,
      column,
      message,
      expectedTokenTypes,
    });
    this.diagnostics.push({
      code: "SYNTAX_ERROR",
      message,
      sourceName: this.sourceName,
      line,
      column: column + 1,
      endLine: offendingSymbol?.line ?? line,
      endColumn: Math.max(column + 2, endColumn(offendingSymbol)),
    });
  }
}
