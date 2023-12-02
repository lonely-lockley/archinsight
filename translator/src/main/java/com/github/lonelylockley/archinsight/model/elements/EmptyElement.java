package com.github.lonelylockley.archinsight.model.elements;

public class EmptyElement extends AbstractElement implements WithId {

    private String id = "<empty>";

    public EmptyElement() {
    }

    public EmptyElement(String id) {
        this.id = id;
    }

    @Override
    public ElementType<EmptyElement> getType() {
        return ElementType.EMPTY;
    }

    @Override
    public AbstractElement clone() {
        return new EmptyElement();
    }

    @Override
    public void setId(String id) {
        this.id = id;
    }

    @Override
    public String getId() {
        return id;
    }
}
