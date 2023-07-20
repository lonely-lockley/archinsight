package com.github.lonelylockley.archinsight.export.model;

import com.github.lonelylockley.archinsight.export.model.HasId;

import java.util.Map;

public class Block implements HasId {

    private final String identifier;
    private final String upperLine;
    private final String midLine;
    private final String lowerLine;
    private final Map<String, String> properties;

    public Block(String identifier, String upperLine, String midLine, String lowerLine, Map<String, String> properties) {
        this.identifier = identifier;
        this.upperLine = upperLine;
        this.midLine = midLine;
        this.lowerLine = lowerLine;
        this.properties = properties;
    }

    @Override
    public String getIdentifier() {
        return identifier;
    }

    public String getUpperLine() {
        return upperLine;
    }

    public String getLowerLine() {
        return lowerLine;
    }

    public String getMidLine() {
        return midLine;
    }

    public Map<String, String> getProperties() {
        return properties;
    }
}
