import type { LanguageSnapshot, LinkProjectResult } from "./contracts.js";
import { AIQ_FUNCTIONS } from "./query-function-catalog.js";
import { RELATION_KINDS } from "./indexed-graph.js";
import { CharStream, CommonTokenStream, Token } from "antlr4ng";
import { AiqLexer } from "./generated/AiqLexer.js";
import {
  AiqParser,
  type MatchClauseContext,
  type NodePatternContext,
  type PathPatternContext,
  type PatternContext,
  type QueryContext,
  type PathRelationshipPatternContext,
  type ProjectionContext,
  type RelationshipPatternContext,
  type ValueExpressionContext,
} from "./generated/AiqParser.js";

export type AiqCompletionKind = "keyword" | "alias" | "type" | "property" | "function" | "parameter" | "selector";

export interface AiqCompletionItem {
  readonly label: string;
  readonly insertText: string;
  readonly kind: AiqCompletionKind;
  readonly detail?: string;
  readonly documentation?: string;
}

export interface AiqCompletionRequest {
  readonly source: string;
  readonly cursorOffset: number;
  readonly snapshot: LanguageSnapshot;
  readonly analysis?: LinkProjectResult;
  readonly parameters?: readonly string[];
}

export interface AiqCompletionResult {
  readonly items: readonly AiqCompletionItem[];
  readonly replacementStartOffset: number;
  readonly replacementEndOffset: number;
}

const clauseKeywords = ["WHERE", "MATCH", "OPTIONAL MATCH", "UNWIND", "WITH", "RETURN", "RETURN TABLE"] as const;
const expressionKeywords = ["DISTINCT", "NOT", "TRUE", "FALSE", "NULL", "AND", "OR", "IN", "CONTAINS", "IS NULL", "IS NOT NULL"] as const;
const selectors = ["authored", "derived", "withDerived", "projected", "withProjected"] as const;

const nodeProperties = ["id", "localId", "type", "context", "sourceIdentity", "parent", "constructor", "annotations"];
const relationshipProperties = ["id", "type", "kind", "operator", "source", "target", "context", "sourceIdentity", "derived", "projected", "annotations"];
const pathProperties = ["nodes", "relationships", "steps", "length"];
const stepProperties = ["index", "from", "to", "relationshipId", "direction"];

/** Tolerant semantic completion for incomplete AIQ. Parsing and execution remain owned by the ANTLR grammar. */
export function completeAiq(request: AiqCompletionRequest): AiqCompletionResult {
  const cursor = Math.max(0, Math.min(request.cursorOffset, request.source.length));
  const before = request.source.slice(0, cursor);
  const recovery = recoverCompletionSyntax(before);
  const visible = recovery.tokens.filter((token) => token.type !== Token.EOF && token.channel === Token.DEFAULT_CHANNEL);
  const last = visible.at(-1);
  const completingToken = last !== undefined && last.stop + 1 === cursor
      && (isIdentifierToken(last) || last.type === AiqLexer.VARIABLE)
    ? last
    : undefined;
  const word = completingToken?.text ?? "";
  const replacementStartOffset = completingToken?.start ?? cursor;
  if (recovery.unterminatedString) {
    return { items: [], replacementStartOffset, replacementEndOffset: cursor };
  }
  const prefix = word.toLocaleLowerCase();
  const aliases = recoveredAliases(recovery.tree, visible);
  const prefixIndex = completingToken === undefined ? visible.length : visible.length - 1;
  const propertyTarget = visible[prefixIndex - 1]?.type === AiqLexer.DOT && isIdentifierToken(visible[prefixIndex - 2])
    ? visible[prefixIndex - 2]!.text ?? undefined
    : undefined;
  const afterColon = visible[prefixIndex - 1]?.type === AiqLexer.COLON;
  const afterDollar = completingToken?.type === AiqLexer.VARIABLE;
  const contextTokens = visible.slice(0, prefixIndex);
  let items: AiqCompletionItem[];

  if (propertyTarget !== undefined) {
    items = propertiesFor(propertyTarget, aliases, request).map((label) => ({
      label, insertText: label, kind: "property", detail: `property of ${propertyTarget}`,
    }));
  } else if (afterDollar) {
    const parameters = new Set(["context", "tab", ...(request.parameters ?? [])]);
    items = [...parameters].sort().map((name) => ({ label: `$${name}`, insertText: `$${name}`, kind: "parameter" }));
  } else if (afterColon) {
    items = insideOpenPair(contextTokens, AiqLexer.LBRACKET, AiqLexer.RBRACKET)
      ? RELATION_KINDS.map((label) => ({ label, insertText: label, kind: "type" as const, detail: "relationship kind" }))
      : request.snapshot.types.map((type) => ({
          label: type.name, insertText: type.name, kind: "type" as const, detail: type.baseType === undefined ? "type" : `extends ${type.baseType}`,
        }));
  } else if (insideRelationshipSelectorMap(contextTokens)) {
    const available = insideVariableRelationship(contextTokens)
      ? selectors.filter((label) => label !== "projected" && label !== "withProjected")
      : selectors;
    items = available.map((label) => ({ label, insertText: label, kind: "selector" as const }));
  } else {
    items = contextualItems(contextTokens, aliases, request.parameters ?? []);
  }
  const normalizedPrefix = prefix.startsWith("$") ? prefix.slice(1) : prefix;
  const unique = new Map<string, AiqCompletionItem>();
  for (const item of items) {
    const candidate = item.label.toLocaleLowerCase().replace(/^\$/, "");
    if (normalizedPrefix.length === 0 || candidate.startsWith(normalizedPrefix)) unique.set(`${item.kind}:${item.label}`, item);
  }
  return { items: [...unique.values()], replacementStartOffset, replacementEndOffset: cursor };
}

function contextualItems(
  tokens: readonly Token[],
  aliases: ReadonlyMap<string, AliasInfo>,
  parameters: readonly string[],
): AiqCompletionItem[] {
  const aliasItems = [...aliases].map(([label, info]) => ({ label, insertText: label, kind: "alias" as const, detail: info.kind }));
  const functionItems = AIQ_FUNCTIONS.map((definition) => ({
    label: definition.name,
    insertText: `${definition.name}(`,
    kind: "function" as const,
    detail: definition.signature,
    documentation: definition.documentation,
  }));
  const parameterItems = [...new Set(["context", "tab", ...parameters])]
    .map((name) => ({ label: `$${name}`, insertText: `$${name}`, kind: "parameter" as const }));
  const expressionItems = [
    ...expressionKeywords.map((label) => ({ label, insertText: label, kind: "keyword" as const })),
    ...functionItems,
    ...aliasItems,
    ...parameterItems,
  ];
  const lastReturn = lastTokenIndex(tokens, AiqLexer.RETURN);
  if (lastReturn >= 0 && lastReturn >= lastClauseIndex(tokens, lastReturn + 1)) {
    const afterReturn = tokens.slice(lastReturn + 1);
    if (afterReturn[0]?.type === AiqLexer.TABLE) return expressionItems;
    return [
      ...aliasItems.filter((item) => ["node", "relationship", "path"].includes(item.detail)),
      { label: "TABLE", insertText: "TABLE ", kind: "keyword" },
    ];
  }
  const lastClause = lastClauseIndex(tokens);
  const clauseType = tokens[lastClause]?.type;
  if (clauseType === AiqLexer.WHERE || clauseType === AiqLexer.WITH || clauseType === AiqLexer.UNWIND) {
    return expressionItems;
  }
  if (tokens.length === 0) {
    return ["MATCH", "OPTIONAL MATCH"].map((label) => ({ label, insertText: label, kind: "keyword" as const }));
  }
  return clauseKeywords.map((label) => ({ label, insertText: label, kind: "keyword" as const }));
}

function lastClauseIndex(tokens: readonly Token[], start = 0): number {
  const clauseTypes = new Set([AiqLexer.MATCH, AiqLexer.OPTIONAL, AiqLexer.WHERE, AiqLexer.WITH, AiqLexer.UNWIND, AiqLexer.RETURN]);
  for (let index = tokens.length - 1; index >= start; index--) {
    if (clauseTypes.has(tokens[index]!.type)) return index;
  }
  return -1;
}

function lastTokenIndex(tokens: readonly Token[], type: number): number {
  for (let index = tokens.length - 1; index >= 0; index--) if (tokens[index]!.type === type) return index;
  return -1;
}

function insideOpenPair(tokens: readonly Token[], open: number, close: number): boolean {
  let depth = 0;
  for (const token of tokens) {
    if (token.type === open) depth += 1;
    else if (token.type === close) depth = Math.max(0, depth - 1);
  }
  return depth > 0;
}

function insideRelationshipSelectorMap(tokens: readonly Token[]): boolean {
  return insideOpenPair(tokens, AiqLexer.LBRACKET, AiqLexer.RBRACKET)
    && insideOpenPair(tokens, AiqLexer.LBRACE, AiqLexer.RBRACE);
}

function insideVariableRelationship(tokens: readonly Token[]): boolean {
  let bracketStart = -1;
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index]!.type === AiqLexer.LBRACKET) bracketStart = index;
    else if (tokens[index]!.type === AiqLexer.RBRACKET) bracketStart = -1;
  }
  return bracketStart >= 0 && tokens.slice(bracketStart).some((token) => token.type === AiqLexer.STAR);
}

type AliasKind = "node" | "relationship" | "path" | "step" | "value"
  | "node-list" | "relationship-list" | "step-list" | "value-list";
interface AliasInfo { readonly kind: AliasKind; readonly type?: string }

interface CompletionRecovery {
  readonly tree?: QueryContext;
  readonly tokens: readonly Token[];
  readonly unterminatedString: boolean;
}

function recoverCompletionSyntax(source: string): CompletionRecovery {
  const lexer = new AiqLexer(CharStream.fromString(source));
  lexer.removeErrorListeners();
  const stream = new CommonTokenStream(lexer);
  stream.fill();
  const tokens = stream.getTokens();
  const unterminatedString = tokens.some((token) => token.type === AiqLexer.UNTERMINATED_STRING && token.stop + 1 >= source.length);
  if (unterminatedString) return { tokens, unterminatedString };
  try {
    stream.seek(0);
    const parser = new AiqParser(stream);
    parser.removeErrorListeners();
    return { tree: parser.query(), tokens, unterminatedString };
  } catch {
    return { tokens, unterminatedString };
  }
}

function recoveredAliases(tree: QueryContext | undefined, tokens: readonly Token[]): Map<string, AliasInfo> {
  let result = new Map<string, AliasInfo>();
  const graph = tree?.graphQuery();
  if (graph !== null && graph !== undefined) {
    for (const clause of graph.matchClause()) recoverMatchAliases(clause, result);
  }
  const table = tree?.tableQuery();
  if (table !== null && table !== undefined) {
    for (const input of table.tableInputClause()) {
      const match = input.matchClause();
      if (match !== null) {
        recoverMatchAliases(match, result);
        continue;
      }
      const unwind = input.unwindClause();
      if (unwind !== null) {
        const name = safeText(unwind.identifier());
        if (name !== undefined) result.set(name, unwindAliasInfo(expressionAliasInfo(unwind.valueExpression(), result)));
        continue;
      }
      const withClause = input.withClause();
      if (withClause !== null) result = recoveredProjectionAliases(withClause.projection(), result);
    }
  }
  if (result.size === 0) recoverTokenPatternAliases(tokens, result);
  recoverLocalAliases(tokens, result);
  return result;
}

function recoverTokenPatternAliases(tokens: readonly Token[], aliases: Map<string, AliasInfo>): void {
  const visible = tokens.filter((token) => token.type !== Token.EOF && token.channel === Token.DEFAULT_CHANNEL);
  const nodePredecessors = new Set([
    AiqLexer.MATCH, AiqLexer.EQUALS, AiqLexer.ARROW_LEFT, AiqLexer.ARROW_RIGHT, AiqLexer.MINUS, AiqLexer.LPAREN,
  ]);
  for (let index = 0; index < visible.length; index++) {
    const token = visible[index]!;
    if (isIdentifierToken(token) && visible[index + 1]?.type === AiqLexer.EQUALS
        && (visible[index - 1]?.type === AiqLexer.MATCH || visible[index - 1]?.type === AiqLexer.OPTIONAL)) {
      aliases.set(token.text!, { kind: "path" });
    }
    if (token.type !== AiqLexer.LPAREN || !isIdentifierToken(visible[index + 1])
        || !nodePredecessors.has(visible[index - 1]?.type ?? -1)) continue;
    const name = visible[index + 1]!.text!;
    const type = visible[index + 2]?.type === AiqLexer.COLON && isIdentifierToken(visible[index + 3])
      ? visible[index + 3]!.text!
      : undefined;
    aliases.set(name, { kind: "node", ...(type === undefined ? {} : { type }) });
  }
}

function recoverMatchAliases(context: MatchClauseContext, aliases: Map<string, AliasInfo>): void {
  const assignment = context.pathAssignment();
  if (assignment !== null) {
    const name = safeText(assignment.identifier());
    if (name !== undefined) aliases.set(name, { kind: "path" });
    const path = assignment.pathPattern();
    if (path !== null) recoverPathAliases(path, aliases);
    return;
  }
  const path = context.pathPattern();
  if (path !== null) {
    recoverPathAliases(path, aliases);
    return;
  }
  const pattern = context.pattern();
  if (pattern !== null) recoverPatternAliases(pattern, aliases);
}

function recoverPathAliases(context: PathPatternContext, aliases: Map<string, AliasInfo>): void {
  for (const node of context.nodePattern()) recoverNodeAlias(node, aliases);
  const relationship = context.pathRelationshipPattern();
  if (relationship !== null) recoverRelationshipAlias(relationship, "relationship-list", aliases);
}

function recoverPatternAliases(context: PatternContext, aliases: Map<string, AliasInfo>): void {
  for (const node of context.nodePattern()) recoverNodeAlias(node, aliases);
  const relationship = context.relationshipPattern();
  if (relationship !== null) recoverRelationshipAlias(relationship, "relationship", aliases);
}

function recoverNodeAlias(context: NodePatternContext, aliases: Map<string, AliasInfo>): void {
  const identifiers = context.identifier();
  const name = safeText(identifiers[0]);
  const type = safeText(identifiers[1]);
  if (name !== undefined) aliases.set(name, { kind: "node", ...(type === undefined ? {} : { type }) });
}

function recoverRelationshipAlias(
  context: RelationshipPatternContext | PathRelationshipPatternContext,
  kind: "relationship" | "relationship-list",
  aliases: Map<string, AliasInfo>,
): void {
  const identifiers = context.identifier();
  const hasColon = context.COLON() !== null;
  const name = identifiers.length === 0 || (identifiers.length === 1 && hasColon) ? undefined : safeText(identifiers[0]);
  const type = hasColon ? safeText(identifiers.at(-1)) : undefined;
  if (name !== undefined) aliases.set(name, { kind, ...(type === undefined ? {} : { type }) });
}

function recoveredProjectionAliases(
  projection: ProjectionContext,
  previous: ReadonlyMap<string, AliasInfo>,
): Map<string, AliasInfo> {
  const scoped = new Map<string, AliasInfo>();
  for (const item of projection.projectionItem()) {
    const expression = item.valueExpression();
    const name = safeText(item.identifier()) ?? expressionBindingName(expression);
    if (name !== undefined) scoped.set(name, expressionAliasInfo(expression, previous));
  }
  return scoped;
}

function expressionAliasInfo(expression: ValueExpressionContext, aliases: ReadonlyMap<string, AliasInfo>): AliasInfo {
  const atom = expression.valueAtom();
  const binding = safeText(atom.identifier());
  const properties = expression.identifier().map((item) => item.getText().toLowerCase());
  if (binding !== undefined) {
    const info = aliases.get(binding) ?? { kind: "value" as const };
    if (info.kind === "path" && properties.length === 1) return pathCollectionInfo(properties[0]!);
    return properties.length === 0 ? info : { kind: "value" };
  }
  const call = atom.functionCall();
  const functionName = call === null ? undefined : safeText(call.identifier(0))?.toLowerCase();
  if (functionName === "nodes") return { kind: "node-list" };
  if (functionName === "relationships") return { kind: "relationship-list" };
  if (atom.listExpression() !== null) return { kind: "value-list" };
  return { kind: "value" };
}

function expressionBindingName(expression: ValueExpressionContext): string | undefined {
  return expression.identifier().length === 0 ? safeText(expression.valueAtom().identifier()) : undefined;
}

function pathCollectionInfo(property: string): AliasInfo {
  if (property === "nodes") return { kind: "node-list" };
  if (property === "relationships") return { kind: "relationship-list" };
  if (property === "steps") return { kind: "step-list" };
  return { kind: "value" };
}

function unwindAliasInfo(info: AliasInfo): AliasInfo {
  if (info.kind === "node-list") return { kind: "node" };
  if (info.kind === "relationship-list") return { kind: "relationship" };
  if (info.kind === "step-list") return { kind: "step" };
  return { kind: "value" };
}

function recoverLocalAliases(tokens: readonly Token[], aliases: Map<string, AliasInfo>): void {
  const stack: number[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const type = tokens[index]!.type;
    if (type === AiqLexer.LPAREN || type === AiqLexer.LBRACKET) stack.push(index);
    else if (type === AiqLexer.RPAREN || type === AiqLexer.RBRACKET) stack.pop();
  }
  for (const openIndex of stack) {
    const opener = tokens[openIndex]!;
    const aliasToken = tokens[openIndex + 1];
    if (!isIdentifierToken(aliasToken) || tokens[openIndex + 2]?.type !== AiqLexer.IN) continue;
    const quantifier = opener.type === AiqLexer.LPAREN && ["all", "any"].includes(tokens[openIndex - 1]?.text?.toLowerCase() ?? "");
    if (opener.type !== AiqLexer.LBRACKET && !quantifier) continue;
    const source = tokens.slice(openIndex + 3).filter((token) => token.type !== Token.EOF
      && token.type !== AiqLexer.WHERE && token.type !== AiqLexer.PIPE);
    aliases.set(aliasToken!.text!, unwindAliasInfo(tokenExpressionAliasInfo(source, aliases)));
  }
}

function tokenExpressionAliasInfo(tokens: readonly Token[], aliases: ReadonlyMap<string, AliasInfo>): AliasInfo {
  const first = tokens[0];
  if (!isIdentifierToken(first)) return { kind: "value" };
  const name = first!.text!;
  if (tokens[1]?.type === AiqLexer.LPAREN) {
    if (name.toLowerCase() === "nodes") return { kind: "node-list" };
    if (name.toLowerCase() === "relationships") return { kind: "relationship-list" };
  }
  const info = aliases.get(name) ?? { kind: "value" as const };
  if (tokens[1]?.type === AiqLexer.DOT && isIdentifierToken(tokens[2]) && info.kind === "path") {
    return pathCollectionInfo(tokens[2]!.text!.toLowerCase());
  }
  return info;
}

function safeText(context: { getText(): string } | null | undefined): string | undefined {
  const value = context?.getText();
  return value === undefined || value.length === 0 || value === "<missing IDENTIFIER>" ? undefined : value;
}

function isIdentifierToken(token: Token | undefined): boolean {
  return token !== undefined && (token.type === AiqLexer.IDENTIFIER
    || (token.type >= AiqLexer.MATCH && token.type <= AiqLexer.SHORTEST_PATH));
}

function propertiesFor(alias: string, aliases: ReadonlyMap<string, AliasInfo>, request: AiqCompletionRequest): string[] {
  const info = aliases.get(alias);
  const kind = info?.kind;
  if (kind === "relationship") return relationshipProperties;
  if (kind === "path") return pathProperties;
  if (kind === "step") return stepProperties;
  const properties = new Set(kind === "node" ? nodeProperties : []);
  const applicableTypes = info?.type === undefined ? request.snapshot.types : request.snapshot.types.filter((type) => type.name === info.type || inherits(type.name, info.type!, request.snapshot));
  for (const type of applicableTypes) for (const attribute of type.attributes ?? []) properties.add(attribute.name);
  for (const element of request.analysis?.elements ?? []) {
    if (info?.type === undefined || element.type === info.type || element.baseTypes.includes(info.type)) {
      for (const name of Object.keys(element.attributes)) properties.add(name);
    }
  }
  return [...properties].sort();
}

function inherits(typeName: string, expected: string, snapshot: LanguageSnapshot): boolean {
  const seen = new Set<string>();
  let current = snapshot.types.find((type) => type.name === typeName)?.baseType;
  while (current !== undefined && !seen.has(current)) {
    if (current === expected) return true;
    seen.add(current);
    current = snapshot.types.find((type) => type.name === current)?.baseType;
  }
  return false;
}
