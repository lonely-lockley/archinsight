package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.elements.ContainerElement;
import com.github.lonelylockley.archinsight.model.elements.ContextElement;
import com.github.lonelylockley.archinsight.model.elements.ElementType;
import com.github.lonelylockley.archinsight.model.elements.SystemElement;

public interface Split {

    default void splitLevel(final ParseDescriptor descriptor, final TranslationContext ctx) {
        if (descriptor.getRoot().getType() == ElementType.CONTEXT) {
            ElementType.CONTEXT.capture(descriptor.getRoot()).foreach(context -> {
                splitContext(context, descriptor, ctx);
            });
        }
        else {
            throw new RuntimeException("Don't know how to split root type: " + descriptor.getRoot().getType());
        }
    }

    private void splitContext(final ContextElement context, final ParseDescriptor descriptor, final TranslationContext ctx) {
        if (isSplittable(context)) {
            final var newContext = stripContext(context);
            final var newContextDescriptor = new ContextDescriptor(descriptor.getBoundedContext(), newContext);
            newContextDescriptor.getOrigins().addAll(descriptor.getOrigins());
            ctx.addDescriptor(newContextDescriptor);
            context
                    .getChildren()
                    .stream()
                    .filter(child -> child.getType() == ElementType.SYSTEM)
                    .map(child -> (SystemElement) child)
                    .forEach(system -> {
                        final var newContainer = stripContainer(system, context);
                        final var newContainerDescriptor = new ContainerDescriptor(newContextDescriptor, newContainer, system);
                        ctx.addDescriptor(newContainerDescriptor);
                    });
        }
    }

    private boolean isSplittable(final ContextElement context) {
        return context.getChildren().stream().anyMatch(el -> el.getType() == ElementType.SYSTEM);
    }

    private ContextElement stripContext(final ContextElement src) {
        final var dst = new ContextElement();
        dst.setDeclaredId(src.getDeclaredId());
        src.getChildren().forEach(child -> {
            var clone = child.clone();
            clone.hasChildren().foreach(grandChildren -> grandChildren.getChildren().removeIf(grandChild -> grandChild.getType() != ElementType.LINK));
            dst.addChild(clone);
        });
        src.getImports().forEach(imp -> dst.addImport(imp.clone()));
        src.clonePositionTo(dst);
        return dst;
    }

    private ContainerElement stripContainer(final SystemElement system, final ContextElement src) {
        final var dst = new ContainerElement();
        dst.setDeclaredId(system.getDeclaredId());
        system.getChildren()
                .stream()
                .filter(child -> child.getType() != ElementType.LINK)
                .forEach(child -> {
                    dst.addChild(child.clone());
                });
        src.getImports()
                .forEach(imp -> dst.addImport(imp.clone()));
        src.clonePositionTo(dst);
        return dst;
    }

}
