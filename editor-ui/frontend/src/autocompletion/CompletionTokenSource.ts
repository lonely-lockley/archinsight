import {ParseTreeListener, ErrorNode, ParserRuleContext, TerminalNode, Token} from 'antlr4ng';
import {InsightLexer} from '../../generated/insight-lang/InsightLexer';

export class CompletionTokenSource implements ParseTreeListener {

    private lastToken: Token | undefined;
    private line: number;
    private col: number;
    private listening: boolean = true;
    private skipRestOfTheLine = false;
    private lineToSkip = -1;

    constructor(line: number, col: number) {
        this.line = line;
        this.col = col - 1;
    }

    visitTerminal(node: TerminalNode): void {
        if (node.getSymbol().line == this.line) {
            console.log('dbg: tkn: ' + node.getSymbol().type + ' ind: ' + node.getSymbol().tokenIndex + ', [' + node.getSymbol().column + '-' + (node.getSymbol().column + node.getSymbol().stop - node.getSymbol().start) + ']  [' + this.line + ':' + this.col + ']');
        }
        const tkn = node.getSymbol();
        if (tkn.type == InsightLexer.TEXT || tkn.type == InsightLexer.COMMENT) {
            this.lastToken = tkn;
            this.skipRestOfTheLine = true;
            this.lineToSkip = node.getSymbol().line;
        }
        else
        if (this.skipRestOfTheLine && node.getSymbol().line > this.lineToSkip) {
            this.skipRestOfTheLine = false;
            this.lineToSkip = -1;
        }

        if (!this.skipRestOfTheLine) {
            const stop = tkn.column + tkn.stop - tkn.start;
            if (this.line == tkn.line && stop < this.col && this.listening) {
                this.lastToken = tkn;
            }
        }
    }



    visitErrorNode(node: ErrorNode): void {
        if (node.getSymbol().line == this.line) {
            console.log('dbg: err: ' + node.getSymbol().type + ' ind: ' + node.getSymbol().tokenIndex + ', [' + node.getSymbol().column + '-' + (node.getSymbol().column + node.getSymbol().stop - node.getSymbol().start) + ']  [' + this.line + ':' + this.col + ']');
        }
        const tkn = node.getSymbol();
        if (tkn.type == InsightLexer.TEXT || tkn.type == InsightLexer.COMMENT) {
            this.lastToken = tkn;
            this.skipRestOfTheLine = true;
        }
        else
        if (this.skipRestOfTheLine && node.getSymbol().line > this.lineToSkip) {
            this.skipRestOfTheLine = false;
            this.lineToSkip = -1;
        }

        if (!this.skipRestOfTheLine) {
            const start = tkn.column;
            const stop = tkn.column + tkn.stop - tkn.start;
            if (this.line == tkn.line && start < this.col && stop < this.col) {
                this.lastToken = tkn;
                this.listening = false;
            }
        }
    }

    enterEveryRule(node: ParserRuleContext): void {

    }

    exitEveryRule(node: ParserRuleContext): void {

    }

    public getTokenIndex(): number {
        if (this.skipRestOfTheLine) {
            return -1;
        }
        else {
            return this.lastToken == undefined ? 0 : this.lastToken.tokenIndex;
        }
    }

}