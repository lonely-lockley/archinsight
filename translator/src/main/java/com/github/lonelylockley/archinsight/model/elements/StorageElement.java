package com.github.lonelylockley.archinsight.model.elements;

import java.util.stream.Collectors;

public class StorageElement extends SystemElement {

    private static final ElementType type = ElementType.STORAGE;

    @Override
    public ElementType getType() {
        return type;
    }

    @Override
    public String toString() {
        return "StorageElement{" +
                "id='" + getId() + '\'' +
                ", name='" + getName() + '\'' +
                ", description='" + getDescription() + '\'' +
                ", technology='" + getTechnology() + '\'' +
                ", external=" + isExternal() +
                ", children=[\n" + getChildren().stream().map(ch -> ch.toString() + '\n').collect(Collectors.joining()) +
                "]}";
    }

}
