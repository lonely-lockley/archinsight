package com.github.lonelylockley.archinsight.introspect;

import com.github.lonelylockley.archinsight.TranslationUtil;
import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.elements.AbstractElement;
import com.github.lonelylockley.archinsight.model.elements.ElementType;
import com.github.lonelylockley.archinsight.model.elements.LinkElement;
import com.github.lonelylockley.archinsight.model.elements.WithExternal;
import org.apache.commons.lang3.StringUtils;

import java.util.*;
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
        // no need to check contexts separately as it checks parents of all containers
        if (descriptor.getLevel() == ArchLevel.CONTAINER) {
            final var declarations = collectDeclarations(descriptor);
            declarations.putAll(collectDeclarations(ctx.getDescriptor(descriptor.getParentContextId())));
            removeConnectedElements(declarations, descriptor.getConnections());
            removeConnectedElements(declarations, ctx.getDescriptor(descriptor.getParentContextId()).getConnections());
            declarations
                    .forEach((key, el) -> {
                        if (el.getType() != ElementType.EMPTY) {
                            var tm = TranslationUtil.newNotice(el, String.format("%s %s has no connections with other elements", StringUtils.capitalize(el.getType().toString().toLowerCase()), key.getElementId()));
                            TranslationUtil.copyPosition(tm, el.getLine(), el.getCharPosition(), el.getStartIndex(), el.getStopIndex());
                            ctx.addMessage(tm);
                        }
                    });
        }
    }

    private void searchForSelfTargetingLinks(ParseDescriptor descriptor) {
        // self referencing is ok at sequence diagrams, but looks strange at container level
        descriptor.getConnections().forEach(link -> {
            if (Objects.equals(link.getFrom(), link.getTo())) {
                var tm = TranslationUtil.newNotice(link, "Element links to itself");
                TranslationUtil.copyPosition(tm, link.getLine(), link.getCharPosition(), link.getStartIndex(), link.getStopIndex());
                ctx.addMessage(tm);
            }
        });
    }

    private void searchConnectionErasures() {
        ctx.getRaw().forEach(descriptor -> {
                    // collect all declared connections grouped by level
                    var res = descriptor.getConnections()
                            .stream()
                            .map(link -> new Tuple2<>(link.getFrom().getLevel(), link))
                            .collect(Collectors.groupingBy(
                                    Tuple2::_1,
                                    Collectors.toList()
                            ));
                    // if all connection are in context or container - no problem, but if they are split into two levels - context level connection will
                    // be erased in container level unless an external system's involved in the interaction
                    if (res.size() == 2) {
                        res.get(ArchLevel.CONTEXT)
                                .stream()
                                .map(Tuple2::_2)
                                .filter(link -> !(descriptor.isDeclared(link.getFrom().getElementId()) && descriptor.getDeclared(link.getFrom().getElementId()).hasExternal().fold(WithExternal::isExternal,() -> false) && link.getTo().getLevel() == ArchLevel.CONTAINER))
                                .forEach(link -> {
                                    var tm = TranslationUtil.newWarning(link, "Link will be erased in container level diagram");
                                    TranslationUtil.copyPosition(tm, link.getLine(), link.getCharPosition(), link.getStartIndex(), link.getStopIndex());
                                    ctx.addMessage(tm);
                                });
                    }
                    else
                    if (res.size() > 2) {
                        throw new IllegalArgumentException("Levels beyond context and containers are not supported currently");
                    }
                });
    }

    public void suggest() {
        for (ParseDescriptor descriptor : ctx.getDescriptors()) {
            searchForIsolatedElements(descriptor);
            searchForSelfTargetingLinks(descriptor);

        }
        searchConnectionErasures();
    }

}
