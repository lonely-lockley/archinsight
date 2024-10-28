package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;
import com.github.lonelylockley.archinsight.model.elements.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

public class Linker implements Declarations, Split, Imports, Mirror, Relocation, Connections {

    private static final Logger logger = LoggerFactory.getLogger(Linker.class);

    private final Map<String, Tuple2<String, AbstractImport>> declaredImports = new HashMap<>();
    private final TranslationContext ctx;

    public Linker(TranslationContext ctx) {
        this.ctx = ctx;
    }

    private void splitLevels() {
        // copy descriptors to temporary collection because it's not a good idea to change context while iterating over it
        var tmp = new ArrayList<>(ctx.getDescriptors());
        ctx.getDescriptors().clear();
        for (ParseDescriptor descriptor : tmp) {
            splitLevel(descriptor, ctx);
        }
    }

    private void initializeDescriptor(ParseDescriptor descriptor, AbstractElement root) {
        if (root.getType() == ElementType.CONTEXT) {
            ElementType.CONTEXT.capture(root).foreach(context -> initializeImports(context, descriptor, ctx));
        }
        else
        if (root.getType() == ElementType.CONTAINER) {
            ElementType.CONTAINER.capture(root).foreach(container -> initializeImports(container, descriptor, ctx));
        }
        root
            .hasChildren()
            .<List<AbstractElement>>fold(WithChildElements::getChildren, Collections::emptyList)
            .forEach(child -> {
                ElementType.LINK.capture(child).foreach(le -> declareConnection(le, descriptor, ctx));
                initializeDescriptor(descriptor, child);
            });
    }

    private void makeDeclarations(ParseDescriptor descriptor, AbstractElement el) {
        if (el.getType() == ElementType.ACTOR) {
            ElementType.ACTOR.capture(el).foreach(actor -> declareElement(actor, descriptor, ctx));
        }
        else
        if (el.getType() == ElementType.SYSTEM) {
            ElementType.SYSTEM.capture(el).foreach(system -> {
                declareElement(system, descriptor, ctx);
                system.getChildren().forEach(child -> makeDeclarations(descriptor, child));
            });
        }
        else
        if (el.getType() == ElementType.SERVICE) {
            ElementType.SERVICE.capture(el).foreach(service -> declareElement(service, descriptor, ctx));
        }
        else
        if (el.getType() == ElementType.STORAGE) {
            ElementType.STORAGE.capture(el).foreach(storage -> declareElement(storage, descriptor, ctx));
        }
        else
        if (el.getType() == ElementType.CONTEXT) {
            ElementType.CONTEXT.capture(el).foreach(context -> context.getChildren().forEach(child -> makeDeclarations(descriptor, child)));
        }
        else
        if (el.getType() == ElementType.CONTAINER) {
            ElementType.CONTAINER.capture(el).foreach(container -> container.getChildren().forEach(child -> makeDeclarations(descriptor, child)));
        }
    }

    private void processImports() {
        for (ParseDescriptor descriptor : ctx.getDescriptors()) {
            rewriteImports(descriptor, ctx);
            checkImports(descriptor, ctx);
        }
        if (ctx.noErrors()) {
            // user-defined code is correct. now start making automatic changes
            remapContexts(ctx);
        }
    }

    private void processConnections(ArchLevel targetLevel) {
        for (ParseDescriptor descriptor : ctx.getDescriptors()) {
            if (descriptor.getLevel() == targetLevel) {
                addMirrorConnections(descriptor, ctx);
                checkConnections(descriptor, ctx);
            }
        }
    }

    public void checkIntegrity(ArchLevel targetLevel) {
        splitLevels();
        for (ParseDescriptor descriptor : ctx.getDescriptors()) {
            // populate imports and connections
            initializeDescriptor(descriptor, descriptor.getRoot());
            // populate declarations
            makeDeclarations(descriptor, descriptor.getRoot());
        }
        processImports();
        processConnections(targetLevel);
    }

}
