package com.github.lonelylockley.archinsight.model.elements;

import java.util.stream.Collectors;

public class StorageElement extends SystemElement {

    @Override
    public ElementType getType() {
        return ElementType.STORAGE;
    }

    @Override
    public AbstractElement clone() {
        var res = new StorageElement();
        if (isImported()) {
            res.setImported();
        }
        res.setNote(this.getNote());
        res.setDeclaredId(this.getDeclaredId());
        res.setName(this.getName());
        res.setDescription(this.getDescription());
        res.setTechnology(this.getTechnology());
        if (this.isExternal()) res.setExternal();
        res.getAnnotations().putAll(this.getAnnotations());
        res.getChildren().addAll(this.getChildren());
        clonePositionTo(res);
        return res;
    }

    @Override
    public String toString() {
        return "StorageElement{" +
                "declaredId='" + getDeclaredId() + '\'' +
                ", name='" + getName() + '\'' +
                ", description='" + getDescription() + '\'' +
                ", technology='" + getTechnology() + '\'' +
                ", external=" + isExternal() +
                ", children=[\n" + getChildren().stream().map(ch -> ch.toString() + '\n').collect(Collectors.joining()) +
                "]}";
    }

}
