import { Token, CommonToken, TokenSource, TokenFactory, CharStream } from 'antlr4ng';
import { InsightLexer } from '../../generated/insight-lang/InsightLexer';
import { InsightParser } from '../../generated/insight-lang/InsightParser';

import EOF = Token.EOF;

export class CompletionTokenSource implements TokenSource {

  private allTokens: Token[] = [];
  private position = 0;
  private current: Token|undefined;

  public line: number = 0;
  public column: number = 0;
  public inputStream: CharStream;
  public sourceName: string = 'CompletionTokenSource';
  public tokenFactory: TokenFactory<Token>;

  constructor(lexer: InsightLexer, line: number, col: number) {
    this.allTokens = lexer.getAllTokens();
    var eof = CommonToken.fromType(EOF, "<EOF>");
    eof.line = line;
    eof.column = col;
    this.allTokens.push(eof);
    this.tokenFactory = lexer.tokenFactory;
    this.inputStream = lexer.inputStream;
  }

  private setCurrentToken(): Token|undefined {
      if (this.position >= this.allTokens.length) {
          this.current = undefined;
          return undefined;
      }
      this.current = this.allTokens[this.position];
      this.line = this.current.line;
      this.column = this.current.column;
      this.position++;
      return this.current;
  }

  public nextToken(): Token {
    return this.setCurrentToken()!;
  }

  public ttt(line: number, col: number, other: number | undefined): number {
        console.log("Suggested tokenIndex: " + other);
        console.log("Looking for line=" + line + " and column=" + col);
//         console.log(this.allTokens);
//         for (var i = 0; i < this.allTokens.length; i++) {
//           if (this.allTokens[i].line == line) {
//               console.log(this.allTokens[i]);
//           }
//         }
//         console.log("-----");
        console.log("Override tokenIndex: " + this.allTokens[this.allTokens.length - 1].tokenIndex);
        return this.allTokens[this.allTokens.length - 1].tokenIndex;
    }

}