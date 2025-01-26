package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.elements.AbstractElement;
import com.github.lonelylockley.archinsight.model.elements.LinkElement;
import com.github.lonelylockley.archinsight.model.elements.WithId;

import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Stream;

public interface Mirroring {

    /*
     * First stage makes declarations only. Adding elements to the root elements will be made at the second stage
     * For all links from element A to imported element B (A -> ext B) create a mirrored link (ext A -> B) in B's diagram
     */
    default void declareMirroredElements(final ParseDescriptor descriptor, final TranslationContext ctx) {
        descriptor
                .getConnections()
                .stream()
                //.filter(link -> descriptor.isImported(link.getTo().toString()))
                // an alternative way to check for imported not to mess with ids here
                .filter(link -> !Objects.equals(descriptor.getExisting(link.getFrom()), descriptor.getExisting(link.getTo())))
                .map(link -> {
                    return new Tuple2<>(link, getTargetDescriptor(link.getTo(), ctx));
                })
                .filter(t -> !Objects.equals(descriptor, t._2))
                .filter(t -> t._2 != null)
                .filter(t -> !(Objects.equals(descriptor.getBoundedContext(), t._2.getBoundedContext()) && Objects.equals(descriptor.getRoot().getOrigin(), t._2.getRoot().getOrigin())))
                .forEach(t -> {
                    final var link = t._1;
                    final var targetDescriptor = t._2;
                    final var sourceElement = getSourceElement(link.getFrom(), ctx);
                    final var mirrored = Imports.transformToImported(sourceElement.clone());
                    final var mirroredId = mirrored.hasId().fold(WithId::getDeclaredId, null);
                    mirroredId.setLevel(ArchLevel.CONTEXT);
                    // if source element is not imported or declared in target descriptor, declare it
                    if (!targetDescriptor.exists(mirroredId)) {
                        targetDescriptor.declareMirrored(mirroredId, mirroredId.toString(), mirrored);
                    }
                    var reversedLink = reverseLink(link, mirroredId);
                    var reversedLinkId = DynamicId.fromLink(reversedLink);
                    targetDescriptor.declareMirrored(reversedLinkId, reversedLinkId.toString(), reversedLink);
                    targetDescriptor.addConnection(reversedLink);
                    targetDescriptor.getRootWithChildren().addChild(reversedLink);
                });
    }

    /**
     * Second and final stage. Now add mirrored elements to parsed structure for exporter
     */
    default void finishMirroring(final ParseDescriptor descriptor, final TranslationContext ctx) {
        descriptor.listMirroredEntries().stream()
                .map(mirrored ->
                        mirrored
                                .getValue()
                                .hasId()
                                .map(withId -> new Tuple2<>(withId.getDeclaredId(), mirrored.getValue()))
                                .fold(Function.identity(), null)
                )
                .filter(Objects::nonNull)
                .forEach(mirrored -> {
                    if (!descriptor.isDeclared(mirrored._1.getElementId())) {
                        descriptor.getRootWithChildren().addChild(mirrored._2);
                    }
                });
    }

    private LinkElement reverseLink(LinkElement direct, DynamicId from) {
        var reversed = (LinkElement) direct.clone();
        reversed.setFrom(from);
        return reversed;
    }

    private AbstractElement getSourceElement(DynamicId id, final TranslationContext ctx) {
        var sourceElementId = id.clone();
        sourceElementId.setLevel(ArchLevel.CONTAINER);
        if (sourceElementId.getBoundaryId() != null) {
            sourceElementId.setElementId(null);
        }
        return ctx.getGlobalElement(sourceElementId);
    }

    private ParseDescriptor getTargetDescriptor(DynamicId targetElementId, final TranslationContext ctx) {
        var targetDescriptorId = targetElementId.clone();
        targetDescriptorId.setElementId(null);
        if (targetElementId.getLevel() == ArchLevel.CONTEXT) {
            targetDescriptorId.setBoundaryId(null);
        }
        return ctx.getDescriptor(targetDescriptorId);
    }

}
