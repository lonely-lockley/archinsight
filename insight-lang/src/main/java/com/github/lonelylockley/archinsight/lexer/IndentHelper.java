package com.github.lonelylockley.archinsight.lexer;

import com.github.lonelylockley.insight.lang.InsightLexer;
import org.antlr.v4.runtime.CommonToken;
import org.antlr.v4.runtime.RecognitionException;
import org.antlr.v4.runtime.Token;

import java.util.LinkedList;

import static org.antlr.v4.runtime.Lexer.DEFAULT_TOKEN_CHANNEL;

public class IndentHelper {

    public static final int INDENT_LENGTH = 4;

    private final InsightLexer lexer;
    private final LinkedList<Token> waitlist;

    private int indentation = 0;
    private boolean wrapped = false;
    private boolean singleLineMode = false;
    private LexerState state;

    public IndentHelper(InsightLexer lexer) {
        this.lexer = lexer;
        this.waitlist = new LinkedList<>();
        this.state = new LexerState();
    }

    private String stripNewlineCharacters(String src) {
        return src.replaceAll("[\n\r]", "");
    }

    private String indentationError(int actual, int expected) {
        return String.format("line %d:%d incorrect indentation. current position: %d, expected: %d", lexer.getLine(), lexer.getCharPositionInLine(), actual, expected);
    }

    private CommonToken createToken(int type, String text) {
        var stop = lexer.getCharIndex() - 1;
        var start = text.isEmpty() ? stop : stop - text.length() + 1;
        var tkn = new CommonToken(lexer.getTokenFactorySourcePair(), type, DEFAULT_TOKEN_CHANNEL, start, stop);
        tkn.setText(text);
        return tkn;
    }

    private int calculateIndentation(String indent) {
        int count = 0;
        for (char ch : indent.toCharArray()) {
            if (ch == '\t') {
                count += INDENT_LENGTH;
            }
            else {
                count++;
            }
        }
        if (count % INDENT_LENGTH != 0) {
            lexer.getErrorListenerDispatch().syntaxError(lexer, lexer.getToken(), lexer._tokenStartLine, lexer.getCharPositionInLine(), indentationError(lexer.getCharPositionInLine(), indentation * INDENT_LENGTH),
                new RecognitionException("incorrect indentation", lexer, lexer._input, null)
            );
        }
        return count / INDENT_LENGTH;
    }

    public void checkIndentation() {
        var newIndentation = calculateIndentation(stripNewlineCharacters(lexer.getText()));
        if (newIndentation > indentation) {
            indentation++;
            state.incIndentation();
            waitlist.add(createToken(InsightLexer.EOL, "\n"));
            waitlist.add(createToken(InsightLexer.INDENT, "<INDENT>"));
        }
        else {
            waitlist.add(createToken(InsightLexer.EOL, "\n"));
            while (indentation > newIndentation && !singleLineMode) {
                waitlist.add(createToken(InsightLexer.DEDENT, "<DEDENT>"));
                indentation--;
                state.decIndentation();
            }
        }
    }

    public void wrapValue() {
        if (!wrapped) {
            wrapped = true;
            state.setWasText();
            waitlist.add(createToken(InsightLexer.WRAP, "<WRAP>"));
        }
    }

    public void unwrapValue() {
        var newIndentation = calculateIndentation(stripNewlineCharacters(lexer.getText()));
        if (newIndentation == indentation + 1) {
            waitlist.add(createToken(InsightLexer.TEXT, "\n"));
        }
        else
        if ((newIndentation <= indentation) && wrapped) {
            wrapped = false;
            if (!(singleLineMode && lexer.getInputStream().LA(1) == -1)) {
                state.resetWasText();
                waitlist.add(createToken(InsightLexer.UNWRAP, "<UNWRAP>"));
                waitlist.add(createToken(InsightLexer.EOL, "\n"));
                lexer.popMode();
                while (indentation > newIndentation) {
                    waitlist.add(createToken(InsightLexer.DEDENT, "<DEDENT>"));
                    indentation--;
                    state.decIndentation();
                }
            }
        }
        else {
            lexer.getErrorListenerDispatch().syntaxError(lexer, lexer.getToken(), lexer._tokenStartLine, lexer.getCharPositionInLine(), indentationError(lexer.getCharPositionInLine(), indentation * INDENT_LENGTH),
                new RecognitionException("incorrect indentation", lexer, lexer._input, null)
            );
        }
    }

    public void processEOF(Token eof) {
        if (wrapped) {
            waitlist.add(createToken(InsightLexer.EOL, "\n"));
            lexer.setText("\n");
            unwrapValue();
            waitlist.add(eof);
        }
        else
        if (lexer.getInputStream().LA(-1) != 10 && lexer.getText() == null) {
            waitlist.add(createToken(InsightLexer.EOL, "\n"));
            lexer.setText("\n");
            checkIndentation();
            waitlist.add(eof);
        }
    }

    public Token nextToken() {
        Token tkn;
        if (!waitlist.isEmpty()) {
            tkn = waitlist.pollFirst();
        }
        else {
            tkn = lexer.supplyToken();
            if (!waitlist.isEmpty()) {
                waitlist.add(tkn);
                tkn = waitlist.pollFirst();
            }
        }
        if (tkn.getType() == Token.EOF) {
            processEOF(tkn);
            if (!waitlist.isEmpty()) {
                waitlist.add(tkn);
                tkn = waitlist.pollFirst();
            }
        }
        final String rawType = lexer.getVocabulary().getSymbolicName(tkn.getType());
        System.out.println("---- " + rawType + " [line=" + tkn.getLine() + ",mode=" + lexer._mode + ",channel=" + tkn.getChannel() + "] = `" + tkn.getText() + "`");
        return tkn;
    }

    public void enableSingleLineMode() {
        singleLineMode = true;
    }

    public LexerState snapshotState() {
        return (LexerState) state.clone();
    }

    public void restoreState(LexerState state) {
        //Token tkn = tokenSupplier.get();
        lexer.reset();
        this.state = (LexerState) state.clone();
        indentation = state.getIndentation();
        if (state.wasText()) {
            wrapped = true;
            lexer.pushMode(InsightLexer.VALUE_MODE);
        }
    }

}
