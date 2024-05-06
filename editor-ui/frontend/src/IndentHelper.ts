import { CommonToken, Token } from 'antlr4ng';
import LexerState from './LexerState';
import { InsightLexer } from '../generated/insight-lang/InsightLexer';

class IndentationException extends Error {

    constructor(msg: string) {
        super(msg);
    }

    public static createErrorMsg(tkn: CommonToken, actual: number, expected: number): string {
        return "line " + tkn.line + ":" + tkn.column + " incorrect indentation. current position: " + actual + ", expected: " + expected;
    }

}

class IndentHelper {

    INDENT_LENGTH: number = 4;

    private lexer: InsightLexer;
    private _waitlist: Token[];
    private state: LexerState;
    private singleLineMode: boolean = false;

    private indentation: number = 0;
    private line: number = 0;
    private idx = 0;

    constructor(lexer: InsightLexer) {
        this.lexer = lexer;
        this._waitlist = [];
        this.state = new LexerState(InsightLexer.TEXT);
    }

    public enableSingleLineMode() {
        this.singleLineMode = true;
    }

    private emitIndentToken(tkn: CommonToken, ephemeral: boolean) {
        this.indentation++;
        this.state.incIndentation();
        var idt = CommonToken.fromType(InsightLexer.INDENT, "<INDENT>");
        idt.line = tkn.line;
        if (ephemeral) {
            idt.setCharPositionInLine(tkn.column + (tkn.stop - tkn.start));
            idt.start = tkn.stop;
            idt.stop = tkn.stop;
        }
        else {
            idt.setCharPositionInLine((this.indentation - 1) * this.INDENT_LENGTH);
            idt.start = tkn.start;
            idt.stop = tkn.stop;
        }
        this._waitlist.push(idt);
    }

    private emitDedentTokens(tkn: CommonToken, curIndentation: number, ephemeral: boolean) {
        while (this.indentation > curIndentation) {
            var ddt = CommonToken.fromType(InsightLexer.DEDENT, "<DEDENT>");
            ddt.line = tkn.line;
            ddt.setCharPositionInLine((this.indentation - 1) * this.INDENT_LENGTH);
            if (ephemeral) {
                ddt.start = tkn.start;
                ddt.stop = tkn.start;
            }
            else {
                ddt.start = tkn.start;
                ddt.stop = tkn.stop;
            }
            this._waitlist.push(ddt);
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
        var position: number = 0;
        if (tkn.type == InsightLexer.INDENTATION || tkn.type == InsightLexer.EOL_VALUE) {
            position = this.expandTabCharacter(this.stripNewlineCharacters(tkn.text)).length;
        }
        else {
            position = tkn.column;
        }
        var tmp: number = position / this.INDENT_LENGTH;
        if (tmp % 1 != 0) {
               this.lexer.errorListenerDispatch.syntaxError?.(
                   this.lexer,
                   null,
                   this.line,
                   position,
                   IndentationException.createErrorMsg(tkn, position, this.indentation * this.INDENT_LENGTH),
                   null
               );
        }
        return Math.floor(tmp);
    }

    private handleIndentation(tkn: CommonToken) {
        var curIndentation: number = this.calculateCurrentIndentation(tkn);
        if (curIndentation == this.indentation + 1) {
            this.emitIndentToken(tkn, false);
        }
        else
        if (curIndentation < this.indentation && this.indentation > 0) {
            if ((tkn.type == Token.EOF && !this.singleLineMode) || tkn.type != Token.EOF) {
                this.emitDedentTokens(tkn, curIndentation, false);
            }
        }
        else
        if (this.indentation == curIndentation) {
            // nothing to do here
        }
        else {
            this.lexer.errorListenerDispatch.syntaxError?.(
               this.lexer,
               null,
               this.line,
               curIndentation * this.INDENT_LENGTH,
               IndentationException.createErrorMsg(tkn, curIndentation * this.INDENT_LENGTH, this.indentation * this.INDENT_LENGTH),
               null
            );
        }
    }

    private handleText(tkn: CommonToken) {
        if (tkn.type == Token.EOF && !this.singleLineMode) {
            this.emitDedentTokens(tkn, 0, true);
            this._waitlist.push(tkn);
        }
        else
        if (tkn.type == InsightLexer.EQ) {
            this._waitlist.push(tkn);
            this.emitIndentToken(tkn, true);
        }
        else
        if (tkn.type == InsightLexer.EOL_VALUE) {
            var eol: CommonToken = CommonToken.fromType(InsightLexer.TEXT, "\n");
            eol.line = tkn.line;
            eol.column = tkn.column;
            eol.start = tkn.start;
            eol.stop = tkn.stop;
            this._waitlist.push(eol);
        }
        else
        if (tkn.channel == 0) {
            this._waitlist.push(tkn);
        }
    }

    public nextToken(): Token {
        do {
            var rawToken: Token = this.lexer.supplyToken();
            var tkn: CommonToken = rawToken as CommonToken;
            if (tkn.line > this.line) {
                this.line = tkn.line;
                this.handleIndentation(tkn);
            }
            this.handleText(tkn);
            this.state.updateToken(tkn);
        }
        while (this._waitlist.length == 0);
        var result = this._waitlist.shift()!;
        result.tokenIndex = this.idx;
        this.idx++;
        return result;
    }

    public checkTextBlockBound(indentationValue: string | undefined): boolean {
        var curIndentation: number = this.expandTabCharacter(this.stripNewlineCharacters(indentationValue)).length / this.INDENT_LENGTH;
        return curIndentation < this.indentation;
    }

    public snapshotState(): LexerState {
        return this.state.clone() as LexerState;
    }

    public restoreState(state: LexerState) {
        var tkn: Token = this.lexer.supplyToken();
        this.lexer.reset();
        this.state = state.clone() as LexerState;
        this.indentation = state.getIndentation();
        if (state.wasText() && (tkn.type == InsightLexer.INDENTATION && !this.checkTextBlockBound(tkn.text))) {
            this.lexer.pushMode(InsightLexer.VALUE_MODE);
        }
    }

}

export default IndentHelper;
