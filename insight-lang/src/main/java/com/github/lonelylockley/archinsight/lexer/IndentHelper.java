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
    private boolean eofReached = false;

    public IndentHelper(InsightLexer lexer) {
        this.lexer = lexer;
        this.waitlist = new LinkedList<>();
        this.state = new LexerState();
    }

    private String stripNewlineCharacters(String src) {
        return src.replaceAll("[\n\r]", "");
    }

    private int countNewLines(String src) {
        var lastIndex = 0;
        var count = 0;
        while(lastIndex != -1){
            lastIndex = src.indexOf('\n', lastIndex);
            if(lastIndex != -1){
                count++;
                lastIndex += 1;
            }
        }
        return count;
    }

    private String indentationError(int actual, int expected) {
        return String.format("line %d:%d incorrect indentation. current position: %d, expected: %d", lexer.getLine(), lexer.getCharPositionInLine(), actual, expected);
    }

    private CommonToken createToken(int type, String text, int length, int lineCorrection, int offsetCorrection) {
        var stop = lexer.getCharIndex() + offsetCorrection;
        var start = stop - length + 1;
        var tkn = new CommonToken(lexer.getTokenFactorySourcePair(), type, DEFAULT_TOKEN_CHANNEL, start, stop);
        tkn.setText(text);
        tkn.setLine(lexer.getLine() + lineCorrection);
        return tkn;
    }

    private int calculateLengthCorrection() {
        return lexer.getText() == null ? 0 : -lexer.getText().length();
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

    private void fireIndents(int desiredIndentation, int linesCorrection) {
        while (indentation < desiredIndentation) {
            indentation++;
            state.incIndentation();
            waitlist.add(createToken(InsightLexer.INDENT, "<INDENT>", INDENT_LENGTH, 0, -linesCorrection));
        }
    }

    private void fireDedents(int desiredIndentation, int linesCorrection) {
        while (indentation > desiredIndentation) {
            waitlist.add(createToken(InsightLexer.DEDENT, "<DEDENT>", 0, -linesCorrection, 0));
            indentation--;
            state.decIndentation();
        }
    }

    public void checkIndentation() {
        var newLines = countNewLines(lexer.getText());
        var newIndentation = calculateIndentation(stripNewlineCharacters(lexer.getText()));
        waitlist.add(createToken(InsightLexer.EOL, "\n", 1, -newLines, calculateLengthCorrection()));
        if (newIndentation > indentation) {
            fireIndents(newIndentation, newLines);
        }
        else
        if (!singleLineMode) {
            fireDedents(newIndentation, newLines);
        }
    }

    public void wrapValue() {
        if (!wrapped) {
            wrapped = true;
            state.setWasText();
            waitlist.add(createToken(InsightLexer.WRAP, "<WRAP>", 0, 0, calculateLengthCorrection()));
        }
    }

    public void unwrapValue() {
        var newLines = countNewLines(lexer.getText());
        var newIndentation = calculateIndentation(stripNewlineCharacters(lexer.getText()));
        if (newIndentation == indentation + 1) {
            waitlist.add(createToken(InsightLexer.TEXT, "\n", 1, -newLines, calculateLengthCorrection()));
        }
        else
        if ((newIndentation <= indentation) && wrapped) {
            wrapped = false;
            if (!singleLineMode) {
                state.resetWasText();
                waitlist.add(createToken(InsightLexer.UNWRAP, "<UNWRAP>", 0, -newLines, calculateLengthCorrection()));
                waitlist.add(createToken(InsightLexer.EOL, "\n", 1, -newLines, calculateLengthCorrection()));
                lexer.popMode();
                fireDedents(newIndentation, newLines);
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
            //waitlist.add(createToken(InsightLexer.EOL, "\n", 1, 0, 0));
            lexer.setText("\n");
            unwrapValue();
        }
        else
        if (lexer.getInputStream().LA(-1) != 10 && lexer.getText() == null) {
            //waitlist.add(createToken(InsightLexer.EOL, "\n", 1, 0, 0));
            lexer.setText("\n");
            checkIndentation();
        }
        waitlist.add(eof);
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
        if (tkn.getType() == Token.EOF && !eofReached) {
            eofReached = true;
            processEOF(tkn);
            if (!waitlist.isEmpty()) {
                tkn = waitlist.pollFirst();
            }
        }
        final String rawType = lexer.getVocabulary().getSymbolicName(tkn.getType());
        System.out.println("---- " + rawType + " [line=" + tkn.getLine() + ",from=" + tkn.getStartIndex() + ",to=" + tkn.getStopIndex() + ",mode=" + lexer._mode + ",channel=" + tkn.getChannel() + "] = `" + tkn.getText() + "`");
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
