package com.github.lonelylockley.archinsight.introspect;

import com.github.lonelylockley.archinsight.TranslationUtil;
import com.github.lonelylockley.archinsight.model.ParsedFileDescriptor;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.model.elements.ElementType;

import java.util.Collection;
import java.util.HashSet;
import java.util.Objects;

public class Introspection {

    private final TranslationContext ctx;

    public Introspection(TranslationContext ctx) {
        this.ctx = ctx;
    }

    private void searchForIsolatedElements(ParsedFileDescriptor descriptor) {
        final var declarations = new HashSet<String>(descriptor.getDeclarations().size());
        declarations.addAll(descriptor.getDeclarations().keySet());
        descriptor.getConnections().forEach(link -> {
            declarations.remove(link.getFrom());
            declarations.remove(link.getTo());
        });
        declarations.forEach(id -> {
            final var el = descriptor.getDeclarations().get(id);
            if (el.getType() != ElementType.BOUNDARY) { // boundaries are never connected
                el.hasId().foreach(withId -> {
                    var tm = TranslationUtil.newNotice(descriptor, String.format("Element %s is not connected to a diagram", withId.getId()));
                    TranslationUtil.copyPosition(tm, el.getLine(), el.getCharPosition(), el.getStartIndex(), el.getStopIndex());
                    ctx.addMessage(tm);
                });
            }
        });
    }

    private void searchForSelfTargetingLinks(ParsedFileDescriptor descriptor) {
        descriptor.getConnections().forEach(link -> {
            if (Objects.equals(link.getFrom(), link.getTo())) {
                var tm = TranslationUtil.newNotice(descriptor, "Element links to itself");
                TranslationUtil.copyPosition(tm, link.getLine(), link.getCharPosition(), link.getStartIndex(), link.getStopIndex());
                ctx.addMessage(tm);
            }
        });
    }

    private void searchForMirroringLinks(String modifiedTabId, Collection<ParsedFileDescriptor> descriptors) {

    }

    public void suggest(String tabId) {
        for (ParsedFileDescriptor descriptor : ctx.getDescriptors()) {
            searchForIsolatedElements(descriptor);
            searchForSelfTargetingLinks(descriptor);
        }
        searchForMirroringLinks(tabId, ctx.getDescriptors());
    }

}
