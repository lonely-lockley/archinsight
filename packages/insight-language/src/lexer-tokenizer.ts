import { CharStream, Token } from "antlr4ng";
import { InsightLexer } from "./generated/InsightLexer.js";
import { LexerState } from "./runtime/layout-lexer-helper.js";

export interface InsightLineLexerState {
  readonly textOpen: boolean;
  readonly indentation: number;
}

export interface InsightLineToken {
  readonly name: string;
  readonly text: string;
  readonly startIndex: number;
  readonly stopIndex: number;
}

export interface InsightLineTokenization {
  readonly tokens: readonly InsightLineToken[];
  readonly endState: InsightLineLexerState;
}

export function initialInsightLineLexerState(): InsightLineLexerState {
  return { textOpen: false, indentation: 0 };
}

export function tokenizeInsightLine(
  line: string,
  state: InsightLineLexerState = initialInsightLineLexerState(),
): InsightLineTokenization {
  const prefixedLine = state.textOpen ? `\n${line}` : line;
  const offsetCorrection = state.textOpen ? 1 : 0;
  const lexer = new InsightLexer(CharStream.fromString(prefixedLine));
  lexer.removeErrorListeners();
  lexer.enableSingleLineMode();
  lexer.restoreState(new LexerState(state.textOpen, state.indentation));

  const tokens: InsightLineToken[] = [];
  while (true) {
    const token = lexer.nextToken();
    if (token.type === Token.EOF) {
      break;
    }
    const name = InsightLexer.symbolicNames[token.type] ?? String(token.type);
    if (isVisibleToken(name)) {
      const startIndex = Math.max(0, tokenStart(token) - offsetCorrection);
      const stopIndex = Math.max(startIndex, tokenStop(token) - offsetCorrection);
      if (startIndex < line.length) {
        tokens.push({
          name,
          text: tokenText(token, prefixedLine),
          startIndex,
          stopIndex: Math.min(line.length - 1, stopIndex),
        });
      }
    }
  }

  const snapshot = lexer.snapshotState();
  return {
    tokens,
    endState: {
      textOpen: snapshot.textOpen,
      indentation: nextIndentation(state, snapshot.textOpen, indentationLevel(line)),
    },
  };
}

function isVisibleToken(name: string): boolean {
  return name !== "INDENT"
    && name !== "DEDENT"
    && name !== "WRAP"
    && name !== "UNWRAP"
    && name !== "EOL"
    && name !== "WHITESPACE"
    && name !== "VALUE_EOL";
}

function nextIndentation(
  previous: InsightLineLexerState,
  textOpen: boolean,
  lineIndentation: number,
): number {
  if (!textOpen) {
    return lineIndentation;
  }
  return previous.textOpen ? previous.indentation : lineIndentation;
}

function indentationLevel(line: string): number {
  let width = 0;
  for (const character of line) {
    if (character === " ") {
      width++;
    } else if (character === "\t") {
      width += 4;
    } else {
      break;
    }
  }
  return Math.floor(width / 4);
}

function tokenStart(token: Token): number {
  return token.start;
}

function tokenStop(token: Token): number {
  return token.stop;
}

function tokenText(token: Token, source: string): string {
  return token.text ?? source.slice(token.start, token.stop + 1);
}
