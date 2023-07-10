package com.github.lonelylockley.archinsight.lexer;

import org.antlr.v4.runtime.CommonToken;

public class IndentationException extends RuntimeException {

    public IndentationException(CommonToken tkn, int actual, int expected) {
        super("line " + tkn.getLine() + ":" + tkn.getCharPositionInLine() + " incorrect indentation. current position: " + actual + ", expected: " + expected);
    }
}
