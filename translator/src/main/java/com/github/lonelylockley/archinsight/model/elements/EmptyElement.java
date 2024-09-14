package com.github.lonelylockley.archinsight.model.elements;

import java.util.UUID;

public class EmptyElement extends AbstractElement implements WithId {

    private String declaredId = "empty_" + UUID.randomUUID();

    public EmptyElement() {
    }

    public EmptyElement(String declaredId) {
        this.declaredId = declaredId;
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
    public void setDeclaredId(String id) {
        this.declaredId = id;
    }

    @Override
    public String getDeclaredId() {
        return declaredId;
    }
}
