package com.github.lonelylockley.archinsight.introspect;

import com.github.lonelylockley.archinsight.TranslationUtil;
import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.DynamicId;
import com.github.lonelylockley.archinsight.model.ParseDescriptor;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.elements.AbstractElement;
import com.github.lonelylockley.archinsight.model.elements.ElementType;
import com.github.lonelylockley.archinsight.model.elements.LinkElement;

import java.util.HashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

public class Introspection {

    private final TranslationContext ctx;

    public Introspection(TranslationContext ctx) {
        this.ctx = ctx;
    }

    private Map<DynamicId, AbstractElement> collectDeclarations(ParseDescriptor descriptor) {
        return descriptor.
                listExisting()
                .entrySet()
                .stream()
                .filter(e -> e.getValue().getType() != ElementType.BOUNDARY && e.getValue().getType() != ElementType.LINK && e.getValue().getType() != ElementType.EMPTY)
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    private void removeConnectedElements(Map<DynamicId, AbstractElement> declarations, Set<LinkElement> connections) {
       connections.forEach(link -> {
            declarations.remove(link.getFrom());
            declarations.remove(link.getTo());
        });
    }

    private void searchForIsolatedElements(ParseDescriptor descriptor) {
        final var declarations = collectDeclarations(descriptor);
        declarations.putAll(collectDeclarations(ctx.getDescriptor(descriptor.getParentContextId())));
        removeConnectedElements(declarations, descriptor.getConnections());
        removeConnectedElements(declarations, ctx.getDescriptor(descriptor.getParentContextId()).getConnections());
        declarations
                .forEach((key, el) -> {
                    if (el.getType() != ElementType.EMPTY) {
                        var tm = TranslationUtil.newNotice(el.getOrigin(), String.format("Element %s has no connections with other elements", key.getElementId()));
                        TranslationUtil.copyPosition(tm, el.getLine(), el.getCharPosition(), el.getStartIndex(), el.getStopIndex());
                        ctx.addMessage(tm);
                    }
                });
    }

    private void searchForSelfTargetingLinks(ParseDescriptor descriptor) {
        descriptor.getConnections().forEach(link -> {
            if (Objects.equals(link.getFrom(), link.getTo())) {
                var tm = TranslationUtil.newNotice(link.getOrigin(), "Element links to itself");
                TranslationUtil.copyPosition(tm, link.getLine(), link.getCharPosition(), link.getStartIndex(), link.getStopIndex());
                ctx.addMessage(tm);
            }
        });
    }

    public void suggest() {
        ctx.getDescriptors()
                .stream()
                .filter(descriptor -> descriptor.getLevel() == ArchLevel.CONTAINER)
                .forEach(descriptor -> {
                    searchForIsolatedElements(descriptor);
                    searchForSelfTargetingLinks(descriptor);
                });
    }

}
