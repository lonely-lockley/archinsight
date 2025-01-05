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

    /**
     * This one is a really complicated thing
     */
    public void checkIntegrity() {
        for (Map.Entry<Origin, ParseDescriptor> descriptor : ctx.getRawEntries()) {
            // declare elements from parsed sources
            makeDeclarations(descriptor.getValue(), null, descriptor.getValue().getRoot());
        }
        for (ParseDescriptor descriptor : ctx.getRaw()) {
            // declare imported elements
            rewriteImports(descriptor, ctx);
            // check integrity
            checkImports(descriptor, ctx);
        }
        // all checks are completed by this moment
        if (ctx.noErrors()) {
            for (ParseDescriptor descriptor : ctx.getRaw()) {
                // strip containers from contexts
                splitLevels(descriptor, ctx);
            }
            for (ParseDescriptor descriptor : ctx.getRaw()) {
                // declare mirrored elements, so they would appear at both levels after split
                declareMirroredElements(descriptor, ctx);
            }
            for (ParseDescriptor descriptor : ctx.getDescriptors()) {
                // the mirrored elements are only declared now. this will push them to the parsed tree structure for exporter
                finishMirroring(descriptor, ctx);
                // trim `from` and `to` connection id's to match a desired level
                remapConnections(descriptor, ctx);
            }
        }
    }

}
