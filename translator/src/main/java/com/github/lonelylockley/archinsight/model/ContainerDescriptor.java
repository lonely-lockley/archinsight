package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.*;


public class ContainerDescriptor extends ParseDescriptor {

    private final ContainerElement root;
    private final ContextDescriptor parent;

    private String id;

    public static String createContainerDescriptorId(ArchLevel level, String boundedContext, String id) {
        return String.format("%s__%s__%s", level, boundedContext, id);
    }

    public ContainerDescriptor(ContextDescriptor parent, ContainerElement root, String id) {
        super(parent.getBoundedContext(), ArchLevel.CONTAINER);
        this.id = createContainerDescriptorId(getLevel(), parent.getBoundedContext(), id);
        this.root = root;
        this.parent = parent;
        getOrigins().add(root.getOrigin());
    }

    protected void overrideId(String id) {
        this.id = id;
    }

    @Override
    public String getId() {
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
