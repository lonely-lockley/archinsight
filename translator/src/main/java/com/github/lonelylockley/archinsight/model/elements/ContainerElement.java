package com.github.lonelylockley.archinsight.model.elements;

import java.util.stream.Collectors;

public class ContainerElement extends ContextElement {

    private ContainerElement() {}

    public ContainerElement(SystemElement se, ContextElement ce) {
        this.setDeclaredId(se.getDeclaredId());
        this.getImports().addAll(ce.getImports());
        this.getChildren().addAll(se.getChildren());
        se.clonePositionTo(this);
    }


    @Override
    public ElementType getType() {
        return ElementType.CONTAINER;
    }

    @Override
    public AbstractElement clone() {
        var res = new ContainerElement();
        res.setDeclaredId(this.getDeclaredId());
        res.getImports().addAll(this.getImports());
        res.getChildren().addAll(this.getChildren());
        clonePositionTo(res);
        return res;
    }

    @Override
    public String toString() {
        return "ContainerElement{" +
                "id='" + getDeclaredId() + "', children=[\n" + getChildren().stream().map(ch -> ch.toString() + '\n').collect(Collectors.joining()) +
                "]}";
    }
}
