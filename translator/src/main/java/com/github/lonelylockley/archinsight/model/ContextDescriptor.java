package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.*;

public class ContextDescriptor extends ParseDescriptor {

    private final DynamicId id;
    private final ContextElement root;

    public ContextDescriptor(DynamicId id, ContextElement root) {
        super(null, id.getBoundedContext(), id.getLevel(), root.clone());
        this.id = id;
        this.root = root;
        getOrigins().add(root.getOrigin());
    }

    @Override
    public DynamicId getId() {
        return id;
    }

    @Override
    public AbstractElement getRoot() {
        return root;
    }

    @Override
    public WithId getRootWithId() {
        return root;
    }

    @Override
    public WithChildElements getRootWithChildren() {
        return root;
    }

    @Override
    public WithImports getRootWithImports() {
        return root;
    }

    @Override
    public String toString() {
        return "ContextDescriptor{" +
                "id='" + id + '\'' +
                '}';
    }

}
