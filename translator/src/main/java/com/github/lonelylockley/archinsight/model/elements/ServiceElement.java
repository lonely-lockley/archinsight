package com.github.lonelylockley.archinsight.model.elements;

import java.util.stream.Collectors;

public class ServiceElement extends SystemElement {

    @Override
    public ElementType getType() {
        return ElementType.SERVICE;
    }

    @Override
    public AbstractElement clone() {
        var res = new ServiceElement();
        res.setNote(this.getNote());
        res.setDeclaredId(this.getDeclaredId().clone());
        res.setName(this.getName());
        res.setDescription(this.getDescription());
        res.setTechnology(this.getTechnology());
        if (this.isExternal()) res.setExternal();
        this.getAnnotations().forEach((key, value) -> res.getAnnotations().put(key, value.clone()));
        this.getChildren().forEach(child -> res.getChildren().add(child.clone()));
        clonePositionTo(res);
        return res;
    }

    @Override
    public String toString() {
        return "ServiceElement{" +
                "declaredId='" + getDeclaredId() + '\'' +
                ", name='" + getName() + '\'' +
                ", description='" + getDescription() + '\'' +
                ", technology='" + getTechnology() + '\'' +
                ", external=" + isExternal() +
                ", children=[\n" + getChildren().stream().map(ch -> ch.toString() + '\n').collect(Collectors.joining()) +
                "]}";
    }

}
