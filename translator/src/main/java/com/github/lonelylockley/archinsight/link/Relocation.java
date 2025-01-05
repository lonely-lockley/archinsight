package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.elements.*;

import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

public interface Relocation {

    private void mergeDescriptors(final ParseDescriptor descriptor, final TranslationContext ctx) {
        if (!ctx.hasDescriptor(descriptor.getId())) {
            ctx.addDescriptor(descriptor);
        }
        else {
            var existing = ctx.getDescriptor(descriptor.getId());
            descriptor.mergeTo(existing);
            existing.getRootWithChildren().getChildren().addAll(descriptor.getRootWithChildren().getChildren());
        }
    }

    /*
     * Split elements of a descriptor into context and container
     * a new context descriptor is created here!
     */
    default void splitLevels(final ParseDescriptor descriptor, final TranslationContext ctx) {
        if (descriptor.getRoot().getType() == ElementType.CONTEXT) {
            ElementType.CONTEXT.capture(descriptor.getRoot()).foreach(context -> {
                splitContextAndContainer(context, (ContextDescriptor) descriptor, ctx);
            });
        }
        else {
            throw new RuntimeException("Don't know how to split root type: " + descriptor.getRoot().getType());
        }
    }

    /**
     * Creates new context descriptor and a container per each system declared in this context
     * @param context original context element
     * @param parent original descriptor
     * @param ctx translation context
     */
    private void splitContextAndContainer(final ContextElement context, final ContextDescriptor parent, final TranslationContext ctx) {
        final var newContextDescriptor = stripContext(context, parent);
        final var newContainers = stripContainer(context, newContextDescriptor, parent, ctx);
        mergeDescriptors(newContextDescriptor, ctx);
        newContainers.forEach(cont -> mergeDescriptors(cont, ctx));
    }

    /**
     * Populates new context descriptor with context level elements
     * @param src original context element
     * @param parent original descriptor
     * @return
     */
    private ContextDescriptor stripContext(final ContextElement src, final ContextDescriptor parent) {
        var newContext = new ContextElement();
        newContext.setDeclaredId(src.getDeclaredId());
        src.clonePositionTo(newContext);
        var newDescriptor = new ContextDescriptor(parent.getId(), newContext);
        parent.mergeTo(newDescriptor);
        parent.getRootWithChildren().getChildren().forEach(child -> {
            // remove all children of context-level elements (grand-children of context) except links
            var clone = child.clone();
            clone.hasChildren()
                    .fold(WithChildElements::getChildren, Collections::<AbstractElement>emptyList)
                    .removeIf(grandChild -> grandChild.getType() != ElementType.LINK);
            newContext.addChild(clone);
        });
        var existing = new HashMap<>(newDescriptor.listExisting());
        existing.forEach((ee, el) -> {
            // clean context from container-level elements
            if (!(ee.getLevel() == ArchLevel.CONTEXT || newDescriptor.isImported(ee.toString()) || newDescriptor.isMirrored(ee.toString()))) {
                newDescriptor.removeExisting(ee, ee.getElementId());
            }
        });
        return newDescriptor;
    }

    /**
     * Creates a new container descriptor per each declared system
     * @param src original context element
     * @param descriptor new context descriptor created from parent
     * @param ctx translation context
     * @return
     */
    private List<ContainerDescriptor> stripContainer(final ContextElement src, final ContextDescriptor descriptor, final ContextDescriptor parent, final TranslationContext ctx) {
        // group future containers by origin
        var containers = parent.listExisting()
                .entrySet()
                .stream()
                .filter(e -> e.getKey().getLevel() == ArchLevel.CONTEXT && parent.isDeclared(e.getKey().getElementId()))
                .map(e -> new Tuple2<>(e.getValue().getOrigin(), e.getValue()))
                .collect(Collectors.groupingBy(
                        Tuple2::_1,
                        Collectors.toList()
                ));
        // create a container for each origin
        var result = new ArrayList<ContainerDescriptor>();
        for (var container : containers.entrySet()) {
            var newContainer = new ContainerElement();
            newContainer.setDeclaredId(src.getDeclaredId());
            // create a boundary for each system | do nothing with actors | keep mirrored
            populateContainerElement(newContainer, descriptor, container.getValue());
            var newDescriptor = populateDescriptor(newContainer, descriptor, parent, container.getValue());
            result.add(newDescriptor);
        }
        return result;
    }

    /**
     * Populates new container root element with children
     * @param newContainer new container descriptor created from parent context
     * @param descriptor new context descriptor created from parent
     * @param container container root element with origin
     */
    private void populateContainerElement(ContainerElement newContainer, final ContextDescriptor descriptor, List<Tuple2<Origin, AbstractElement>> container) {
        var i = new AtomicInteger();
        for (var entry : container) {
            var el = entry._2;
            if (newContainer.getOrigin() == null) {
                el.clonePositionTo(newContainer);
            }
            if (el.getType() == ElementType.ACTOR) {
                ElementType.ACTOR.capture(el).foreach(actor -> {
                    descriptor.getConnections().forEach(link -> {
                        if (Objects.equals(link.getFrom(), actor.getDeclaredId())) {
                            link.getFrom().setLevel(ArchLevel.CONTAINER);
                        }
                        if (Objects.equals(link.getTo(), actor.getDeclaredId())) {
                            link.getTo().setLevel(ArchLevel.CONTAINER);
                        }
                    });
                });
                newContainer.addChild(el);
            }
            else if (el.getType() == ElementType.SYSTEM) {
                ElementType.SYSTEM.capture(el).foreach(sys -> {
                    var boundary = new BoundaryElement();
                    boundary.setDeclaredId(sys.getDeclaredId());
                    boundary.setName(sys.getName());
                    boundary.setTechnology(sys.getTechnology());
                    boundary.setDescription(sys.getDescription());
                    sys.getChildren().stream().filter(child -> child.getType() != ElementType.LINK).forEach(boundary::addChild);
                    sys.clonePositionTo(boundary);
                    if (boundary.getChildren().isEmpty()) {
                        boundary.getChildren().add(new EmptyElement(DynamicId.fromElementId("invisible_node_" + i.incrementAndGet())));
                    }
                    newContainer.addChild(boundary);
                });
            }
        }
    }

    /**
     * Populates new container descriptor with container level elements
     * @param newContainer new container descriptor created from parent context
     * @param descriptor new context descriptor created from parent
     * @param container container root element with origin
     */
    private ContainerDescriptor populateDescriptor(ContainerElement newContainer, final ContextDescriptor descriptor, final ContextDescriptor parent, List<Tuple2<Origin, AbstractElement>> container) {
        var boundaryIds = container
                .stream()
                .map(t -> t._2)
                .map(el -> el.hasId().fold(WithId::getDeclaredId, null))
                .filter(Objects::nonNull)
                .map(DynamicId::clone)
                .peek(id -> id.setLevel(ArchLevel.CONTAINER))
                .map(DynamicId::getElementId)
                .collect(Collectors.toSet());
        var containerId = DynamicId.fromAbstractElements(ArchLevel.CONTAINER, descriptor.getBoundedContext(), boundaryIds);
        var result = new ContainerDescriptor(descriptor, newContainer, containerId);
        parent.mergeTo(result);
        var existing = new HashMap<>(parent.listExisting());
        existing.forEach((id, el) -> {
            // clean container from context-level elements
            //    keep imported elements               keep container elements in the same boundary
            if (!(result.isImported(id.toString()) || (id.getLevel() == ArchLevel.CONTAINER && checkIdPointsToTheSameContainer(id, result, boundaryIds)))) {
                result.removeExisting(id, id.getElementId());
            }
        });
        result.listImported().forEach(impId -> {
            var imported = result.getImported(impId);
            newContainer.addChild(imported);
        });
        for (Map.Entry<String, AbstractElement> mirrored : descriptor.listMirroredEntries()) {
            result.getRootWithChildren().addChild(mirrored.getValue());
        }
        return result;
    }

    private boolean checkIdPointsToTheSameContainer(DynamicId id, ContainerDescriptor descriptor, Set<String> boundaryIds) {
        return Objects.equals(id.getBoundedContext(), descriptor.getBoundedContext()) && boundaryIds.contains(id.getBoundaryId());
    }

}
