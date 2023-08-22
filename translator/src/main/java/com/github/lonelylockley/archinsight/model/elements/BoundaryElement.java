package com.github.lonelylockley.archinsight.model.elements;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

public class BoundaryElement extends AbstractElement implements WithId, WithChildElements, WithParameters {

    private static final ElementType type = ElementType.BOUNDARY;

    private final List<AbstractElement> children = new ArrayList<>();
    private String id = null;
    private String name = null;
    private String desc = null;
    private String tech = null;

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
        this.desc = description;
    }

    @Override
    public String getDescription() {
        return desc;
    }

    @Override
    public void setTechnology(String tech) {
        this.tech = tech;
    }

    @Override
    public String getTechnology() {
        return tech;
    }

    @Override
    public ElementType getType() {
        return type;
    }

    @Override
    public String toString() {
        return "BoundaryElement{" +
                "id='" + id + '\'' +
                ", name='" + name + '\'' +
                ", desc='" + desc + '\'' +
                ", tech='" + tech + '\'' +
                ", children=[\n" + children.stream().map(ch -> ch.toString() + '\n').collect(Collectors.joining()) +
                "]}";
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof WithId that)) return false;
        return id.equals(that.getId());
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

}
