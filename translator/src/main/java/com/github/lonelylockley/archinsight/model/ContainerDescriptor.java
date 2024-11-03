package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.*;


public class ContainerDescriptor extends ParseDescriptor {

    private final ContainerElement root;
    private final ContextDescriptor parent;

    private DynamicId id;

    public ContainerDescriptor(ContextDescriptor parent, ContainerElement root, DynamicId id) {
        super(parent.getBoundedContext(), ArchLevel.CONTAINER, root);
        parent.mergeTo(this);
        this.id = id;
        this.root = root;
        this.parent = parent;
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
    public ContextDescriptor getParentContext() {
        return parent;
    }

    @Override
    public String toString() {
        return "ContainerDescriptor{" +
                "id='" + id + '\'' +
                '}';
    }
}
