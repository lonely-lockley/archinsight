package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.parse.BuilderBase;

public class LinkElement implements Element {

    private final String from;
    private final String to;
    private final String name;
    private final String description;
    private final String technology;
    private final boolean sync;

    private static final ElementType type = ElementType.LINK;

    public LinkElement(String from, String to, String name, String description, String technology, boolean sync) {
        this.from = from;
        this.to = to;
        this.name = name;
        this.description = description;
        this.technology = technology;
        this.sync = sync;
    }

    public String getFrom() {
        return from;
    }

    public String getTo() {
        return to;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    @Override
    public String getTechnology() {
        return technology;
    }

    public boolean isSync() {
        return sync;
    }

    @Override
    public ElementType getType() {
        return type;
    }

    @Override
    public String toString() {
        return "Link{" +
                "from='" + from + '\'' +
                ", to='" + to + '\'' +
                ", name='" + name + '\'' +
                ", description='" + description + '\'' +
                ", technology='" + technology + '\'' +
                ", sync=" + sync +
                '}';
    }

    public static class Builder implements BuilderBase<LinkElement, Builder> {

        private String from = null;
        private String to = null;
        private String name = null;
        private String description = null;
        private String technology = null;
        private Boolean sync = null;

        public Builder withFrom(String from) {
            this.from = from;
            return this;
        }

        public Builder withTo(String to) {
            this.to = to;
            return this;
        }

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

        public Builder withSyncFlag(boolean sync) {
            this.sync = sync;
            return this;
        }

        @Override
        public LinkElement build() {
            assert from != null && !from.isBlank();
            assert to != null && !to.isBlank();
            assert name != null && !name.isBlank();
            return new LinkElement(from, to, name, description, technology, sync == null || sync);
        }

        @Override
        public ElementType getType() {
            return LinkElement.type;
        }
    }
}
