package com.github.lonelylockley.archinsight.model.elements;

import java.util.Set;

public class ModuleElement extends PersonElement {

    private static final ElementType type = ElementType.MODULE;

    private final Set<String> content;

    public ModuleElement(String name, String description, String technology, Set<String> content) {
        super(name, description, technology);
        this.content = content;
    }

    public Set<String> getContent() {
        return content;
    }

    @Override
    public ElementType getType() {
        return type;
    }

    @Override
    public String toString() {
        return "Module{" +
                "content=" + content +
                ", name='" + getName() + '\'' +
                ", description='" + getDescription() + '\'' +
                ", technology='" + getTechnology() + '\'' +
                '}';
    }

    public static class Builder extends PersonElement.Builder {

        private Set<String> content = null;

        public PersonElement.Builder withContent(Set<String> content) {
            this.content = content;
            return this;
        }

        @Override
        public ModuleElement build() {
            assert name != null && !name.isBlank();
            return new ModuleElement(name, description, technology, content);
        }

        @Override
        public ElementType getType() {
            return ModuleElement.type;
        }


    }

}
