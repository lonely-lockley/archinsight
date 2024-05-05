import { CharStream, CommonTokenStream } from 'antlr4ng';

import { InsightLexer } from '../../generated/insight-lang/InsightLexer';
import { InsightContext, InsightParser } from '../../generated/insight-lang/InsightParser';
import InsightErrorListener, { InsightError } from './InsightErrorListener';

const parse = (code: string): {
                                ast: InsightContext;
                                errors: InsightError[];
                              } => {
  const inputStream = CharStream.fromString(code);
  const lexer = new InsightLexer(inputStream);

  lexer.removeErrorListeners();

  const insightErrorListener = new InsightErrorListener();
  lexer.addErrorListener(insightErrorListener);

  const tokenStream = new CommonTokenStream(lexer);
  const parser = new InsightParser(tokenStream);

  parser.removeErrorListeners();
  parser.addErrorListener(insightErrorListener);

  const ast = parser.insight();
  const errors: InsightError[] = insightErrorListener.getErrors();

  return { ast, errors };
};

export const parseAndGetASTRoot = (code: string): InsightContext => {
  const { ast } = parse(code);
  return ast;
};

export const parseAndGetSyntaxErrors = (code: string): InsightError[] => {
  const { errors } = parse(code);
  return errors;
};
