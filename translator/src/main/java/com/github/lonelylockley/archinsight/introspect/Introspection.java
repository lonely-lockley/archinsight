package com.github.lonelylockley.archinsight.introspect;

import com.github.lonelylockley.archinsight.TranslationUtil;
import com.github.lonelylockley.archinsight.model.DynamicId;
import com.github.lonelylockley.archinsight.model.ParseDescriptor;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.elements.ElementType;

import java.util.HashSet;
import java.util.Objects;

public class Introspection {

    private final TranslationContext ctx;

    public Introspection(TranslationContext ctx) {
        this.ctx = ctx;
    }

    private void searchForIsolatedElements(ParseDescriptor descriptor) {
        final var declarations = new HashSet<DynamicId>(descriptor.listExisting().size());
        declarations.addAll(descriptor.listExisting().keySet());
        descriptor.getConnections().forEach(link -> {
            declarations.remove(link.getFrom());
            declarations.remove(link.getTo());
        });
        declarations.forEach(id -> {
            final var el = descriptor.listExisting().get(id);
            if (el.getType() != ElementType.BOUNDARY && el.getType() != ElementType.EMPTY) { // boundaries are never connected
                el.hasId().foreach(withId -> {
                    var tm = TranslationUtil.newNotice(el.getOrigin(), String.format("Element %s has no connections with other elements", withId.getDeclaredId()));
                    TranslationUtil.copyPosition(tm, el.getLine(), el.getCharPosition(), el.getStartIndex(), el.getStopIndex());
                    ctx.addMessage(tm);
                });
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
        for (ParseDescriptor descriptor : ctx.getDescriptors()) {
            searchForIsolatedElements(descriptor);
            searchForSelfTargetingLinks(descriptor);
        }
    }

}
