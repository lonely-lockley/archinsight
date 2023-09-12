package com.github.lonelylockley.archinsight.model.remote.translator;

import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;

import java.io.Serializable;

public class LinkerMessage implements Serializable {

    private MessageLevel level;
    private String msg;

    private int charPosition = 0;
    private int startIndex = 0;
    private int stopIndex = 0;
    private int line = 0;

    public LinkerMessage() {}

    public LinkerMessage(MessageLevel level, String msg) {
        this.level = level;
        this.msg = msg;
    }

    public void setLevel(MessageLevel level) {
        this.level = level;
    }

    public void setMsg(String msg) {
        this.msg = msg;
    }

    public void setCharPosition(int charPosition) {
        this.charPosition = charPosition;
    }

    public void setStartIndex(int startIndex) {
        this.startIndex = startIndex;
    }

    public void setStopIndex(int stopIndex) {
        this.stopIndex = stopIndex;
    }

    public void setLine(int line) {
        this.line = line;
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
