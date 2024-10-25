package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.AbstractElement;
import com.github.lonelylockley.archinsight.model.elements.ContextElement;

import java.util.Collection;
import java.util.Collections;

public class ContextDescriptor extends ParseDescriptor {

    private final String id;
    private final ContextElement root;

    public ContextDescriptor(String boundedContext, ContextElement root) {
        super(boundedContext, ArchLevel.CONTEXT);
        this.id = String.format("%s__%s", getLevel().toString(), boundedContext);
        this.root = root;
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
        return null;
    }

    @Override
    public Collection<Origin> getOrigins() {
        return Collections.singleton(root.getOrigin());
    }

    @Override
    public String toString() {
        return "ContextDescriptor{" +
                "id='" + id + '\'' +
                '}';
    }

}
