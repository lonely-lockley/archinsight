package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.TranslationUtil;
import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;
import com.github.lonelylockley.archinsight.model.imports.GeneratedImport;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

public interface Imports {

    default void rewriteImports(ParseDescriptor descriptor, TranslationContext ctx) {
        final var imports = new ArrayList<>(descriptor.getImports());
        final var named = imports
                .stream()
                .filter(imp -> !imp.isAnonymous())
                .collect(Collectors.toMap(imp -> imp.getAlias().toString(), Function.identity()));
        final var remapping = new HashMap<DynamicId, DynamicId>();
        imports
                .stream()
                .filter(AbstractImport::isAnonymous)
                .forEach(anon -> {
                    if (named.containsKey(anon.getIdentifier())) {
                        // anonymous imports from container element imported with named import
                        var system = named.get(anon.getIdentifier());
                        var res = new GeneratedImport();
                        res.setLevel(anon.getLevel());
                        res.setLevelSource(system.getLevelSource());
                        res.setBoundedContext(system.getBoundedContext());
                        res.setBoundedContextSource(system.getBoundedContextSource());
                        res.setIdentifier(system.getIdentifier());
                        res.setIdentifierSource(system.getIdentifierSource());
                        res.setAliasSource(anon.getAliasSource());
                        res.setElement(anon.getElement());
                        res.setElementSource(anon.getElementSource());
                        anon.clonePositionTo(res);
                        remapping.put(anon.getAlias(), DynamicId.fromImport(res));
                        descriptor.replaceImport(anon, res);
                    }
                    else
                    if (descriptor.isDeclared(anon.getElement()) || descriptor.isImported(anon.getElement())) {
                        // anonymous imports in the same file without corresponding named import
                        var res = new GeneratedImport();
                        res.setLevel(anon.getLevel());
                        res.setBoundedContext(descriptor.getBoundedContext());
                        res.setIdentifier(anon.getIdentifier());
                        res.setIdentifierSource(anon.getIdentifierSource());
                        res.setAliasSource(anon.getAliasSource());
                        res.setElement(anon.getElement());
                        res.setElementSource(anon.getElementSource());
                        anon.clonePositionTo(res);
                        remapping.put(anon.getAlias(), DynamicId.fromImport(res));
                        descriptor.replaceImport(anon, res);
                    }
                });

        remapConnections(descriptor, remapping, named, ctx);
        remapImports(descriptor, ctx);
    }

    private void remapConnections(ParseDescriptor descriptor, Map<DynamicId, DynamicId> remapping, Map<String, AbstractImport> named, TranslationContext ctx) {
        descriptor.getConnections().forEach(link -> {
            if (remapping.containsKey(link.getTo())) {
                // remap anonymous imports
                link.setTo(remapping.get(link.getTo()));
            }
            else
            if (named.containsKey(link.getTo().toString())) {
                // remap named imports
                link.setTo(DynamicId.fromImport(named.get(link.getTo().toString())));
            }
            else
            if (descriptor.isDeclared(link.getTo().getElementId())) {
                // remap declared IDs
                descriptor.getDeclared(link.getTo().getElementId()).hasId().map(WithId::getDeclaredId).foreach(link::setTo);
            }
            else {
                var tm = TranslationUtil.newError(link,
                        String.format("Undeclared identifier %s", link.getTo().getElementId())
                );
                TranslationUtil.copyPosition(tm, link);
                ctx.addMessage(tm);
            }
        });
    }

    private void remapImports(ParseDescriptor descriptor, TranslationContext ctx) {
        descriptor.getImports().forEach(imp -> {
            if (descriptor.isImported(imp.getAlias().toString())) {
                var id = DynamicId.fromImport(imp);
                descriptor.removeExisting(imp.getAlias(), imp.getAlias().toString());
                var element = transformToImported(ctx.getGlobalElement(id).clone());
                descriptor.getRootWithChildren().addChild(element);
                //if (!(descriptor.getLevel() == id.getLevel() && Objects.equals(descriptor.getBoundedContext(), id.getBoundedContext()))) {
                    // do not re-declare imports to the same context
                    descriptor.declareImported(id, id.toString(), element);
                //}
            }
        });
    }

    static AbstractElement transformToImported(AbstractElement imported) {
        imported.hasChildren().foreach(c -> c.getChildren().clear());
        imported.hasExternal().foreach(WithExternal::setExternal);
        return imported;
    }

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

}
