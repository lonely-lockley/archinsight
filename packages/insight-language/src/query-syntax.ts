export interface NodePattern {
  readonly alias: string;
  readonly label?: string;
  readonly properties: Readonly<Record<string, QueryValue>>;
}

export interface RelationshipPattern {
  readonly alias?: string;
  readonly type?: string;
  readonly properties: Readonly<Record<string, QueryValue>>;
  readonly selectors: ReadonlySet<string>;
}

export interface QueryPattern {
  readonly left: NodePattern;
  readonly relationship?: RelationshipPattern;
  readonly right?: NodePattern;
  readonly direction?: "outgoing" | "incoming" | "undirected";
}

export interface MatchClause {
  readonly optional: boolean;
  readonly rollup: boolean;
  readonly pattern: QueryPattern;
  readonly where?: Expression;
}

export interface ParsedQuery {
  readonly matches: readonly MatchClause[];
  readonly groupBy?: ValueExpression;
  readonly returns: readonly string[];
}

export interface QueryAnalysis {
  readonly query: ParsedQuery;
  readonly referencedVariables: readonly string[];
  readonly requiresContext: boolean;
  readonly requiresSource: boolean;
}

export type QueryValue =
  | { readonly kind: "literal"; readonly value: string }
  | { readonly kind: "variable"; readonly name: string };

export type Expression =
  | { readonly kind: "and"; readonly left: Expression; readonly right: Expression }
  | { readonly kind: "or"; readonly left: Expression; readonly right: Expression }
  | { readonly kind: "not"; readonly expression: Expression }
  | { readonly kind: "is"; readonly left: ValueExpression; readonly target: string }
  | { readonly kind: "in"; readonly left: ValueExpression; readonly right: ValueExpression }
  | { readonly kind: "compare"; readonly operator: "eq" | "ne" | "contains"; readonly left: ValueExpression; readonly right: ValueExpression };

export type ValueExpression =
  | { readonly kind: "property"; readonly alias: string; readonly property: string }
  | { readonly kind: "binding"; readonly alias: string }
  | { readonly kind: "list"; readonly values: readonly QueryValue[] }
  | QueryValue;

export function parseQuery(query: string): ParsedQuery {
  return new QueryParser(tokenizeQuery(query)).parseQuery();
}

export function analyzeQuery(query: string): QueryAnalysis {
  const tokens = tokenizeQuery(query);
  const parsed = new QueryParser(tokens).parseQuery();
  const referencedVariables = [...new Set(tokens
    .filter((token): token is Extract<QueryToken, { readonly kind: "variable" }> => token.kind === "variable")
    .map((token) => token.text))].sort();
  return {
    query: parsed,
    referencedVariables,
    requiresContext: referencedVariables.includes("context"),
    requiresSource: referencedVariables.includes("tab"),
  };
}

type QueryToken =
  | { readonly kind: "identifier"; readonly text: string }
  | { readonly kind: "string"; readonly text: string }
  | { readonly kind: "variable"; readonly text: string }
  | { readonly kind: "symbol"; readonly text: string }
  | { readonly kind: "eof"; readonly text: "" };

function tokenizeQuery(source: string): readonly QueryToken[] {
  const tokens: QueryToken[] = [];
  for (let index = 0; index < source.length;) {
    const char = source[index] ?? "";
    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if (char === "#") {
      while (index < source.length && source[index] !== "\n") {
        index++;
      }
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index++;
      while (/[A-Za-z0-9_]/.test(source[index] ?? "")) {
        index++;
      }
      tokens.push({ kind: "identifier", text: source.slice(start, index) });
      continue;
    }
    if (char === "$") {
      const start = index + 1;
      index++;
      if (!/[A-Za-z_]/.test(source[index] ?? "")) {
        throw new Error(`Unsupported query variable near '${source.slice(index - 1)}'`);
      }
      while (/[A-Za-z0-9_]/.test(source[index] ?? "")) {
        index++;
      }
      tokens.push({ kind: "variable", text: source.slice(start, index) });
      continue;
    }
    if (char === "'") {
      const start = ++index;
      while (index < source.length && source[index] !== "'") {
        index++;
      }
      if (index >= source.length) {
        throw new Error("Unterminated string literal in query");
      }
      tokens.push({ kind: "string", text: source.slice(start, index) });
      index++;
      continue;
    }
    const two = source.slice(index, index + 2);
    if (two === "->" || two === "<-" || two === "<>") {
      tokens.push({ kind: "symbol", text: two });
      index += 2;
      continue;
    }
    if ("()[]{}:,.=-".includes(char)) {
      tokens.push({ kind: "symbol", text: char });
      index++;
      continue;
    }
    throw new Error(`Unsupported query token '${char}'`);
  }
  tokens.push({ kind: "eof", text: "" });
  return tokens;
}

class QueryParser {
  private index = 0;
  private readonly aliases = new Set<string>();

  constructor(private readonly tokens: readonly QueryToken[]) {
  }

  parseQuery(): ParsedQuery {
    const matches: MatchClause[] = [];
    while (this.atKeyword("MATCH") || this.atKeyword("OPTIONAL")) {
      matches.push(this.parseMatchClause());
    }
    if (matches.length === 0) {
      throw new Error("Unsupported MATCH clause");
    }
    let groupBy: ValueExpression | undefined;
    if (this.consumeKeyword("GROUP")) {
      this.expectKeyword("BY");
      groupBy = this.parseValueExpression();
    }
    this.expectKeyword("RETURN");
    const returns = this.parseReturnList();
    this.expectEof();
    return { matches, ...(groupBy === undefined ? {} : { groupBy }), returns };
  }

  private parseMatchClause(): MatchClause {
    const optional = this.consumeKeyword("OPTIONAL");
    this.expectKeyword("MATCH");
    const rollup = this.consumeKeyword("ROLLUP");
    const pattern = this.parsePattern();
    const where = this.consumeKeyword("WHERE") ? this.parseExpression() : undefined;
    return { optional, rollup, pattern, ...(where === undefined ? {} : { where }) };
  }

  private parsePattern(): QueryPattern {
    const left = this.parseNodePattern();
    const incoming = this.consumeSymbol("<-");
    if (!incoming && !this.consumeSymbol("-")) {
      return { left };
    }
    const relationship = this.parseRelationshipPattern();
    const direction = incoming
      ? this.consumeSymbol("-") ? "incoming" : undefined
      : this.consumeSymbol("->") ? "outgoing" : this.consumeSymbol("-") ? "undirected" : undefined;
    if (direction === undefined) {
      const expected = incoming ? "'-'" : "'->' or '-'";
      throw new Error(`Expected ${expected} after relationship pattern, found '${this.current().text}'`);
    }
    return { left, relationship, right: this.parseNodePattern(), direction };
  }

  private parseNodePattern(): NodePattern {
    this.expectSymbol("(");
    const alias = this.expectIdentifier();
    this.aliases.add(alias);
    const label = this.consumeSymbol(":") ? this.expectIdentifier() : undefined;
    const properties = this.consumeSymbol("{") ? this.parseProperties("}") : {};
    this.expectSymbol(")");
    return { alias, ...(label === undefined ? {} : { label }), properties };
  }

  private parseRelationshipPattern(): RelationshipPattern {
    this.expectSymbol("[");
    let alias: string | undefined;
    let type: string | undefined;
    if (this.atIdentifier()) {
      const identifier = this.expectIdentifier();
      if (this.consumeSymbol(":")) {
        alias = identifier;
        type = this.expectIdentifier();
      } else {
        alias = identifier;
      }
    } else if (this.consumeSymbol(":")) {
      type = this.expectIdentifier();
    }
    if (alias !== undefined) {
      this.aliases.add(alias);
    }
    const parsed = this.consumeSymbol("{")
      ? this.parseRelationshipProperties()
      : { properties: {}, selectors: new Set<string>() };
    this.expectSymbol("]");
    return {
      ...(alias === undefined ? {} : { alias }),
      ...(type === undefined ? {} : { type }),
      properties: parsed.properties,
      selectors: parsed.selectors,
    };
  }

  private parseProperties(endSymbol: string): Readonly<Record<string, QueryValue>> {
    const properties: Record<string, QueryValue> = {};
    if (this.consumeSymbol(endSymbol)) {
      return properties;
    }
    while (true) {
      const name = this.expectIdentifier();
      this.expectSymbol(":");
      properties[name] = this.parseQueryValue();
      if (this.consumeSymbol(endSymbol)) {
        return properties;
      }
      this.expectSymbol(",");
    }
  }

  private parseRelationshipProperties(): { readonly properties: Readonly<Record<string, QueryValue>>; readonly selectors: ReadonlySet<string> } {
    const properties: Record<string, QueryValue> = {};
    const selectors = new Set<string>();
    if (this.consumeSymbol("}")) {
      return { properties, selectors };
    }
    while (true) {
      const name = this.expectIdentifier();
      if (this.consumeSymbol(":")) {
        properties[name] = this.parseQueryValue();
      } else {
        selectors.add(name);
      }
      if (this.consumeSymbol("}")) {
        return { properties, selectors };
      }
      this.expectSymbol(",");
    }
  }

  private parseExpression(): Expression {
    return this.parseOrExpression();
  }

  private parseOrExpression(): Expression {
    let expression = this.parseAndExpression();
    while (this.consumeKeyword("OR")) {
      expression = { kind: "or", left: expression, right: this.parseAndExpression() };
    }
    return expression;
  }

  private parseAndExpression(): Expression {
    let expression = this.parseNotExpression();
    while (this.consumeKeyword("AND")) {
      expression = { kind: "and", left: expression, right: this.parseNotExpression() };
    }
    return expression;
  }

  private parseNotExpression(): Expression {
    return this.consumeKeyword("NOT")
      ? { kind: "not", expression: this.parseNotExpression() }
      : this.parsePrimaryExpression();
  }

  private parsePrimaryExpression(): Expression {
    if (this.consumeSymbol("(")) {
      const expression = this.parseExpression();
      this.expectSymbol(")");
      return expression;
    }
    return this.parseComparison();
  }

  private parseComparison(): Expression {
    const left = this.parseValueExpression();
    if (this.consumeKeyword("IS")) {
      if (this.consumeKeyword("NOT")) {
        return { kind: "not", expression: { kind: "is", left, target: this.expectIdentifier() } };
      }
      return { kind: "is", left, target: this.expectIdentifier() };
    }
    if (this.consumeKeyword("IN")) {
      return { kind: "in", left, right: this.parseValueExpression() };
    }
    return { kind: "compare", operator: this.parseComparisonOperator(), left, right: this.parseValueExpression() };
  }

  private parseComparisonOperator(): "eq" | "ne" | "contains" {
    if (this.consumeSymbol("=")) {
      return "eq";
    }
    if (this.consumeSymbol("<>")) {
      return "ne";
    }
    this.expectKeyword("CONTAINS");
    return "contains";
  }

  private parseValueExpression(): ValueExpression {
    if (this.consumeSymbol("[")) {
      const values: QueryValue[] = [];
      if (this.consumeSymbol("]")) {
        return { kind: "list", values };
      }
      while (true) {
        values.push(this.parseQueryValue());
        if (this.consumeSymbol("]")) {
          return { kind: "list", values };
        }
        this.expectSymbol(",");
      }
    }
    if (this.atIdentifier()) {
      const identifier = this.expectIdentifier();
      if (this.consumeSymbol(".")) {
        return { kind: "property", alias: identifier, property: this.expectIdentifier() };
      }
      return this.aliases.has(identifier)
        ? { kind: "binding", alias: identifier }
        : { kind: "literal", value: identifier };
    }
    return this.parseQueryValue();
  }

  private parseQueryValue(): QueryValue {
    const token = this.current();
    if (token.kind === "variable") {
      this.index++;
      return { kind: "variable", name: token.text };
    }
    if (token.kind === "string" || token.kind === "identifier") {
      this.index++;
      return { kind: "literal", value: token.text };
    }
    throw new Error(`Expected query value, found '${token.text}'`);
  }

  private parseReturnList(): readonly string[] {
    const returns = [this.expectIdentifier()];
    while (this.consumeSymbol(",")) {
      returns.push(this.expectIdentifier());
    }
    return returns;
  }

  private atIdentifier(): boolean {
    return this.current().kind === "identifier";
  }

  private atKeyword(keyword: string): boolean {
    const token = this.current();
    return token.kind === "identifier" && token.text.toUpperCase() === keyword;
  }

  private consumeKeyword(keyword: string): boolean {
    if (!this.atKeyword(keyword)) {
      return false;
    }
    this.index++;
    return true;
  }

  private expectKeyword(keyword: string): void {
    if (!this.consumeKeyword(keyword)) {
      throw new Error(`Expected ${keyword}, found '${this.current().text}'`);
    }
  }

  private consumeSymbol(symbol: string): boolean {
    const token = this.current();
    if (token.kind !== "symbol" || token.text !== symbol) {
      return false;
    }
    this.index++;
    return true;
  }

  private expectSymbol(symbol: string): void {
    if (!this.consumeSymbol(symbol)) {
      throw new Error(`Expected '${symbol}', found '${this.current().text}'`);
    }
  }

  private expectIdentifier(): string {
    const token = this.current();
    if (token.kind !== "identifier") {
      throw new Error(`Expected identifier, found '${token.text}'`);
    }
    this.index++;
    return token.text;
  }

  private expectEof(): void {
    if (this.current().kind !== "eof") {
      throw new Error(`Unexpected query token '${this.current().text}'`);
    }
  }

  private current(): QueryToken {
    return this.tokens[this.index] ?? { kind: "eof", text: "" };
  }
}
