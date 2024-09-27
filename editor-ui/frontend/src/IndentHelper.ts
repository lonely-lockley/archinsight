import { CommonToken, Token } from 'antlr4ng';
import LexerState from './LexerState';
import { InsightLexer } from '../generated/insight-lang/InsightLexer';

class IndentationException extends Error {

    constructor(msg: string) {
        super(msg);
    }

    public static createErrorMsg(lexer: InsightLexer, actual: number, expected: number): string {
        return "line " + lexer.line + ":" + lexer.column + " incorrect indentation. current position: " + actual + ", expected: " + expected;
    }

}

class IndentHelper {

    INDENT_LENGTH: number = 4;

    private lexer: InsightLexer;
    private waitlist: Token[];

    private indentation: number = 0;
    private wrapped: boolean = false;
    private singleLineMode: boolean = false;
    private state: LexerState;

    constructor(lexer: InsightLexer) {
        this.lexer = lexer;
        this.waitlist = [];
        this.state = new LexerState();
    }

    private stripNewlineCharacters(src: string | undefined): string {
        if (src == undefined) {
            return "";
        }
        else {
            return src.replace(/\r?\n/g, "");
        }
    }

    private currentToken(): Token {
        const tokenStartMarker = this.lexer.inputStream.mark();
        const token = this.lexer.nextToken();               // Get the current token
        this.lexer.inputStream.seek(tokenStartMarker);
        return token;
    }

    private createToken(type: number, text: string): CommonToken {
        let stop = this.lexer.getCharIndex() - 1;
        let start = text.length == 0 ? stop : stop - text.length + 1;
        let tkn = CommonToken.fromSource([this.lexer, this.lexer.inputStream], type, InsightLexer.DEFAULT_TOKEN_CHANNEL, start, stop);
        tkn.setText(text);
        return tkn;
    }

    private calculateIndentation(indent: string): number {
        let count = 0;
        for (const ch of indent) {
            if (ch == '\t') {
                count += this.INDENT_LENGTH;
            }
            else {
                count++;
            }
        }
        if (count % this.INDENT_LENGTH != 0) {
            this.lexer.errorListenerDispatch.syntaxError?.(
                this.lexer,
                null,
                this.lexer.line,
                this.lexer.getCharIndex(),
                IndentationException.createErrorMsg(this.lexer, this.lexer.getCharIndex(), this.indentation * this.INDENT_LENGTH),
                null
            );
        }
        return count / this.INDENT_LENGTH;
    }

    public checkIndentation() {
        let newIndentation = this.calculateIndentation(this.stripNewlineCharacters(this.lexer.text));
        if (newIndentation > this.indentation) {
            this.indentation++;
            this.state.incIndentation();
            this.waitlist.push(this.createToken(InsightLexer.EOL, "\n"));
            this.lexer.emitToken(this.createToken(InsightLexer.INDENT, "<INDENT>"));
        }
        else {
            this.lexer.emitToken(this.createToken(InsightLexer.EOL, "\n"));
            while (this.indentation > newIndentation && !this.singleLineMode) {
                this.waitlist.push(this.currentToken());
                this.lexer.emitToken(this.createToken(InsightLexer.DEDENT, "<DEDENT>"));
                this.indentation--;
                this.state.decIndentation();
            }
        }
    }

    public wrapValue() {
        if (!this.wrapped) {
            this.wrapped = true;
            this.state.setWasText();
            this.waitlist.push(this.createToken(InsightLexer.WRAP, "<WRAP>"));
        }
    }

    public unwrapValue() {
        let newIndentation = this.calculateIndentation(this.stripNewlineCharacters(this.lexer.text));
        if (newIndentation == this.indentation + 1) {
            this.lexer.emitToken(this.createToken(InsightLexer.TEXT, "\n"));
        }
        else
        if ((newIndentation <= this.indentation) && this.wrapped) {
            this.wrapped = false;
            if (!(this.singleLineMode && this.lexer.inputStream.LA(1) == -1)) {
                this.state.resetWasText();
                this.waitlist.push(this.createToken(InsightLexer.UNWRAP, "<UNWRAP>"));
                this.lexer.emitToken(this.createToken(InsightLexer.EOL, "\n"));
                this.lexer.popMode();
                while (this.indentation > newIndentation) {
                    this.waitlist.push(this.currentToken());
                    this.lexer.emitToken(this.createToken(InsightLexer.DEDENT, "<DEDENT>"));
                    this.indentation--;
                    this.state.decIndentation();
                }
            }
        }
        else {
            this.lexer.errorListenerDispatch.syntaxError?.(
                this.lexer,
                null,
                this.lexer.line,
                this.lexer.getCharIndex(),
                IndentationException.createErrorMsg(this.lexer, this.lexer.getCharIndex(), this.indentation * this.INDENT_LENGTH),
                null
            );
        }
    }

    public processEOF(eof: Token) {
        if (this.wrapped) {
            this.lexer.emitToken(this.createToken(InsightLexer.EOL, "\n"));
            this.lexer.text = "\n";
            this.unwrapValue();
            this.waitlist.push(this.currentToken());
            this.lexer.emitToken(eof);
        }
        else
            if (this.lexer.inputStream.LA(-1) != 10 && this.lexer.text == null) {
                this.lexer.emitToken(this.createToken(InsightLexer.EOL, "\n"));
                this.lexer.text = "\n";
                this.checkIndentation();
                this.waitlist.push(this.currentToken());
                this.lexer.emitToken(eof);
        }
    }

    public nextToken(): Token {
        let tkn: Token;
        if (this.waitlist.length > 0) {
            tkn = this.waitlist.shift()!;
        }
        else {
            tkn = this.lexer.supplyToken();
            if (this.waitlist.length > 0) {
                this.waitlist.push(tkn);
                tkn = this.waitlist.shift()!;
            }
        }
        if (tkn.type == Token.EOF) {
            this.processEOF(tkn);
            if (this.waitlist.length > 0) {
                this.waitlist.push(tkn);
                tkn =this.waitlist.shift()!;
            }
        }
        return tkn;
    }

    public enableSingleLineMode() {
        this.singleLineMode = true;
    }

    public snapshotState(): LexerState {
        return this.state.clone() as LexerState;
    }

    public restoreState(state: LexerState) {
        this.lexer.reset();
        this.state = state.clone() as LexerState;
        this.indentation = state.getIndentation();
        if (state.wasText()) {
            this.wrapped = true;
            this.lexer.pushMode(InsightLexer.VALUE_MODE);
        }
    }

}

export default IndentHelper;
