package com.github.lonelylockley.archinsight.lexer;

import com.github.lonelylockley.insight.lang.InsightLexer;
import org.antlr.v4.runtime.CommonToken;
import org.antlr.v4.runtime.RecognitionException;
import org.antlr.v4.runtime.Token;

import java.util.LinkedList;
import java.util.function.Supplier;

public class IndentHelper {

    public static final int INDENT_LENGTH = 4;

    private final InsightLexer lexer;
    private final Supplier<Token> tokenSupplier;
    private final LinkedList<Token> waitlist;

    private boolean singleLineMode = false;
    private int indentation = 0;
    private int line = 0;
    private LexerState state;

    public IndentHelper(Supplier<Token> tokenSupplier, InsightLexer lexer) {
        this.tokenSupplier = tokenSupplier;
        this.lexer = lexer;
        this.waitlist = new LinkedList<>();
        state = new LexerState(InsightLexer.TEXT);
    }

    public void enableSingleLineMode() {
        this.singleLineMode = true;
    }

    private String indentationError(CommonToken tkn, int actual, int expected) {
        return String.format("line %d:%d incorrect indentation. current position: %d, expected: %d", tkn.getLine(), tkn.getCharPositionInLine(), actual, expected);
    }

    private void emitIndentToken(CommonToken tkn) {
        indentation++;
        state.incIndentation();
        CommonToken idt = new CommonToken(InsightLexer.INDENT, "<INDENT>");
        idt.setLine(tkn.getLine());
        idt.setCharPositionInLine((indentation - 1) * INDENT_LENGTH);
        waitlist.add(idt);
    }

    private void emitDedentTokens(CommonToken tkn, int curIndentation) {
        while (indentation > curIndentation) {
            CommonToken ddt = new CommonToken(InsightLexer.DEDENT, "<DEDENT>");
            ddt.setLine(tkn.getLine());
            ddt.setCharPositionInLine((indentation - 1) * INDENT_LENGTH);
            waitlist.add(ddt);
            indentation--;
            state.decIndentation();
            if (state.wasText()) {
                state.resetWasText();
            }
        }
    }

    private String stripNewlineCharacters(String src) {
        return src.replaceAll("[\n\r]", "");
    }

    private String expandTabCharacter(String src) {
        return src.replaceAll("\t", "    ");
    }

    private int calculateCurrentIndentation(CommonToken tkn) {
        int position;
        if (tkn.getType() == InsightLexer.INDENTATION || tkn.getType() == InsightLexer.EOL_VALUE) {
            position = expandTabCharacter(stripNewlineCharacters(tkn.getText())).length();
        }
        else {
            position = tkn.getCharPositionInLine();
        }
        float tmp = (float) position / (float) INDENT_LENGTH;
        if (tmp % 1 != 0) {
            lexer.getErrorListenerDispatch().syntaxError(lexer, tkn, line, position, "incorrect indentation",
                new RecognitionException(indentationError(tkn, position, indentation * INDENT_LENGTH), lexer, lexer._input, null)
            );
        }
        return (int) tmp;
    }

    private void handleIndentation(CommonToken tkn) {
        int curIndentation = calculateCurrentIndentation(tkn);
        if (curIndentation == indentation + 1) {
            emitIndentToken(tkn);
        }
        else
        if (curIndentation < indentation && indentation > 0) {
            if ((tkn.getType() == Token.EOF && !singleLineMode) || tkn.getType() != Token.EOF) {
                emitDedentTokens(tkn, curIndentation);
            }
        }
        else
        if (indentation == curIndentation) {
            // nothing to do here
        }
        else {
            lexer.getErrorListenerDispatch().syntaxError(lexer, tkn, line, curIndentation * INDENT_LENGTH, "incorrect indentation",
                    new RecognitionException(indentationError(tkn, curIndentation * INDENT_LENGTH, indentation * INDENT_LENGTH), lexer, lexer._input, null)
            );
        }
    }

    private void handleText(CommonToken tkn) {
        if (tkn.getType() == Token.EOF && !singleLineMode) {
            emitDedentTokens(tkn, 0);
            waitlist.add(tkn);
        }
        else
        if (tkn.getType() == InsightLexer.EQ) {
            waitlist.add(tkn);
            emitIndentToken(tkn);
        }
        else
        if (tkn.getType() == InsightLexer.EOL_VALUE) {
            CommonToken eol = new CommonToken(InsightLexer.TEXT, "\n");
            eol.setLine(tkn.getLine());
            waitlist.add(eol);
        }
        else
        if (tkn.getChannel() == 0) {
            waitlist.add(tkn);
        }
    }

    public Token nextToken() {
        do {
            CommonToken tkn = (CommonToken) tokenSupplier.get();
            if (tkn.getLine() > line) {
                line = tkn.getLine();
                handleIndentation(tkn);
            }
            handleText(tkn);
            state.updateToken(tkn);
        }
        while (waitlist.size() == 0);
        return waitlist.pollFirst();
    }

    public boolean checkTextBlockBound(String indentationValue) {
        int curIndentation = expandTabCharacter(stripNewlineCharacters(indentationValue)).length() / INDENT_LENGTH;
        return curIndentation < indentation;
    }

    public LexerState snapshotState() {
        return (LexerState) state.clone();
    }

    public void restoreState(LexerState state) {
        Token tkn = tokenSupplier.get();
        lexer.reset();
        this.state = (LexerState) state.clone();
        indentation = state.getIndentation();
        if (state.wasText() && (tkn.getType() == InsightLexer.INDENTATION && !checkTextBlockBound(tkn.getText()))) {
            lexer.pushMode(InsightLexer.VALUE_MODE);
        }
    }

}
