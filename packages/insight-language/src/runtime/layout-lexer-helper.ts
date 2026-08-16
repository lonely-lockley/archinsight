import { CommonToken, Lexer, RecognitionException, Token, type CharStream } from "antlr4ng";

const INDENT_LENGTH = 4;

export class LexerState {
  public constructor(
    public readonly textOpen = false,
    public readonly indentation = 0,
  ) {
  }

  public openText(): LexerState {
    return new LexerState(true, this.indentation);
  }

  public closeText(): LexerState {
    return new LexerState(false, this.indentation);
  }

  public increaseIndentation(): LexerState {
    return new LexerState(this.textOpen, this.indentation + 1);
  }

  public decreaseIndentation(): LexerState {
    return new LexerState(this.textOpen, this.indentation - 1);
  }
}

export class LayoutLexerHelper {
  private readonly pendingTokens: Token[] = [];
  private indentation = 0;
  private textOpen = false;
  private singleLineMode = false;
  private eofProcessed = false;
  private lineTerminated = true;
  private state = new LexerState();

  public constructor(private readonly lexer: InsightLayoutLexer) {
  }

  public nextToken(): Token {
    let token = this.pollOrScanToken();
    if (token.type === Token.EOF && !this.eofProcessed) {
      this.eofProcessed = true;
      this.processEof(token);
      token = this.pendingTokens.shift() ?? token;
    }
    return token;
  }

  public checkIndentation(): void {
    const matchedText = this.lexer.text;
    const newlineCount = countNewlines(matchedText);
    const desiredIndentation = this.calculateIndentation(stripNewlines(matchedText));

    this.lineTerminated = true;
    this.pendingTokens.push(this.createToken(this.tokenType("EOL"), "\n", 1, -newlineCount, -matchedText.length));
    this.adjustIndentation(desiredIndentation, newlineCount);
  }

  public wrapValue(): void {
    if (this.textOpen) {
      return;
    }

    this.textOpen = true;
    this.state = this.state.openText();
    this.pendingTokens.push(this.createToken(this.tokenType("WRAP"), "<WRAP>", 0, 0, -this.lexer.text.length));
  }

  public unwrapValue(): void {
    const matchedText = this.lexer.text;
    const newlineCount = countNewlines(matchedText);
    const desiredIndentation = this.calculateIndentation(stripNewlines(matchedText));

    this.lineTerminated = true;
    if (desiredIndentation === this.indentation + 1) {
      this.pendingTokens.push(this.createToken(this.tokenType("TEXT"), "\n", 1, -newlineCount, -matchedText.length));
      return;
    }

    if (desiredIndentation <= this.indentation && this.textOpen) {
      this.closeText(newlineCount, -matchedText.length);
      this.pendingTokens.push(this.createToken(this.tokenType("EOL"), "\n", 1, -newlineCount, -matchedText.length));
      this.lexer.popMode();
      this.fireDedents(desiredIndentation, newlineCount);
      return;
    }

    this.reportIndentationError(desiredIndentation * INDENT_LENGTH);
  }

  public snapshotState(): LexerState {
    return new LexerState(this.state.textOpen, this.state.indentation);
  }

  public restoreState(restoredState: LexerState): void {
    this.lexer.reset();
    this.state = new LexerState(restoredState.textOpen, restoredState.indentation);
    this.indentation = this.state.indentation;
    this.textOpen = this.state.textOpen;
    this.pendingTokens.length = 0;
    this.eofProcessed = false;
    this.lineTerminated = true;

    if (this.textOpen) {
      this.lexer.pushMode(this.tokenType("VALUE_MODE"));
    }
  }

  public enableSingleLineMode(): void {
    this.singleLineMode = true;
  }

  private pollOrScanToken(): Token {
    const pending = this.pendingTokens.shift();
    if (pending !== undefined) {
      return pending;
    }

    const token = this.lexer.supplyToken();
    if (token.type !== Token.EOF) {
      this.lineTerminated = false;
    }
    if (this.pendingTokens.length === 0) {
      return token;
    }

    this.pendingTokens.push(token);
    return this.pendingTokens.shift() ?? token;
  }

  private processEof(eof: Token): void {
    if (!this.singleLineMode) {
      if (this.textOpen) {
        this.closeText(0, 0);
        this.lexer.popMode();
      }
      if (!this.lineTerminated) {
        this.pendingTokens.push(this.createToken(this.tokenType("EOL"), "\n", 1, 0, 0));
        this.lineTerminated = true;
      }
      this.fireDedents(0, 0);
    }
    this.pendingTokens.push(eof);
  }

  private closeText(lineCorrection: number, offsetCorrection: number): void {
    this.textOpen = false;
    this.state = this.state.closeText();
    this.pendingTokens.push(this.createToken(this.tokenType("UNWRAP"), "<UNWRAP>", 0, -lineCorrection, offsetCorrection));
  }

  private adjustIndentation(desiredIndentation: number, newlineCount: number): void {
    if (desiredIndentation > this.indentation) {
      this.fireIndents(desiredIndentation, newlineCount);
    } else if (!this.singleLineMode) {
      this.fireDedents(desiredIndentation, newlineCount);
    }
  }

  private fireIndents(desiredIndentation: number, newlineCount: number): void {
    while (this.indentation < desiredIndentation) {
      this.indentation++;
      this.state = this.state.increaseIndentation();
      this.pendingTokens.push(this.createToken(this.tokenType("INDENT"), "<INDENT>", INDENT_LENGTH, 0, -newlineCount));
    }
  }

  private fireDedents(desiredIndentation: number, newlineCount: number): void {
    while (this.indentation > desiredIndentation) {
      this.pendingTokens.push(this.createToken(this.tokenType("DEDENT"), "<DEDENT>", 0, -newlineCount, 0));
      this.indentation--;
      this.state = this.state.decreaseIndentation();
    }
  }

  private calculateIndentation(whitespace: string): number {
    let width = 0;
    for (const character of whitespace) {
      width += character === "\t" ? INDENT_LENGTH : 1;
    }

    if (width % INDENT_LENGTH !== 0) {
      this.reportIndentationError(width);
    }

    return width / INDENT_LENGTH;
  }

  private reportIndentationError(actualWidth: number): void {
    const expectedWidth = this.indentation * INDENT_LENGTH;
    const message = `incorrect indentation: current width is ${actualWidth}, expected a multiple of ${INDENT_LENGTH} near level ${expectedWidth}`;
    this.lexer.errorListenerDispatch.syntaxError(
      this.lexer,
      null,
      this.lexer.line,
      this.lexer.column,
      message,
      new RecognitionException({ message, recognizer: this.lexer, input: this.lexer.inputStream, ctx: null }),
    );
  }

  private createToken(
    type: number,
    text: string,
    length: number,
    lineCorrection: number,
    offsetCorrection: number,
  ): Token {
    const stop = this.lexer.getCharIndex() + offsetCorrection;
    const start = length === 0 ? stop : stop - length + 1;
    const token = CommonToken.fromSource(
      [this.lexer, this.lexer.inputStream],
      type,
      Token.DEFAULT_CHANNEL,
      start,
      stop,
    );
    token.text = text;
    token.line = this.lexer.line + lineCorrection;
    token.column = this.charPositionInLine(start);
    return token as Token;
  }

  private charPositionInLine(offset: number): number {
    const cursor = Math.max(0, Math.min(offset, this.lexer.inputStream.size));
    let column = 0;
    for (let index = cursor - 1; index >= 0; index--) {
      const text = this.lexer.inputStream.getTextFromRange(index, index);
      if (text === "\n" || text === "\r") {
        break;
      }
      column++;
    }
    return column;
  }

  private tokenType(name: string): number {
    const value = (this.lexer.constructor as unknown as Record<string, number>)[name];
    if (typeof value !== "number") {
      throw new Error(`Generated lexer does not expose token type ${name}`);
    }
    return value;
  }
}

function countNewlines(text: string): number {
  let count = 0;
  for (const character of text) {
    if (character === "\n") {
      count++;
    }
  }
  return count;
}

function stripNewlines(text: string): string {
  return text.replaceAll("\r", "").replaceAll("\n", "");
}

interface InsightLayoutLexer extends Lexer {
  supplyToken(): Token;
  inputStream: CharStream;
}
