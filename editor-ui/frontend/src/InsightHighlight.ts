import { CharStream, Token } from 'antlr4ng';
import { languages } from 'monaco-editor';

import { InsightLexer } from '../generated/insight-lang/InsightLexer';
import LexerState from './LexerState';

import TokensProvider = languages.TokensProvider;
import IState = languages.IState;

import EOF = Token.EOF;
import IToken = languages.IToken;

class InsightToken implements IToken {
  readonly scopes: string;
  readonly startIndex: number;
  readonly level: number;

  constructor(ruleName: string, startIndex: number, level: number) {
    this.scopes = ruleName.toLowerCase() + '.insight';
    this.startIndex = startIndex;
    this.level = level;
  }
}

export class InsightTokensProvider implements TokensProvider {
  keywords = new Set([
    'CONTEXT',
    'CONTAINER',
    'SYSTEM',
    'EXTERNAL',
    'ACTOR',
    'SERVICE',
    'STORAGE',
    'BOUNDARY',
    'IMPORT',
    'CONTEXT_IMPORT',
    'CONTAINER_IMPORT',
    'CONTEXT_ELEMENT_IMPORT',
    'CONTAINER_ELEMENT_IMPORT',
    'FROM',
    'AS'
  ]);
  parameters = new Set(['NAME', 'DESCRIPTION', 'TECHNOLOGY', 'LINKS', 'VIA', 'CALL', 'FORMAT']);
  identifier = new Set(['IDENTIFIER']);
  operator = new Set(['EQ', 'SWIRE', 'AWIRE']);
  annotation = new Set(['ATTRIBUTE', 'PLANNED', 'DEPRECATED', 'LPAREN', 'RPAREN']);

  getInitialState(): languages.IState {
    return new LexerState();
  }

  tokenize(line: string, state: IState): languages.ILineTokens {
    const inputStream = CharStream.fromString('\n' + line);
    const lexer = new InsightLexer(inputStream);
    lexer.enableSingleLineMode();
    lexer.removeErrorListeners();
    lexer.restoreState(state as LexerState);

    const tokens: InsightToken[] = [];
    let grammarToken;

    while ((grammarToken = lexer.nextToken()) != null) {
      if (grammarToken.type == EOF) {
        // reached end of document
        break;
      } else {
        const tokenTypeName = lexer.vocabulary.getSymbolicName(grammarToken.type) ?? '';
        let editorType: string;

        if (this.keywords.has(tokenTypeName)) {
          editorType = 'type';
        } else if (this.parameters.has(tokenTypeName)) {
          editorType = 'parameter';
        } else if (this.identifier.has(tokenTypeName)) {
          editorType = 'variable';
        } else if (tokenTypeName === 'TEXT' || tokenTypeName === 'ANNOTATION_VALUE') {
          editorType = 'string';
        } else if (tokenTypeName === 'COMMENT') {
          editorType = 'comment';
        } else if (this.annotation.has(tokenTypeName)) {
          editorType = 'constant';
        } else if (this.operator.has(tokenTypeName)) {
          editorType = 'operator';
        } else {
          editorType = tokenTypeName;
        }

        const token = new InsightToken(
          editorType,
          grammarToken.column,
          grammarToken.line,
        );

        tokens.push(token);
      }
    }

    var tt = lexer.snapshotState();
    // var st = state as LexerState;
    // console.log(">>>" + line + "<<<  from {wasText: " + st.wasText() + ", indent: " + st.getIndentation() + "}; to {wasText: " + tt.wasText() + ", indent: " + tt.getIndentation() + "};");
    return { tokens: tokens, endState: tt };
  }
}
