package com.github.lonelylockley.archinsight.model.remote.translator;

import java.io.Serializable;
import java.util.UUID;

public class TranslatorMessage implements Serializable {

    private MessageLevel level;
    private String msg;
    private String tabId;
    private UUID fileId;
    private String location;
    private int charPosition = 0;
    private int startIndex = 0;
    private int stopIndex = 0;
    private int line = 0;

    public TranslatorMessage() {}

    public TranslatorMessage(MessageLevel level, String tabId, UUID fileId, String location, String msg) {
        this.level = level;
        this.msg = msg;
        this.tabId = tabId;
        this.fileId = fileId;
        this.location = location;
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

    public String getTabId() {
        return tabId;
    }

    public void setTabId(String tabId) {
        this.tabId = tabId;
    }

    public UUID getFileId() {
        return fileId;
    }

    public void setFileId(UUID fileId) {
        this.fileId = fileId;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    @Override
    public String toString() {
        return String.format("[%s] %d:%d %s", level.toString(), line, charPosition, msg);
    }
}
