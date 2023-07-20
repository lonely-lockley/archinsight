package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.elements.AbstractElement;

import java.io.Serializable;

public class LinkerMessage implements Serializable {

    private final MessageLevel level;
    private final String msg;

    private int charPosition = 0;
    private int startIndex = 0;
    private int stopIndex = 0;
    private int line = 0;

    public LinkerMessage(MessageLevel level, String msg) {
        this.level = level;
        this.msg = msg;
    }

    public void copyPosition(AbstractElement el) {
        this.charPosition = el.getCharPosition();
        this.line = el.getLine();
        this.startIndex = el.getStartIndex();
        this.stopIndex = el.getStopIndex();
    }

    public MessageLevel getLevel() {
        return level;
    }

    public String getMsg() {
        return msg;
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

    @Override
    public String toString() {
        return String.format("[%s] %d:%d %s", level.toString(), line, charPosition, msg);
    }
}
