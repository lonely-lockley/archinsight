import { ANTLRInputStream, CommonToken, Token } from 'antlr4ts';
import { LinkedList } from 'linked-list-typescript';
import LexerState from './LexerState';
import { InsightLexer } from '../../../build/insight-lang/InsightLexer';

class Queue<T> extends LinkedList<T> {
  constructor(...values: T[]) {
    super(...values);
  }

  get front() {
    return this.head;
  }

  add(val: T) {
    this.append(val);
  }

  pop(): T {
    var tmp = this.removeHead();
    return tmp;
  }
}

class IndentationException extends Error {

    constructor(tkn: CommonToken, actual: number, expected: number) {
        super("line " + tkn.line + ":" + tkn.charPositionInLine + " incorrect indentation. current position: " + actual + ", expected: " + expected);
    }

}

class IndentHelper {

    INDENT_LENGTH: number = 4;

    private lexer: InsightLexer;
    private _waitlist: Queue<Token>;
    private state: LexerState;
    private singleLineMode: boolean = false;

    private indentation: number = 0;
    private line: number = 0;

    constructor(lexer: InsightLexer) {
        this.lexer = lexer;
        this._waitlist = new Queue<Token>();
        this.state = new LexerState(InsightLexer.TEXT);
    }

    public enableSingleLineMode() {
        this.singleLineMode = true;
    }

    private emitIndentToken(tkn: CommonToken) {
        this.indentation++;
        this.state.incIndentation();
        var idt = new CommonToken(InsightLexer.INDENT, "<INDENT>");
        idt.line = tkn.line;
        idt.charPositionInLine = (this.indentation - 1) * this.INDENT_LENGTH;
        this._waitlist.add(idt);
    }

    private emitDedentTokens(tkn: CommonToken, curIndentation: number) {
        while (this.indentation > curIndentation) {
            var ddt = new CommonToken(InsightLexer.DEDENT, "<DEDENT>");
            ddt.line = tkn.line;
            ddt.charPositionInLine = (this.indentation - 1) * this.INDENT_LENGTH;
            this._waitlist.add(ddt);
            this.indentation--;
            this.state.decIndentation();
            if (this.state.wasText()) {
                this.state.resetWasText();
            }
        }
    }

    private stripNewlineCharacters(src: string | undefined): string {
        if (src == undefined) {
            return "";
        }
        else {
            return src.replace(/\r?\n/g, "");
        }
    }

    private expandTabCharacter(src: string| undefined): string {
        if (src == undefined) {
            return "";
        }
        else {
            return src.replace(/\t/g, "    ");
        }
    }

    private calculateCurrentIndentation(tkn: CommonToken): number {
        var position: number;
        if (tkn.type == InsightLexer.INDENTATION || tkn.type == InsightLexer.EOL_VALUE) {
            position = this.expandTabCharacter(this.stripNewlineCharacters(tkn.text)).length;
        }
        else {
            position = tkn.charPositionInLine;
        }
        var tmp: number = position / this.INDENT_LENGTH;
        if (tmp % 1 != 0) {
            throw new IndentationException(tkn, position, this.indentation * this.INDENT_LENGTH);
        }
        return Math.floor(tmp);
    }

    private handleIndentation(tkn: CommonToken) {
        var curIndentation: number = this.calculateCurrentIndentation(tkn);
        if (curIndentation == this.indentation + 1) {
            this.emitIndentToken(tkn);
        }
        else
        if (curIndentation < this.indentation && this.indentation > 0) {
            if ((tkn.type == Token.EOF && !this.singleLineMode) || tkn.type != Token.EOF) {
                this.emitDedentTokens(tkn, curIndentation);
            }
        }
        else
        if (this.indentation == curIndentation) {
            // nothing to do here
        }
        else {
            throw new IndentationException(tkn, curIndentation * this.INDENT_LENGTH, this.indentation * this.INDENT_LENGTH);
        }
    }

    private handleText(tkn: CommonToken) {
        if (tkn.type == Token.EOF && !this.singleLineMode) {
            this.emitDedentTokens(tkn, 0);
            this._waitlist.add(tkn);
        }
        else
        if (tkn.type == InsightLexer.EQ) {
            this._waitlist.add(tkn);
            this.emitIndentToken(tkn);
        }
        else
        if (tkn.type == InsightLexer.EOL_VALUE) {
            var eol: CommonToken = new CommonToken(InsightLexer.EOL, "\n");
            eol.line = tkn.line;
            this._waitlist.add(eol);
        }
        else {
            this._waitlist.add(tkn);
        }
    }

    public nextToken(): Token {
        var rawToken: Token = this.lexer.supplyToken();
        do {
            var tkn: CommonToken = rawToken as CommonToken;
            if (tkn.line > this.line) {
                this.handleIndentation(tkn);
                this.line = tkn.line;
            }
            this.handleText(tkn);
            this.state.updateToken(tkn);
        }
        while (this._waitlist.length == 0);
        return this._waitlist.pop();
    }

    public checkTextBlockBound(indentationValue: string | undefined): boolean {
        if (indentationValue == undefined) {
            throw Error("Empty text to check for indentation");
        }
        var curIndentation: number = this.expandTabCharacter(this.stripNewlineCharacters(indentationValue)).length / this.INDENT_LENGTH;
        return curIndentation < this.indentation;
    }

    public snapshotState(): LexerState {
        return this.state;
    }

    public restoreState(state: LexerState) {
        var tkn: Token = this.lexer.supplyToken();
        this.lexer.reset();
        this.state = state;
        this.indentation = state.getIndentation();
        if (state.wasText() && (tkn.type == InsightLexer.INDENTATION && !this.checkTextBlockBound(tkn.text))) {
            this.lexer.pushMode(InsightLexer.VALUE_MODE);
        }
    }

}

export default IndentHelper;
