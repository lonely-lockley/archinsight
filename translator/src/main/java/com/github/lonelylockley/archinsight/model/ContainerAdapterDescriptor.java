package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.ContainerElement;

public class ContainerAdapterDescriptor extends ContainerDescriptor {

    public ContainerAdapterDescriptor(ParseDescriptor left, ParseDescriptor right) {
        super(left.getParentContext(), new ContainerElement(), left.getRootWithId().getDeclaredId());
        getRootWithId().setDeclaredId(left.getBoundedContext());
        getOrigins().addAll(left.getOrigins());
        getOrigins().addAll(right.getOrigins());
        getRootWithChildren().getChildren().addAll(left.getRootWithChildren().getChildren());
        getRootWithChildren().getChildren().addAll(right.getRootWithChildren().getChildren());
    }

    @Override
    public String toString() {
        return "ContainerAdapterDescriptor{" +
                "id='" + getId() + '\'' +
                '}';
    }
}
