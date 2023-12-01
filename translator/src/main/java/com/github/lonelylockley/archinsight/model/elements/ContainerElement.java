package com.github.lonelylockley.archinsight.model.elements;

import java.util.stream.Collectors;

public class ContainerElement extends ContextElement {

    private static final ElementType type = ElementType.CONTAINER;

    @Override
    public ElementType getType() {
        return type;
    }

    @Override
    public Object clone() {
        var res = new ContainerElement();
        res.setId(this.getId());
        res.getImports().addAll(this.getImports());
        res.getChildren().addAll(this.getChildren());
        clonePositionTo(res);
        return res;
    }

    @Override
    public String toString() {
        return "ContainerElement{" +
                "id='" + getId() + "', children=[\n" + getChildren().stream().map(ch -> ch.toString() + '\n').collect(Collectors.joining()) +
                "]}";
    }
}
