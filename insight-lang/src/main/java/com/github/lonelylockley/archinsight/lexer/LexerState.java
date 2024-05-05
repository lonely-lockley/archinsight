package com.github.lonelylockley.archinsight.lexer;

import org.antlr.v4.runtime.Token;

import java.util.Objects;

public class LexerState {
    private final int TEXT;

    private boolean wasText = false;
    private int indentation = 0;

    public LexerState(int TEXT) {
        this.TEXT = TEXT;
    }

    protected LexerState(boolean wasText, int indentation, int TEXT) {
        this.wasText = wasText;
        this.indentation = indentation;
        this.TEXT = TEXT;
    }

    public boolean wasText() {
        return wasText;
    }

    public void setWasText() {
        this.wasText = true;
    }

    public void resetWasText() {
        this.wasText = false;
    }

    public int getIndentation() {
        return indentation;
    }

    public void incIndentation() {
        this.indentation++;
    }

    public void decIndentation() {
        this.indentation--;
    }

    public void updateToken(Token tkn) {
        if (tkn.getType() == TEXT) {
            setWasText();
        }
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        LexerState that = (LexerState) o;
        return wasText == that.wasText && indentation == that.indentation;
    }

    @Override
    public int hashCode() {
        return Objects.hash(wasText, indentation);
    }

    @Override
    public Object clone() {
        return new LexerState(this.wasText, this.indentation, this.TEXT);
    }

}
