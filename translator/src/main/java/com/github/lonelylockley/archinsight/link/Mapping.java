package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.ParseDescriptor;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.elements.LinkElement;

import java.util.Objects;

public interface Mapping {

    default void remapConnections(ParseDescriptor descriptor, TranslationContext ctx) {
        if (descriptor.getLevel() == ArchLevel.CONTEXT) {
            remapContext(descriptor);
        }
        else
        if (descriptor.getLevel() == ArchLevel.CONTAINER) {
            remapContainer(descriptor);
        }
    }

    private void remapContext(ParseDescriptor descriptor) {
        var remapped = descriptor.getConnections()
                .stream()
                .map(link -> (LinkElement) link.clone())
                .peek(link -> {
                    link.getFrom().setLevel(ArchLevel.CONTEXT);
                    if (link.getFrom().getBoundaryId() == null) {
                        link.getFrom().setBoundaryId(link.getFrom().getElementId());
                    }
                    link.getFrom().setElementId(null);
                    link.getTo().setLevel(ArchLevel.CONTEXT);
                    if (link.getTo().getBoundaryId() == null) {
                        link.getTo().setBoundaryId(link.getTo().getElementId());
                    }
                    link.getTo().setElementId(null);
                })
                .filter(link -> !Objects.equals(link.getFrom(), link.getTo()))
                .toList();
        descriptor.getConnections().clear();
        descriptor.getConnections().addAll(remapped);
    }

    private void remapContainer(ParseDescriptor descriptor) {
        var remapped = descriptor.getConnections()
                .stream()
                .map(link -> (LinkElement) link.clone())
                .peek(link -> {
                    if (!descriptor.exists(link.getTo())) {
                        link.getTo().setLevel(ArchLevel.CONTEXT);
                        link.getTo().setElementId(null);
                    }
                })
                .filter(link -> link.getFrom().getLevel() != ArchLevel.CONTEXT)
                .toList();
        descriptor.getConnections().clear();
        descriptor.getConnections().addAll(remapped);
    }

}
