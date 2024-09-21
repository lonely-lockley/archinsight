package com.github.lonelylockley.archinsight.lexer;

import com.github.lonelylockley.insight.lang.InsightLexer2;
import org.antlr.v4.runtime.CommonToken;
import org.antlr.v4.runtime.RecognitionException;
import org.antlr.v4.runtime.Token;

import java.util.LinkedList;
import java.util.function.Supplier;

import static org.antlr.v4.runtime.Lexer.DEFAULT_TOKEN_CHANNEL;

public class IndentHelper2 {

    public static final int INDENT_LENGTH = 4;

    private final InsightLexer2 lexer;
    private final Supplier<Token> tokenSupplier;
    private final LinkedList<Token> waitlist;

    private int indentation = 0;
    private boolean wrapped = false;

    public IndentHelper2(Supplier<Token> tokenSupplier, InsightLexer2 lexer) {
        this.tokenSupplier = tokenSupplier;
        this.lexer = lexer;
        this.waitlist = new LinkedList<>();
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
            lexer.getErrorListenerDispatch().syntaxError(lexer, lexer._token, lexer._tokenStartLine, lexer.getCharPositionInLine(), indentationError(lexer.getCharPositionInLine(), indentation * INDENT_LENGTH),
                new RecognitionException("incorrect indentation", lexer, lexer._input, null)
            );
        }
        return count / INDENT_LENGTH;
    }

    public void checkIndentation() {
        var newIndentation = calculateIndentation(stripNewlineCharacters(lexer.getText()));
        if (newIndentation > indentation) {
            indentation++;
            waitlist.add(createToken(InsightLexer2.EOL, "\n"));
            lexer._token = createToken(InsightLexer2.INDENT, "<INDENT>");
        }
        else {
            while (indentation > newIndentation) {
                waitlist.add(createToken(InsightLexer2.DEDENT, "<DEDENT>"));
                indentation--;
            }
        }
    }

    public void wrapValue() {
        if (!wrapped) {
            wrapped = true;
            waitlist.add(createToken(InsightLexer2.WRAP, "<WRAP>"));
        }
    }

    public void unwrapValue() {
        var newIndentation = calculateIndentation(stripNewlineCharacters(lexer.getText()));
        if (newIndentation == indentation + 1) {
            lexer._token = createToken(InsightLexer2.TEXT, "\n");
        }
        else
        if ((newIndentation <= indentation) && wrapped) {
            wrapped = false;
            waitlist.add(createToken(InsightLexer2.UNWRAP, "<UNWRAP>"));
            lexer._token = createToken(InsightLexer2.EOL, "\n");
            lexer.popMode();
            while (indentation > newIndentation) {
                waitlist.add(lexer._token);
                lexer._token = createToken(InsightLexer2.DEDENT, "<DEDENT>");
                indentation--;
            }
        }
        else {
            lexer.getErrorListenerDispatch().syntaxError(lexer, lexer._token, lexer._tokenStartLine, lexer.getCharPositionInLine(), indentationError(lexer.getCharPositionInLine(), indentation * INDENT_LENGTH),
                new RecognitionException("incorrect indentation", lexer, lexer._input, null)
            );
        }
    }

    public void processEOF(Token eof) {
        if (wrapped) {
            lexer._token = createToken(InsightLexer2.EOL, "\n");
            lexer._text = "\n";
            unwrapValue();
            waitlist.add(lexer._token);
            lexer._token = eof;
        }
    }

    public Token nextToken() {
        Token tkn;
        if (!waitlist.isEmpty()) {
            tkn = waitlist.pollFirst();
        }
        else {
            tkn = tokenSupplier.get();
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

}
