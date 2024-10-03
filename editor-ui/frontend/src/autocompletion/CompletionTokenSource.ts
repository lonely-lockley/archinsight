import {ParseTreeListener, ErrorNode, ParserRuleContext, TerminalNode, Token} from 'antlr4ng';

export class CompletionTokenSource implements ParseTreeListener {

    private lastToken: Token | undefined;
    private line: number;
    private col: number;
    private listening: boolean = true;

    constructor(line: number, col: number) {
        this.line = line;
        this.col = col - 1;
    }

    visitTerminal(node: TerminalNode): void {
        if (node.getSymbol().line == this.line) {
            console.log('dbg: tkn: ' + node.getSymbol().type + ' ind: ' + node.getSymbol().tokenIndex + ', [' + node.getSymbol().column + '-' + (node.getSymbol().column + node.getSymbol().stop - node.getSymbol().start) + ']  [' + this.line + ':' + this.col + ']');
        }
        const tkn = node.getSymbol();
        const stop = tkn.column + tkn.stop - tkn.start;
        if (this.line == tkn.line && stop < this.col && this.listening) {
            this.lastToken = tkn;
        }
    }

    visitErrorNode(node: ErrorNode): void {
        if (node.getSymbol().line == this.line) {
            console.log('dbg: err: ' + node.getSymbol().type + ' ind: ' + node.getSymbol().tokenIndex + ', [' + node.getSymbol().column + '-' + (node.getSymbol().column + node.getSymbol().stop - node.getSymbol().start) + ']  [' + this.line + ':' + this.col + ']');
        }
        const tkn = node.getSymbol();
        const start = tkn.column;
        const stop = tkn.column + tkn.stop - tkn.start;
        if (this.line == tkn.line && start < this.col && stop < this.col) {
            this.lastToken = tkn;
            this.listening = false;
        }
    }

    enterEveryRule(node: ParserRuleContext): void {

    }

    exitEveryRule(node: ParserRuleContext): void {

    }

    public getTokenIndex(): number {
        return this.lastToken == undefined ? 0 : this.lastToken.tokenIndex;
    }

}