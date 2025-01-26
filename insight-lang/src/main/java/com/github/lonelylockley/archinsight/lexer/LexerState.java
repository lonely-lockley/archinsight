package com.github.lonelylockley.archinsight.lexer;

import java.util.Objects;

public class LexerState {

    private boolean wasText = false;
    private int indentation = 0;

    public LexerState() {
    }

    protected LexerState(boolean wasText, int indentation) {
        this.wasText = wasText;
        this.indentation = indentation;
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
        return new LexerState(this.wasText, this.indentation);
    }

}
