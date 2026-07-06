import type {
  AntlrParseTreeLike,
  AntlrTokenLike,
  TokenNameResolver,
} from "./antlr-adapter.js";
import type { LanguageSnapshot } from "./contracts.js";
import { parseWithGeneratedInsightParser } from "./generated-provider.js";
import { TypeSystem } from "./type-system.js";

export const insightSemanticTokenTypes = [
  "keyword",
  "type",
  "operator",
  "string",
  "comment",
  "property",
  "function",
  "variable",
] as const;

export type InsightSemanticTokenType = typeof insightSemanticTokenTypes[number];

export const insightSemanticTokenModifiers = ["declaration"] as const;

export type InsightSemanticTokenModifier = typeof insightSemanticTokenModifiers[number];

export interface InsightSemanticToken {
  readonly line: number;
  readonly column: number;
  readonly length: number;
  readonly type: InsightSemanticTokenType;
  readonly modifiers?: readonly InsightSemanticTokenModifier[];
}

interface TokenClassification {
  readonly type: InsightSemanticTokenType;
  readonly modifiers?: readonly InsightSemanticTokenModifier[];
}

const emptySnapshot: LanguageSnapshot = {
  schemaVersion: "semantic-highlighting",
  types: [],
  constructors: [],
  operators: [],
  enums: [],
  presentations: [],
};

const keywordTokens = new Set([
  "DEFINE",
  "EXTEND",
  "PRESENTATION",
  "TYPE",
  "OPERATOR",
  "ENUM",
  "OF",
  "OR",
  "ON",
  "CONSTRUCTOR",
  "REQUIRED",
  "IMPORT",
  "FROM",
  "AS",
  "CONTEXT",
  "PROJECT",
  "IMPLEMENTATION",
]);

const declarationKeywordTokens = new Set(["CONSTRUCTOR", "REQUIRED"]);
const typeTokens = new Set(["LIST_TYPE", "TEXT_TYPE", "TYPE_IDENTIFIER"]);
const annotationTokens = new Set([
  "ATTRIBUTE_ANNOTATION",
  "PLANNED_ANNOTATION",
  "DEPRECATED_ANNOTATION",
  "ANNOTATION_VALUE",
]);
const projectionEndpointTokens = new Set(["PROJECTION_FROM", "PROJECTION_TO", "PROJECTION_THIS"]);
const projectionDereferenceTokens = new Set(["PROJECTION_SLOT", "PROJECTION_OWNER"]);
const neutralSymbolTokens = new Set(["ANONYMOUS_ATTRIBUTE", "COLON", "EQ", "LPAREN", "RPAREN"]);

export function semanticHighlightInsight(
  source: string,
  snapshot: LanguageSnapshot = emptySnapshot,
): readonly InsightSemanticToken[] {
  const input = parseWithGeneratedInsightParser({
    sourceName: "semantic.ai",
    source,
    cursorOffset: source.length,
    snapshot,
  });
  const typeSystem = new TypeSystem(snapshot);
  const classifications = new Map<number, TokenClassification>();
  if (input.tree !== undefined) {
    classifyTree(input.tree, input.ruleNames, input.tokenName, typeSystem, classifications);
  }
  const result: InsightSemanticToken[] = [];
  for (let index = 0; index < input.tokens.length; index++) {
    const token = input.tokens[index]!;
    const start = tokenStart(token);
    const stop = tokenStop(token);
    if (start < 0 || stop < start || tokenType(token) === -1) {
      continue;
    }
    const name = tokenName(input.tokenName, tokenType(token));
    if (isTechnicalTokenName(name)) {
      continue;
    }
    const classification = classifications.get(start) ?? fallbackClassification(name, token, nextVisibleToken(input.tokens, index, input.tokenName), input.tokenName);
    if (classification === undefined) {
      continue;
    }
    result.push({
      line: Math.max(0, tokenLine(token) - 1),
      column: Math.max(0, tokenColumn(token)),
      length: stop - start + 1,
      type: classification.type,
      ...(classification.modifiers === undefined ? {} : { modifiers: classification.modifiers }),
    });
  }
  result.sort((left, right) => left.line - right.line || left.column - right.column || left.length - right.length);
  return result;
}

function classifyTree(
  tree: AntlrParseTreeLike,
  ruleNames: readonly string[],
  tokenNameResolver: TokenNameResolver,
  typeSystem: TypeSystem,
  classifications: Map<number, TokenClassification>,
): void {
  switch (ruleName(tree, ruleNames)) {
    case "contextDeclaration":
      markFirstChildRule(tree, "contextDeclarationName", ruleNames, classifications, "variable", ["declaration"]);
      break;
    case "namedImportDeclaration":
      markFirstChildRule(tree, "identifierReference", ruleNames, classifications, "variable");
      markFirstChildRule(tree, "contextReference", ruleNames, classifications, "variable");
      markFirstChildRule(tree, "importAlias", ruleNames, classifications, "variable", ["declaration"]);
      break;
    case "objectDeclaration":
      classifyObjectDeclaration(tree, ruleNames, typeSystem, classifications);
      break;
    case "objectExtension":
      markFirstChildRule(tree, "extensionConstructor", ruleNames, classifications, "function");
      markFirstChildRule(tree, "extensionTargetReference", ruleNames, classifications, "variable");
      break;
    case "operatorInvocation":
      markFirstChildRule(tree, "operatorIdentifier", ruleNames, classifications, "operator");
      markFirstChildRule(tree, "identifierReference", ruleNames, classifications, "variable");
      break;
    case "namedList":
      markFirstChildRule(tree, "listName", ruleNames, classifications, "property", ["declaration"]);
      break;
    case "listValue":
      markFirstChildRule(tree, "identifierReference", ruleNames, classifications, "variable");
      break;
    case "typeConstructorDeclaration":
      markFirstChildRule(tree, "constructorName", ruleNames, classifications, "function", ["declaration"]);
      break;
    case "operatorConstructorDeclaration":
      markFirstChildRule(tree, "constructorIdentifier", ruleNames, classifications, "function", ["declaration"]);
      break;
    case "attributeDeclaration":
      markFirstChildRule(tree, "identifier", ruleNames, classifications, "property", ["declaration"]);
      break;
    case "anonymousListAttributeDeclaration":
      markFirstChildToken(tree, "ANONYMOUS_ATTRIBUTE", tokenNameResolver, classifications, "property", ["declaration"]);
      break;
    case "assignment":
      markFirstChildRule(tree, "attributeName", ruleNames, classifications, "property");
      break;
    case "presentationAssignment":
      markFirstChildRule(tree, "presentationPropertyIdentifier", ruleNames, classifications, "property");
      break;
    case "presentationSection":
      markFirstChildRule(tree, "identifier", ruleNames, classifications, "property", ["declaration"]);
      break;
    case "enumValueDeclaration":
      markFirstChildRule(tree, "identifier", ruleNames, classifications, "variable", ["declaration"]);
      break;
    case "projectionRule":
      markFirstChildRule(tree, "operatorIdentifier", ruleNames, classifications, "operator");
      break;
    case "projectionTerm":
      if (firstChildByRule(tree, "identifier", ruleNames) !== undefined) {
        markFirstChildRule(tree, "identifier", ruleNames, classifications, "property");
      }
      break;
    case "projectionSlotDereference":
      markFirstChildRule(tree, "identifier", ruleNames, classifications, "property");
      break;
  }

  for (const child of childrenOf(tree)) {
    classifyTree(child, ruleNames, tokenNameResolver, typeSystem, classifications);
  }
}

function classifyObjectDeclaration(
  tree: AntlrParseTreeLike,
  ruleNames: readonly string[],
  typeSystem: TypeSystem,
  classifications: Map<number, TokenClassification>,
): void {
  const prefix = firstChildByRule(tree, "namedPrefixOperatorInvocation", ruleNames);
  if (prefix !== undefined) {
    markFirstDescendantRule(prefix, "operatorIdentifier", ruleNames, classifications, "operator");
    markFirstChildRule(tree, "elementConstructor", ruleNames, classifications, "function");
    markFirstChildRule(tree, "identifierDeclaration", ruleNames, classifications, "variable", ["declaration"]);
    return;
  }

  const constructor = firstChildByRule(tree, "elementConstructor", ruleNames);
  if (constructor !== undefined && typeSystem.hasOperatorConstructor(textOf(constructor))) {
    markFirstTerminal(constructor, classifications, "operator");
    markFirstChildRule(tree, "identifierDeclaration", ruleNames, classifications, "variable");
    return;
  }

  markFirstChildRule(tree, "elementConstructor", ruleNames, classifications, "function");
  markFirstChildRule(tree, "identifierDeclaration", ruleNames, classifications, "variable", ["declaration"]);
}

function markFirstChildRule(
  tree: AntlrParseTreeLike,
  targetRule: string,
  ruleNames: readonly string[],
  classifications: Map<number, TokenClassification>,
  type: InsightSemanticTokenType,
  modifiers?: readonly InsightSemanticTokenModifier[],
): void {
  const child = firstChildByRule(tree, targetRule, ruleNames);
  if (child !== undefined) {
    markFirstTerminal(child, classifications, type, modifiers);
  }
}

function markFirstDescendantRule(
  tree: AntlrParseTreeLike,
  targetRule: string,
  ruleNames: readonly string[],
  classifications: Map<number, TokenClassification>,
  type: InsightSemanticTokenType,
  modifiers?: readonly InsightSemanticTokenModifier[],
): void {
  const child = firstDescendantByRule(tree, targetRule, ruleNames);
  if (child !== undefined) {
    markFirstTerminal(child, classifications, type, modifiers);
  }
}

function markFirstChildToken(
  tree: AntlrParseTreeLike,
  targetToken: string,
  tokenNameResolver: TokenNameResolver,
  classifications: Map<number, TokenClassification>,
  type: InsightSemanticTokenType,
  modifiers?: readonly InsightSemanticTokenModifier[],
): void {
  const token = firstTokenByName(tree, targetToken, tokenNameResolver);
  if (token !== undefined) {
    markToken(token, classifications, type, modifiers);
  }
}

function markFirstTerminal(
  tree: AntlrParseTreeLike,
  classifications: Map<number, TokenClassification>,
  type: InsightSemanticTokenType,
  modifiers?: readonly InsightSemanticTokenModifier[],
): void {
  const symbol = terminalSymbol(tree);
  if (symbol !== undefined) {
    markToken(symbol, classifications, type, modifiers);
    return;
  }
  for (const child of childrenOf(tree)) {
    const previousSize = classifications.size;
    markFirstTerminal(child, classifications, type, modifiers);
    if (classifications.size > previousSize) {
      return;
    }
  }
}

function markToken(
  token: AntlrTokenLike,
  classifications: Map<number, TokenClassification>,
  type: InsightSemanticTokenType,
  modifiers?: readonly InsightSemanticTokenModifier[],
): void {
  const start = tokenStart(token);
  if (start >= 0) {
    classifications.set(start, { type, ...(modifiers === undefined ? {} : { modifiers }) });
  }
}

function fallbackClassification(
  token: string,
  current: AntlrTokenLike,
  next: AntlrTokenLike | undefined,
  tokenNameResolver: TokenNameResolver,
): TokenClassification | undefined {
  if (token === "COMMENT") {
    return { type: "comment" };
  }
  if (token === "TEXT") {
    return { type: "string" };
  }
  if (keywordTokens.has(token)) {
    return { type: "keyword", modifiers: declarationKeywordTokens.has(token) ? ["declaration"] : [] };
  }
  if (typeTokens.has(token)) {
    return { type: "type" };
  }
  if (annotationTokens.has(token)) {
    return { type: "function" };
  }
  if (token === "OPERATOR_IDENTIFIER") {
    return { type: "operator" };
  }
  if (projectionEndpointTokens.has(token) || projectionDereferenceTokens.has(token)) {
    return { type: "variable" };
  }
  if (neutralSymbolTokens.has(token)) {
    return { type: "operator" };
  }
  if (token === "IDENTIFIER") {
    const nextName = next === undefined ? undefined : tokenName(tokenNameResolver, tokenType(next));
    if (next !== undefined && tokenLine(current) === tokenLine(next) && (nextName === "EQ" || nextName === "COLON")) {
      return { type: "property" };
    }
    return { type: "variable" };
  }
  return undefined;
}

function nextVisibleToken(
  tokens: readonly AntlrTokenLike[],
  startIndex: number,
  tokenNameResolver: TokenNameResolver,
): AntlrTokenLike | undefined {
  for (let index = startIndex + 1; index < tokens.length; index++) {
    const token = tokens[index]!;
    const name = tokenName(tokenNameResolver, tokenType(token));
    if (!isTechnicalTokenName(name)) {
      return token;
    }
  }
  return undefined;
}

function firstChildByRule(
  tree: AntlrParseTreeLike,
  targetRule: string,
  ruleNames: readonly string[],
): AntlrParseTreeLike | undefined {
  return childrenOf(tree).find((child) => ruleName(child, ruleNames) === targetRule);
}

function firstDescendantByRule(
  tree: AntlrParseTreeLike,
  targetRule: string,
  ruleNames: readonly string[],
): AntlrParseTreeLike | undefined {
  if (ruleName(tree, ruleNames) === targetRule) {
    return tree;
  }
  for (const child of childrenOf(tree)) {
    const result = firstDescendantByRule(child, targetRule, ruleNames);
    if (result !== undefined) {
      return result;
    }
  }
  return undefined;
}

function firstTokenByName(
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

function childrenOf(tree: AntlrParseTreeLike): AntlrParseTreeLike[] {
  if (tree.children !== undefined) {
    return tree.children.filter((child): child is AntlrParseTreeLike => child !== null);
  }
  const count = typeof tree.getChildCount === "function"
    ? tree.getChildCount()
    : tree.childCount ?? 0;
  const result: AntlrParseTreeLike[] = [];
  for (let index = 0; index < count; index++) {
    const child = tree.getChild?.(index);
    if (child !== undefined && child !== null) {
      result.push(child);
    }
  }
  return result;
}

function ruleName(tree: AntlrParseTreeLike, ruleNames: readonly string[]): string {
  const index = typeof tree.getRuleIndex === "function" ? tree.getRuleIndex() : tree.ruleIndex;
  if (index !== undefined && index >= 0 && index < ruleNames.length) {
    return ruleNames[index] ?? "";
  }
  const constructorName = tree.constructor.name;
  return constructorName.endsWith("Context")
    ? lowerFirst(constructorName.slice(0, -"Context".length))
    : constructorName;
}

function terminalSymbol(tree: AntlrParseTreeLike): AntlrTokenLike | undefined {
  return (typeof tree.getSymbol === "function" ? tree.getSymbol() : tree.symbol) ?? undefined;
}

function textOf(tree: AntlrParseTreeLike): string {
  if (typeof tree.getText === "function") {
    return tree.getText();
  }
  const symbol = terminalSymbol(tree);
  if (symbol !== undefined) {
    return symbol.getText?.() ?? symbol.text ?? "";
  }
  return childrenOf(tree).map(textOf).join("");
}

function tokenType(token: AntlrTokenLike): number {
  return token.getType?.() ?? token.type ?? token.tokenType ?? -1;
}

function tokenStart(token: AntlrTokenLike): number {
  return token.getStartIndex?.() ?? token.startIndex ?? token.start ?? -1;
}

function tokenStop(token: AntlrTokenLike): number {
  return token.getStopIndex?.() ?? token.stopIndex ?? token.stop ?? tokenStart(token);
}

function tokenLine(token: AntlrTokenLike | undefined): number {
  return token?.getLine?.() ?? token?.line ?? 1;
}

function tokenColumn(token: AntlrTokenLike | undefined): number {
  return token?.getCharPositionInLine?.() ?? token?.charPositionInLine ?? token?.column ?? 0;
}

function tokenName(resolver: TokenNameResolver, type: number): string {
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

function isTechnicalTokenName(token: string): boolean {
  return token === "EOF"
    || token === "EOL"
    || token === "INDENT"
    || token === "DEDENT"
    || token === "WRAP"
    || token === "UNWRAP"
    || token === "WHITESPACE"
    || token === "VALUE_EOL";
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toLowerCase() ?? ""}${value.slice(1)}`;
}
