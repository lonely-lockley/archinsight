package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.*;


public class ContainerDescriptor extends ParseDescriptor {

    private final String id;
    private final ContainerElement root;
    private final ContextDescriptor parent;

    public static String createContainerDescriptorId(ArchLevel level, String boundedContext, String id) {
        return String.format("%s__%s__%s", level, boundedContext, id);
    }

    public ContainerDescriptor(ContextDescriptor parent, ContainerElement root, SystemElement container) {
        super(parent.getBoundedContext(), ArchLevel.CONTAINER);
        this.id = createContainerDescriptorId(getLevel(), parent.getBoundedContext(), container.getDeclaredId());
        this.root = root;
        this.parent = parent;
        getOrigins().add(root.getOrigin());
    }

    public ContainerDescriptor(ContextDescriptor parent, ContainerElement root, ActorElement container) {
        super(parent.getBoundedContext(), ArchLevel.CONTAINER);
        this.id = createContainerDescriptorId(getLevel(), parent.getBoundedContext(), container.getDeclaredId());
        this.root = root;
        this.parent = parent;
        getOrigins().add(root.getOrigin());
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
