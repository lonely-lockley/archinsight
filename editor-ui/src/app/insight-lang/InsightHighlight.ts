import {languages} from "monaco-editor";
import TokensProvider = languages.TokensProvider;
import IState = languages.IState;
import {ANTLRInputStream, ParserErrorListener, RecognitionException, Recognizer, Token} from "antlr4ts";
import { InsightLexer } from '../../../build/insight-lang/InsightLexer';
import EOF = Token.EOF;
import IToken = languages.IToken;


class MultilineState implements IState {

    readonly previousMode: number;

    constructor(previousMode: number) {
        this.previousMode = previousMode;
    }

    clone(): IState {
        return new MultilineState(this.previousMode);
    }

    equals(that: IState): boolean {
        if (that instanceof MultilineState) {
            return this.previousMode === that.previousMode;
        }
        else {
            return false;
        }
    }

}

class InsightToken implements IToken {
    readonly scopes: string;
    readonly startIndex: number;
    readonly level: number;

    constructor(ruleName: String, startIndex: number, level: number) {
        this.scopes = ruleName.toLowerCase() + ".insight";
        this.startIndex = startIndex;
        this.level = level;
    }
}

export class InsightTokensProvider implements TokensProvider {
    keywords = new Set(['CONTEXT', 'CONTAINER', 'SYSTEM', 'EXTERNAL', 'PERSON', 'SERVICE',
                        'STORAGE', 'MODULE', 'CONTAINS' ]);
    parameters = new Set(['NAME', 'DESCRIPTION', 'TECHNOLOGY']);
    identifier = new Set(['PROJECTNAME', 'IDENTIFIER']);
    operator = new Set(['EQ', 'LINKS']);

    getInitialState(): languages.IState {
        return new MultilineState(InsightLexer.DEFAULT_MODE);
    }

    tokenize(line: string, state: IState): languages.ILineTokens {
        let inputStream = new ANTLRInputStream("\n" + line);
        let lexer = new InsightLexer(inputStream);
        lexer.removeErrorListeners();
        if (state instanceof MultilineState) {
            lexer.pushMode(state.previousMode);
        }
        let tokens: InsightToken[] = [];
        let grammarToken;
        let nextMode: number = InsightLexer.DEFAULT_MODE;

        while ((grammarToken = lexer.nextToken()) != null) {
            if (grammarToken.type == EOF) {
                // reached end of document
                break;
            }
            else {
                let tokenTypeName = lexer.vocabulary.getSymbolicName(grammarToken.type)!;
                let editorType: string;

                if (this.keywords.has(tokenTypeName)) {
                    editorType = "type";
                    nextMode = InsightLexer.DEFAULT_MODE;
                }
                else
                if (this.parameters.has(tokenTypeName)) {
                    editorType = "parameter";
                    nextMode = InsightLexer.DEFAULT_MODE;
                }
                else
                if (this.identifier.has(tokenTypeName)) {
                    editorType = "variable";
                    nextMode = InsightLexer.DEFAULT_MODE;
                }
                else
                if (tokenTypeName === "TEXT") {
                    editorType = "string";
                    nextMode = InsightLexer.VALUE_MODE;
                }
                else
                if (tokenTypeName === "COMMENT") {
                    editorType = "comment";
                    nextMode = InsightLexer.DEFAULT_MODE;
                }
                else
                if (this.operator.has(tokenTypeName)) {
                    editorType = "operator";
                    nextMode = InsightLexer.DEFAULT_MODE;
                }
                else {
                    editorType = tokenTypeName;
                }

                let token = new InsightToken(editorType, grammarToken.charPositionInLine, grammarToken.line);
                tokens.push(token);
            }
        }

        return {tokens: tokens, endState: new MultilineState(nextMode)};
    }

}