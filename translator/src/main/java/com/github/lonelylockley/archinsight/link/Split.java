package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.model.imports.GeneratedImport;

import java.util.List;

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
                    .forEach(child -> {
                        if (child.getType() == ElementType.SYSTEM) {
                            ElementType.SYSTEM.capture(child).foreach(system -> {
                                final var newContainer = stripContainer(system, context);
                                final var newContainerDescriptor = new ContainerDescriptor(newContextDescriptor, newContainer, system.getDeclaredId());
                                createImport(newContextDescriptor, system.getDeclaredId(), system);
                                ctx.addDescriptor(newContainerDescriptor);
                            });
                        }
                        else
                        if (child.getType() == ElementType.ACTOR) {
                            ElementType.ACTOR.capture(child).foreach(actor -> {
                                final var newContainer = stripContainer(actor, context);
                                final var newContainerDescriptor = new ContainerDescriptor(newContextDescriptor, newContainer, actor.getDeclaredId());
                                createImport(newContextDescriptor, actor.getDeclaredId(), actor);
                                ctx.addDescriptor(newContainerDescriptor);
                            });
                        }
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

    private void createImport(ContextDescriptor descriptor, String id, AbstractElement el) {
        // create imports that will help to make links inside a single file without excess imports
        final var imp = new GeneratedImport();
        imp.setBoundedContext(descriptor.getBoundedContext());
        imp.setLevel(descriptor.getLevel());
        imp.setIdentifier(id);
        imp.setOrigination(descriptor, el);
        imp.setOrigin(el.getOrigin());
        descriptor.addImport(imp);
    }

    private ContainerElement stripContainer(final SystemElement system, final ContextElement src) {
        return stripContainer(system.getDeclaredId(), system.getChildren(), src);
    }

    private ContainerElement stripContainer(final ActorElement actor, final ContextElement src) {
        return stripContainer(actor.getDeclaredId(), actor.getChildren(), src);
    }

    private ContainerElement stripContainer(String id, List<AbstractElement> children, final ContextElement src) {
        final var dst = new ContainerElement();
        dst.setDeclaredId(id);
        children
                .stream()
                .filter(child -> child.getType() != ElementType.LINK)
                .forEach(child -> {
                    dst.addChild(child.clone());
                });
        src.getImports().forEach(imp -> dst.addImport(imp.clone()));
        src.getChildren()
                .forEach(child -> {
                    child.hasId().filter(withId -> id.equals(withId.getDeclaredId())).foreach(withId -> child.clonePositionTo(dst));
                });
        return dst;
    }

}
