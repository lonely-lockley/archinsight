package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.TranslationUtil;
import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.DynamicId;
import com.github.lonelylockley.archinsight.model.ParseDescriptor;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.elements.LinkElement;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;

import java.util.Objects;

public interface Integrity {

    default void checkImports(ParseDescriptor descriptor, TranslationContext ctx) {
        if (ctx.hasErrors()) {
            return;
        }
        for (AbstractImport imported : descriptor.getImports()) {
            var elementId = DynamicId.fromImport(imported);
            var containerId = elementId.clone();
            containerId.setElementId(null);
            var namespaceId = containerId.clone();
            namespaceId.setBoundaryId(null);
            // check namespace exists
            if (imported.getLevel() == ArchLevel.CONTEXT && !ctx.isDeclaredGlobally(namespaceId)) {
                var tm = TranslationUtil.newError(imported,
                        String.format("Unsatisfied import: %s %s not found", TranslationUtil.stringify(imported.getLevel()), imported.getBoundedContext())
                );
                TranslationUtil.copyPosition(tm, imported.getLine(), imported.getLevelSource().getCharPosition(), imported.getLevelSource().getStartIndex(), imported.getBoundedContextSource().getStopIndex());
                ctx.addMessage(tm);
            }
            else
            if (!ctx.isDeclaredGlobally(containerId)) {
                var tm = TranslationUtil.newError(imported,
                        String.format("Unsatisfied import: %s not found in %s %s", containerId.getBoundaryId(), TranslationUtil.stringify(containerId.getLevel()), containerId.getBoundedContext())
                );
                TranslationUtil.copyPosition(tm, imported.getLine(), imported.getIdentifierSource().getCharPosition(), imported.getIdentifierSource().getStartIndex(), imported.getIdentifierSource().getStopIndex());
                ctx.addMessage(tm);
            }
            else
            if (!ctx.isDeclaredGlobally(elementId)) {
                var tm = TranslationUtil.newError(imported,
                        String.format("Unsatisfied import: %s not found in %s %s", imported.getElement(), TranslationUtil.stringify(imported.getLevel()), imported.getIdentifier())
                );
                TranslationUtil.copyPosition(tm, imported.getLine(), imported.getElementSource().getCharPosition(), imported.getElementSource().getStartIndex(), imported.getElementSource().getStopIndex());
                ctx.addMessage(tm);
            }
        }
    }

    default void checkConnections(ParseDescriptor descriptor, TranslationContext ctx) {
        for (LinkElement link : descriptor.getConnections()) {
            if (Objects.equals(link.getFrom().getBoundedContext(), link.getTo().getBoundedContext()) && !Objects.equals(link.getFrom().getLevel(), link.getTo().getLevel())) {
                if (Objects.equals(link.getFrom().getBoundaryId(), link.getTo().getElementId())) {
                    var tm = TranslationUtil.newError(link,
                            "Service cannot communicate with it's own system"
                    );
                    ctx.addMessage(tm);
                }
                else
                if (Objects.equals(link.getFrom().getElementId(), link.getTo().getBoundaryId())) {
                    var tm = TranslationUtil.newError(link,
                            "System cannot communicate with it's own services"
                    );
                    ctx.addMessage(tm);
                }
            }
        }
    }

}
