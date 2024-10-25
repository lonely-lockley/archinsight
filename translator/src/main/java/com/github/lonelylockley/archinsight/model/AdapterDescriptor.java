package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.ContextElement;

import java.util.*;

public class AdapterDescriptor extends ContextDescriptor {

    private final List<Origin> origins = new ArrayList<>();

    public AdapterDescriptor(ParseDescriptor left, ParseDescriptor right) {
        super(left.getBoundedContext(), (ContextElement) left.getRoot().clone());
        var root = getRoot();
        origins.addAll(left.getOrigins());
        origins.addAll(right.getOrigins());
        right.getRoot().hasImports().foreach(withImports -> root.hasImports().foreach(wi -> {
            wi // remove imports pointing to this bounded context
                .getImports()
                .removeIf(imp -> Objects.equals(imp.getBoundedContext(), getBoundedContext()));
            withImports // do the same for the right descriptor
                .getImports()
                .stream()
                .filter(imp -> !Objects.equals(imp.getBoundedContext(), getBoundedContext()))
                .forEach(imp -> wi.getImports().add(imp));
        }));
        right.getRoot().hasChildren().foreach(withChildElements ->
                root
                    .hasChildren()
                    .foreach(wc -> wc.getChildren().addAll(withChildElements.getChildren()))
            );
    }

    @Override
    public Collection<Origin> getOrigins() {
        return origins;
    }
}
