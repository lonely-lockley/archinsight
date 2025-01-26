package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.*;


public class ContainerDescriptor extends ParseDescriptor {

    private final ContainerElement root;

    private DynamicId id;

    public ContainerDescriptor(ContextDescriptor parent, ContainerElement root, DynamicId id) {
        super(parent.getId(), parent.getBoundedContext(), ArchLevel.CONTAINER, root);
        this.id = id;
        this.root = root;
        getOrigins().clear();
        getOrigins().add(root.getOrigin());
    }

    protected void overrideId(DynamicId id) {
        this.id = id;
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
        return "ContainerDescriptor{" +
                "id='" + id + '\'' +
                '}';
    }
}
