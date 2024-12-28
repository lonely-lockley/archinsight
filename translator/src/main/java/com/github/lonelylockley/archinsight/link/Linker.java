package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;
import com.github.lonelylockley.archinsight.model.elements.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

public class Linker implements Declarations, Relocation, Imports, Mirroring, Mapping {

    private static final Logger logger = LoggerFactory.getLogger(Linker.class);

    private final Map<String, Tuple2<String, AbstractImport>> declaredImports = new HashMap<>();
    private final TranslationContext ctx;

    public Linker(TranslationContext ctx) {
        this.ctx = ctx;
    }

    private void makeDeclarations(ParseDescriptor descriptor, DynamicId parentId, AbstractElement el) {
        if (el.getType() == ElementType.ACTOR) {
            ElementType.ACTOR.capture(el).foreach(actor -> declareElement(actor, parentId, descriptor, ctx));
        }
        else
        if (el.getType() == ElementType.SYSTEM) {
            ElementType.SYSTEM.capture(el).foreach(system -> declareElement(system, parentId, descriptor, ctx));
        }
        else
        if (el.getType() == ElementType.SERVICE) {
            ElementType.SERVICE.capture(el).foreach(service -> declareElement(service, parentId, descriptor, ctx));
        }
        else
        if (el.getType() == ElementType.STORAGE) {
            ElementType.STORAGE.capture(el).foreach(storage -> declareElement(storage, parentId, descriptor, ctx));
        }
        else
        if (el.getType() == ElementType.CONTEXT) {
            ElementType.CONTEXT.capture(el).foreach(context -> {
                declareGlobalElement(context.getDeclaredId(), context, ctx);
                declareImports(context, descriptor, ctx);
            });
        }
        else
        if (el.getType() == ElementType.LINK) {
            ElementType.LINK.capture(el).foreach(link -> declareConnection(link, descriptor, ctx));
        }

        el.hasChildren()
                .fold(WithChildElements::getChildren, Collections::<AbstractElement>emptyList)
                .forEach(child -> makeDeclarations(descriptor, el.hasId().fold(WithId::getDeclaredId, null), child));
    }

    public void checkIntegrity(ArchLevel targetLevel) {
        for (Map.Entry<Origin, ParseDescriptor> descriptor : ctx.getRawEntries()) {
            ctx.remapDescriptor(descriptor.getValue().getId(), descriptor.getKey());
            makeDeclarations(descriptor.getValue(), null, descriptor.getValue().getRoot());
        }
        for (ParseDescriptor descriptor : ctx.getRaw()) {
            rewriteImports(descriptor, ctx);
            checkImports(descriptor, ctx);
        }
        // all checks are completed by this moment
        if (ctx.noErrors()) {
            for (ParseDescriptor descriptor : ctx.getRaw()) {
                declareMirroredElements(descriptor, ctx);
            }
            var tmp = new ArrayList<>(ctx.getRaw());
            ctx.getRaw().clear();
            for (ParseDescriptor descriptor : tmp) {
                splitLevels(descriptor, ctx);
            }
            for (ParseDescriptor descriptor : ctx.getDescriptors()) {
                finishMirroring(descriptor, ctx);
                remapConnections(descriptor, ctx);
            }
        }
    }

}
