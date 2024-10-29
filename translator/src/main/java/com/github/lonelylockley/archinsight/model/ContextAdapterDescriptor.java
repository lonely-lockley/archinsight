package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.*;

public class ContextAdapterDescriptor extends ContextDescriptor {

    public ContextAdapterDescriptor(ParseDescriptor left, ParseDescriptor right) {
        super(left.getBoundedContext(), (ContextElement) left.getRoot().clone());
        getOrigins().addAll(left.getOrigins());
        getOrigins().addAll(right.getOrigins());
        getRootWithImports().getImports().addAll(right.getRootWithImports().getImports());
        getRootWithChildren().getChildren().addAll(right.getRootWithChildren().getChildren());
    }

    @Override
    public String toString() {
        return "ContextAdapterDescriptor{" +
                "id='" + getId() + '\'' +
                '}';
    }

}
