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
        return src == undefined ? "" : src.replace(/\r?\n/g, "");
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
                this.lexer.emit(),
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
            this.waitlist.push(this.createToken(InsightLexer.INDENT, "<INDENT>"));
        }
        else {
            this.waitlist.push(this.createToken(InsightLexer.EOL, "\n"));
            while (this.indentation > newIndentation && !this.singleLineMode) {
                this.waitlist.push(this.createToken(InsightLexer.DEDENT, "<DEDENT>"));
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
            this.waitlist.push(this.createToken(InsightLexer.TEXT, "\n"));
        }
        else
        if ((newIndentation <= this.indentation) && this.wrapped) {
            this.wrapped = false;
            if (!(this.singleLineMode && this.lexer.inputStream.LA(1) == -1)) {
                this.state.resetWasText();
                this.waitlist.push(this.createToken(InsightLexer.UNWRAP, "<UNWRAP>"));
                this.waitlist.push(this.createToken(InsightLexer.EOL, "\n"));
                this.lexer.popMode();
                while (this.indentation > newIndentation) {
                    this.waitlist.push(this.createToken(InsightLexer.DEDENT, "<DEDENT>"));
                    this.indentation--;
                    this.state.decIndentation();
                }
            }
        }
        else {
            this.lexer.errorListenerDispatch.syntaxError?.(
                this.lexer,
                this.lexer.emit(),
                this.lexer.line,
                this.lexer.getCharIndex(),
                IndentationException.createErrorMsg(this.lexer, this.lexer.getCharIndex(), this.indentation * this.INDENT_LENGTH),
                null
            );
        }
    }

    public processEOF(eof: Token) {
        if (this.wrapped) {
            this.waitlist.push(this.createToken(InsightLexer.EOL, "\n"));
            this.lexer.text = "\n";
            this.unwrapValue();
            this.waitlist.push(eof);
        }
        else
        if (this.lexer.inputStream.LA(-1) != 10 && this.lexer.text == undefined) {
            this.waitlist.push(this.createToken(InsightLexer.EOL, "\n"));
            this.lexer.text = "\n";
            this.checkIndentation();
            this.waitlist.push(eof);
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
        const rawType = this.lexer.vocabulary.getSymbolicName(tkn.type);
        console.log("---- " + rawType + " [idx=" + tkn.tokenIndex + "line=" + tkn.line + ",mode=" + this.lexer.mode + ",channel=" + tkn.channel + "] = `" + tkn.text + "`");
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
