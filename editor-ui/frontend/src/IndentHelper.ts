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
    private tokenId: number = 0;

    constructor(lexer: InsightLexer) {
        this.lexer = lexer;
        this.waitlist = [];
        this.state = new LexerState();
    }

    private stripNewlineCharacters(src: string | undefined): string {
        return src == undefined ? "" : src.replace(/\r?\n/g, "");
    }

    private countNewLines(src: string): number {
        let lastIndex = 0;
        let count = 0;
        while(lastIndex != -1){
            lastIndex = src.indexOf('\n', lastIndex);
            if(lastIndex != -1){
                count++;
                lastIndex += 1;
            }
        }
        return count;
    }

    private calculateLengthCorrection(): number {
        return this.lexer.text == null ? 0 : -this.lexer.text.length;
    }

    private createToken(type: number, text: string, tokenLength: number, lineCorrection = 0, offsetCorrection = 0, column: number | undefined = undefined): CommonToken {
        let stop = this.lexer.getCharIndex() + offsetCorrection;
        let start = stop - tokenLength + 1;
        let tkn = CommonToken.fromSource([this.lexer, this.lexer.inputStream], type, InsightLexer.DEFAULT_TOKEN_CHANNEL, start, stop);
        tkn.setLine(this.lexer.line + lineCorrection);
        tkn.setText(text);
        if (column != undefined) {
            tkn.setCharPositionInLine(column);
        }
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
                this.createToken(InsightLexer.INDENT, " ".repeat(this.lexer.column), this.lexer.column, 0, 0, 0),
                this.lexer.line,
                0,
                IndentationException.createErrorMsg(this.lexer, this.lexer.column, this.indentation * this.INDENT_LENGTH),
                null
            );
        }
        return count / this.INDENT_LENGTH;
    }


    private fireIndents(desiredIndentation: number, linesCorrection: number) {
        while (this.indentation < desiredIndentation) {
            this.indentation++;
            this.state.incIndentation();
            this.waitlist.push(this.createToken(InsightLexer.INDENT, "<INDENT>", this.INDENT_LENGTH, 0, -linesCorrection));
        }
    }

    private fireDedents(desiredIndentation: number, linesCorrection: number) {
        while (this.indentation > desiredIndentation) {
            this.waitlist.push(this.createToken(InsightLexer.DEDENT, "<DEDENT>", 0, -linesCorrection, 0));
            this.indentation--;
            this.state.decIndentation();
        }
    }

    public checkIndentation() {
        let newLines = this.countNewLines(this.lexer.text);
        let newIndentation = this.calculateIndentation(this.stripNewlineCharacters(this.lexer.text));
        this.waitlist.push(this.createToken(InsightLexer.EOL, "\n", 1, -newLines, this.calculateLengthCorrection()));
        if (newIndentation > this.indentation) {
            this.fireIndents(newIndentation, newLines);
        }
        else {
            if (!this.singleLineMode) {
                this.fireDedents(newIndentation, newLines);
            }
        }
    }

    public wrapValue() {
        if (!this.wrapped) {
            this.wrapped = true;
            this.state.setWasText();
            this.waitlist.push(this.createToken(InsightLexer.WRAP, "<WRAP>", 0, 0, this.calculateLengthCorrection()));
        }
    }

    public unwrapValue() {
        let newLines = this.countNewLines(this.lexer.text);
        let newIndentation = this.calculateIndentation(this.stripNewlineCharacters(this.lexer.text));
        if (newIndentation == this.indentation + 1) {
            this.waitlist.push(this.createToken(InsightLexer.TEXT, "\n", 1, -newLines, this.calculateLengthCorrection()));
        }
        else
        if ((newIndentation <= this.indentation) && this.wrapped) {
            this.wrapped = false;
            if (!(this.singleLineMode && this.lexer.inputStream.LA(1) == -1)) {
                this.state.resetWasText();
                this.waitlist.push(this.createToken(InsightLexer.UNWRAP, "<UNWRAP>", 0, -newLines, this.calculateLengthCorrection()));
                this.waitlist.push(this.createToken(InsightLexer.EOL, "\n", 1, -newLines,  this.calculateLengthCorrection()));
                this.lexer.popMode();
                this.fireDedents(newIndentation, newLines);
            }
        }
        else {
            this.lexer.errorListenerDispatch.syntaxError?.(
                this.lexer,
                this.createToken(InsightLexer.INDENT, " ".repeat(this.lexer.column), this.lexer.column, 0, 0, 0),
                this.lexer.line,
                0,
                IndentationException.createErrorMsg(this.lexer, this.lexer.column, this.indentation * this.INDENT_LENGTH),
                null
            );
        }
    }

    public processEOF(eof: Token) {
        if (this.wrapped) {
            this.lexer.text = "\n";
            this.unwrapValue();
            this.waitlist.push(eof);
        }
        else
        if (this.lexer.inputStream.LA(-1) != 10 && this.lexer.text == undefined) {
            this.lexer.text = "\n";
            this.checkIndentation();
            this.waitlist.push(eof);
        }
        else
        if (!this.singleLineMode && !(this.waitlist.length > 0 && this.waitlist[this.waitlist.length - 1].type == InsightLexer.EOF)) {
            this.fireDedents(0, 0);
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
        tkn.tokenIndex = this.tokenId;
        this.tokenId++;
        // const rawType = this.lexer.vocabulary.getSymbolicName(tkn.type);
        // console.log("---- " + rawType + " [idx=" + tkn.tokenIndex + "line=" + tkn.line + ",from=" + tkn.start + ",to=" + tkn.stop + ",mode=" + this.lexer.mode + ",channel=" + tkn.channel + "] = `" + tkn.text + "`");
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
