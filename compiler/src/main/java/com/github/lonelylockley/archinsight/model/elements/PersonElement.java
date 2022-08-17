package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.parse.BuilderBase;

import java.util.HashMap;
import java.util.Map;

public class PersonElement extends AnnotatedElement {

    private final String name;
    private final String description;
    private final String technology;

    private static final ElementType type = ElementType.PERSON;

    public PersonElement(String name, String description, String technology, Map<String, String> annotations) {
        super(annotations);
        this.name = name;
        this.description = description;
        this.technology = technology;
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

    @Override
    public String toString() {
        return "Person{" +
                "name='" + name + '\'' +
                ", description='" + description + '\'' +
                ", technology='" + technology + '\'' +
                '}';
    }

    @Override
    public ElementType getType() {
        return type;
    }

    public static class Builder implements BuilderBase<PersonElement, Builder> {

        protected String name = null;
        protected String description = null;
        protected String technology = null;
        protected Map<String, String> annotations = new HashMap<>();

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

        @Override
        public Builder withAnnotations(Map<String, String> annotations) {
            this.annotations = annotations;
            return this;
        }

        @Override
        public PersonElement build() {
            assert name != null && !name.isBlank();
            return new PersonElement(name, description, technology, annotations);
        }

        @Override
        public ElementType getType() {
            return PersonElement.type;
        }
    }

}
