package com.github.lonelylockley.archinsight.model.elements;

import java.util.*;

public abstract class AnnotatedElement implements Element {

    private final Map<String, String> annotations = new HashMap<>();

    public AnnotatedElement(Map<String, String> annotations) {
        if (annotations != null) {
            addAllAnnotations(annotations);
        }
    }

    public void addAllAnnotations(Map<String, String> annotations) {
        annotations.forEach(this::addAnnotation);
    }

    public void addAnnotation(String name, String value) {
        annotations.put(name, value);
    }

    public Map<String, String> getAnnotations() {
        return annotations;
    }

}
