package com.github.lonelylockley.archinsight.parse.ctx;

import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.parse.BuilderBase;

import java.util.HashMap;
import java.util.LinkedList;
import java.util.Map;

public abstract class ParseContext {

    protected final LinkedList<BuilderBase> context = new LinkedList<>();

    protected boolean external = false;
    protected String projectName = null;
    protected String identifier = null;
    protected String parameter = null;
    protected ElementType type = null;
    protected String annotationName = null;
    protected Map<String, String> annotations = new HashMap<>();

    public Element finishElement() {
        if (!context.isEmpty()) {
            BuilderBase bb = context.pop();
            bb.withAnnotations(annotations);
            setExternal(false);
            setIdentifier(null);
            setParameter(null);
            type = null;
            annotations = new HashMap<>();
            return bb.build();
        }
        else {
            return null;
        }
    }

    public LinkElement.Builder startNewLink() {
        LinkElement.Builder builder = new LinkElement.Builder();
        context.push(builder);
        type = ElementType.LINK;
        return builder;
    }

    public BuilderBase currentElement() {
        return context.peek();
    }

    public boolean isExternal() {
        return external;
    }

    public void setExternal(boolean external) {
        this.external = external;
    }

    public String currentIdentifier() {
        return identifier;
    }

    public void setIdentifier(String identifier) {
        this.identifier = identifier;
    }

    public String currentParameter() {
        return parameter;
    }

    public void setParameter(String parameter) {
        this.parameter = parameter;
    }

    public ElementType getType() {
        return type;
    }

    public String getProjectName() {
        return projectName;
    }

    public void setProjectName(String projectName) {
        this.projectName = projectName;
    }

    public String getAnnotationName() {
        return annotationName;
    }

    public void setAnnotationName(String annotationName) {
        this.annotationName = annotationName;
    }

    public void addAnnotation(String name, String value) {
        this.annotations.put(name, value);
    }

    public Map<String, String> getAnnotations() {
        return annotations;
    }
}
