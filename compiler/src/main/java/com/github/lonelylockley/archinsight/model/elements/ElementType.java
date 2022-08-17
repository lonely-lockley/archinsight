package com.github.lonelylockley.archinsight.model.elements;

import java.util.HashMap;
import java.util.Map;

public enum ElementType {
    // any level
    LINK("LINKS"),

    // context level
    SYSTEM("SYSTEM"),
    PERSON("PERSON"),

    // container level
    SERVICE("SERVICE"),
    STORAGE("STORAGE"),
    MODULE("MODULE"),
    CONTAINS("CONTAINS"),

    // other
    CONTEXT("CONTEXT"),
    CONTAINER("CONTAINER"),

    PROJECTNAME("PROJECTNAME"),
    EXTERNAL("EXTERNAL"),
    NAME("NAME"),
    DESCRIPTION("DESCRIPTION"),
    TECHNOLOGY("TECHNOLOGY"),
    TEXT("TEXT"),
    IDENTIFIER("IDENTIFIER"),
    ANNOTATION("ANNOTATION"),
    ANNOTATION_VALUE("ANNOTATION_VALUE"),

    UNKNOWN("unk");

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
