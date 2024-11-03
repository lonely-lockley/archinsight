package com.github.lonelylockley.archinsight.model.annotations;

import com.github.lonelylockley.archinsight.parse.WithSource;

public abstract class AbstractAnnotation extends WithSource implements Cloneable {

    private final AnnotationType type;

    private String value = null;

    public AbstractAnnotation(AnnotationType type) {
        this.type = type;
    }

    public AnnotationType getAnnotationType() {
        return type;
    }

    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value;
    }

    @Override
    public AbstractAnnotation clone() {
        return this;
    }
}
