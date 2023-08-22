package com.github.lonelylockley.archinsight.model.elements;

import java.util.stream.Collectors;

public class ContainerElement extends ContextElement {

    private static final ElementType type = ElementType.CONTAINER;

    @Override
    public ElementType getType() {
        return type;
    }
    @Override
    public String toString() {
        return "ContainerElement{" +
                "id='" + getId() + "', children=[\n" + getChildren().stream().map(ch -> ch.toString() + '\n').collect(Collectors.joining()) +
                "]}";
    }
}
