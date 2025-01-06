package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.model.Origin;
import org.antlr.v4.runtime.CommonToken;

public abstract class WithSource {

    protected Origin origin;
    protected int charPosition = 0;
    protected int startIndex = 0;
    protected int stopIndex = 0;
    protected int line = 0;

    public void setSource(Origin origin, CommonToken tkn) {
        this.origin = origin;
        charPosition = tkn.getCharPositionInLine();
        startIndex = tkn.getStartIndex();
        stopIndex = tkn.getStopIndex();
        line = tkn.getLine();
    }

    public void setSource(Origin origin, int charPositionInLine, int startIndex, int stopIndex, int line) {
        this.origin = origin;
        this.charPosition = charPositionInLine;
        this.startIndex = startIndex;
        this.stopIndex = stopIndex;
        this.line = line;
    }

    public Origin getOrigin() {
        return origin;
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

    public void clonePositionTo(WithSource res) {
        res.origin = origin;
        res.charPosition = charPosition;
        res.line = line;
        res.startIndex = startIndex;
        res.stopIndex = stopIndex;
    }

}
