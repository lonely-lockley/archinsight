import { ANTLRErrorListener, Recognizer, ATNSimulator, Token, RecognitionException, Parser, DFA, BitSet, ATNConfigSet } from 'antlr4ng';

export interface InsightError {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  code: string;
}

class InsightErrorListener implements ANTLRErrorListener {
  private errors: InsightError[] = [];

  syntaxError<S extends Token, T extends ATNSimulator>(recognizer: Recognizer<T>, offendingSymbol: S | null, line: number, charPositionInLine: number, msg: string, e: RecognitionException | null): void {
    this.errors.push({
      startLineNumber: line,
      endLineNumber: line,
      startColumn: offendingSymbol == null ? charPositionInLine : offendingSymbol.start,
      // Let's suppose the length of the error is only 1 char for simplicity
      endColumn: offendingSymbol == null ? charPositionInLine + 1 : offendingSymbol.stop,
      message: msg,
      // This the error code you can customize them as you want
      code: '1',
    });
  }

  reportAmbiguity(recognizer: Parser, dfa: DFA, startIndex: number, stopIndex: number, exact: boolean, ambigAlts: BitSet | undefined, configs: ATNConfigSet): void {
    // ignore
  }

  reportAttemptingFullContext(recognizer: Parser, dfa: DFA, startIndex: number, stopIndex: number, conflictingAlts: BitSet | undefined, configs: ATNConfigSet): void {
    // ignore
  }

  reportContextSensitivity(recognizer: Parser, dfa: DFA, startIndex: number, stopIndex: number, prediction: number, configs: ATNConfigSet): void {
    // ignore
  }

  getErrors(): InsightError[] {
    return this.errors;
  }
}

export default InsightErrorListener;
