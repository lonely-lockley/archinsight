package com.github.lonelylockley.archinsight.model.elements;

import java.util.Map;

public class StorageElement extends SystemElement {

    private static final ElementType type = ElementType.STORAGE;

    public StorageElement(String name, String description, String technology, Map<String, String> annotations, boolean external) {
        super(name, description, technology, annotations, external);
    }

    @Override
    public ElementType getType() {
        return type;
    }

    @Override
    public String toString() {
        return "Storage{" +
                "name='" + getName() + '\'' +
                ", description='" + getDescription() + '\'' +
                ", technology='" + getTechnology() + '\'' +
                ", external=" + isExternal() +
                '}';
    }

    public static class Builder extends SystemElement.Builder {
        @Override
        public StorageElement build() {
            assert name != null && !name.isBlank();
            return new StorageElement(name, description, technology, annotations, external != null && external);
        }

        @Override
        public ElementType getType() {
            return StorageElement.type;
        }
    }

}
