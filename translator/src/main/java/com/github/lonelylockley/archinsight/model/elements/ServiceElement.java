package com.github.lonelylockley.archinsight.model.elements;

import java.util.stream.Collectors;

public class ServiceElement extends SystemElement {

    private static final ElementType type = ElementType.SERVICE;

    @Override
    public ElementType getType() {
        return type;
    }

    @Override
    public String toString() {
        return "ServiceElement{" +
                "id='" + getId() + '\'' +
                ", name='" + getName() + '\'' +
                ", description='" + getDescription() + '\'' +
                ", technology='" + getTechnology() + '\'' +
                ", external=" + isExternal() +
                ", children=[\n" + getChildren().stream().map(ch -> ch.toString() + '\n').collect(Collectors.joining()) +
                "]}";
    }

}
