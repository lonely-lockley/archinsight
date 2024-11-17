package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.elements.AbstractElement;
import com.github.lonelylockley.archinsight.model.elements.LinkElement;
import com.github.lonelylockley.archinsight.model.elements.WithId;

import java.util.Objects;

public interface Mirroring {

    default void addMirrorConnections(final ParseDescriptor descriptor, final TranslationContext ctx) {
        descriptor
                .getConnections()
                .stream()
                .filter(link -> descriptor.isImported(link.getTo().toString()))
                .map(link -> new Tuple2<>(link, getTargetDescriptor(link.getTo(), ctx)))
                .filter(t -> !Objects.equals(descriptor, t._2))
                .forEach(t -> {
                    final var link = t._1;
                    final var targetDescriptor = t._2;
                    AbstractElement mirrored;
                    // if source element is not imported or declared in target descriptor, declare it
                    if (!targetDescriptor.exists(link.getFrom())) {
                        var sourceElement = getSourceElement(link.getFrom(), ctx);
                        mirrored = Imports.transformToImported(sourceElement.clone());
                        targetDescriptor.declareMirrored(link.getFrom(), link.getFrom().toString(), mirrored);
                        targetDescriptor.getRootWithChildren().addChild(mirrored);
                    }
                    else {
                        mirrored = targetDescriptor.getExisting(link.getFrom());
                    }
                    var mirroredId = mirrored.hasId().fold(WithId::getDeclaredId, null);
                    var reversedLink = reverseLink(link, mirroredId);
                    targetDescriptor.addConnection(reversedLink);
                    targetDescriptor.getRootWithChildren().addChild(reversedLink);
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
        if (targetDescriptorId.getLevel() == ArchLevel.CONTEXT) {
            targetDescriptorId.setBoundaryId(null);
        }
        var targetDescriptorRealId = ctx.getDescriptorRemapping(targetDescriptorId);
        if (targetDescriptorRealId == null) {
            targetDescriptorRealId = targetDescriptorId;
        }
        return ctx.getDescriptor(targetDescriptorRealId);
    }

}
