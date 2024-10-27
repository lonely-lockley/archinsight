package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.AbstractElement;
import com.github.lonelylockley.archinsight.model.elements.ContextElement;

import java.util.Collection;
import java.util.Collections;

public class ContextDescriptor extends ParseDescriptor {

    private final String id;
    private final ContextElement root;

    public static String createContextDescriptorId(ArchLevel level, String boundedContext) {
        return String.format("%s__%s", level, boundedContext);
    }

    public ContextDescriptor(String boundedContext, ContextElement root) {
        super(boundedContext, ArchLevel.CONTEXT);
        this.id = createContextDescriptorId(getLevel(), boundedContext);
        this.root = root;
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
    public ContextDescriptor getParentContext() {
        return null;
    }

    @Override
    public String toString() {
        return "ContextDescriptor{" +
                "id='" + id + '\'' +
                '}';
    }

}
