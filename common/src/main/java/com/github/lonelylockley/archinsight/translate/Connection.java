package com.github.lonelylockley.archinsight.translate;

import java.util.Map;

public class Connection {

    private final String identifier;
    private final Block from;
    private final Block to;
    private final String textUpper;
    private final String textMid;
    private final String textLower;
    private final Map<String, String> properties;

    public Connection(String identifier, Block from, Block to, String textUpper, String textMid, String textLower, Map<String, String>properties) {
        this.identifier = identifier;
        this.from = from;
        this.to = to;
        this.textUpper = textUpper;
        this.textMid = textMid;
        this.textLower = textLower;
        this.properties = properties;
    }

    public String getIdentifier() {
        return identifier;
    }

    public Block getFrom() {
        return from;
    }

    public Block getTo() {
        return to;
    }

    public String getTextUpper() {
        return textUpper;
    }

    public String getTextLower() {
        return textLower;
    }

    public String getTextMid() {
        return textMid;
    }

    public Map<String, String> getProperties() {
        return properties;
    }
}
