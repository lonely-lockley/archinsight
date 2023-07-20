package com.github.lonelylockley.archinsight.model.elements;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

public class ContextElement extends AbstractElement implements WithId, WithChildElements {

    private static final ElementType type = ElementType.CONTEXT;

    private String id = null;

    private final List<AbstractElement> children = new ArrayList<>();

    @Override
    public void setId(String id) {
        this.id = id;
    }

    @Override
    public String getId() {
        return id;
    }

    @Override
    public ElementType getType() {
        return type;
    }

    public void addChild(AbstractElement child) {
        children.add(child);
    }

    @Override
    public List<AbstractElement> getChildren() {
        return children;
    }

    @Override
    public String toString() {
        return "ContextElement{" +
                "id='" + id + "', children=[\n" + children.stream().map(ch -> ch.toString() + '\n').collect(Collectors.joining()) +
                "]}";
    }
}
