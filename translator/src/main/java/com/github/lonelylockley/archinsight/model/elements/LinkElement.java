package com.github.lonelylockley.archinsight.model.elements;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

public class LinkElement extends AbstractElement implements WithAnnotations, WithParameters {

    private static final ElementType type = ElementType.LINK;

    private final Map<String, String> annotations = new HashMap<>();

    private String from;
    private String to;
    private String name;
    private String description;
    private String technology;
    private boolean sync;

    public void setFrom(String from) {
        this.from = from;
    }

    public void setTo(String to) {
        this.to = to;
    }

    public void setSync() {
        this.sync = true;
    }

    public String getFrom() {
        return from;
    }

    public String getTo() {
        return to;
    }

    public boolean isSync() {
        return sync;
    }

    public void setName(String name) {
        this.name = name;
    }

    @Override
    public String getName() {
        return name;
    }

    @Override
    public void setDescription(String description) {
        this.description = description;
    }

    @Override
    public String getDescription() {
        return description;
    }

    @Override
    public void setTechnology(String tech) {
        this.technology = tech;
    }

    @Override
    public String getTechnology() {
        return technology;
    }

    @Override
    public ElementType getType() {
        return type;
    }

    @Override
    public void addAllAnnotations(Map<String, String> annotations) {
        annotations.forEach(this::addAnnotation);
    }

    @Override
    public void addAnnotation(String name, String value) {
        annotations.put(name, value);
    }

    @Override
    public Map<String, String> getAnnotations() {
        return annotations;
    }

    @Override
    public String toString() {
        return "LinkElement{" +
                "from='" + from + '\'' +
                ", to='" + to + '\'' +
                ", name='" + name + '\'' +
                ", description='" + description + '\'' +
                ", technology='" + technology + '\'' +
                ", sync=" + sync +
                '}';
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        LinkElement that = (LinkElement) o;
        return sync == that.sync && from.equals(that.from) && to.equals(that.to) && Objects.equals(name, that.name) && Objects.equals(description, that.description) && Objects.equals(technology, that.technology);
    }

    @Override
    public int hashCode() {
        return Objects.hash(from, to, name, description, technology, sync);
    }
}
