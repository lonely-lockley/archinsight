package com.github.lonelylockley.archinsight.model.elements;

import java.util.stream.Collectors;

public class ContainerElement extends ContextElement {

    public ContainerElement() {}

    @Override
    public ElementType getType() {
        return ElementType.CONTAINER;
    }

    @Override
    public AbstractElement clone() {
        var res = new ContainerElement();
        res.setDeclaredId(this.getDeclaredId().clone());
        this.getImports().forEach(imp -> res.getImports().add(imp.clone()));
        this.getChildren().forEach(child -> res.getChildren().add(child.clone()));
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
