package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.TranslationUtil;
import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;

import java.util.List;

public interface Declarations {

    default void declareConnection(LinkElement link, ParseDescriptor descriptor, TranslationContext ctx) {
        if (descriptor.getConnections().contains(link)) {
            var tm = TranslationUtil.newWarning(link,
                    String.format("Link from %s to %s is already defined", link.getFrom().getElementId(), link.getTo().getElementId())
            );
            ctx.addMessage(tm);
        }
        else {
            descriptor.addConnection(link);
        }
    }

    default void declareElement(ActorElement act, DynamicId parentId, ParseDescriptor descriptor, TranslationContext ctx) {
        declareElement(act.getDeclaredId(), parentId, ArchLevel.CONTEXT, act, descriptor, ctx);
    }

    default void declareElement(SystemElement sys, DynamicId parentId, ParseDescriptor descriptor, TranslationContext ctx) {
        declareElement(sys.getDeclaredId(), parentId, ArchLevel.CONTEXT, sys, descriptor, ctx);
        declareGlobalElement(sys, parentId, descriptor, ctx);
    }

    default void declareElement(ServiceElement srv, DynamicId parentId, ParseDescriptor descriptor, TranslationContext ctx) {
        declareElement(srv.getDeclaredId(), parentId, ArchLevel.CONTAINER, srv, descriptor, ctx);
    }

    default void declareElement(StorageElement str, DynamicId parentId, ParseDescriptor descriptor, TranslationContext ctx) {
        declareElement(str.getDeclaredId(), parentId, ArchLevel.CONTAINER, str, descriptor, ctx);
    }

    private void declareGlobalElement(SystemElement container, DynamicId parentId, ParseDescriptor descriptor, TranslationContext ctx) {
        var newId = container.getDeclaredId().clone();
        newId.setLevel(ArchLevel.CONTAINER);
        if (!ctx.isDeclaredGlobally(newId)) {
            ctx.declareGlobalElement(newId, container);
        }
    }

    default void declareGlobalElement(ContextElement context, DynamicId parentId, ParseDescriptor descriptor, TranslationContext ctx) {
        if (!ctx.isDeclaredGlobally(context.getDeclaredId())) {
            ctx.declareGlobalElement(context.getDeclaredId(), context);
        }
    }

    private void declareElement(DynamicId id, DynamicId parentId, ArchLevel level, AbstractElement el, ParseDescriptor descriptor, TranslationContext ctx) {
        id.setLevel(level);
        id.setBoundedContext(descriptor.getBoundedContext());
        if (parentId != null) {
            id.setBoundaryId(parentId.getElementId());
        }
        if (descriptor.isDeclared(id.getElementId())) {
            var tm = TranslationUtil.newError(el,
                    String.format("Identifier %s is already defined", id.getElementId())
            );
            ctx.addMessage(tm);
        }
        else
        if (descriptor.isImported(id.getElementId())) {
            var tm = TranslationUtil.newError(el, String.format("Element with id %s is already imported", id.getElementId()));
            ctx.addMessage(tm);
        }
        else {
            descriptor.declareElement(id, id.getElementId(), el);
            ctx.declareGlobalElement(id, el);
        }
    }

    default void declareImports(ContextElement context, ParseDescriptor descriptor, TranslationContext ctx) {
        declareImports(context, context.getImports(), descriptor, ctx);
    }

    private void declareImports(AbstractElement el, List<AbstractImport> imports, ParseDescriptor descriptor, TranslationContext ctx) {
        imports
                .forEach(imported -> {
                    descriptor.addImport(imported);
                    if (!imported.isAnonymous()) {
                        var id = imported.getAlias();
                        if (descriptor.isDeclared(id.getElementId())) {
                            var tm = TranslationUtil.newError(el, String.format("Identifier %s is already defined", id.getElementId()));
                            ctx.addMessage(tm);
                        }
                        else
                        if (descriptor.isImported(id.getElementId())) {
                            var tm = TranslationUtil.newError(imported, String.format("Duplicate import %s", id.getElementId()));
                            TranslationUtil.copyPosition(tm, imported.getLine(), imported.getIdentifierSource().getCharPosition(), imported.getIdentifierSource().getStartIndex(), imported.getIdentifierSource().getStopIndex());
                            ctx.addMessage(tm);
                        }
                        else {
                            var ee = new EmptyElement(id);
                            ee.setOrigin(imported.getOrigin());
                            descriptor.declareImported(id, id.getElementId(), ee);
                        }
                    }
                });
    }

}
