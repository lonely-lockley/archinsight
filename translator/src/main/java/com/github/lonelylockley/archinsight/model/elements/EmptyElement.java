package com.github.lonelylockley.archinsight.model.elements;

public class EmptyElement extends AbstractElement {
    @Override
    public ElementType getType() {
        return ElementType.EMPTY;
    }
}
