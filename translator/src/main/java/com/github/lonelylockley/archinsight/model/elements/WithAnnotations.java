package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.model.annotations.AbstractAnnotation;
import com.github.lonelylockley.archinsight.model.annotations.AnnotationType;
import com.github.lonelylockley.archinsight.parse.HasType;

import java.util.List;
import java.util.Map;
import java.util.Set;

public interface WithAnnotations extends HasType {
    public void addAllAnnotations(List<AbstractAnnotation> annotations);
    public void addAnnotation(AbstractAnnotation annotation);
    public Map<AnnotationType, AbstractAnnotation> getAnnotations();
}
