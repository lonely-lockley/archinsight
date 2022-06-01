package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.parse.BuilderBase;

public class SystemElement implements Element {

    private final String name;
    private final String description;
    private final String technology;
    private final boolean external;

    private static final ElementType type = ElementType.SYSTEM;

    public SystemElement(String name, String description, String technology, boolean external) {
        this.name = name;
        this.description = description;
        this.technology = technology;
        this.external = external;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public String getTechnology() {
        return technology;
    }

    public boolean isExternal() {
        return external;
    }

    @Override
    public String toString() {
        return "System{" +
                "name='" + name + '\'' +
                ", description='" + description + '\'' +
                ", technology='" + technology + '\'' +
                ", external=" + external +
                '}';
    }

    @Override
    public ElementType getType() {
        return type;
    }

    public static class Builder implements BuilderBase<SystemElement, Builder> {

        protected String name = null;
        protected String description = null;
        protected String technology = null;
        protected Boolean external = null;

        @Override
        public Builder withName(String name) {
            this.name = name;
            return this;
        }

        @Override
        public Builder withDescription(String description) {
            this.description = description;
            return this;
        }

        @Override
        public Builder withTechnology(String technology) {
            this.technology = technology;
            return this;
        }

        public Builder withExternalFlag(boolean external) {
            this.external = external;
            return this;
        }

        @Override
        public SystemElement build() {
            assert name != null && !name.isBlank();
            return new SystemElement(name, description, technology, external != null && external);
        }

        @Override
        public ElementType getType() {
            return SystemElement.type;
        }
    }

}
