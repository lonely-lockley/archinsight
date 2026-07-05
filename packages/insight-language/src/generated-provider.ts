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
import {
  AntlrInsightSyntaxProvider,
  type AntlrAdapterInput,
  type AntlrSyntaxErrorLike,
} from "./antlr-adapter.js";
import type { CompletionRequest } from "./contracts.js";
import { InsightLexer } from "./generated/InsightLexer.js";
import { InsightParser } from "./generated/InsightParser.js";

export function createGeneratedInsightSyntaxProvider(): AntlrInsightSyntaxProvider {
  return new AntlrInsightSyntaxProvider(parseWithGeneratedInsightParser);
}

export function parseWithGeneratedInsightParser(request: CompletionRequest): AntlrAdapterInput {
  const syntaxErrors: AntlrSyntaxErrorLike[] = [];
  const input = CharStream.fromString(request.source);
  const lexer = new InsightLexer(input);
  const lexerErrorListener = new CapturingErrorListener(syntaxErrors);
  lexer.removeErrorListeners();
  lexer.addErrorListener(lexerErrorListener);

  const tokenStream = new CommonTokenStream(lexer);
  const parser = new InsightParser(tokenStream);
  const parserErrorListener = new CapturingErrorListener(syntaxErrors, parser);
  parser.removeErrorListeners();
  parser.addErrorListener(parserErrorListener);

  try {
    const tree = parser.insight();
    tokenStream.fill();

    return {
      source: request.source,
      cursorOffset: request.cursorOffset,
      tree,
      tokens: tokenStream.getTokens(),
      ruleNames: InsightParser.ruleNames,
      tokenName: tokenName,
      syntaxErrors,
      ...(request.indexedIdentifiers === undefined ? {} : { indexedIdentifiers: request.indexedIdentifiers }),
      ...(request.contextIds === undefined ? {} : { contextIds: request.contextIds }),
    };
  } catch (error) {
    const tokens = tokensAfterParserFailure(request.source);
    return {
      source: request.source,
      cursorOffset: request.cursorOffset,
      tokens,
      ruleNames: InsightParser.ruleNames,
      tokenName: tokenName,
      syntaxErrors,
      ...(request.indexedIdentifiers === undefined ? {} : { indexedIdentifiers: request.indexedIdentifiers }),
      ...(request.contextIds === undefined ? {} : { contextIds: request.contextIds }),
      parseFailure: {
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function tokensAfterParserFailure(source: string): Token[] {
  try {
    const lexer = new InsightLexer(CharStream.fromString(source));
    lexer.removeErrorListeners();
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    return tokenStream.getTokens();
  } catch {
    return [];
  }
}

function tokenName(type: number): string {
  if (type === Token.EOF) {
    return "EOF";
  }
  return InsightParser.symbolicNames[type] ?? InsightParser.literalNames[type] ?? String(type);
}

class CapturingErrorListener extends BaseErrorListener {
  public constructor(
    private readonly errors: AntlrSyntaxErrorLike[],
    private readonly parser?: Parser,
  ) {
    super();
  }

  public override syntaxError<S extends Token, T extends ATNSimulator>(
    recognizer: Recognizer<T>,
    offendingSymbol: S | null,
    line: number,
    column: number,
    _message: string,
    exception: RecognitionException | null,
  ): void {
    const expectedTokens = exception?.getExpectedTokens()
      ?? this.parser?.getExpectedTokens()
      ?? recognizer.atn.getExpectedTokens(recognizer.state, null);
    this.errors.push({
      ...optionalOffset(offendingSymbol?.start),
      line,
      column,
      message: _message,
      expectedTokenTypes: expectedTokens.toArray(),
    });
  }
}

function optionalOffset(offset: number | undefined): { readonly offset?: number } {
  return offset === undefined || offset < 0 ? {} : { offset };
}
