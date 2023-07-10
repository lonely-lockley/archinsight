package com.github.lonelylockley.archinsight.model.elements;

import java.util.Map;

public class ServiceElement extends SystemElement {

    private static final ElementType type = ElementType.SERVICE;

    public ServiceElement(String name, String description, String technology, Map<String, String> annotations, boolean external) {
        super(name, description, technology, annotations, external);
    }

    @Override
    public ElementType getType() {
        return type;
    }

    @Override
    public String toString() {
        return "Service{" +
                "name='" + getName() + '\'' +
                ", description='" + getDescription() + '\'' +
                ", technology='" + getTechnology() + '\'' +
                ", external=" + isExternal() +
                '}';
    }

    public static class Builder extends SystemElement.Builder {

        @Override
        public ServiceElement build() {
            assert name != null && !name.isBlank();
            return new ServiceElement(name, description, technology, annotations, external != null && external);
        }

        @Override
        public ElementType getType() {
            return ServiceElement.type;
        }

    }

}
