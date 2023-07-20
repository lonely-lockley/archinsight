package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.parse.HasType;
import org.antlr.v4.runtime.CommonToken;

public abstract class AbstractElement implements HasType {

    protected int charPosition = 0;
    protected int startIndex = 0;
    protected int stopIndex = 0;
    protected int line = 0;

    public void setSource(CommonToken tkn) {
        charPosition = tkn.getCharPositionInLine();
        startIndex = tkn.getStartIndex();
        stopIndex = tkn.getStopIndex();
        line = tkn.getLine();
    }

    public int getCharPosition() {
        return charPosition;
    }

    public int getStartIndex() {
        return startIndex;
    }

    public int getStopIndex() {
        return stopIndex;
    }

    public int getLine() {
        return line;
    }
}
