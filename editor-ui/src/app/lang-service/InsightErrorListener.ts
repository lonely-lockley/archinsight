import { ANTLRErrorListener, Recognizer } from 'antlr4ts';

export interface InsightError {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  code: string;
}

class InsightErrorListener implements ANTLRErrorListener<unknown> {
  private errors: InsightError[] = [];

  syntaxError(
    recognizer: Recognizer<unknown, any>,
    offendingSymbol: unknown | undefined,
    line: number,
    charPositionInLine: number,
    msg: string,
    // e: RecognitionException | undefined,
  ): void {
    this.errors.push({
      startLineNumber: line,
      endLineNumber: line,
      startColumn: charPositionInLine,
      // Let's suppose the length of the error is only 1 char for simplicity
      endColumn: charPositionInLine + 1,
      message: msg,
      // This the error code you can customize them as you want
      code: '1',
    });
  }

  getErrors(): InsightError[] {
    return this.errors;
  }
}

export default InsightErrorListener;
