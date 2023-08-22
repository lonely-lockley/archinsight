import { ANTLRInputStream, Token } from 'antlr4ts';
import { languages } from 'monaco-editor';
import * as monaco from 'monaco-editor-core';
import React, { FC, useEffect, useRef } from 'react';

import { InsightLexer } from '../../../build/insight-lang/InsightLexer';
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
    'PERSON',
    'SERVICE',
    'STORAGE',
    'MODULE',
    'CONTAINS',
    'BOUNDARY'
  ]);
  parameters = new Set(['NAME', 'DESCRIPTION', 'TECHNOLOGY']);
  identifier = new Set(['PROJECTNAME', 'IDENTIFIER']);
  operator = new Set(['EQ', 'LINKS']);

  getInitialState(): languages.IState {
    return new LexerState(InsightLexer.TEXT);
  }

  tokenize(line: string, state: IState): languages.ILineTokens {
    const inputStream = new ANTLRInputStream(line);
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
        } else if (tokenTypeName === 'TEXT') {
          editorType = 'string';
        } else if (tokenTypeName === 'COMMENT') {
          editorType = 'comment';
        } else if (this.operator.has(tokenTypeName)) {
          editorType = 'operator';
        } else {
          editorType = tokenTypeName;
        }

        const token = new InsightToken(
          editorType,
          grammarToken.charPositionInLine,
          grammarToken.line,
        );

        tokens.push(token);
      }
    }

    var tt = lexer.snapshotState();
    //var st = state as LexerState;
    //console.log(">>>" + line + "<<<  from {wasText: " + st.wasText() + ", indent: " + st.getIndentation() + "}; to {wasText: " + tt.wasText() + ", indent: " + tt.getIndentation() + "};");
    return { tokens: tokens, endState: tt };
  }
}
