package com.github.lonelylockley.archinsight.model.elements;

import java.util.*;
import java.util.stream.Collectors;

public class ActorElement extends AbstractElement implements WithId, WithParameters, WithAnnotations, WithChildElements {

    private static final ElementType type = ElementType.SYSTEM;

    private final Map<String, String> annotations = new HashMap<>();
    private final List<AbstractElement> children = new ArrayList<>();

    private String id;
    private String name;
    private String description;
    private String technology;

    @Override
    public void addChild(AbstractElement child) {
        children.add(child);
    }

    @Override
    public List<AbstractElement> getChildren() {
        return children;
    }

    @Override
    public void setId(String id) {
        this.id = id;
    }

    @Override
    public String getId() {
        return id;
    }

    @Override
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
        return "SystemElement{" +
                "id='" + id + '\'' +
                ", name='" + name + '\'' +
                ", description='" + description + '\'' +
                ", technology='" + technology + '\'' +
                ", children=[\n" + children.stream().map(ch -> ch.toString() + '\n').collect(Collectors.joining()) +
                "]}";
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        ActorElement that = (ActorElement) o;
        return id.equals(that.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
