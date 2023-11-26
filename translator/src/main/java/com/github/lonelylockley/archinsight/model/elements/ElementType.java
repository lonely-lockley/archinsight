package com.github.lonelylockley.archinsight.model.elements;

import java.util.HashMap;
import java.util.Map;

public enum ElementType {
    // any level
    LINK("LINKS"),

    // context level
    SYSTEM("SYSTEM"),
    ACTOR("ACTOR"),

    // container level
    SERVICE("SERVICE"),
    STORAGE("STORAGE"),

    // other
    CONTEXT("CONTEXT"),
    CONTAINER("CONTAINER"),
    BOUNDARY("BOUNDARY"),

    // special case
    UNKNOWN("unk"),
    EMPTY("empty");

    private final String identifier;

    ElementType(String identifier) {
        this.identifier = identifier;
    }

    private static final Map<String, ElementType> byId = new HashMap<>();
    static {
        for (ElementType e : ElementType.values()) {
            if (byId.put(e.identifier, e) != null) {
                throw new IllegalArgumentException("duplicate id: " + e.identifier);
            }
        }
    }

    public static ElementType elementByIdentifier(String identifier) {
        ElementType et = byId.get(identifier);
        if (et == null) {
            et = UNKNOWN;
        }
        return et;
    }
}
