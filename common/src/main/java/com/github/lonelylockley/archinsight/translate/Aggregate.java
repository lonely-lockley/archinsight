package com.github.lonelylockley.archinsight.translate;

import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public class Aggregate implements HasId {

    private final String identifier;
    private final String textUpper;
    private final String textMid;
    private final String textLower;
    private final Map<String, String> properties;
    private final Set<HasId> members = new HashSet<>();

    public Aggregate(String identifier, String textUpper, String textMid, String textLower, Map<String, String> properties, HasId... blocks) {
        this.identifier = identifier;
        this.textUpper = textUpper;
        this.textMid = textMid;
        this.textLower = textLower;
        this.properties = properties;
        Collections.addAll(members, blocks);
    }

    @Override
    public String getIdentifier() {
        return identifier;
    }

    public String getTextUpper() {
        return textUpper;
    }

    public String getTextMid() {
        return textMid;
    }

    public String getTextLower() {
        return textLower;
    }

    public Map<String, String> getProperties() {
        return properties;
    }

    public Set<HasId> getMembers() {
        return members;
    }
}
