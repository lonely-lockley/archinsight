package com.github.lonelylockley.archinsight.model.annotations;

import org.antlr.v4.runtime.atn.ATN;

public enum AnnotationType {
    ATTRIBUTE("@attribute"),
    PLANNED("@planned"),
    DEPRECATED("@deprecated");

    private final String annotationName;

    private AnnotationType(String annotationName) {
        this.annotationName = annotationName;
    }

    public String getAnnotationName() {
        return annotationName;
    }
}
