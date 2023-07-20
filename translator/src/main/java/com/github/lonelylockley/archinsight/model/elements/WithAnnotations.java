package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.parse.HasType;

import java.util.Map;

public interface WithAnnotations extends HasType {
    public void addAllAnnotations(Map<String, String> annotations);
    public void addAnnotation(String name, String value);
    public Map<String, String> getAnnotations();
}
