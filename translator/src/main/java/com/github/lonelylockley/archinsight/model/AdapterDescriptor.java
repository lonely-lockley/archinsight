package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.*;

import java.util.function.Function;

public class AdapterDescriptor extends ContextDescriptor {

    public AdapterDescriptor(ParseDescriptor left, ParseDescriptor right) {
        super(left.getBoundedContext(), (ContextElement) left.getRoot().clone());
        getOrigins().addAll(left.getOrigins());
        getOrigins().addAll(right.getOrigins());
        var l = ElementType.CONTEXT.capture(getRoot()).fold(Function.identity(), () -> { throw new RuntimeException("Unexpected descriptor type " + getRoot().getType()); });
        var r = ElementType.CONTEXT.capture(right.getRoot()).fold(Function.identity(), () -> { throw new RuntimeException("Unexpected descriptor type " + getRoot().getType()); });
        l.getImports().addAll(r.getImports());
        l.getChildren().addAll(r.getChildren());
    }

}
