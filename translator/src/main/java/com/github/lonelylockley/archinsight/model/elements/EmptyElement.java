package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.model.DynamicId;
import com.github.lonelylockley.archinsight.model.Origin;

import java.util.UUID;

public class EmptyElement extends AbstractElement implements WithId {

    private DynamicId declaredId;

    public EmptyElement() {
        declaredId = DynamicId.empty();
        declaredId.setElementId("empty_" + UUID.randomUUID());
    }

    public EmptyElement(DynamicId declaredId) {
        this.declaredId = declaredId;
    }

    public void setOrigin(Origin origin) {
        super.origin = origin;
    }

    @Override
    public ElementType<EmptyElement> getType() {
        return ElementType.EMPTY;
    }

    @Override
    public AbstractElement clone() {
        return new EmptyElement(this.declaredId.clone());
    }

    @Override
    public void setDeclaredId(DynamicId id) {
        this.declaredId = id;
    }

    @Override
    public DynamicId getDeclaredId() {
        return declaredId;
    }

    @Override
    public String toString() {
        return "EmptyElement{" +
                "declaredId='" + declaredId + '\'' +
                '}';
    }
}
