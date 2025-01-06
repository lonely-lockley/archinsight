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
        remapImports(named, descriptor, ctx);
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

    private void remapImports(Map<String, AbstractImport> named, ParseDescriptor descriptor, TranslationContext ctx) {
        named.values().forEach(imp -> {
            if (descriptor.isImported(imp.getAlias().toString())) {
                var id = DynamicId.fromImport(imp);
                descriptor.removeExisting(imp.getAlias(), imp.getAlias().toString());
                if (ctx.isDeclaredGlobally(id)) {
                    var element = transformToImported(ctx.getGlobalElement(id).clone());
                    descriptor.getRootWithChildren().addChild(element);
                    descriptor.declareImported(id, id.toString(), element);
                }
            }
        });
    }

    public static AbstractElement transformToImported(AbstractElement imported) {
        imported.hasChildren().foreach(c -> c.getChildren().clear());
        imported.hasExternal().foreach(WithExternal::setExternal);
        imported.hasNote().foreach(withNote -> withNote.setNote(null));
        return imported;
    }

}
