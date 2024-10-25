package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.AbstractElement;
import com.github.lonelylockley.archinsight.model.elements.ContainerElement;
import com.github.lonelylockley.archinsight.model.elements.SystemElement;

import java.util.Collection;
import java.util.Collections;
import java.util.List;

public class ContainerDescriptor extends ParseDescriptor {

    private final String id;
    private final ContainerElement root;
    private final ContextDescriptor parent;

    public ContainerDescriptor(ContextDescriptor parent, ContainerElement root, SystemElement container) {
        super(parent.getBoundedContext(), ArchLevel.CONTAINER);
        this.id = String.format("%s__%s__%s", getLevel().toString(), parent.getBoundedContext(), container.getDeclaredId());
        this.root = root;
        this.parent = parent;
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
    public ContextDescriptor getParentContext() {
        return parent;
    }

    @Override
    public Collection<Origin> getOrigins() {
        return Collections.singleton(root.getOrigin());
    }

    @Override
    public String toString() {
        return "ContainerDescriptor{" +
                "id='" + id + '\'' +
                '}';
    }
}
